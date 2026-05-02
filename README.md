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

# Projects
ccctl projects list
ccctl projects get <id>
ccctl projects create --title "My new project"
ccctl projects update <id> --state "In Build"

# Tasks
ccctl tasks list --project <project-id>
ccctl tasks get <task-id>
ccctl tasks create --project <project-id> --title "Wire up auth" --status todo
ccctl tasks update <task-id> --status doing

# Logs
ccctl logs create --project <project-id> --message "Shipped homepage v2"

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

## Output modes

| Flag       | Behavior                                                       |
| ---------- | -------------------------------------------------------------- |
| _(none)_   | Pretty colored output in a TTY, JSON envelope when piped       |
| `--json`   | Force JSON envelope: `{ ok, data, summary, breadcrumbs }`      |
| `--agent`  | Raw JSON only (no envelope) — for AI agents                    |
| `--quiet`  | Same as `--agent`                                              |
| `--md`     | Markdown output (no ANSI codes, safe to pipe into rendering)   |

In TTY mode, each command renders its own table or detail block; the writer adds a summary line and breadcrumb hints. `--md` uses a structured markdown render. `--json` and `--agent` never render to stdout outside the envelope.

## Environment variables

| Variable                    | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `CLICKSTUDIO_AGENT_TOKEN`   | Token (takes precedence over the credential file)     |
| `CCCTL_TOKEN`               | Alias for the above                                    |
| `CCCTL_BASE_URL`            | API base URL (default: `https://cc.clickstudio.ai`)   |

You can also override the base URL per-invocation with `--base-url <url>`.

## Scopes

Tokens carry a coarse scope set:

- **Project-scoped:** `projects:read`, `projects:write`, `tasks:read`, `tasks:write`, `logs:write`
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

## Exit codes

| Code | Meaning            |
| ---- | ------------------ |
| 0    | Success            |
| 1    | Usage error        |
| 2    | Not found          |
| 3    | Authentication     |
| 4    | Forbidden / scope  |
| 5    | Rate limited       |
| 6    | Network error      |
| 7    | API error          |
