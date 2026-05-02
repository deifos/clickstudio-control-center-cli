import { Command } from 'commander';
import { AuthManager } from '../auth/manager.js';
import { loadConfig } from '../config/config.js';
import { CCCTLClient } from '../client.js';
import { brand, divider } from '../output/theme.js';
import { ExitAPI } from '../output/codes.js';
import { VERSION } from '../version.js';
import type { OutputWriter } from '../output/writer.js';

export function createDoctorCommand(getWriter: () => OutputWriter): Command {
  return new Command('doctor')
    .description('Run diagnostics: check token, base URL, and API reachability')
    .action(async () => {
      const writer = getWriter();
      const config = loadConfig();
      const manager = new AuthManager();
      const token = manager.resolveToken();
      const tokenSource = manager.getSource();

      const checks: Array<{ name: string; status: 'ok' | 'warn' | 'fail'; detail?: string }> = [];

      checks.push({ name: 'CLI version', status: 'ok', detail: VERSION });
      checks.push({ name: 'Base URL', status: 'ok', detail: config.baseUrl });
      checks.push({
        name: 'Token',
        status: token ? 'ok' : 'fail',
        detail: token ? `${manager.getTokenPreview()} (${tokenSource})` : 'not set',
      });

      let apiReachable = false;
      let agentName: string | null = null;
      let scopes: string[] = [];

      if (token) {
        try {
          const client = new CCCTLClient({ token, baseUrl: config.baseUrl, timeoutMs: 10_000 });
          const me = await client.whoami();
          apiReachable = true;
          agentName = me.agent.name;
          scopes = me.scopes;
          checks.push({ name: 'API reachable', status: 'ok', detail: 'whoami succeeded' });
          checks.push({
            name: 'Agent identity',
            status: 'ok',
            detail: `🤖 ${me.agent.name}`,
          });
          checks.push({ name: 'Scopes', status: 'ok', detail: me.scopes.join(', ') });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({ name: 'API reachable', status: 'fail', detail: msg });
        }
      } else {
        checks.push({ name: 'API reachable', status: 'warn', detail: 'skipped (no token)' });
      }

      const allOk = checks.every((c) => c.status === 'ok');

      if (writer.isStyled()) {
        console.log();
        console.log(brand.bold('Diagnostics'));
        console.log(divider(40));
        for (const c of checks) {
          const mark =
            c.status === 'ok' ? brand.success('✓') : c.status === 'warn' ? brand.warning('!') : brand.error('✗');
          console.log(`  ${mark} ${c.name.padEnd(18)} ${brand.muted(c.detail ?? '')}`);
        }
        console.log();
      }

      writer.ok(
        {
          ok: allOk,
          version: VERSION,
          baseUrl: config.baseUrl,
          tokenSource,
          apiReachable,
          agent: agentName,
          scopes,
          checks,
        },
        {
          summary: allOk ? 'All checks passed' : 'Some checks failed',
        },
      );

      // Surface failure to the shell so CI / supervisor scripts / agent
      // health checks can detect a broken setup. We set process.exitCode
      // (instead of process.exit) so the writer's stdout flush completes
      // before the process closes.
      if (!allOk) {
        process.exitCode = ExitAPI;
      }
    });
}
