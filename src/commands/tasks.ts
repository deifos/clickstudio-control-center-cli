import { Command } from 'commander';
import { brand, divider } from '../output/theme.js';
import { errUsage } from '../output/errors.js';
import type { OutputWriter } from '../output/writer.js';
import type { TaskSummary } from '../client.js';
import { requireClient } from './auth.js';

export function createTasksCommand(getWriter: () => OutputWriter): Command {
  const tasks = new Command('tasks').alias('task').description('Manage tasks');

  tasks
    .command('list')
    .description('List tasks for a project')
    .requiredOption('--project <id>', 'Project ID')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();
      const data = await client.listTasks(opts.project);

      if (writer.isStyled()) {
        renderTasksTable(data);
      }

      writer.ok(data, {
        summary: `${data.length} task${data.length === 1 ? '' : 's'} in ${opts.project}`,
        breadcrumbs:
          data.length > 0
            ? [
                { action: 'Get task', cmd: `ccctl tasks get ${data[0]!.id}` },
                { action: 'Update status', cmd: `ccctl tasks update ${data[0]!.id} --status doing` },
              ]
            : [
                {
                  action: 'Create task',
                  cmd: `ccctl tasks create --project ${opts.project} --title "..."`,
                },
              ],
      });
    });

  tasks
    .command('get <id>')
    .description('Show a single task')
    .action(async (id: string) => {
      const writer = getWriter();
      const client = requireClient();
      const task = await client.getTask(id);

      if (writer.isStyled()) {
        renderTaskDetail(task);
      }

      writer.ok(task, { summary: task.title });
    });

  tasks
    .command('create')
    .description('Create a task (auto-assigned to the agent)')
    .requiredOption('--project <id>', 'Project ID')
    .requiredOption('--title <title>', 'Task title')
    .option('--description <text>', 'Task description')
    .option('--status <columnId>', 'Initial column (todo, doing, done, ...)', 'todo')
    .option('--section <section>', 'Section (Product, Marketing)', 'Product')
    .option('--no-assign-self', "Don't auto-assign the task to this agent")
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      const created = await client.createTask({
        projectId: opts.project,
        title: opts.title,
        description: opts.description,
        status: opts.status,
        section: opts.section,
        assignToSelf: opts.assignSelf,
      });

      if (writer.isStyled()) {
        console.log(
          `  ${brand.success('✓')} Created task ${brand.bold(created.title)} ${brand.muted(`(${created.id})`)}`,
        );
        console.log();
      }

      writer.ok(created, {
        summary: `Created task "${created.title}"`,
        breadcrumbs: [
          { action: 'Move to doing', cmd: `ccctl tasks update ${created.id} --status doing` },
          { action: 'Mark done', cmd: `ccctl tasks update ${created.id} --status done` },
        ],
      });
    });

  tasks
    .command('update <id>')
    .description('Update a task — change title, status, description, etc.')
    .option('--title <title>', 'New title')
    .option('--description <text>', 'New description')
    .option('--status <columnId>', 'New column (todo, doing, done, ...)')
    .option('--section <section>', 'New section (Product, Marketing)')
    .action(async (id: string, opts) => {
      const writer = getWriter();

      if (
        opts.title === undefined &&
        opts.description === undefined &&
        opts.status === undefined &&
        opts.section === undefined
      ) {
        throw errUsage('At least one of --title, --description, --status, or --section is required');
      }

      const client = requireClient();
      const updated = await client.updateTask(id, {
        title: opts.title,
        description: opts.description,
        status: opts.status,
        section: opts.section,
      });

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Updated ${brand.bold(updated.title)}`);
        console.log();
      }

      writer.ok(updated, { summary: `Updated "${updated.title}"` });
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
