import type { CCCTLClient, ProjectSummary } from '../client.js';
import { CLIError } from '../output/errors.js';
import { CodeUsage, CodeNotFound } from '../output/codes.js';
import { looksLikeId } from './ids.js';

// Per-invocation cache so a single CLI call only fetches the project list
// once even if multiple `--project` references are resolved.
let cachedProjects: ProjectSummary[] | null = null;
async function loadProjects(client: CCCTLClient): Promise<ProjectSummary[]> {
  if (cachedProjects) return cachedProjects;
  cachedProjects = await client.listProjects();
  return cachedProjects;
}

function formatCandidates(projects: ProjectSummary[], cap = 8): string {
  const head = projects.slice(0, cap).map((p) => `  • ${p.title}  ${p.id}`);
  const more = projects.length > cap ? `\n  …and ${projects.length - cap} more` : '';
  return head.join('\n') + more;
}

// Resolve a `--project` argument that may be either an ID or a (partial)
// title. Resolution order:
//   1. Exact ID — short-circuit, no API call (the project endpoint will
//      surface a 404 itself if the ID is wrong, so we don't pre-validate).
//   2. Case-insensitive exact title match — most common case.
//   3. Case-insensitive substring — convenient but only when unambiguous.
// Throws on miss / ambiguity with a candidate list so the caller never
// silently picks the wrong project.
export async function resolveProjectRef(
  client: CCCTLClient,
  ref: string,
): Promise<string> {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new CLIError(CodeUsage, '--project value is empty');
  }
  if (looksLikeId(trimmed)) return trimmed;

  const projects = await loadProjects(client);
  const needle = trimmed.toLowerCase();

  const exact = projects.filter((p) => p.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) {
    throw new CLIError(
      CodeUsage,
      `Project title "${trimmed}" is ambiguous (${exact.length} matches)`,
      `Disambiguate with the project ID:\n${formatCandidates(exact)}`,
    );
  }

  const contains = projects.filter((p) => p.title.toLowerCase().includes(needle));
  if (contains.length === 1) return contains[0]!.id;
  if (contains.length > 1) {
    throw new CLIError(
      CodeUsage,
      `Project name "${trimmed}" matches ${contains.length} projects`,
      `Use the full title or ID:\n${formatCandidates(contains)}`,
    );
  }

  throw new CLIError(
    CodeNotFound,
    `No project matches "${trimmed}"`,
    projects.length > 0
      ? `Available:\n${formatCandidates(projects)}`
      : 'This token has no accessible projects',
  );
}
