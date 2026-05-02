import { Command } from 'commander';
import { AuthManager } from '../auth/manager.js';
import { saveCredentials } from '../config/credentials.js';
import { loadConfig } from '../config/config.js';
import { CCCTLClient } from '../client.js';
import { errAuth, errUsage } from '../output/errors.js';
import { brand, divider, logo } from '../output/theme.js';
import type { OutputWriter } from '../output/writer.js';

export function createAuthCommand(getWriter: () => OutputWriter): Command {
  const auth = new Command('auth').description('Manage authentication');

  auth
    .command('login')
    .description('Save an agent token to your credential store')
    .requiredOption('--token <token>', 'Agent token (starts with ccs_)')
    .action(async (opts) => {
      const writer = getWriter();
      const config = loadConfig();
      const token: string = opts.token;

      if (!token.startsWith('ccs_')) {
        throw errUsage(
          'Token must start with "ccs_"',
          'Mint one at /dashboard/admin/agent-tokens',
        );
      }

      // Verify the token by calling whoami
      const client = new CCCTLClient({ token, baseUrl: config.baseUrl });
      const me = await client.whoami();

      saveCredentials({
        token,
        agentName: me.agent.name,
        organizationId: me.organizationId,
        scopes: me.scopes,
        createdAt: new Date().toISOString(),
      });

      if (writer.isStyled()) {
        console.log();
        console.log(`  ${logo()}`);
        console.log();
        console.log(`  ${brand.success('✓')} Authenticated as ${brand.agent('🤖 ' + me.agent.name)}`);
        console.log(`    ${brand.muted('org:')}    ${me.organizationId}`);
        console.log(`    ${brand.muted('scopes:')} ${me.scopes.join(', ')}`);
        console.log();
      }

      writer.ok(
        {
          authenticated: true,
          agent: me.agent.name,
          organizationId: me.organizationId,
          scopes: me.scopes,
        },
        {
          summary: `Logged in as 🤖 ${me.agent.name}`,
          breadcrumbs: [
            { action: 'List projects', cmd: 'ccctl projects list' },
            { action: 'Show org info', cmd: 'ccctl org info' },
            { action: 'Run diagnostics', cmd: 'ccctl doctor' },
          ],
        },
      );
    });

  auth
    .command('logout')
    .description('Clear stored credentials')
    .action(() => {
      const writer = getWriter();
      const manager = new AuthManager();

      if (!manager.isAuthenticated()) {
        writer.ok({ authenticated: false }, { summary: 'Already logged out' });
        return;
      }

      if (manager.getSource() === 'env') {
        throw errUsage(
          'Credentials are set via CLICKSTUDIO_AGENT_TOKEN environment variable',
          'Unset it first: unset CLICKSTUDIO_AGENT_TOKEN',
        );
      }

      manager.logout();

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Logged out`);
        console.log();
      }

      writer.ok(
        { authenticated: false },
        {
          summary: 'Logged out',
          breadcrumbs: [{ action: 'Log back in', cmd: 'ccctl auth login --token ccs_...' }],
        },
      );
    });

  auth
    .command('status')
    .description('Show authentication status')
    .action(() => {
      const writer = getWriter();
      const manager = new AuthManager();
      const creds = manager.getCredentials();

      if (!creds) {
        throw errAuth('Not authenticated');
      }

      const data = {
        authenticated: true,
        source: manager.getSource(),
        token: manager.getTokenPreview(),
        agent: creds.agentName ?? null,
        organizationId: creds.organizationId ?? null,
        scopes: creds.scopes ?? null,
      };

      if (writer.isStyled()) {
        console.log();
        console.log(brand.bold('Authentication status'));
        console.log(divider(35));
        console.log(`  ${brand.label('Source')}    ${data.source}`);
        console.log(`  ${brand.label('Token')}     ${data.token}`);
        console.log(`  ${brand.label('Agent')}     ${data.agent ? brand.agent('🤖 ' + data.agent) : brand.muted('(unknown)')}`);
        console.log(`  ${brand.label('Org')}       ${data.organizationId ?? brand.muted('(unknown)')}`);
        console.log(
          `  ${brand.label('Scopes')}    ${data.scopes ? data.scopes.join(', ') : brand.muted('(unknown)')}`,
        );
        console.log();
      }

      writer.ok(data, {
        summary: `Authenticated${creds.agentName ? ` as 🤖 ${creds.agentName}` : ''}`,
        breadcrumbs: [
          { action: 'Show org', cmd: 'ccctl org info' },
          { action: 'Log out', cmd: 'ccctl auth logout' },
        ],
      });
    });

  auth
    .command('whoami')
    .description('Verify the token against the API and print agent identity')
    .action(async () => {
      const writer = getWriter();
      const client = requireClient();
      const me = await client.whoami();

      if (writer.isStyled()) {
        console.log();
        console.log(`  ${brand.agent('🤖 ' + me.agent.name)}`);
        console.log(`  ${brand.muted('org:')}    ${me.organizationId}`);
        console.log(`  ${brand.muted('scopes:')} ${me.scopes.join(', ')}`);
        console.log(
          `  ${brand.muted('access:')} ${me.accessAllProjects ? 'all projects' : `${me.projectIds.length} project(s)`}`,
        );
        console.log();
      }

      writer.ok(me, { summary: `Logged in as 🤖 ${me.agent.name}` });
    });

  auth
    .command('token')
    .description('Print the current token (for scripting)')
    .action(() => {
      const manager = new AuthManager();
      const token = manager.resolveToken();
      if (!token) throw errAuth('Not authenticated');
      process.stdout.write(token);
    });

  return auth;
}

export function requireClient(): CCCTLClient {
  const manager = new AuthManager();
  const token = manager.resolveToken();
  if (!token) throw errAuth();
  const config = loadConfig();
  return new CCCTLClient({ token, baseUrl: config.baseUrl });
}
