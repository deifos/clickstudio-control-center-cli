import { Command } from 'commander';
import { brand, divider } from '../output/theme.js';
import { errUsage } from '../output/errors.js';
import type { OutputWriter } from '../output/writer.js';
import type { TaskSummary } from '../client.js';
import { requireClient } from './auth.js';
import { resolveAssignees, findPlainHandles, loadMembers, resolveAlias } from '../util/members.js';
import { resolveProjectRef } from '../util/projects.js';
import { resolveTaskRef } from '../util/tasks.js';

const collectMany = (value: string, prev: string[] = []): string[] => prev.concat(value);

// Surface a warning when an agent writes `@vlad` in plain text but didn't
// pass an --assignee flag. Plain `@handles` don't parse as tiptap mentions
// on the dashboard, so they neither trigger a notification nor set
// assignees — the exact silent-failure mode that motivated assignee support
// in the first place. We warn instead of auto-promoting because guessing
// what the agent meant is brittle.
function plainHandleNotice(description: string | undefined, hasExplicitAssignees: boolean): string | undefined {
  if (hasExplicitAssignees || !description) return undefined;
  const handles = findPlainHandles(description);
  if (handles.length === 0) return undefined;
  const sample = handles.slice(0, 3).join(', ');
  return `Description contains plain ${sample}${handles.length > 3 ? ` (+${handles.length - 3} more)` : ''}, but no --assignee was given. Plain @handles are not parsed as mentions or assignments — pass --assignee ${handles[0]} to actually assign and notify.`;
}

export function createTasksCommand(getWriter: () => OutputWriter): Command {
  const tasks = new Command('tasks').alias('task').description('Manage tasks');

  tasks
    .command('list')
    .description('List tasks for a project (filters combine with AND)')
    .requiredOption('--project <ref>', 'Project ID or title (e.g. "Acme Web")')
    .option('--status <columnId>', 'Filter by column (todo, doing, done, ...)')
    .option('--assignee <handle>', 'Filter by assignee — repeatable; matches if ANY listed assignee is on the task', collectMany, [] as string[])
    .option('--section <name>', 'Filter by section (case-insensitive)')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      const projectId = await resolveProjectRef(client, opts.project);
      let data = await client.listTasks(projectId);

      const filters: string[] = [];

      if (opts.status) {
        const status = String(opts.status).toLowerCase();
        data = data.filter((t) => t.columnId.toLowerCase() === status);
        filters.push(`status=${opts.status}`);
      }

      if (opts.section) {
        const section = String(opts.section).toLowerCase();
        data = data.filter((t) => t.section.toLowerCase() === section);
        filters.push(`section=${opts.section}`);
      }

      const assigneeAliases = opts.assignee as string[];
      if (assigneeAliases.length > 0) {
        // Resolve each alias against members. Bad aliases fail loudly here
        // rather than silently returning zero results — saves the agent from
        // chasing a phantom empty board.
        const members = await loadMembers(client);
        const wantedIds = new Set<string>();
        for (const alias of assigneeAliases) {
          const { match, candidates } = resolveAlias(alias, members);
          if (!match) {
            const candidateLines = (candidates.length > 0 ? candidates : members)
              .slice(0, 6)
              .map((m) => `  • ${m.name?.trim() || m.email.split('@')[0]} — ${m.email}`)
              .join('\n');
            const reason = candidates.length > 1
              ? `--assignee "${alias}" is ambiguous (${candidates.length} matches)`
              : `--assignee "${alias}" matches no member`;
            throw errUsage(`${reason}\n${candidateLines}`);
          }
          wantedIds.add(match.id);
        }
        data = data.filter((t) => t.assignees.some((a) => wantedIds.has(a.id)));
        filters.push(`assignee=${assigneeAliases.join(',')}`);
      }

      if (writer.isStyled()) {
        renderTasksTable(data);
      }

      const filterSuffix = filters.length > 0 ? ` (${filters.join(', ')})` : '';

      writer.ok(data, {
        summary: `${data.length} task${data.length === 1 ? '' : 's'} in ${projectId}${filterSuffix}`,
        breadcrumbs:
          data.length > 0
            ? [
                { action: 'Get task', cmd: `ccctl tasks get ${data[0]!.id}` },
                { action: 'Update status', cmd: `ccctl tasks update ${data[0]!.id} --status doing` },
              ]
            : [
                {
                  action: 'Create task',
                  cmd: `ccctl tasks create --project ${projectId} --title "..."`,
                },
              ],
      });
    });

  tasks
    .command('get <ref>')
    .description('Show a single task by ID, or by title with --project')
    .option('--project <ref>', 'Project ID or title (required when <ref> is a title)')
    .action(async (ref: string, opts) => {
      const writer = getWriter();
      const client = requireClient();

      const taskId = await resolveTaskRef(client, ref, opts.project);
      const task = await client.getTask(taskId);

      if (writer.isStyled()) {
        renderTaskDetail(task);
      }

      writer.ok(task, { summary: task.title });
    });

  tasks
    .command('create')
    .description('Create a task (auto-assigned to the agent unless --assignee is given)')
    .requiredOption('--project <ref>', 'Project ID or title')
    .requiredOption('--title <title>', 'Task title')
    .option('--description <text>', 'Task description')
    .option('--status <columnId>', 'Initial column (todo, doing, done, ...)', 'todo')
    .option('--section <section>', 'Section (Product, Marketing)', 'Product')
    .option(
      '--assignee <handle>',
      'Assign by handle (@vlad, @alex) — repeatable, resolves via /api/agent/members',
      collectMany,
      [] as string[],
    )
    .option(
      '--assignee-id <userId>',
      'Assign by raw user ID — repeatable',
      collectMany,
      [] as string[],
    )
    .option('--no-assign-self', "Don't auto-assign the task to this agent")
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      const aliases = opts.assignee as string[];
      const rawIds = opts.assigneeId as string[];
      const [projectId, assigneeIds] = await Promise.all([
        resolveProjectRef(client, opts.project),
        resolveAssignees(client, aliases, rawIds),
      ]);

      // If the caller passed assignees, default to NOT also auto-adding self
      // (the server applies the same rule). Otherwise honour --no-assign-self.
      const userSetAssignees = aliases.length > 0 || rawIds.length > 0;

      const created = await client.createTask({
        projectId,
        title: opts.title,
        description: opts.description,
        status: opts.status,
        section: opts.section,
        ...(assigneeIds.length > 0 && { assigneeIds }),
        ...(userSetAssignees ? { assignToSelf: false } : { assignToSelf: opts.assignSelf }),
      });

      if (writer.isStyled()) {
        console.log(
          `  ${brand.success('✓')} Created task ${brand.bold(created.title)} ${brand.muted(`(${created.id})`)}`,
        );
        console.log();
      }

      writer.ok(created, {
        summary: `Created task "${created.title}"`,
        notice: plainHandleNotice(opts.description, userSetAssignees),
        breadcrumbs: [
          { action: 'Move to doing', cmd: `ccctl tasks update ${created.id} --status doing` },
          { action: 'Mark done', cmd: `ccctl tasks update ${created.id} --status done` },
        ],
      });
    });

  tasks
    .command('update <ref>')
    .description('Update a task — change title, status, description, assignees, etc.')
    .option('--project <ref>', 'Project ID or title (required when <ref> is a task title)')
    .option('--title <title>', 'New title')
    .option('--description <text>', 'Replace description with this text')
    .option('--append-description <text>', 'Append text to the existing description (separator: blank line)')
    .option('--prepend-description <text>', 'Prepend text to the existing description (separator: blank line)')
    .option('--status <columnId>', 'New column (todo, doing, done, ...)')
    .option('--section <section>', 'New section (Product, Marketing)')
    .option(
      '--assignee <handle>',
      'Replace assignees with this set (repeatable: @vlad, @alex)',
      collectMany,
      [] as string[],
    )
    .option(
      '--assignee-id <userId>',
      'Replace assignees by raw user ID — repeatable',
      collectMany,
      [] as string[],
    )
    .option(
      '--add-assignee <handle>',
      'Add an assignee without dropping existing ones (repeatable)',
      collectMany,
      [] as string[],
    )
    .option(
      '--remove-assignee <handle>',
      'Remove an assignee while keeping the rest (repeatable)',
      collectMany,
      [] as string[],
    )
    .action(async (ref: string, opts) => {
      const writer = getWriter();

      const replaceAliases = opts.assignee as string[];
      const replaceIds = opts.assigneeId as string[];
      const addAliases = opts.addAssignee as string[];
      const removeAliases = opts.removeAssignee as string[];

      const hasReplace = replaceAliases.length > 0 || replaceIds.length > 0;
      const hasMutate = addAliases.length > 0 || removeAliases.length > 0;

      if (hasReplace && hasMutate) {
        throw errUsage(
          '--assignee/--assignee-id (replace) cannot be combined with --add-assignee/--remove-assignee (mutate). Pick one mode.',
        );
      }

      const hasDescriptionMutate =
        opts.appendDescription !== undefined || opts.prependDescription !== undefined;
      if (opts.description !== undefined && hasDescriptionMutate) {
        throw errUsage(
          '--description (replace) cannot be combined with --append-description or --prepend-description (mutate). Pick one mode.',
        );
      }

      if (
        opts.title === undefined &&
        opts.description === undefined &&
        !hasDescriptionMutate &&
        opts.status === undefined &&
        opts.section === undefined &&
        !hasReplace &&
        !hasMutate
      ) {
        throw errUsage(
          'At least one of --title, --description, --append-description, --prepend-description, --status, --section, --assignee, --add-assignee, or --remove-assignee is required',
        );
      }

      const client = requireClient();
      const id = await resolveTaskRef(client, ref, opts.project);

      // Both assignee mutate and description mutate need a fetch of the
      // current task. Do it once and reuse — keeps the dry-run preview
      // accurate (it shows the patch derived from real current state).
      const needsCurrent = hasMutate || hasDescriptionMutate;
      const currentTask = needsCurrent ? await client.getTask(id) : null;

      let assigneeIds: string[] | undefined;
      if (hasReplace) {
        assigneeIds = await resolveAssignees(client, replaceAliases, replaceIds);
      } else if (hasMutate) {
        // Read-modify-write for additive/subtractive semantics: take the
        // current assignees, apply add/remove, send the resulting full set.
        // The agent API only supports replace, mirroring session-auth.
        const [addIds, removeIds] = await Promise.all([
          resolveAssignees(client, addAliases, []),
          resolveAssignees(client, removeAliases, []),
        ]);
        const next = new Set(currentTask!.assignees.map((a) => a.id));
        for (const userId of addIds) next.add(userId);
        for (const userId of removeIds) next.delete(userId);
        assigneeIds = Array.from(next);
      }

      // Description mutate: append/prepend to whatever is currently there.
      // Separator is a blank line so paragraphs don't run together. If the
      // current description is empty we just use the new chunk verbatim.
      let nextDescription: string | undefined = opts.description;
      if (hasDescriptionMutate) {
        const current = currentTask!.description ?? '';
        const sep = current.length > 0 ? '\n\n' : '';
        const prepend = opts.prependDescription as string | undefined;
        const append = opts.appendDescription as string | undefined;
        let combined = current;
        if (prepend !== undefined) combined = `${prepend}${sep}${combined}`;
        if (append !== undefined) combined = `${combined}${sep}${append}`;
        nextDescription = combined;
      }

      const updated = await client.updateTask(id, {
        title: opts.title,
        ...(nextDescription !== undefined && { description: nextDescription }),
        status: opts.status,
        section: opts.section,
        ...(assigneeIds !== undefined && { assigneeIds }),
      });

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Updated ${brand.bold(updated.title)}`);
        console.log();
      }

      writer.ok(updated, {
        summary: `Updated "${updated.title}"`,
        notice: plainHandleNotice(nextDescription, hasReplace || hasMutate),
      });
    });

  tasks
    .command('delete <ref>')
    .alias('rm')
    .description('Delete a task (irreversible — requires tasks:write scope)')
    .option('--project <ref>', 'Project ID or title (required when <ref> is a task title)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (ref: string, opts) => {
      const writer = getWriter();
      const client = requireClient();

      const id = await resolveTaskRef(client, ref, opts.project);

      // Only prompt in an interactive TTY. JSON/quiet/markdown callers (CI,
      // agents) get the action without prompts — they can pass --yes
      // explicitly if a future runtime decides to interpret stdin as a tty.
      if (!opts.yes && writer.isStyled() && process.stdin.isTTY) {
        const task = await client.getTask(id);
        process.stdout.write(
          `${brand.warning('!')} Delete task ${brand.bold(task.title)} ${brand.muted(`(${task.id})`)}? [y/N] `,
        );
        const answer = await new Promise<string>((resolve) => {
          process.stdin.once('data', (chunk) => resolve(chunk.toString().trim().toLowerCase()));
        });
        process.stdin.pause();
        if (answer !== 'y' && answer !== 'yes') {
          throw errUsage('Cancelled');
        }
      }

      const result = await client.deleteTask(id);

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Deleted ${brand.bold(result.title)} ${brand.muted(`(${result.id})`)}`);
        console.log();
      }

      writer.ok(result, { summary: `Deleted "${result.title}"` });
    });

  return tasks;
}

function renderTasksTable(tasks: TaskSummary[]): void {
  if (tasks.length === 0) {
    console.log(brand.muted('  No tasks'));
    return;
  }

  const titleW = Math.max(5, ...tasks.map((t) => t.title.length));
  console.log();
  for (const t of tasks) {
    const assignees =
      t.assignees.length > 0
        ? brand.muted(' — ' + t.assignees.map(assigneeLabel).join(', '))
        : '';
    console.log(
      `  ${brand.muted(`[${t.columnId}]`.padEnd(10))} ${t.title.padEnd(titleW)}  ${brand.muted(t.id)}${assignees}`,
    );
  }
  console.log();
}

function renderTaskDetail(t: TaskSummary): void {
  console.log();
  console.log(brand.primaryBold(t.title));
  console.log(divider(40));
  console.log(`  ${brand.label('id'.padEnd(11))} ${t.id}`);
  if (t.projectId) console.log(`  ${brand.label('project'.padEnd(11))} ${t.projectId}`);
  console.log(`  ${brand.label('status'.padEnd(11))} ${t.columnId}`);
  console.log(`  ${brand.label('section'.padEnd(11))} ${t.section}`);
  console.log(
    `  ${brand.label('assignees'.padEnd(11))} ${
      t.assignees.length > 0 ? t.assignees.map(assigneeLabel).join(', ') : brand.muted('(none)')
    }`,
  );
  if (t.description) {
    console.log();
    console.log(brand.label('Description'));
    console.log(`  ${t.description}`);
  }
  console.log();
}

function assigneeLabel(u: { name: string | null; email: string; isAgent?: boolean }): string {
  const name = u.name || u.email.split('@')[0]!;
  return u.isAgent ? brand.agent(`🤖 ${name}`) : name;
}
