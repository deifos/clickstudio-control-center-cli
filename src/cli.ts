import { Command } from 'commander';
import { VERSION } from './version.js';
import { OutputWriter, Format } from './output/writer.js';
import { CLIError, DryRunPreview } from './output/errors.js';
import { setBaseUrlOverride, setDryRun } from './config/config.js';
import { createAuthCommand } from './commands/auth.js';
import { createOrgCommand } from './commands/org.js';
import { createProjectsCommand } from './commands/projects.js';
import { createTasksCommand } from './commands/tasks.js';
import { createLogsCommand } from './commands/logs.js';
import { createNotesCommand } from './commands/notes.js';
import { createIdeasCommand } from './commands/ideas.js';
import { createMentionsCommand } from './commands/mentions.js';
import { createDoctorCommand } from './commands/doctor.js';

let writer: OutputWriter;

function resolveFormat(opts: {
  json?: boolean;
  quiet?: boolean;
  agent?: boolean;
  md?: boolean;
}): Format {
  if (opts.agent || opts.quiet) return Format.Quiet;
  if (opts.json) return Format.JSON;
  if (opts.md) return Format.Markdown;
  return Format.Auto;
}

function getWriter(): OutputWriter {
  return writer;
}

export function run(): void {
  const program = new Command('ccctl')
    .version(VERSION, '-v, --version')
    .description('Click Studio Control Center CLI — manage projects, tasks, and logs from the terminal or an agent')
    .option('-j, --json', 'Output as JSON envelope')
    .option('-q, --quiet', 'Output raw JSON only (no envelope)')
    .option('--agent', 'Agent mode (alias for --quiet)')
    .option('-m, --md', 'Output as Markdown')
    .option('--base-url <url>', 'API base URL override')
    .option('--dry-run', 'Print the request that WOULD be sent on writes (POST/PATCH/DELETE) and exit 0 without mutating data')
    .helpOption('--help', 'Show help for command')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      const format = resolveFormat(opts);
      writer = new OutputWriter({ format });
      if (opts.baseUrl) {
        setBaseUrlOverride(opts.baseUrl);
      }
      if (opts.dryRun) {
        setDryRun(true);
      }
    });

  program.addCommand(createAuthCommand(getWriter));
  program.addCommand(createOrgCommand(getWriter));
  program.addCommand(createProjectsCommand(getWriter));
  program.addCommand(createTasksCommand(getWriter));
  program.addCommand(createLogsCommand(getWriter));
  program.addCommand(createNotesCommand(getWriter));
  program.addCommand(createIdeasCommand(getWriter));
  program.addCommand(createMentionsCommand(getWriter));
  program.addCommand(createDoctorCommand(getWriter));

  program.exitOverride();

  (async () => {
    try {
      await program.parseAsync(process.argv);
    } catch (error) {
      if (!writer) {
        writer = new OutputWriter({ format: Format.Auto });
      }

      if (error instanceof DryRunPreview) {
        writer.ok(
          {
            dryRun: true,
            method: error.method,
            url: error.url,
            body: error.body ?? null,
          },
          {
            summary: `DRY RUN — would ${error.method} ${error.url}`,
            notice: 'No data was mutated. Re-run without --dry-run to apply.',
          },
        );
        process.exit(0);
      }

      if (error instanceof CLIError) {
        writer.err(error);
        process.exit(error.exitCode);
      }

      // Commander's own help/version errors. Must come AFTER the CLIError
      // branch — CLIError also exposes an `exitCode` property, so this
      // generic check would otherwise swallow it without printing anything.
      if (error instanceof Error && 'exitCode' in error) {
        const exitCode = (error as { exitCode: number }).exitCode;
        process.exit(exitCode);
      }

      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })();
}
