# mc-kit

**Lightweight toolkit for integrating [Mission Control](https://github.com/builderz-labs/mission-control) with any project that uses Markdown-based backlogs and Claude Code sub-agents.**

Bidirectional sync between `docs/BACKLOG.md` and MC's Kanban. Task orchestration via the Claude Code Agent tool. Headless screenshot evidence via Playwright. Container lifecycle with podman/docker. Zero dependencies — pure Node stdlib for all the REST plumbing; Playwright is opt-in.

---

## Why this exists

Mission Control is great as a multi-agent orchestration dashboard, but has no opinion about how *you* want to organize your project's work. This kit wraps MC's REST API in a small CLI so you can:

- Keep `docs/BACKLOG.md` as the canonical source of truth for tasks
- See them as a Kanban in MC
- Dispatch tasks to Claude Code sub-agents from the dashboard
- Flip completed items back into Markdown on commit

All while using your **Claude Max subscription** (no extra API-key billing — everything runs through the local `claude` CLI).

## Quick install

```bash
# Clone mc-kit somewhere reusable
git clone https://github.com/McMarius11/mc-kit ~/.local/mc-kit
ln -s ~/.local/mc-kit/bin/mc-kit ~/.local/bin/mc-kit
# (or add ~/.local/mc-kit/bin to PATH)

# In your project root
cd ~/Arbeit/MyProject
mc-kit init                    # interactive, creates .mc-kit.json + backlog stub
mc-kit doctor                  # verifies MC is installed and reachable
mc-kit sync push               # uploads backlog to the Kanban
mc-kit ide                     # opens dashboard in browser
```

## Configuration

Each project gets a `.mc-kit.json` in its root. Minimal:

```json
{
  "project_name": "My App"
}
```

Full schema (`templates/mc-kit.config.json`):

| Field | Default | Purpose |
|---|---|---|
| `project_name` | *(required)* | The project name that appears in Mission Control |
| `project_desc` | `""` | Description visible in MC's project list |
| `backlog_path` | `docs/BACKLOG.md` | Where your Markdown backlog lives |
| `id_prefix` | `B` | Backlog IDs are `#<prefix><NN>` (so default is `#B01`) |
| `themes` | `["AUDIT","PARITY","UX","PERF","TRUST"]` | Accepted theme tags per item |
| `bundle_path` | `null` | Optional — if set, `screenshot` subcommand works against this single-file HTML |
| `screenshot_dir` | `tools/screenshots` | Where headless captures go |
| `mc_base` | `http://localhost:3000` | MC URL |
| `mc_env_file` | `~/Arbeit/mission-control/.env` | Where to read API_KEY |
| `mc_dir` | `~/Arbeit/mission-control` | MC install dir (used by `ide` subcommand) |

All paths are resolved relative to the project root (the directory containing `.mc-kit.json`).

## Commands

```text
Project setup:
  mc-kit init                        Create .mc-kit.json + backlog stub (interactive)
  mc-kit doctor                      Verify MC reachable, API key valid

Backlog sync:
  mc-kit sync push [--dry]           Push docs/BACKLOG.md → MC Kanban
  mc-kit sync pull [--dry]           Pull "done" back to BACKLOG.md (flip [ ] → [x])

Task ops (for orchestrator sessions):
  mc-kit list [--status S] [--json]  List tasks; filter by inbox|in_progress|review|…
  mc-kit get <id>                    Show task details (id = #B05 | PANO-005 | raw)
  mc-kit status <id> <new-status>    Move task (inbox → in_progress → review → done)
  mc-kit comment <id> "text"         Post comment to task
  mc-kit open-count                  Integer: tasks not-done

Mission Control lifecycle:
  mc-kit ide                         Start container + sync + open browser
  mc-kit ide:stop                    Stop container
  mc-kit ide:status                  Show runtime status
  mc-kit ide:logs                    Tail container logs

Orchestrator helpers:
  mc-kit next-task [--theme T] [--priority P]   Pick highest-priority open task
  mc-kit open <id>                              Open task card in browser
  mc-kit assign <id> "Agent Name"               Assign task (CLI escape for MC UI bug)
  mc-kit unassign <id>                          Unassign task (workaround for UI bug)
  mc-kit watch-dispatch [--once] [--json]       Poll for tasks assigned to
                                                "Claude Code (external)" or tagged

Optional:
  mc-kit screenshot <xml> <tab> <out.png>       Playwright capture (requires bundle_path)
```

## Known MC bugs & manual patches

mc-kit documents small workarounds for upstream MC bugs in `patches/`.
Each `.md` has a copy-paste one-liner plus context — apply yourself,
skip what you don't need. Re-run after an MC container rebuild.

| # | Fix | File | Upstream |
|---|-----|------|----------|
| [001](patches/001-nullable-assigned-to.md) | Task-UI "Unassigned" sends `null` but API rejects it — makes `assigned_to` nullable | `src/lib/validation.ts` | not filed |

If you don't want to patch MC at all, use the CLI workaround:
`mc-kit unassign <id>` sends an empty string (which the current schema
accepts) instead of `null`.



## Setting up Mission Control itself

mc-kit assumes you already have MC installed at `~/Arbeit/mission-control/`. If not:

```bash
cd ~/Arbeit
git clone https://github.com/builderz-labs/mission-control
cd mission-control
bash install.sh --docker --skip-openclaw --dir "$(pwd)"

# Apply Fedora/Podman-specific overrides (lets MC see your host ~/.claude):
bash ~/.local/mc-kit/scripts/setup-podman-overrides.sh

# Start
podman-compose up -d --build   # first build takes ~3 min, then fast
```

Your Claude API key (`API_KEY=...`) goes in `~/Arbeit/mission-control/.env`. mc-kit reads it from there; you don't have to type it anywhere.

## How the orchestrator pattern works

Claude Code's native `Agent` tool lets an interactive session spawn sub-agents that inherit the same Max subscription (one slot per spawn, parallel-safe, auto-terminating).

With mc-kit + a few `.claude/commands/` definitions in your project, your daily flow is:

```
You                   "arbeite #B05"
  │
  ▼
Orchestrator-Claude   reads task via `mc-kit get #B05`
(the interactive      picks sub-agent(s) by project heuristics
session you're in)    spawns them via Agent tool
                      aggregates their reports
                      flips status via `mc-kit status #B05 review`
                      posts summary via `mc-kit comment #B05 ...`
```

Sub-agents can invoke `mc-kit screenshot …` to attach visual evidence to tasks before returning. Mission Control shows everything live — status changes, comments, and linked images.

## Which projects this works for

Any project where:

- Your work items live in a Markdown file (or can be expressed that way)
- You have a naming convention for IDs and themes
- You're using Claude Code CLI interactively for development
- You want Kanban-style visualization of progress

Not a good fit when:

- You need real-time collaboration (MC is single-user)
- You need complex hierarchical epics (MC's Tasks are flat — use GitHub Projects v2 or Plane.so instead)
- You need autonomous worker agents that run without your session (look at OpenHands or Claude Agent SDK)

## Non-goals

- **No fork of Mission Control.** mc-kit is a thin adapter; MC updates work transparently.
- **No custom UI.** MC provides the Kanban; mc-kit provides the glue.
- **No daemon.** Everything runs on-demand from your shell or from an interactive Claude Code session.

## License

MIT © McMarius11 — see [LICENSE](./LICENSE).
