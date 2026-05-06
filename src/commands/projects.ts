import { Command } from 'commander';
import { brand, divider, styleState } from '../output/theme.js';
import { errUsage } from '../output/errors.js';
import type { OutputWriter } from '../output/writer.js';
import type { ProjectSummary, ProjectDetail } from '../client.js';
import { requireClient } from './auth.js';
import { resolveProjectRef } from '../util/projects.js';
import { loadMembers, resolveAlias } from '../util/members.js';

const collectMany = (value: string, prev: string[] = []): string[] => prev.concat(value);

export function createProjectsCommand(getWriter: () => OutputWriter): Command {
  const projects = new Command('projects')
    .alias('project')
    .description('Manage projects');

  projects
    .command('list')
    .description('List projects accessible to this token (filters combine with AND)')
    .option('--favorites', "Only your own favorites (this token's agent user)")
    .option(
      '--favorited-by <handle>',
      'Only projects favorited by this person (repeatable; matches if ANY listed user has starred it)',
      collectMany,
      [] as string[],
    )
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();
      let data = await client.listProjects();

      const filters: string[] = [];

      if (opts.favorites) {
        data = data.filter((p) => p.isFavorite);
        filters.push('favorites');
      }

      const favoritedByAliases = opts.favoritedBy as string[];
      if (favoritedByAliases.length > 0) {
        const members = await loadMembers(client);
        const wantedIds = new Set<string>();
        for (const alias of favoritedByAliases) {
          const { match, candidates } = resolveAlias(alias, members);
          if (!match) {
            const list = (candidates.length > 0 ? candidates : members)
              .slice(0, 6)
              .map((m) => `  • ${m.name?.trim() || m.email.split('@')[0]} — ${m.email}`)
              .join('\n');
            const reason =
              candidates.length > 1
                ? `--favorited-by "${alias}" is ambiguous (${candidates.length} matches)`
                : `--favorited-by "${alias}" matches no member`;
            throw errUsage(`${reason}\n${list}`);
          }
          wantedIds.add(match.id);
        }
        data = data.filter((p) => p.favoritedBy.some((u) => wantedIds.has(u.id)));
        filters.push(`favorited-by=${favoritedByAliases.join(',')}`);
      }

      if (writer.isStyled()) {
        renderProjectsTable(data);
      }

      const filterSuffix = filters.length > 0 ? ` (${filters.join(', ')})` : '';

      writer.ok(data, {
        summary: `${data.length} project${data.length === 1 ? '' : 's'}${filterSuffix}`,
        breadcrumbs:
          data.length > 0
            ? [
                { action: 'Show project', cmd: `ccctl projects get ${data[0]!.id}` },
                { action: 'List tasks', cmd: `ccctl tasks list --project ${data[0]!.id}` },
              ]
            : [
                {
                  action: 'Create project',
                  cmd: 'ccctl projects create --title "My Project"',
                },
              ],
      });
    });

  projects
    .command('get <ref>')
    .description('Show a project with its tasks and recent logs (accepts ID or title)')
    .action(async (ref: string) => {
      const writer = getWriter();
      const client = requireClient();
      const id = await resolveProjectRef(client, ref);
      const project = await client.getProject(id);

      if (writer.isStyled()) {
        renderProjectDetail(project);
      }

      writer.ok(project, {
        summary: project.title,
        breadcrumbs: [
          { action: 'List tasks', cmd: `ccctl tasks list --project ${project.id}` },
          {
            action: 'Add log entry',
            cmd: `ccctl logs create --project ${project.id} --message "..."`,
          },
        ],
      });
    });

  projects
    .command('create')
    .description('Create a new project (requires projects:write)')
    .requiredOption('--title <title>', 'Project title')
    .option('--brain-dump <text>', 'Brain dump / notes')
    .option('--artifact-links <text>', 'Artifact links')
    .option('--state <state>', 'Initial state (Backlog, In Build, Live, Paused)', 'Backlog')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      const created = await client.createProject({
        title: opts.title,
        brainDump: opts.brainDump,
        artifactLinks: opts.artifactLinks,
        state: opts.state,
      });

      if (writer.isStyled()) {
        console.log(
          `  ${brand.success('✓')} Created ${brand.bold(created.title)} (${brand.muted(created.id)})`,
        );
        console.log();
      }

      writer.ok(created, {
        summary: `Created project "${created.title}"`,
        breadcrumbs: [
          { action: 'View project', cmd: `ccctl projects get ${created.id}` },
          { action: 'Add a task', cmd: `ccctl tasks create --project ${created.id} --title "..."` },
        ],
      });
    });

  projects
    .command('update <ref>')
    .description('Update a project (accepts ID or title; requires projects:write)')
    .option('--title <title>', 'New title')
    .option('--brain-dump <text>', 'New brain dump')
    .option('--artifact-links <text>', 'New artifact links')
    .option('--state <state>', 'New state (Backlog, In Build, Live, Paused)')
    .action(async (ref: string, opts) => {
      const writer = getWriter();

      if (
        opts.title === undefined &&
        opts.brainDump === undefined &&
        opts.artifactLinks === undefined &&
        opts.state === undefined
      ) {
        throw errUsage(
          'At least one of --title, --brain-dump, --artifact-links, or --state is required',
        );
      }

      const client = requireClient();
      const id = await resolveProjectRef(client, ref);
      const updated = await client.updateProject(id, {
        title: opts.title,
        brainDump: opts.brainDump,
        artifactLinks: opts.artifactLinks,
        state: opts.state,
      });

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Updated ${brand.bold(updated.title)}`);
        console.log();
      }

      writer.ok(updated, { summary: `Updated "${updated.title}"` });
    });

  projects
    .command('favorite <ref>')
    .alias('star')
    .description('Mark a project as a favorite for this agent (idempotent)')
    .action(async (ref: string) => {
      const writer = getWriter();
      const client = requireClient();
      const id = await resolveProjectRef(client, ref);
      const result = await client.setProjectFavorite(id, true);

      if (writer.isStyled()) {
        console.log(`  ${brand.success('★')} Favorited project ${brand.muted(`(${result.id})`)}`);
        console.log();
      }

      writer.ok(result, { summary: `Favorited project ${result.id}` });
    });

  projects
    .command('unfavorite <ref>')
    .alias('unstar')
    .description('Remove a project from this agent\'s favorites (idempotent)')
    .action(async (ref: string) => {
      const writer = getWriter();
      const client = requireClient();
      const id = await resolveProjectRef(client, ref);
      const result = await client.setProjectFavorite(id, false);

      if (writer.isStyled()) {
        console.log(`  ${brand.muted('☆')} Unfavorited project ${brand.muted(`(${result.id})`)}`);
        console.log();
      }

      writer.ok(result, { summary: `Unfavorited project ${result.id}` });
    });

  return projects;
}

function renderProjectsTable(projects: ProjectSummary[]): void {
  if (projects.length === 0) {
    console.log(brand.muted('  No projects'));
    return;
  }

  const titleW = Math.max(5, ...projects.map((p) => p.title.length));
  const stateW = Math.max(5, ...projects.map((p) => p.state.length));

  const header = [
    '  ', // 2-char gutter for the favorite indicator
    brand.bold('Title'.padEnd(titleW)),
    brand.bold('State'.padEnd(stateW)),
    brand.bold('Tasks'.padStart(6)),
    brand.bold('Stars'.padStart(5)),
    brand.bold('ID'),
  ].join('  ');

  console.log();
  console.log(header);
  console.log(divider(header.length));
  for (const p of projects) {
    const star = p.isFavorite ? brand.success('★') : ' ';
    const starCount = p.favoritedBy.length;
    const row = [
      ` ${star}`,
      p.title.padEnd(titleW),
      styleState(p.state).padEnd(stateW + 10), // +10 for ANSI color overhead
      String(p.taskCount).padStart(6),
      starCount > 0 ? brand.muted(String(starCount).padStart(5)) : ' '.repeat(5),
      brand.muted(p.id),
    ].join('  ');
    console.log(row);
  }
  console.log();
}

function renderProjectDetail(p: ProjectDetail): void {
  console.log();
  const titleLine = p.isFavorite ? `${brand.success('★')} ${p.title}` : p.title;
  console.log(brand.primaryBold(titleLine));
  console.log(divider(40));
  console.log(`  ${brand.label('id'.padEnd(10))} ${p.id}`);
  console.log(`  ${brand.label('state'.padEnd(10))} ${styleState(p.state)}`);
  console.log(`  ${brand.label('owner'.padEnd(10))} ${ownerLabel(p.owner)}`);
  console.log(`  ${brand.label('created'.padEnd(10))} ${p.createdAt}`);
  console.log(`  ${brand.label('updated'.padEnd(10))} ${p.updatedAt}`);
  if (p.favoritedBy.length > 0) {
    console.log(
      `  ${brand.label('starred by'.padEnd(10))} ${p.favoritedBy.map(ownerLabel).join(', ')}`,
    );
  }

  if (p.tasks.length > 0) {
    console.log();
    console.log(brand.bold(`Tasks (${p.tasks.length})`));
    for (const t of p.tasks) {
      const assignees =
        t.assignees.length > 0
          ? brand.muted(' — ' + t.assignees.map(ownerLabel).join(', '))
          : '';
      console.log(`  ${brand.muted('·')} ${brand.muted(`[${t.columnId}]`)} ${t.title}${assignees}`);
    }
  }

  if (p.logs.length > 0) {
    console.log();
    console.log(brand.bold(`Recent logs`));
    for (const log of p.logs.slice(0, 5)) {
      console.log(`  ${brand.muted('·')} ${log.text}`);
    }
  }

  console.log();
}

function ownerLabel(u: { name: string | null; email: string; isAgent?: boolean } | null): string {
  if (!u) return brand.muted('(unknown)');
  const name = u.name || u.email.split('@')[0]!;
  return u.isAgent ? brand.agent(`🤖 ${name}`) : name;
}
