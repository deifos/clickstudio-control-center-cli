import type { CCCTLClient, NoteSummary } from '../client.js';
import { CLIError } from '../output/errors.js';
import { CodeUsage, CodeNotFound } from '../output/codes.js';
import { looksLikeId } from './ids.js';
import { resolveProjectRef } from './projects.js';

function formatCandidates(notes: NoteSummary[], cap = 8): string {
  const head = notes.slice(0, cap).map((n) => `  • ${n.title}  ${n.id}`);
  const more = notes.length > cap ? `\n  …and ${notes.length - cap} more` : '';
  return head.join('\n') + more;
}

// Mirrors resolveTaskRef. Accepts an ID or a note title scoped to a project;
// title resolution requires `projectRef` so we don't fan out across projects.
export async function resolveNoteRef(
  client: CCCTLClient,
  ref: string,
  projectRef: string | undefined,
): Promise<string> {
  const trimmed = ref.trim();
  if (!trimmed) throw new CLIError(CodeUsage, 'note reference is empty');
  if (looksLikeId(trimmed)) return trimmed;

  if (!projectRef) {
    throw new CLIError(
      CodeUsage,
      `"${trimmed}" doesn't look like a note ID — pass --project <ref> to look it up by title`,
    );
  }

  const projectId = await resolveProjectRef(client, projectRef);
  const notes = await client.listNotes(projectId);
  const needle = trimmed.toLowerCase();

  const exact = notes.filter((n) => n.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) {
    throw new CLIError(
      CodeUsage,
      `Note title "${trimmed}" is ambiguous (${exact.length} matches in this project)`,
      `Disambiguate with the note ID:\n${formatCandidates(exact)}`,
    );
  }

  const contains = notes.filter((n) => n.title.toLowerCase().includes(needle));
  if (contains.length === 1) return contains[0]!.id;
  if (contains.length > 1) {
    throw new CLIError(
      CodeUsage,
      `Note name "${trimmed}" matches ${contains.length} notes`,
      `Use the full title or ID:\n${formatCandidates(contains)}`,
    );
  }

  throw new CLIError(
    CodeNotFound,
    `No note in project matches "${trimmed}"`,
    notes.length > 0
      ? `Project notes:\n${formatCandidates(notes)}`
      : 'This project has no notes',
  );
}
