import type { Breadcrumb, ResponseOptions } from './envelope.js';
import type { CLIError } from './errors.js';
import { brand, divider } from './theme.js';

// In Styled (TTY) mode, commands custom-render their own table/detail block
// before calling writer.ok — so the writer's job is the surrounding context
// (summary, notice, breadcrumbs), not a generic dump of the data, which
// would duplicate what the command already printed. The `data` parameter is
// kept in the signature for symmetry with the JSON/Markdown renderers.
export function renderStyledResponse(_data: unknown, opts: ResponseOptions): void {
  if (opts.summary) {
    console.log(brand.primaryBold(opts.summary));
    console.log();
  }

  if (opts.notice) {
    console.log(brand.warning(opts.notice));
    console.log();
  }

  if (opts.breadcrumbs && opts.breadcrumbs.length > 0) {
    renderBreadcrumbs(opts.breadcrumbs);
  }
}

export function renderStyledError(error: CLIError): void {
  console.error(brand.error.bold(`Error: ${error.message}`));
  if (error.hint) {
    console.error(brand.muted(`  Hint: ${error.hint}`));
  }
}

function renderBreadcrumbs(breadcrumbs: Breadcrumb[]): void {
  console.log();
  console.log(divider());
  console.log(brand.bold('Hints:'));
  for (const bc of breadcrumbs) {
    const desc = bc.description ? brand.muted(` — ${bc.description}`) : '';
    console.log(`  ${brand.command(bc.cmd)}${desc}`);
  }
}

