---
type: project
tags: [tooling, protocol, ai-agents]
status: active
created: 2026-02-19
aliases: [WCP, Work Context Protocol]
---

# Work Context Protocol (WCP)

> A standard way for AI agents to read and write project/task context, regardless of the underlying project management system. Markdown files in a git repo. No database. No business logic.

**Code repo:** `~/projects/wcp/` (TBD — create when we start building)
**Related:** [[05-projects/agent-pipeline-summary|Pipeline-Skills]] (primary consumer)

---

## The Problem

AI coding agents (Claude Code, pipeline-skills, Cursor, etc.) need to know what to work on and report what they did. Today this is either:

1. **Manual** — human tells the agent what to do, copies results back to Linear/Jira
2. **Bespoke** — each tool builds its own Linear integration, its own Jira integration, etc.

Neither scales. Manual breaks flow. Bespoke means N tools x M PM systems = N*M integrations.

## The Idea

A **protocol** — a standard schema + read/write interface — for work context. Any PM system can serve it (via adapter). Any agent can consume it. Build our own tool first, extract the protocol from what works.

```
PM System ──adapter──▶ WCP Server (MCP-compatible) ◀── Agent
                            ▲
                            │
                       filesystem + git
```

## Design Principles

See also: [[03-living-docs/patterns/Protocol-Over-Tool]] — the meta-pattern behind this project.

Inherited from [[05-projects/agent-pipeline-summary|pipeline-skills]]:

1. **Evolve from working systems.** Build the tool we need. Use it. Extract the protocol from what works. No speculative design.
2. **Keep it simple.** Start with the minimum schema that's useful. Add fields when a real use case demands them.
3. **Bidirectional.** Agents read context AND write back — status changes, comments, artifact links. The PM system is the source of truth, not a read-only reference.
4. **Correctness over speed.** A wrong status update is worse than a slow one. Agents should confirm state transitions make sense.
5. **Markdown is the name of the game.** Work items are markdown files with YAML frontmatter. Human-readable, grep-able, Obsidian-compatible, git-trackable.
6. **No business logic.** This is a system of record, not a workflow engine. No automations, no triggers, no state machines, no enforced transitions. Just structured data that agents and humans can read and write.

---

## Storage: Filesystem + Git

No database. Work items are markdown files in a git repository. Git gives you version history, audit trail, branching, and diffing for free. GitHub gives you remote persistence, backup, and a web UI.

### Directory Structure

```
wcp-data/                          ← git repo (push to GitHub for backup)
├── .wcp/
│   └── config.yaml                ← namespace definitions + counters
├── PIPE/
│   ├── PIPE-1.md
│   ├── PIPE-2.md
│   └── PIPE-3.md
├── SN/
│   ├── SN-1.md
│   ├── SN-2.md
│   └── SN-3.md
└── OS/
    ├── OS-1.md
    └── OS-2.md
```

Each namespace is a directory. Each work item is a file. The callsign IS the filename.

### Config File

```yaml
# .wcp/config.yaml
namespaces:
  PIPE:
    name: Pipeline Skills
    description: Agent pipeline framework development
    next: 4
  SN:
    name: Show Notes
    description: AI podcast summarizer
    next: 4
  OS:
    name: Operating System
    description: Personal OS tooling and improvements
    next: 3
```

The `next` counter tracks the next available number per namespace. The MCP server increments it on create.

---

## Work Item Format

A work item is a markdown file. Frontmatter is structured data. Body is free-form description. Activity log is appended.

```markdown
---
id: PIPE-12
title: Add WCP MCP server
status: todo
priority: high
type: feature
project: MVP
assignee: dave
parent: PIPE-1
created: 2026-02-19
updated: 2026-02-19
artifacts:
  - type: prd
    title: WCP PRD
    url: projects/pipe-12/prd.md
  - type: pr
    title: "feat: WCP MCP server"
    url: https://github.com/dpaola2/wcp/pull/3
---

Build the MCP server that exposes WCP tools for reading and writing work items.

## Acceptance Criteria

- [ ] `wcp_list_items` returns filtered items
- [ ] `wcp_get_item` returns full item detail
- [ ] `wcp_update_item` changes status and fields
- [ ] `wcp_add_comment` appends to activity log

---

## Activity

**dave** — 2026-02-19 10:30
Started sketching the schema. Going with filesystem + markdown approach.

**pipeline-discovery** — 2026-02-19 14:00
Discovery complete. Found 3 existing patterns in the codebase. Architecture
doc drafted and linked above.

**dave** — 2026-02-19 16:00
Reviewed architecture. Approved. Moving to implementation.
```

### Frontmatter Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Callsign: `{NS}-{N}`. Auto-generated on create. |
| `title` | string | yes | Short, scannable. |
| `status` | string | yes | `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` |
| `priority` | string | no | `urgent`, `high`, `medium`, `low`. Omit for none. |
| `type` | string | no | `feature`, `bug`, `chore`, `spike`. Omit if not useful. |
| `project` | string | no | Grouping within namespace. Free-form string. |
| `assignee` | string | no | Person or agent name. |
| `parent` | string | no | Callsign of parent item (for sub-tasks). |
| `created` | date | yes | ISO date. Set on create. |
| `updated` | date | yes | ISO date. Updated on every write. |
| `artifacts` | list | no | `[{type, title, url}]`. Artifact links. |

### Body

Everything between frontmatter and the `## Activity` section is the description. Markdown. Can include acceptance criteria, context, specs, whatever. The MCP server doesn't parse this — it just returns it as-is.

### Activity Log

The `## Activity` section is append-only. Each entry:

```
**{author}** — {ISO datetime}
{markdown body}
```

The MCP server's `wcp_add_comment` tool appends a new entry here and updates the `updated` date in frontmatter. Git tracks who actually committed.

---

## MCP Interface

WCP exposes itself as an MCP server. Agents interact through standard MCP tools.

### Tools

| Tool | Action | Example |
|------|--------|---------|
| `wcp_list` | List/filter work items | `namespace=PIPE status=todo` |
| `wcp_get` | Read one item (full file) | `id=PIPE-12` |
| `wcp_create` | Create new work item | `namespace=PIPE title="Add MCP server" type=feature` |
| `wcp_update` | Update frontmatter fields | `id=PIPE-12 status=in_progress` |
| `wcp_comment` | Append to activity log | `id=PIPE-12 body="Discovery complete."` |
| `wcp_namespaces` | List all namespaces | |

Six tools. That's it.

**What the tools do under the hood:**

- `wcp_create` → reads config, increments counter, writes new `.md` file, updates config, returns callsign
- `wcp_update` → reads file, modifies frontmatter fields, updates `updated` date, writes file
- `wcp_comment` → reads file, appends entry to `## Activity` section, updates `updated` date, writes file
- `wcp_list` → scans namespace directory, parses frontmatter from each file, filters, returns summary list
- `wcp_get` → reads file, returns full content (frontmatter + body + activity)
- `wcp_namespaces` → reads config, returns namespace list

No git operations in the MCP server itself. Git commit/push is a separate concern — the user (or a hook) handles that.

### Agent Workflow (typical)

```
1. Agent reads:    wcp_get PIPE-12
                   → full item: frontmatter, description, acceptance criteria,
                     artifacts, activity history

2. Agent starts:   wcp_update PIPE-12 status=in_progress

3. Agent reports:  wcp_comment PIPE-12 "Discovery complete. 3 existing
                   implementations found. Architecture doc drafted."

4. Agent links:    wcp_update PIPE-12 artifacts+={type: prd, title: "Architecture",
                   url: "projects/pipe-12/architecture.md"}

5. Agent finishes: wcp_update PIPE-12 status=in_review
```

---

## Pipeline-Skills Integration

Pipeline-skills is the primary consumer of WCP. Here's how the pipeline currently works and what changes.

### Current State (manual slugs + optional Linear)

- User runs `/prd my-feature` → creates `projects/my-feature/prd.md`
- The **slug** (`my-feature`) is the tracking key through all stages
- Skills reference the slug to find artifacts: `projects/{slug}/prd.md`, `projects/{slug}/architecture.md`, etc.
- Linear integration (ROAD-08) is planned but not built — would create Linear issues from gameplan milestones
- No status tracking — the user knows what stage they're at by which artifacts exist

### After WCP Integration

- User runs `wcp_create namespace=PIPE title="My Feature" type=feature` → gets `PIPE-42`
- User runs `/prd PIPE-42` → skill reads `wcp_get PIPE-42` for context, creates PRD, links it via `wcp_update PIPE-42 artifacts+={type: prd, ...}`
- Each stage updates status: `/discovery PIPE-42` → `wcp_update PIPE-42 status=in_progress`, then `wcp_comment PIPE-42 "Discovery complete. 3 modules identified..."`, then `wcp_update PIPE-42 status=in_review`
- **Callsign replaces slug** as the tracking key. Artifact paths could use callsign: `projects/PIPE-42/prd.md`
- Human checkpoints (architecture review, gameplan review) are recorded as comments
- The activity log becomes a complete audit trail of the pipeline run

### Which Skills Change

| Skill | Change |
|-------|--------|
| **All skills** | Accept callsign (e.g. `PIPE-42`) instead of slug. Read item context from WCP. |
| `/prd` | After creating PRD, link artifact and comment on WCP item. |
| `/discovery` | Set status to `in_progress`, comment with findings, set status to `in_review`. |
| `/architecture` | Same pattern. Link architecture doc as artifact. |
| `/gameplan` | Create sub-items for each milestone (`wcp_create parent=PIPE-42 title="Milestone 1: ..."`) |
| `/implementation` | Update milestone sub-item status as work progresses. |
| `/review` | Comment with review findings. |
| `/create-pr` | Link PR as artifact. |
| `/qa-plan` | Link QA plan. Set parent item to `in_review` or `done`. |

### Migration Path

This is NOT a big-bang rewrite. Evolve incrementally:

1. **Build WCP MCP server** (standalone — doesn't touch pipeline-skills)
2. **Use WCP manually** alongside pipeline-skills for a project or two
3. **Update one skill** (probably `/prd`) to read/write WCP. Validate the workflow.
4. **Roll through remaining skills** one at a time
5. **Deprecate slug-based tracking** when WCP covers all stages

---

## Future: Adapters

> Not in scope for MVP. Captured here for the roadmap.

The protocol's value multiplies when the same 6 tools can be backed by different systems:

| Adapter | What it does | Use case |
|---------|-------------|----------|
| **Filesystem (MVP)** | Reads/writes markdown files in a git repo | Dave's personal use, pipeline-skills |
| **Linear** | Reads/writes Linear issues via Linear API | Teams using Linear. Off-the-shelf MCP server that speaks WCP. |
| **GitHub Issues** | Maps WCP tools to GitHub Issues API | Open-source projects |
| **Jira** | Maps WCP tools to Jira REST API | Enterprise teams |

The **Linear adapter** is the most natural next step after MVP — Dave will be at DO using Linear, and a WCP-to-Linear adapter would let pipeline-skills work there without any pipeline changes. This could also be released as a standalone open-source MCP server for anyone using Linear with AI agents.

---

## Implementation Plan

### Phase 1: Working Tool (MVP)

Build the thing we need. Filesystem + markdown + MCP server.

**Tech stack:** TypeScript, `@modelcontextprotocol/sdk`, `gray-matter` (frontmatter parsing). No database. Follow the entity-index pattern (`tools/entity-index/`) for project structure, build setup, and MCP server boilerplate.

**Architectural reference:** `tools/entity-index/` in this repo:
- `package.json` — deps: `@modelcontextprotocol/sdk`, `better-sqlite3` (we replace with `gray-matter`)
- `src/index.ts` — MCP server setup, tool registration
- `src/parser.ts` — file parsing logic
- `src/database.ts` — storage layer (we replace with filesystem read/write)
- Configured in `.mcp.json` at project root with `VAULT_PATH` env var (we use `WCP_DATA_PATH`)

**Build steps:**
- [ ] Create repo at `~/projects/wcp/`
- [ ] Create data directory (configurable via `WCP_DATA_PATH` env var, default `~/projects/wcp-data/`)
- [ ] `npm init`, install `@modelcontextprotocol/sdk`, `gray-matter`, TypeScript
- [ ] `src/index.ts` — MCP server, 6 tools
- [ ] `src/parser.ts` — read/write markdown files with frontmatter
- [ ] `src/config.ts` — read/write `.wcp/config.yaml` (namespace defs + counters)
- [ ] Seed namespaces: `PIPE`, `SN`, `OS`
- [ ] Add to `.mcp.json` in assistant project (alongside entity-index)
- [ ] Init git in data directory, push to GitHub for backup
- [ ] Smoke test: create, list, get, update, comment on a work item

### Phase 2: Use It, Learn, Iterate

Run the tool for real work. Discover what's missing.

- What fields do we actually need?
- What queries do agents actually make?
- What status transitions matter?
- Is the activity log format right?
- Do we need `wcp_search` (full-text across descriptions)?
- Do we need projects as first-class entities with their own files?
- Git auto-commit on write? Or leave it manual?

### Phase 3: Extract the Protocol

Once the schema and interface are stable from real use:

- Formalize the WCP spec (file format + MCP tool contract)
- Build a Linear adapter (reads/writes Linear, exposes same 6 tools)
- The spec IS the file format + the tool interface. Anyone who serves those tools with that schema is WCP-compatible.

---

## What This Replaces / Complements

| Context | Before WCP | After WCP |
|---------|-----------|-----------|
| **Pipeline-skills** | Manual slug tracking, ROAD-08 planned bespoke Linear integration | Reads/writes WCP. PM-agnostic. |
| **Show Notes** | `_state.md` task board in markdown | WCP namespace `SN`. Claude reads/writes via MCP. |
| **Personal OS** | `_project-board.md`, scattered TODOs | WCP namespace `OS`. Queryable, agent-accessible. |
| **Future: DO** | Whatever they use (Linear?) | WCP adapter on top. Dave's tools work everywhere. |

---

## Why Filesystem + Git (Not SQLite)

| Property | Filesystem + Git | SQLite |
|----------|-----------------|--------|
| **Human-readable** | Yes — markdown files, open in any editor or Obsidian | No — binary DB, need a viewer |
| **Diffable** | Yes — `git diff` shows exactly what changed | No — binary diffs are meaningless |
| **History** | Free — `git log PIPE/PIPE-12.md` | Must build audit tables |
| **Grep-able** | Yes — `rg "status: todo" PIPE/` | Need SQL queries |
| **Backup** | `git push` to GitHub | Export/copy DB file |
| **Collaboration** | PRs, branches, merge | Locking, WAL mode |
| **Obsidian-compatible** | Yes — the data repo IS an Obsidian vault | No |
| **Agent-friendly** | Yes — agents are great at reading/writing text files | Also fine |
| **Performance** | Fine for hundreds of items. May need indexing at thousands. | Better at scale |

For the scale we're working at (dozens to low hundreds of items per namespace), filesystem wins on every dimension that matters.

---

## Open Questions

- **Naming confirmation:** WCP (Work Context Protocol) — good enough? Ship it?
- **Callsign collision with external systems:** WCP callsigns are local. Linear IDs are Linear's. An adapter would map between them (e.g., `PIPE-12` ↔ `ENG-456`).
- **Activity log vs. separate comment files:** Inline is simpler. Separate files if activity gets very long. Start inline, split if needed.
- **Git auto-commit:** Should the MCP server auto-commit on every write? Or leave that to the user / a periodic hook? Leaning toward: no auto-commit. Batch changes, commit when meaningful.
- **Ordering:** Do items need a `position` field for manual ordering within a status? Or is priority + creation order enough?
- **Projects as files:** Right now `project` is a string field on items. Could later promote to its own markdown file (`PIPE/_projects/MVP.md`) with description, status, dates. Not yet.

---

## Cross-References

- [[05-projects/agent-pipeline-summary]] — pipeline-skills (primary consumer of WCP)
- [[05-projects/show-notes/_index]] — Show Notes (WCP namespace candidate)
- [[03-living-docs/Tool-Integrations]] — MCP server configuration
- [[05-projects/entity-index/_index]] — entity-index MCP server (architectural pattern to follow: TypeScript, local, MCP-native)
