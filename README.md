# ccctl — Click Studio Control Center CLI

Command-line interface for Click Studio Control Center — manage projects, tasks, ideas, and project logs from your terminal or an AI agent.

Designed for both humans (with colored, friendly output in a TTY) and agents (with `--json` and `--agent` machine-readable envelopes).

## Install

The CLI isn't on npm yet. Install directly from GitHub:

```bash
npm install -g github:deifos/clickstudio-control-center-cli
```

The package's `prepare` script builds on install, so no extra step is needed. Update later by re-running the same command, or pin a tag/branch with `github:user/repo#v0.2.0`.

You can also run from a clone:

```bash
git clone <repo> && cd clickstudio-control-center-cli
npm install
npm run build
node dist/bin/ccctl.js --help
```

Once published to npm, this will work too:

```bash
npm install -g clickstudio-control-center-cli
```

## Authenticate

1. Mint an agent token in the dashboard at **Admin → Agent tokens → New token**. Token format is `ccs_...` and is shown once at creation.
2. Save it locally (verifies against the API and stores in `~/.config/clickstudio/credentials.json` with mode `0600`):

   ```bash
   ccctl auth login --token ccs_xxxxxxxxxxxx
   ```

3. Or pass via env var (recommended for agents and CI):

   ```bash
   export CLICKSTUDIO_AGENT_TOKEN=ccs_xxxxxxxxxxxx
   ccctl auth whoami
   ```

The token's organization, scopes, and project allow-list are baked into the token — the CLI doesn't need any other config.

## Quick reference

```bash
# Identity
ccctl auth login --token ccs_...   # save and verify a token
ccctl auth logout                  # clear stored credentials
ccctl auth whoami                  # verify token, show agent identity
ccctl auth status                  # show local credential state
ccctl auth token                   # print the raw token (for scripting)
ccctl doctor                       # reachability + identity check (CI-safe; exits non-zero on failure)

# Org
ccctl org info

# Projects (commands accept ID or title — substring match if unambiguous)
ccctl projects list
ccctl projects list --favorites                               # only your own favorites
ccctl projects list --favorited-by @vlad                      # see what Vlad is working on
ccctl projects get <id-or-title>                              # e.g. "Acme Web" or "Family"
ccctl projects create --title "My new project"
ccctl projects update <id-or-title> --state "In Build"
ccctl projects favorite <id-or-title>                         # alias: star
ccctl projects unfavorite <id-or-title>                       # alias: unstar

# Tasks (--project and the task <ref> accept ID or title)
ccctl tasks list --project "Acme Web"             # title works anywhere --project does
ccctl tasks list --project "Acme Web" --status todo
ccctl tasks list --project "Acme Web" --status todo --assignee @vlad --section Product
ccctl tasks get <id-or-title> --project "Acme Web"
ccctl tasks create --project "Acme Web" --title "Wire up auth" --status todo
ccctl tasks create --project "Acme Web" --title "Deploy" --assignee @vlad
ccctl tasks create --project "Acme Web" --title "QA" --assignee @vlad --assignee @alex
ccctl tasks update <id-or-title> --project "Acme Web" --status doing
ccctl tasks update <id-or-title> --project "Acme Web" --assignee @alex
ccctl tasks update <id-or-title> --project "Acme Web" --add-assignee @bot
ccctl tasks update <id-or-title> --project "Acme Web" --remove-assignee @vlad
ccctl tasks update <id-or-title> --project "Acme Web" --append-description "Update: deployed"
ccctl tasks update <id-or-title> --project "Acme Web" --prepend-description "URGENT: "
ccctl tasks delete <id-or-title> --project "Acme Web"
ccctl tasks delete <id-or-title> --project "Acme Web" --yes
ccctl tasks rm <id-or-title> --project "Acme Web" --yes

# Logs
ccctl logs create --project "Acme Web" --message "Shipped homepage v2"

# Notes (long-form context per project)
ccctl notes list --project "Acme Web"
ccctl notes get <id-or-title> --project "Acme Web"
ccctl notes create --project "Acme Web" --title "Stack notes" --content "..."
ccctl notes update <id-or-title> --project "Acme Web" --content "..."
ccctl notes delete <id-or-title> --project "Acme Web" --yes
ccctl notes rm <id-or-title> --project "Acme Web" --yes

# Ideas
ccctl ideas list                          # all ideas in the org
ccctl ideas list --status Pending         # only Pending ideas
ccctl ideas get <idea-id>
ccctl ideas create --title "Project name finder for kids' apps" \
  --description "..." --link https://example.com

# Mentions / notifications addressed to this agent
ccctl mentions list                       # everything (read + unread)
ccctl mentions list --unread              # only unread — what to act on
ccctl mentions ack <notification-id>      # mark a single one as read
ccctl mentions ack-all                    # mark every unread as read
```

Humans can `@`-mention the agent in tasks, notes, and project log entries the same way they mention each other (the agent shows up in the picker as `🤖 <name>`). The agent receives those mentions via `ccctl mentions list --unread` — a natural place to poll before deciding what to do next.

### Assigning work

`--assignee` resolves the alias against the org member list (`/api/agent/members`, `org:read` scope). Resolution order:

1. Exact user ID — full CUID/auth ID match.
2. Case-insensitive exact `name`.
3. Case-insensitive exact email local-part, including chunks split on `.` `_` `-` (so `jane.doe@…` matches `jane`, `doe`, and `jane.doe`).
4. Case-insensitive unique prefix on `name` (≥3 characters).

A `0` or `>1` match prints a candidate list and exits with code `1`. The leading `@` is optional — `--assignee vlad` and `--assignee @vlad` are equivalent. Pass `--assignee-id <userId>` to skip resolution entirely.

If you give the create command any `--assignee` / `--assignee-id`, the agent will **not** auto-assign itself. Pass them with no `--assignee` (or with `--assign-self`) for the legacy "claim it for me" behavior.

`--assignee` on update is a full **replace**. `--add-assignee` and `--remove-assignee` are additive/subtractive (the CLI does a read-modify-write internally). The two modes are mutually exclusive in one invocation.

### Discovery: title and substring lookup

Anywhere a command takes a project (`--project <ref>`, or the positional argument on `projects get/update`) or a task (`tasks get/update/delete <ref>`), you can pass either an ID or a title. Resolution order:

1. **ID** — anything that looks like a database ID (≥20 alphanumeric or UUID with hyphens) is used as-is, no API call.
2. **Exact title** (case-insensitive) — most reliable.
3. **Substring** (case-insensitive) — only used if exactly one match.

Ambiguity or zero matches print a candidate list and exit non-zero, so an agent never silently picks the wrong project. Title resolution for `tasks get/update/delete` requires `--project` so we don't fan out across every project.

### Filtering `tasks list`

`tasks list` supports filters that combine with AND:

- `--status <columnId>` — `todo`, `doing`/`in-progress`, `done`, etc.
- `--assignee <handle>` — repeatable; matches if **any** listed assignee is on the task. Same alias resolver as `--assignee` on create/update.
- `--section <name>` — case-insensitive exact match (`Product`, `Marketing`, …).

Filters are applied client-side; for very large projects this is fine but expect the request to fetch the full task list first.

### Favorites

Each user (humans and agents) can star projects. The agent's CLI exposes both ends:

- **What you starred** — `ccctl projects list --favorites` filters to projects this token has favorited. `ccctl projects favorite <ref>` / `unfavorite <ref>` toggles.
- **What others starred** — `ccctl projects list --favorited-by @vlad` shows what Vlad has open. Repeat the flag to OR multiple users. Useful for an agent to answer "what's the team focused on this week?".

Each project in `projects list` / `projects get` carries `isFavorite: bool` (this agent's perspective) and `favoritedBy: [User]` (everyone who starred it). The TTY render shows a yellow `★` next to favorited rows and a stars-count column.

### Server-side warnings (silently dropped fields)

If you POST/PATCH a body with a field the API doesn't recognise (typo, removed param, wrong scope), the response now carries `warnings: ["Unknown field 'foo' was ignored …"]`. The CLI strips this from the typed response and surfaces it as a yellow notice — so an unrecognised field never silently disappears. Validation errors also include a `field` name on the JSON error response, which the CLI surfaces in the `hint` line as `field: <name> — <hint>`.

### Plain `@handle` warning

The dashboard renders `@`-mentions from tiptap markup (`@[Name](userId)`). Plain `@vlad` text in a description is **not** parsed — it neither notifies the mentioned user nor sets them as an assignee. To prevent that silent failure, the CLI scans the description on `tasks create` / `tasks update` and surfaces a notice when it sees plain `@handle` patterns but no `--assignee` flag was given. The notice appears in the `notice` field of the JSON envelope and as a yellow warning line in the styled and Markdown renders. Pass `--assignee @vlad` (or `--add-assignee`) to fix.

## Output modes

| Flag       | Behavior                                                       |
| ---------- | -------------------------------------------------------------- |
| _(none)_   | Pretty colored output in a TTY, JSON envelope when piped       |
| `--json`   | Force JSON envelope (see schema below)                          |
| `--agent`  | Raw JSON only (no envelope) — for AI agents                    |
| `--quiet`  | Same as `--agent`                                              |
| `--md`     | Markdown output (no ANSI codes, safe to pipe into rendering)   |

In TTY mode, each command renders its own table or detail block; the writer adds a summary line and breadcrumb hints. `--md` uses a structured markdown render. `--json` and `--agent` never render to stdout outside the envelope.

### JSON envelope

Success:

```json
{
  "ok": true,
  "schemaVersion": "1",
  "data": <command-specific shape>,
  "summary": "human-readable headline",
  "notice": "yellow warning, optional",
  "breadcrumbs": [{ "action": "...", "cmd": "ccctl ..." }]
}
```

Error (also exits non-zero):

```json
{
  "ok": false,
  "schemaVersion": "1",
  "error": "human-readable message",
  "code": "usage_error | not_found | auth_error | forbidden | rate_limit | network_error | api_error",
  "hint": "optional remediation hint"
}
```

`schemaVersion` is bumped only on breaking changes (renamed/dropped fields, or a type change on `data`). Adding new optional fields does **not** bump it. Agents can branch on this value to stay forward-compatible.

The `data` shape per command is whatever the underlying API returns — see [`src/client.ts`](src/client.ts) for the TypeScript definitions.

## Dry-run

Add `--dry-run` (global flag) to any write — `tasks create`, `tasks update`, `tasks delete`, `projects create`, `projects update`, `logs create`, `ideas create`, `mentions ack`, etc. The CLI:

1. Performs all read-side work (alias resolution, project/task lookup, fetching the current state for `--add-assignee` or `--append-description`).
2. Builds the **exact** body it would send.
3. Prints `{ method, url, body }` in your chosen output format and exits `0` without calling the API.

```bash
ccctl --dry-run tasks create --project "Acme Web" --title "Deploy" --assignee @vlad --json
```

`GET` requests are not intercepted — they always run, since they are needed for resolution and read-modify-write.

## Environment variables

| Variable                    | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `CLICKSTUDIO_AGENT_TOKEN`   | Token (takes precedence over the credential file)     |
| `CCCTL_TOKEN`               | Alias for the above                                    |
| `CCCTL_BASE_URL`            | API base URL (default: `https://cc.clickstudio.ai`)   |

You can also override the base URL per-invocation with `--base-url <url>`.

## Scopes

Tokens carry a coarse scope set:

- **Project-scoped:** `projects:read`, `projects:write`, `tasks:read`, `tasks:write`, `notes:read`, `notes:write`, `logs:write`
- **Org-wide:** `org:read`, `ideas:read`, `ideas:write`

A token can also carry a `projectIds` allow-list to constrain it to specific projects. Project-scoped tokens cannot create new projects and cannot read/write outside their allow-list. **Org-wide scopes cannot be combined with `projectIds`** — the dashboard rejects mints that try, since the project allow-list wouldn't apply to org-level resources. If you need both, mint two separate tokens.

## Running on a server (Hetzner / VPS / CI)

For agents running as a service, put the token in the unit file rather than a shell profile:

```ini
# /etc/systemd/system/my-agent.service
[Service]
Environment=CLICKSTUDIO_AGENT_TOKEN=ccs_xxxxxxxxxxxx
Environment=CCCTL_BASE_URL=https://cc.clickstudio.ai
ExecStart=/usr/bin/node /opt/my-agent/index.js
```

Use `ccctl doctor` as a healthcheck — it exits non-zero if the token is missing, expired, revoked, or the API is unreachable.

## Versioning

`ccctl` follows [semver](https://semver.org/). The CLI version is what `ccctl --version` prints. Two separate version surfaces:

- **Package version** (`package.json`, `--version`) — bumps per release. **MAJOR** for breaking changes (renamed/removed flags, exit-code remapping, envelope shape changes), **MINOR** for additive features, **PATCH** for fixes.
- **Wire schema** (`schemaVersion` on every JSON envelope) — currently `"1"`. Bumps only on incompatible envelope shape changes. Independent of the package version. Agents can branch on this value to stay forward-compatible.

The full per-version log lives in [`CHANGELOG.md`](CHANGELOG.md). Pin a specific version on install with:

```bash
npm install -g github:deifos/clickstudio-control-center-cli#v1.0.0
```

## Exit codes

| Code | Meaning           | When                                                                |
| ---- | ----------------- | ------------------------------------------------------------------- |
| 0    | Success           | Including `--dry-run`                                                |
| 1    | Usage error       | Bad/missing flag, ambiguous alias, or HTTP `400` (validation)        |
| 2    | Not found         | HTTP `404`                                                           |
| 3    | Authentication    | HTTP `401`                                                           |
| 4    | Forbidden / scope | HTTP `403`                                                           |
| 5    | Rate limited      | HTTP `429`                                                           |
| 6    | Network error     | DNS failure, timeout, connection refused                             |
| 7    | API error         | Any other non-2xx (5xx, unexpected statuses)                         |

`400` is mapped to `usage_error` rather than `api_error` because validation failures are caused by the caller, not the server. Combined with the `field: <name>` prefix in the error hint (added by F2), an agent can branch on exit code 1 + the `field` value to retry with a corrected payload.
