import type { CCCTLClient, MemberInfo } from '../client.js';
import { CLIError } from '../output/errors.js';
import { CodeUsage } from '../output/codes.js';
import { looksLikeId } from './ids.js';

// Strip a leading `@` so users can write either `@vlad` or `vlad`.
export function normalizeAlias(s: string): string {
  return s.replace(/^@/, '').trim().toLowerCase();
}

// Resolution order (first non-empty match wins):
//   1. Exact id match
//   2. Case-insensitive exact name
//   3. Case-insensitive exact email local-part, including chunks split on
//      ./_/- (so `jane.doe@…` matches `jane`, `doe`, and the full
//      local-part)
//   4. Case-insensitive unique prefix on name (≥3 chars)
// On 0 or 2+ matches, returns null — the caller surfaces a candidate list.
export function resolveAlias(
  alias: string,
  members: MemberInfo[],
): { match: MemberInfo | null; candidates: MemberInfo[] } {
  const raw = alias.trim();
  if (looksLikeId(raw)) {
    const byId = members.find((m) => m.id === raw);
    return { match: byId ?? null, candidates: byId ? [] : members };
  }

  const needle = normalizeAlias(raw);
  if (!needle) return { match: null, candidates: members };

  const byName = members.filter(
    (m) => (m.name ?? '').trim().toLowerCase() === needle,
  );
  if (byName.length === 1) return { match: byName[0]!, candidates: [] };
  if (byName.length > 1) return { match: null, candidates: byName };

  const byLocalPart: MemberInfo[] = [];
  for (const m of members) {
    const local = m.email.split('@')[0]?.toLowerCase() ?? '';
    if (!local) continue;
    if (local === needle) {
      byLocalPart.push(m);
      continue;
    }
    const chunks = local.split(/[._-]/).filter(Boolean);
    if (chunks.includes(needle)) byLocalPart.push(m);
  }
  if (byLocalPart.length === 1) return { match: byLocalPart[0]!, candidates: [] };
  if (byLocalPart.length > 1) return { match: null, candidates: byLocalPart };

  if (needle.length >= 3) {
    const byPrefix = members.filter((m) =>
      (m.name ?? '').trim().toLowerCase().startsWith(needle),
    );
    if (byPrefix.length === 1) return { match: byPrefix[0]!, candidates: [] };
    if (byPrefix.length > 1) return { match: null, candidates: byPrefix };
  }

  return { match: null, candidates: [] };
}

// Detect `@handle` patterns in plain text that look like a mention attempt
// but are not tiptap markup (`@[Name](id)`). We surface a warning when an
// agent writes `@vlad` in a description without also passing `--assignee`,
// so they don't silently lose assignment + notification. The lookbehind
// `(?<!\S)` ensures we don't match email addresses (`a@b.com`) where the
// `@` is preceded by a non-space char.
const PLAIN_HANDLE_RE = /(?<!\S)@(?!\[)[A-Za-z][A-Za-z0-9._-]*/g;

export function findPlainHandles(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const match of text.matchAll(PLAIN_HANDLE_RE)) {
    out.add(match[0]!);
  }
  return Array.from(out);
}

// Per-invocation cache so a single CLI call only fetches members once even if
// it resolves multiple aliases (e.g. --assignee @vlad --assignee @alex).
let cachedMembers: MemberInfo[] | null = null;
export async function loadMembers(client: CCCTLClient): Promise<MemberInfo[]> {
  if (cachedMembers) return cachedMembers;
  cachedMembers = await client.listMembers();
  return cachedMembers;
}

// Resolve a list of `--assignee` / `--assignee-id` inputs to userIds. Throws
// a usage error with a candidate list on the first miss — partial success
// would silently drop assignees, which is exactly the bug the feature is
// fixing.
export async function resolveAssignees(
  client: CCCTLClient,
  aliases: string[],
  rawIds: string[],
): Promise<string[]> {
  if (aliases.length === 0 && rawIds.length === 0) return [];

  const resolved = new Set<string>();
  for (const id of rawIds) {
    if (!looksLikeId(id)) {
      throw new CLIError(
        CodeUsage,
        `--assignee-id must be a full user ID (got "${id}")`,
        'IDs are typically 20+ alphanumeric characters; use --assignee for handles like @vlad',
      );
    }
    resolved.add(id);
  }

  if (aliases.length > 0) {
    const members = await loadMembers(client);
    for (const alias of aliases) {
      const { match, candidates } = resolveAlias(alias, members);
      if (match) {
        resolved.add(match.id);
        continue;
      }
      const list = candidates.length > 0 ? candidates : members;
      const lines = list.slice(0, 8).map((m) => {
        const name = m.name?.trim() || m.email.split('@')[0]!;
        const tag = m.isAgent ? ' [agent]' : '';
        return `  • ${name}${tag} — ${m.email}`;
      });
      const more = list.length > 8 ? `\n  …and ${list.length - 8} more` : '';
      const reason =
        candidates.length > 1
          ? `Ambiguous — "${alias}" matched ${candidates.length} people`
          : `No member matches "${alias}"`;
      throw new CLIError(
        CodeUsage,
        reason,
        `Try one of:\n${lines.join('\n')}${more}\n  Or pass --assignee-id <userId>`,
      );
    }
  }

  return Array.from(resolved);
}
