import { Command } from 'commander';
import { brand } from '../output/theme.js';
import type { OutputWriter } from '../output/writer.js';
import { requireClient } from './auth.js';
import { resolveProjectRef } from '../util/projects.js';

export function createLogsCommand(getWriter: () => OutputWriter): Command {
  const logs = new Command('logs').alias('log').description('Project log entries');

  logs
    .command('create')
    .description('Append a log entry to a project')
    .requiredOption('--project <ref>', 'Project ID or title')
    .requiredOption('--message <text>', 'Log message')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      const projectId = await resolveProjectRef(client, opts.project);
      const log = await client.createLog({
        projectId,
        text: opts.message,
      });

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Logged: ${log.text}`);
        console.log();
      }

      writer.ok(log, { summary: 'Log entry added' });
    });

  return logs;
}
