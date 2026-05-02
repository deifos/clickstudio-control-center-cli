import type { ResponseOptions, SuccessResponse, ErrorResponse } from './envelope.js';
import { CLIError } from './errors.js';
import { renderStyledResponse, renderStyledError } from './styled.js';

export enum Format {
  Auto = 'auto',
  JSON = 'json',
  Quiet = 'quiet',
  Styled = 'styled',
  Markdown = 'markdown',
}

export interface WriterOptions {
  format: Format;
}

export class OutputWriter {
  private format: Format;

  constructor(opts: WriterOptions) {
    this.format = opts.format;
  }

  effectiveFormat(): Format {
    if (this.format !== Format.Auto) return this.format;
    return process.stdout.isTTY ? Format.Styled : Format.JSON;
  }

  isMachineOutput(): boolean {
    const f = this.effectiveFormat();
    return f === Format.JSON || f === Format.Quiet;
  }

  /**
   * True only for the colored TTY output mode. Commands should gate their
   * custom chalk-using renders on this — gating on `!isMachineOutput()`
   * would also fire in `--md` mode, mixing ANSI codes into Markdown.
   */
  isStyled(): boolean {
    return this.effectiveFormat() === Format.Styled;
  }

  ok<T>(data: T, opts: ResponseOptions = {}): void {
    const format = this.effectiveFormat();

    switch (format) {
      case Format.JSON:
        this.renderJSON(data, opts);
        break;
      case Format.Quiet:
        this.renderQuiet(data);
        break;
      case Format.Markdown:
        this.renderMarkdown(data, opts);
        break;
      case Format.Styled:
      default:
        renderStyledResponse(data, opts);
        break;
    }
  }

  err(error: CLIError): void {
    const format = this.effectiveFormat();

    if (format === Format.JSON || format === Format.Quiet) {
      const envelope: ErrorResponse = {
        ok: false,
        error: error.message,
        code: error.code,
        hint: error.hint,
      };
      console.error(JSON.stringify(envelope));
    } else {
      renderStyledError(error);
    }
  }

  private renderJSON<T>(data: T, opts: ResponseOptions): void {
    const envelope: SuccessResponse<T> = {
      ok: true,
      data,
      summary: opts.summary,
      notice: opts.notice,
      breadcrumbs: opts.breadcrumbs,
    };
    console.log(JSON.stringify(envelope, null, 2));
  }

  private renderQuiet<T>(data: T): void {
    console.log(JSON.stringify(data, null, 2));
  }

  private renderMarkdown<T>(data: T, opts: ResponseOptions): void {
    if (opts.summary) {
      console.log(`## ${opts.summary}\n`);
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === 'object') {
          for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
            if (value !== null && value !== undefined) {
              console.log(`- **${key}**: ${String(value)}`);
            }
          }
          console.log();
        } else {
          console.log(`- ${String(item)}`);
        }
      }
    } else if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (value !== null && value !== undefined) {
          console.log(`- **${key}**: ${String(value)}`);
        }
      }
    } else {
      console.log(String(data));
    }

    if (opts.notice) {
      console.log(`\n> ${opts.notice}`);
    }

    if (opts.breadcrumbs && opts.breadcrumbs.length > 0) {
      console.log('\n### Hints\n');
      for (const bc of opts.breadcrumbs) {
        console.log(`- \`${bc.cmd}\` — ${bc.action}`);
      }
    }
  }
}
