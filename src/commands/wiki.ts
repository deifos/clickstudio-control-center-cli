import { Command } from 'commander';
import { brand, divider } from '../output/theme.js';
import { errUsage } from '../output/errors.js';
import type { OutputWriter } from '../output/writer.js';
import type { WikiEntrySummary } from '../client.js';
import { requireClient } from './auth.js';
import { resolveWikiRef } from '../util/wiki.js';

export function createWikiCommand(getWriter: () => OutputWriter): Command {
  const wiki = new Command('wiki').description('Browse and edit the org wiki');

  wiki
    .command('list')
    .description('List wiki entries (newest first)')
    .option('--search <text>', 'Filter by title/links/content/tags (case-insensitive)')
    .option('--limit <n>', 'Maximum number of entries to return', '100')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      const limit = parseInt(opts.limit, 10);
      if (Number.isNaN(limit) || limit < 1) {
        throw errUsage('--limit must be a positive integer');
      }

      const data = await client.listWiki({ search: opts.search, limit });

      if (writer.isStyled()) {
        renderWikiTable(data);
      }

      writer.ok(data, {
        summary: `${data.length} wiki entr${data.length === 1 ? 'y' : 'ies'}${opts.search ? ` matching "${opts.search}"` : ''}`,
        breadcrumbs:
          data.length > 0
            ? [
                { action: 'Show entry', cmd: `ccctl wiki get ${data[0]!.id}` },
                { action: 'Capture another', cmd: 'ccctl wiki create --title "..."' },
              ]
            : [{ action: 'Capture an entry', cmd: 'ccctl wiki create --title "..."' }],
      });
    });

  wiki
    .command('get <ref>')
    .description('Show a single wiki entry (by ID or title)')
    .action(async (ref: string) => {
      const writer = getWriter();
      const client = requireClient();
      const id = await resolveWikiRef(client, ref);
      const entry = await client.getWikiEntry(id);

      if (writer.isStyled()) {
        renderWikiDetail(entry);
      }

      writer.ok(entry, { summary: entry.title });
    });

  wiki
    .command('create')
    .description('Capture a new wiki entry')
    .option('--title <title>', 'Entry title (defaults to first non-empty line of links/content)')
    .option('--links <text>', 'Newline-separated links or paths')
    .option('--content <text>', 'Notes / freeform body (markdown ok)')
    .option('--tags <text>', 'Comma-separated tags')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      if (
        opts.title === undefined &&
        opts.links === undefined &&
        opts.content === undefined &&
        opts.tags === undefined
      ) {
        throw errUsage('At least one of --title, --links, --content, or --tags is required');
      }

      const created = await client.createWikiEntry({
        title: opts.title,
        links: opts.links,
        content: opts.content,
        tags: opts.tags,
      });

      if (writer.isStyled()) {
        console.log(
          `  ${brand.success('✓')} Captured wiki entry ${brand.bold(created.title)} ${brand.muted(`(${created.id})`)}`,
        );
        console.log();
      }

      writer.ok(created, {
        summary: `Captured "${created.title}"`,
        breadcrumbs: [
          { action: 'View entry', cmd: `ccctl wiki get ${created.id}` },
          { action: 'List wiki', cmd: 'ccctl wiki list' },
        ],
      });
    });

  wiki
    .command('update <ref>')
    .description('Update a wiki entry — change title, links, content, or tags')
    .option('--title <title>', 'New title')
    .option('--links <text>', 'New links (full replace)')
    .option('--content <text>', 'New notes/body (full replace)')
    .option('--tags <text>', 'New tags (full replace)')
    .action(async (ref: string, opts) => {
      const writer = getWriter();

      if (
        opts.title === undefined &&
        opts.links === undefined &&
        opts.content === undefined &&
        opts.tags === undefined
      ) {
        throw errUsage('At least one of --title, --links, --content, or --tags is required');
      }

      const client = requireClient();
      const id = await resolveWikiRef(client, ref);
      const updated = await client.updateWikiEntry(id, {
        title: opts.title,
        links: opts.links,
        content: opts.content,
        tags: opts.tags,
      });

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Updated ${brand.bold(updated.title)}`);
        console.log();
      }

      writer.ok(updated, { summary: `Updated "${updated.title}"` });
    });

  wiki
    .command('delete <ref>')
    .alias('rm')
    .description('Delete a wiki entry (irreversible — requires wiki:write scope)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (ref: string, opts) => {
      const writer = getWriter();
      const client = requireClient();

      const id = await resolveWikiRef(client, ref);

      if (!opts.yes && writer.isStyled() && process.stdin.isTTY) {
        const entry = await client.getWikiEntry(id);
        process.stdout.write(
          `${brand.warning('!')} Delete wiki entry ${brand.bold(entry.title)} ${brand.muted(`(${entry.id})`)}? [y/N] `,
        );
        const answer = await new Promise<string>((resolve) => {
          process.stdin.once('data', (chunk) => resolve(chunk.toString().trim().toLowerCase()));
        });
        process.stdin.pause();
        if (answer !== 'y' && answer !== 'yes') {
          throw errUsage('Cancelled');
        }
      }

      const result = await client.deleteWikiEntry(id);

      if (writer.isStyled()) {
        console.log(
          `  ${brand.success('✓')} Deleted ${brand.bold(result.title)} ${brand.muted(`(${result.id})`)}`,
        );
        console.log();
      }

      writer.ok(result, { summary: `Deleted "${result.title}"` });
    });

  return wiki;
}

function renderWikiTable(entries: WikiEntrySummary[]): void {
  if (entries.length === 0) {
    console.log(brand.muted('  No wiki entries'));
    return;
  }

  const titleW = Math.max(5, ...entries.map((e) => e.title.length));
  console.log();
  for (const e of entries) {
    const author = e.author ? authorLabel(e.author) : brand.muted('(unknown)');
    const tags = e.tags ? brand.muted(`[${e.tags}]`) : '';
    console.log(
      `  ${e.title.padEnd(titleW)}  ${brand.muted(e.id)}  ${brand.muted('—')} ${author}${tags ? '  ' + tags : ''}`,
    );
  }
  console.log();
}

function renderWikiDetail(e: WikiEntrySummary): void {
  console.log();
  console.log(brand.primaryBold(e.title));
  console.log(divider(40));
  console.log(`  ${brand.label('id'.padEnd(11))} ${e.id}`);
  console.log(
    `  ${brand.label('author'.padEnd(11))} ${e.author ? authorLabel(e.author) : brand.muted('(unknown)')}`,
  );
  console.log(`  ${brand.label('updated'.padEnd(11))} ${e.updatedAt}`);
  if (e.tags) {
    console.log(`  ${brand.label('tags'.padEnd(11))} ${e.tags}`);
  }
  if (e.links) {
    console.log();
    console.log(brand.label('Links'));
    for (const l of e.links.split('\n').filter(Boolean)) {
      console.log(`  ${brand.muted('·')} ${l}`);
    }
  }
  if (e.content) {
    console.log();
    console.log(brand.label('Content'));
    console.log(`  ${e.content.replace(/\n/g, '\n  ')}`);
  }
  console.log();
}

function authorLabel(u: { name: string | null; isAgent: boolean }): string {
  const name = u.name || '(unknown)';
  return u.isAgent ? brand.agent(`🤖 ${name}`) : name;
}
