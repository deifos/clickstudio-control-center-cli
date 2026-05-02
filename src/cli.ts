import { Command } from 'commander';
import { VERSION } from './version.js';
import { OutputWriter, Format } from './output/writer.js';
import { CLIError } from './output/errors.js';
import { setBaseUrlOverride } from './config/config.js';
import { createAuthCommand } from './commands/auth.js';
import { createOrgCommand } from './commands/org.js';
import { createProjectsCommand } from './commands/projects.js';
import { createTasksCommand } from './commands/tasks.js';
import { createLogsCommand } from './commands/logs.js';
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
    .helpOption('--help', 'Show help for command')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      const format = resolveFormat(opts);
      writer = new OutputWriter({ format });
      if (opts.baseUrl) {
        setBaseUrlOverride(opts.baseUrl);
      }
    });

  program.addCommand(createAuthCommand(getWriter));
  program.addCommand(createOrgCommand(getWriter));
  program.addCommand(createProjectsCommand(getWriter));
  program.addCommand(createTasksCommand(getWriter));
  program.addCommand(createLogsCommand(getWriter));
  program.addCommand(createIdeasCommand(getWriter));
  program.addCommand(createMentionsCommand(getWriter));
  program.addCommand(createDoctorCommand(getWriter));

  program.exitOverride();

  (async () => {
    try {
      await program.parseAsync(process.argv);
    } catch (error) {
      if (error instanceof CLIError) {
        if (!writer) {
          writer = new OutputWriter({ format: Format.Auto });
        }
        writer.err(error);
        process.exit(error.exitCode);
      }

      // Commander's own help/version errors
      if (error instanceof Error && 'exitCode' in error) {
        const exitCode = (error as { exitCode: number }).exitCode;
        process.exit(exitCode);
      }

      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })();
}
