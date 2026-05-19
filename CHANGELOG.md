# Changelog

All notable changes to `ccctl` are tracked here. The CLI follows [semver](https://semver.org/):

- **MAJOR** — breaking changes (renamed/removed flags, exit-code remapping, envelope shape changes that bump `schemaVersion`)
- **MINOR** — additive features (new commands, new optional flags, new optional response fields)
- **PATCH** — fixes only

The wire format is also versioned via the `schemaVersion` field on every JSON envelope. That value (currently `"1"`) is bumped only on incompatible envelope changes — it's independent of the package version.

## 1.2.0 — 2026-05-19

### Added — task columns discovery
- New `ccctl tasks columns` subcommand prints the valid column ids the board recognises (today: `todo`, `in-progress`, `done`). Pass any of these to `--status` verbatim.
- `--status` help text on `tasks list`, `tasks create`, and `tasks update` now points at `tasks columns` instead of listing examples — the old examples included `doing`, which is not a real column and was silently accepted by the server, leaving the task invisible on the board.

### Changed
- Server now rejects unknown `--status` / `columnId` values with a 400. Previously they were persisted and the board would skip rendering the task.
- Breadcrumbs that suggested `--status doing` now suggest `--status in-progress`.

## 1.1.0 — 2026-05-16

### Added — wiki
- New scopes: `wiki:read` and `wiki:write` (both org-wide, like `ideas:*`). Combining either with `--project` scoping is rejected at mint time.
- New `wiki` command group: `list`, `get`, `create`, `update`, `delete` (alias `rm`).
- `wiki list --search <text> --limit <n>` filters case-insensitively across title/links/content/tags.
- `wiki get|update|delete <ref>` accepts either a cuid-style ID or a title (exact match preferred, falls back to substring).
- Existing tokens must be re-minted to gain wiki access — they don't auto-acquire new scopes.

## 1.0.0 — 2026-05-06

First stable release. Backfills the work done since the `0.1.0` baseline into a single signed-off version. Future batches will bump per-batch.

### Added — assignees + member resolution
- `tasks create --assignee @handle` and `--assignee-id <userId>` (repeatable). Resolves aliases via the new `/api/agent/members` endpoint with a deterministic order: id → name → email-local-part (split on `._-`) → unique prefix on name.
- `tasks update --assignee` (replace), `--add-assignee`, `--remove-assignee`. Replace and mutate are mutually exclusive.
- `tasks delete <ref>` (alias `rm`), with a TTY confirmation prompt and `--yes` to skip.
- Plain `@handle` warning: when a description contains `@vlad` text but no `--assignee` flag, the CLI surfaces a notice pointing at the canonical flag (no auto-promotion — the wire format keeps `@[Name](id)` markup as the only mention shape).

### Added — discovery + filters
- Project lookup by title or substring on every `--project` flag and on `projects get/update`.
- Task lookup by title scoped by `--project` on `tasks get/update/delete`.
- `tasks list --status <columnId>` / `--assignee @handle` / `--section <name>` (combinable, AND).
- `projects list --favorites` and `--favorited-by @handle` filters.

### Added — favorites
- `projects favorite <ref>` and `projects unfavorite <ref>` (aliases `star`/`unstar`).
- Project list and detail responses now carry `isFavorite: boolean` (this token's perspective) and `favoritedBy: User[]` (full roster). TTY render shows a yellow `★` next to favorited rows and a stars-count column; detail view lists who has starred.

### Added — notes
- New scopes: `notes:read` and `notes:write` (project-scoped).
- New `notes` command group: `list`, `get`, `create`, `update`, `delete` (alias `rm`).
- Existing tokens must be re-minted to gain notes access — they don't auto-acquire new scopes.

### Added — safer writes + agent UX
- Global `--dry-run`. Intercepts `POST`/`PATCH`/`DELETE` at the client layer, prints the resolved `{ method, url, body }` (with all aliases resolved and read-modify-write applied), and exits `0` without contacting the API. `GET` requests still happen so resolvers and read-modify-write paths produce accurate previews.
- `tasks update --append-description` / `--prepend-description`. Read-modify-write on the existing description; `\n\n` separator. Mutually exclusive with `--description` (replace).
- F1: agent write routes return `warnings: string[]` when the request body contains keys outside the route's allow-list. The CLI strips this off the typed response and surfaces it as a `notice` in the envelope.
- F2: validation 400 errors include a `field` key alongside `error`/`hint`. The CLI prepends `field: <name>` to the rendered hint.
- E3: commander's default unknown-flag rejection verified. Typos (e.g. `--asignee`) suggest the correct flag and exit `1`.

### Added — schema + output
- Every JSON envelope now includes `schemaVersion: "1"`. This commits to a stable wire format; future bumps signal incompatible shape changes.
- Documented envelope structure in the README (success, error, hints).

### Added — `auth` ergonomics
- `auth status`, `auth token`, and a `doctor` command that exits non-zero on any failed check (CI-safe).

### Changed — breaking
- `tasks create` no longer auto-self-assigns when any `--assignee` / `--assignee-id` flag is given. Pass `--assign-self` to keep the legacy union behavior.
- HTTP `400` now maps to exit code `1` (`usage_error`) instead of `7` (`api_error`). Validation failures are caller-side problems, so this lines up with commander's own unknown-flag exit code. Combined with `field: <name>` in the hint, agents can branch on `exit 1 + field` for retries.

### Fixed
- `404` responses exit with code `2` (`not_found`) instead of `7` (`api_error`).
- `doctor` now sets `process.exitCode = ExitAPI` when any check fails, so it's CI-safe.
- The CLI's main catch block dropped `CLIError` rendering after a refactor; restored before the generic `exitCode` check.
- 4xx responses now thread the server's `hint` (and now `field`) through the error rendering.

### Internal
- `package.json` is the single source of truth for the version. `scripts/sync-version.mjs` regenerates `src/version.ts` on `prebuild`.
- New utility modules: `src/util/{ids,projects,tasks,notes,members}.ts`, `src/output/notices.ts`.
- The default base URL is `https://cc.clickstudio.ai` (it was `localhost:3002` in the early scaffolding).

## 0.1.0 — Initial scaffold

- Bearer-authed CLI for the Click Studio Control Center.
- Command groups: `auth`, `org`, `projects`, `tasks`, `logs`, `ideas`, `mentions`, `doctor`.
- Output modes: styled (TTY), JSON envelope, raw JSON (agent), Markdown.
- Token storage at `~/.config/clickstudio/credentials.json` (mode `0600`); env var precedence (`CLICKSTUDIO_AGENT_TOKEN`, `CCCTL_TOKEN`).
- Native fetch + `AbortController` for timeouts; no axios.
