import { Command } from 'commander';
import { brand, divider } from '../output/theme.js';
import { errUsage } from '../output/errors.js';
import type { OutputWriter } from '../output/writer.js';
import type { IdeaSummary, IdeaDetail } from '../client.js';
import { requireClient } from './auth.js';

const STATUS_STYLES: Record<string, (s: string) => string> = {
  Pending: brand.warning,
  Promoted: brand.success,
  Archived: brand.muted,
};

function styleStatus(status: string): string {
  const styler = STATUS_STYLES[status] ?? brand.muted;
  return styler(status);
}

export function createIdeasCommand(getWriter: () => OutputWriter): Command {
  const ideas = new Command('ideas').alias('idea').description('Capture and list ideas');

  ideas
    .command('list')
    .description('List ideas in the org')
    .option('--status <status>', 'Filter by status: Pending, Promoted, Archived')
    .option('--limit <n>', 'Maximum number of ideas to return', '50')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      if (opts.status && !['Pending', 'Promoted', 'Archived'].includes(opts.status)) {
        throw errUsage('--status must be one of: Pending, Promoted, Archived');
      }

      const limit = parseInt(opts.limit, 10);
      if (Number.isNaN(limit) || limit < 1) {
        throw errUsage('--limit must be a positive integer');
      }

      const data = await client.listIdeas({ status: opts.status, limit });

      if (writer.isStyled()) {
        renderIdeasTable(data);
      }

      writer.ok(data, {
        summary: `${data.length} idea${data.length === 1 ? '' : 's'}${opts.status ? ` (${opts.status})` : ''}`,
        breadcrumbs:
          data.length > 0
            ? [
                { action: 'Show idea', cmd: `ccctl ideas get ${data[0]!.id}` },
                { action: 'Capture another', cmd: 'ccctl ideas create --title "..."' },
              ]
            : [{ action: 'Capture an idea', cmd: 'ccctl ideas create --title "..."' }],
      });
    });

  ideas
    .command('get <id>')
    .description('Show a single idea (with name suggestions if any)')
    .action(async (id: string) => {
      const writer = getWriter();
      const client = requireClient();
      const idea = await client.getIdea(id);

      if (writer.isStyled()) {
        renderIdeaDetail(idea);
      }

      writer.ok(idea, { summary: idea.title });
    });

  ideas
    .command('create')
    .description('Capture a new idea')
    .requiredOption('--title <title>', 'Idea title')
    .option('--description <text>', 'Description / context')
    .option(
      '--links <links>',
      'Newline-separated links, or pass --link multiple times',
    )
    .option('--link <url>', 'Add a link (repeatable)', collect, [] as string[])
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      const links: string[] | string | undefined =
        Array.isArray(opts.link) && opts.link.length > 0
          ? (opts.link as string[])
          : opts.links;

      const created = await client.createIdea({
        title: opts.title,
        description: opts.description,
        links,
      });

      if (writer.isStyled()) {
        console.log(
          `  ${brand.success('✓')} Captured idea ${brand.bold(created.title)} ${brand.muted(`(${created.id})`)}`,
        );
        console.log();
      }

      writer.ok(created, {
        summary: `Captured "${created.title}"`,
        breadcrumbs: [
          { action: 'View idea', cmd: `ccctl ideas get ${created.id}` },
          { action: 'List ideas', cmd: 'ccctl ideas list' },
        ],
      });
    });

  return ideas;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function renderIdeasTable(ideas: IdeaSummary[]): void {
  if (ideas.length === 0) {
    console.log(brand.muted('  No ideas yet'));
    return;
  }

  const titleW = Math.max(5, ...ideas.map((i) => i.title.length));
  console.log();
  for (const i of ideas) {
    const status = styleStatus(i.status);
    const captured =
      i.capturedBy &&
      (i.capturedBy.isAgent
        ? brand.agent(`🤖 ${i.capturedBy.name || i.capturedBy.email.split('@')[0]}`)
        : brand.muted(i.capturedBy.name || i.capturedBy.email.split('@')[0]));
    console.log(
      `  ${status.padEnd(20)} ${i.title.padEnd(titleW)}  ${brand.muted(i.id)}${captured ? '  ' + captured : ''}`,
    );
  }
  console.log();
}

function renderIdeaDetail(i: IdeaDetail): void {
  console.log();
  console.log(brand.primaryBold(i.title));
  console.log(divider(40));
  console.log(`  ${brand.label('id'.padEnd(11))} ${i.id}`);
  console.log(`  ${brand.label('status'.padEnd(11))} ${styleStatus(i.status)}`);
  console.log(`  ${brand.label('source'.padEnd(11))} ${i.source}`);
  if (i.capturedBy) {
    const name = i.capturedBy.name || i.capturedBy.email.split('@')[0];
    console.log(
      `  ${brand.label('captured'.padEnd(11))} ${i.capturedBy.isAgent ? brand.agent(`🤖 ${name}`) : name}`,
    );
  }
  console.log(`  ${brand.label('created'.padEnd(11))} ${i.createdAt}`);
  if (i.promotedToProject) {
    console.log(
      `  ${brand.label('promoted'.padEnd(11))} ${brand.success(i.promotedToProject.title)} ${brand.muted(`(${i.promotedToProject.id})`)}`,
    );
  }

  if (i.description) {
    console.log();
    console.log(brand.label('Description'));
    console.log(`  ${i.description}`);
  }

  if (i.links) {
    console.log();
    console.log(brand.label('Links'));
    for (const l of i.links.split('\n').filter(Boolean)) {
      console.log(`  ${brand.muted('·')} ${l}`);
    }
  }

  if (i.nameSuggestions && i.nameSuggestions.length > 0) {
    console.log();
    console.log(brand.label(`Name suggestions (${i.nameSearchStatus})`));
    for (const s of i.nameSuggestions) {
      console.log(`  ${brand.muted('·')} ${brand.bold(s.name)} ${brand.muted(s.domain)}`);
      if (s.rationale) console.log(`    ${brand.muted(s.rationale)}`);
    }
  }

  console.log();
}
