import type { CCCTLClient, WikiEntrySummary } from '../client.js';
import { CLIError } from '../output/errors.js';
import { CodeUsage, CodeNotFound } from '../output/codes.js';
import { looksLikeId } from './ids.js';

function formatCandidates(entries: WikiEntrySummary[], cap = 8): string {
  const head = entries.slice(0, cap).map((e) => `  • ${e.title}  ${e.id}`);
  const more = entries.length > cap ? `\n  …and ${entries.length - cap} more` : '';
  return head.join('\n') + more;
}

// Resolve a wiki ref by ID or title. Wiki is org-wide (no project scoping),
// so we just search the full list — same pattern as resolveNoteRef but
// without the --project gate.
export async function resolveWikiRef(client: CCCTLClient, ref: string): Promise<string> {
  const trimmed = ref.trim();
  if (!trimmed) throw new CLIError(CodeUsage, 'wiki reference is empty');
  if (looksLikeId(trimmed)) return trimmed;

  const entries = await client.listWiki({ search: trimmed, limit: 200 });
  const needle = trimmed.toLowerCase();

  const exact = entries.filter((e) => e.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) {
    throw new CLIError(
      CodeUsage,
      `Wiki title "${trimmed}" is ambiguous (${exact.length} matches)`,
      `Disambiguate with the entry ID:\n${formatCandidates(exact)}`,
    );
  }

  const contains = entries.filter((e) => e.title.toLowerCase().includes(needle));
  if (contains.length === 1) return contains[0]!.id;
  if (contains.length > 1) {
    throw new CLIError(
      CodeUsage,
      `Wiki title "${trimmed}" matches ${contains.length} entries`,
      `Use the full title or ID:\n${formatCandidates(contains)}`,
    );
  }

  throw new CLIError(
    CodeNotFound,
    `No wiki entry matches "${trimmed}"`,
    entries.length > 0
      ? `Wiki entries:\n${formatCandidates(entries)}`
      : 'The wiki is empty',
  );
}
