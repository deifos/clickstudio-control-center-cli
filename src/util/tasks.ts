import type { CCCTLClient, TaskSummary } from '../client.js';
import { CLIError } from '../output/errors.js';
import { CodeUsage, CodeNotFound } from '../output/codes.js';
import { looksLikeId } from './ids.js';
import { resolveProjectRef } from './projects.js';

function formatCandidates(tasks: TaskSummary[], cap = 8): string {
  const head = tasks
    .slice(0, cap)
    .map((t) => `  • [${t.columnId}] ${t.title}  ${t.id}`);
  const more = tasks.length > cap ? `\n  …and ${tasks.length - cap} more` : '';
  return head.join('\n') + more;
}

// Resolve a task reference that may be either an ID or a title scoped to a
// project. Title resolution requires `projectRef` so we don't fan out across
// every project the agent can see — that's slow and noisy.
//
//   - ID-shaped → return as-is (the API surfaces a real 404 if invalid).
//   - Title + project → list tasks in that project and match exactly first,
//     then case-insensitive substring if unambiguous.
//   - Title + no project → usage error with hint.
export async function resolveTaskRef(
  client: CCCTLClient,
  ref: string,
  projectRef: string | undefined,
): Promise<string> {
  const trimmed = ref.trim();
  if (!trimmed) throw new CLIError(CodeUsage, 'task reference is empty');
  if (looksLikeId(trimmed)) return trimmed;

  if (!projectRef) {
    throw new CLIError(
      CodeUsage,
      `"${trimmed}" doesn't look like a task ID — pass --project <ref> to look it up by title`,
    );
  }

  const projectId = await resolveProjectRef(client, projectRef);
  const tasks = await client.listTasks(projectId);
  const needle = trimmed.toLowerCase();

  const exact = tasks.filter((t) => t.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) {
    throw new CLIError(
      CodeUsage,
      `Task title "${trimmed}" is ambiguous (${exact.length} matches in this project)`,
      `Disambiguate with the task ID:\n${formatCandidates(exact)}`,
    );
  }

  const contains = tasks.filter((t) => t.title.toLowerCase().includes(needle));
  if (contains.length === 1) return contains[0]!.id;
  if (contains.length > 1) {
    throw new CLIError(
      CodeUsage,
      `Task name "${trimmed}" matches ${contains.length} tasks`,
      `Use the full title or ID:\n${formatCandidates(contains)}`,
    );
  }

  throw new CLIError(
    CodeNotFound,
    `No task in project matches "${trimmed}"`,
    tasks.length > 0
      ? `Project tasks:\n${formatCandidates(tasks)}`
      : 'This project has no tasks',
  );
}
