// Per-invocation notice queue. The HTTP client pushes here when an API
// response carries a `warnings` field (server-side F1 — silent-drop
// detection). The writer drains this on the next `ok` call and merges with
// any command-level notice, so warnings always reach the user without
// every command having to plumb them through manually.

const queue: string[] = [];

export function pushNotice(n: string): void {
  if (n) queue.push(n);
}

export function pushNotices(items: readonly string[] | undefined): void {
  if (!items) return;
  for (const n of items) pushNotice(n);
}

export function drainNotices(): string[] {
  const out = queue.slice();
  queue.length = 0;
  return out;
}
