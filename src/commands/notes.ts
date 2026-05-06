import { Command } from 'commander';
import { brand, divider } from '../output/theme.js';
import { errUsage } from '../output/errors.js';
import type { OutputWriter } from '../output/writer.js';
import type { NoteSummary } from '../client.js';
import { requireClient } from './auth.js';
import { resolveProjectRef } from '../util/projects.js';
import { resolveNoteRef } from '../util/notes.js';

export function createNotesCommand(getWriter: () => OutputWriter): Command {
  const notes = new Command('notes').alias('note').description('Manage project notes');

  notes
    .command('list')
    .description('List notes for a project')
    .requiredOption('--project <ref>', 'Project ID or title')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();
      const projectId = await resolveProjectRef(client, opts.project);
      const data = await client.listNotes(projectId);

      if (writer.isStyled()) {
        renderNotesTable(data);
      }

      writer.ok(data, {
        summary: `${data.length} note${data.length === 1 ? '' : 's'} in ${projectId}`,
        breadcrumbs:
          data.length > 0
            ? [
                { action: 'Show note', cmd: `ccctl notes get ${data[0]!.id}` },
                { action: 'Edit note', cmd: `ccctl notes update ${data[0]!.id} --content "..."` },
              ]
            : [
                {
                  action: 'Create note',
                  cmd: `ccctl notes create --project ${projectId} --title "..." --content "..."`,
                },
              ],
      });
    });

  notes
    .command('get <ref>')
    .description('Show a single note by ID, or by title with --project')
    .option('--project <ref>', 'Project ID or title (required when <ref> is a title)')
    .action(async (ref: string, opts) => {
      const writer = getWriter();
      const client = requireClient();
      const id = await resolveNoteRef(client, ref, opts.project);
      const note = await client.getNote(id);

      if (writer.isStyled()) {
        renderNoteDetail(note);
      }

      writer.ok(note, { summary: note.title });
    });

  notes
    .command('create')
    .description('Create a note on a project')
    .requiredOption('--project <ref>', 'Project ID or title')
    .option('--title <title>', 'Note title (defaults to "Untitled")')
    .option('--content <text>', 'Note content (markdown / mention markup)')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      if (opts.title === undefined && opts.content === undefined) {
        throw errUsage('At least one of --title or --content is required');
      }

      const projectId = await resolveProjectRef(client, opts.project);
      const created = await client.createNote({
        projectId,
        title: opts.title,
        content: opts.content,
      });

      if (writer.isStyled()) {
        console.log(
          `  ${brand.success('✓')} Created note ${brand.bold(created.title)} ${brand.muted(`(${created.id})`)}`,
        );
        console.log();
      }

      writer.ok(created, {
        summary: `Created note "${created.title}"`,
        breadcrumbs: [
          { action: 'Show note', cmd: `ccctl notes get ${created.id}` },
          { action: 'Edit note', cmd: `ccctl notes update ${created.id} --content "..."` },
        ],
      });
    });

  notes
    .command('update <ref>')
    .description('Update a note — change title or content')
    .option('--project <ref>', 'Project ID or title (required when <ref> is a note title)')
    .option('--title <title>', 'New title')
    .option('--content <text>', 'New content (full replace)')
    .action(async (ref: string, opts) => {
      const writer = getWriter();

      if (opts.title === undefined && opts.content === undefined) {
        throw errUsage('At least one of --title or --content is required');
      }

      const client = requireClient();
      const id = await resolveNoteRef(client, ref, opts.project);
      const updated = await client.updateNote(id, {
        title: opts.title,
        content: opts.content,
      });

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Updated ${brand.bold(updated.title)}`);
        console.log();
      }

      writer.ok(updated, { summary: `Updated "${updated.title}"` });
    });

  notes
    .command('delete <ref>')
    .alias('rm')
    .description('Delete a note (irreversible — requires notes:write scope)')
    .option('--project <ref>', 'Project ID or title (required when <ref> is a note title)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (ref: string, opts) => {
      const writer = getWriter();
      const client = requireClient();

      const id = await resolveNoteRef(client, ref, opts.project);

      if (!opts.yes && writer.isStyled() && process.stdin.isTTY) {
        const note = await client.getNote(id);
        process.stdout.write(
          `${brand.warning('!')} Delete note ${brand.bold(note.title)} ${brand.muted(`(${note.id})`)}? [y/N] `,
        );
        const answer = await new Promise<string>((resolve) => {
          process.stdin.once('data', (chunk) => resolve(chunk.toString().trim().toLowerCase()));
        });
        process.stdin.pause();
        if (answer !== 'y' && answer !== 'yes') {
          throw errUsage('Cancelled');
        }
      }

      const result = await client.deleteNote(id);

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Deleted ${brand.bold(result.title)} ${brand.muted(`(${result.id})`)}`);
        console.log();
      }

      writer.ok(result, { summary: `Deleted "${result.title}"` });
    });

  return notes;
}

function renderNotesTable(notes: NoteSummary[]): void {
  if (notes.length === 0) {
    console.log(brand.muted('  No notes'));
    return;
  }

  const titleW = Math.max(5, ...notes.map((n) => n.title.length));
  console.log();
  for (const n of notes) {
    const author = n.author ? authorLabel(n.author) : brand.muted('(unknown)');
    console.log(
      `  ${n.title.padEnd(titleW)}  ${brand.muted(n.id)}  ${brand.muted('—')} ${author}`,
    );
  }
  console.log();
}

function renderNoteDetail(n: NoteSummary): void {
  console.log();
  console.log(brand.primaryBold(n.title));
  console.log(divider(40));
  console.log(`  ${brand.label('id'.padEnd(11))} ${n.id}`);
  console.log(`  ${brand.label('project'.padEnd(11))} ${n.projectId}`);
  console.log(`  ${brand.label('author'.padEnd(11))} ${n.author ? authorLabel(n.author) : brand.muted('(unknown)')}`);
  console.log(`  ${brand.label('updated'.padEnd(11))} ${n.updatedAt}`);
  if (n.content) {
    console.log();
    console.log(brand.label('Content'));
    console.log(`  ${n.content.replace(/\n/g, '\n  ')}`);
  }
  console.log();
}

function authorLabel(u: { name: string | null; email: string; isAgent?: boolean }): string {
  const name = u.name || u.email.split('@')[0]!;
  return u.isAgent ? brand.agent(`🤖 ${name}`) : name;
}
