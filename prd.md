---
pipeline_stage: 0
pipeline_stage_name: prd
pipeline_project: "wcp-mvp"
pipeline_started_at: "2026-02-19T09:30:21-0500"
pipeline_completed_at: "2026-02-19T09:30:27-0500"
---

# Work Context Protocol (WCP) — MVP PRD

|  |  |
| -- | -- |
| **Product** | Work Context Protocol |
| **Version** | 1 |
| **Author** | Stage 0 (Pipeline) |
| **Date** | 2026-02-19 |
| **Status** | Draft — Review Required |
| **Platforms** | MCP Server (CLI / agent integration) |
| **Level** | 2 |

---

## 1. Executive Summary

**What:** An MCP-compatible server that exposes 6 tools for AI agents (and humans) to read and write structured work items stored as markdown files with YAML frontmatter in a git repository. Work items are organized by namespace (e.g., `PIPE`, `SN`, `OS`), each with an auto-incrementing callsign (`PIPE-12`). No database — the filesystem is the database, git is the audit trail.

**Why:** AI coding agents need a standard way to know what to work on and report what they did. Today this is either manual (human copies context back and forth) or bespoke (each tool builds its own PM integration). WCP eliminates the N-tools x M-PM-systems integration matrix by providing a single protocol that any agent can consume and any PM system can serve via adapter.

**Key Design Principles:**
- **Evolve from working systems** — build the tool we need, use it, extract the protocol from what works. No speculative design.
- **Markdown is the data format** — human-readable, grep-able, Obsidian-compatible, git-trackable. YAML frontmatter for structured fields, markdown body for description, append-only activity log for history.
- **No business logic** — pure data layer. No automations, triggers, state machines, or enforced transitions. Agents and humans read and write structured data.
- **Six tools, that's it** — `wcp_list`, `wcp_get`, `wcp_create`, `wcp_update`, `wcp_comment`, `wcp_namespaces`. Minimal surface area.

---

## 2. Goals & Success Metrics

### Goals
- Provide a working MCP server that pipeline-skills (and other agents) can use to track work items
- Replace manual slug-based tracking in the pipeline with callsign-based tracking backed by structured data
- Validate the WCP file format and tool interface through real daily use before extracting a formal protocol spec
- Store all work context in a git repo that doubles as an Obsidian vault

### Success Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| All 6 MCP tools functional (create, list, get, update, comment, namespaces) | Pass smoke test | Day 1 |
| Pipeline-skills `/prd` skill reads/writes WCP instead of manual slugs | 1 skill migrated | 30 days |
| WCP used as primary work tracker for at least 2 projects | 2+ projects tracked | 30 days |
| All pipeline-skills migrated to WCP callsigns | Full migration | 60 days |

---

## 3. Feature Requirements

### Core MCP Tools

| ID | Requirement | Platform | Priority |
|----|------------|----------|----------|
| MCP-001 | `wcp_namespaces` returns a list of all configured namespaces with name, description, and item count | MCP Server | Must |
| MCP-002 | `wcp_list` returns a filtered summary list of work items. Supports filters: `namespace` (required), `status`, `priority`, `type`, `project`, `assignee`, `parent` | MCP Server | Must |
| MCP-003 | `wcp_list` returns only frontmatter fields (id, title, status, priority, type, project, assignee, created, updated) — not full body or activity log | MCP Server | Must |
| MCP-004 | `wcp_get` accepts a callsign (e.g., `PIPE-12`) and returns the full file content: frontmatter, body, and activity log | MCP Server | Must |
| MCP-005 | `wcp_create` accepts `namespace`, `title`, and optional fields (`status`, `priority`, `type`, `project`, `assignee`, `parent`). Auto-generates callsign by reading and incrementing the namespace counter in config. Writes a new `.md` file. Returns the new callsign. | MCP Server | Must |
| MCP-006 | `wcp_create` defaults `status` to `backlog`, `created` and `updated` to today's date, and initializes an empty `## Activity` section | MCP Server | Must |
| MCP-007 | `wcp_update` accepts a callsign and one or more frontmatter fields to change. Updates the specified fields and sets `updated` to today's date. Does not modify body or activity log. | MCP Server | Must |
| MCP-008 | `wcp_update` supports an `artifacts` append operation — adding a new artifact `{type, title, url}` to the artifacts list without replacing existing entries | MCP Server | Must |
| MCP-009 | `wcp_comment` accepts a callsign, `author`, and `body`. Appends a new entry to the `## Activity` section in the format `**{author}** — {ISO datetime}\n{body}`. Updates `updated` date in frontmatter. | MCP Server | Must |
| MCP-010 | All write operations (`wcp_create`, `wcp_update`, `wcp_comment`) are atomic — either the full write succeeds or no file is modified | MCP Server | Must |

### File Format & Parsing

| ID | Requirement | Platform | Priority |
|----|------------|----------|----------|
| FMT-001 | Work items are markdown files with YAML frontmatter (parsed via `gray-matter`), a free-form markdown body, and an `## Activity` section | MCP Server | Must |
| FMT-002 | The frontmatter schema supports these fields: `id` (string, required), `title` (string, required), `status` (string, required), `priority` (string), `type` (string), `project` (string), `assignee` (string), `parent` (string), `created` (date, required), `updated` (date, required), `artifacts` (list of `{type, title, url}`) | MCP Server | Must |
| FMT-003 | Valid `status` values are: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` | MCP Server | Must |
| FMT-004 | Valid `priority` values are: `urgent`, `high`, `medium`, `low` (or omitted for none) | MCP Server | Must |
| FMT-005 | Valid `type` values are: `feature`, `bug`, `chore`, `spike` (or omitted) | MCP Server | Should |
| FMT-006 | The parser must preserve the body section (between frontmatter and `## Activity`) exactly as-is — no reformatting | MCP Server | Must |
| FMT-007 | The parser must preserve the activity log section exactly as-is when performing updates to frontmatter | MCP Server | Must |

### Configuration

| ID | Requirement | Platform | Priority |
|----|------------|----------|----------|
| CFG-001 | Namespace definitions and counters are stored in `.wcp/config.yaml` at the root of the data directory | MCP Server | Must |
| CFG-002 | Each namespace in config has: key (directory name), `name` (human label), `description`, and `next` (next available number) | MCP Server | Must |
| CFG-003 | The data directory path is configurable via `WCP_DATA_PATH` environment variable, defaulting to `~/projects/wcp-data/` | MCP Server | Must |
| CFG-004 | On startup, the server validates that the data directory and `.wcp/config.yaml` exist. If not, it returns a clear error message with setup instructions. | MCP Server | Must |
| CFG-005 | Seed the initial config with three namespaces: `PIPE` (Pipeline Skills), `SN` (Show Notes), `OS` (Operating System) | MCP Server | Should |

### Server Infrastructure

| ID | Requirement | Platform | Priority |
|----|------------|----------|----------|
| SRV-001 | The server runs as a stdio-based MCP server using `@modelcontextprotocol/sdk` | MCP Server | Must |
| SRV-002 | The server is configured in `.mcp.json` at the consuming project root with `WCP_DATA_PATH` as an env var | MCP Server | Must |
| SRV-003 | The server does NOT perform git operations (commit, push, pull). Git is a separate concern handled by the user or hooks. | MCP Server | Must |

---

## 4. Platform-Specific Requirements

### MCP Server (Primary Platform)
- Runs as a local stdio-based MCP server, invoked by Claude Code (or any MCP-compatible client)
- Follows the `tools/entity-index/` architectural pattern: TypeScript, `@modelcontextprotocol/sdk`, tool registration in `src/index.ts`
- Replaces `better-sqlite3` (used in entity-index) with filesystem I/O + `gray-matter` for parsing
- All tool responses follow MCP tool result format (content array with text type)

### API
- N/A — no HTTP API. The MCP tool interface is the API. Future adapters (Linear, GitHub Issues) are out of scope for MVP.

---

## 5. User Flows

### Flow 1: Agent Creates and Works a Task
**Persona:** AI coding agent (e.g., pipeline-skills discovery agent)
**Entry Point:** Agent receives a callsign or is asked to create new work

1. Agent calls `wcp_namespaces` to see available namespaces
2. Agent calls `wcp_create` with `namespace=PIPE`, `title="Add authentication middleware"`, `type=feature`
3. Server increments `PIPE.next` in config, writes `PIPE/PIPE-4.md`, returns `PIPE-4`
4. Agent calls `wcp_update` with `id=PIPE-4`, `status=in_progress`, `assignee=pipeline-discovery`
5. Agent does its work, then calls `wcp_comment` with `id=PIPE-4`, `author=pipeline-discovery`, `body="Discovery complete. Found 3 existing auth patterns."`
6. Agent calls `wcp_update` with `id=PIPE-4`, `status=in_review`
7. **Success:** Work item reflects full lifecycle with activity trail
8. **Error:** If callsign doesn't exist, server returns clear error: "Item PIPE-99 not found"

### Flow 2: Human Reviews Work Items
**Persona:** Developer (Dave)
**Entry Point:** Wants to see what's in progress

1. Human (via agent) calls `wcp_list` with `namespace=PIPE`, `status=in_progress`
2. Server scans `PIPE/` directory, parses frontmatter from each file, filters by status, returns summary list
3. Human calls `wcp_get` with `id=PIPE-4` to see full details including activity log
4. Human reviews, then calls `wcp_comment` with `author=dave`, `body="Approved. Moving to implementation."`
5. Human calls `wcp_update` with `status=todo` (or `in_progress` for next stage)
6. **Success:** Human has full visibility into agent work and can steer via status changes and comments
7. **Error:** If namespace doesn't exist, server returns: "Namespace XYZ not found"

### Flow 3: Human Browses Work Items Directly
**Persona:** Developer (Dave)
**Entry Point:** Opens data directory in Obsidian or text editor

1. Human navigates to `~/projects/wcp-data/PIPE/`
2. Opens `PIPE-4.md` in Obsidian — rendered markdown with frontmatter metadata
3. Edits the body or frontmatter directly in editor
4. Saves — file is immediately available to MCP server on next read
5. **Success:** Files are always human-readable and editable without the MCP server
6. **Error:** If human introduces invalid frontmatter YAML, the parser should handle gracefully (return raw content with a parse warning, not crash)

---

## 6. UI Mockups / Wireframes

N/A — this is a CLI/MCP tool with no graphical UI. The "UI" is the MCP tool interface and the markdown files themselves.

Example work item file (`PIPE/PIPE-12.md`):

```
---
id: PIPE-12
title: Add WCP MCP server
status: in_progress
priority: high
type: feature
project: MVP
assignee: dave
created: 2026-02-19
updated: 2026-02-19
artifacts:
  - type: prd
    title: WCP PRD
    url: projects/pipe-12/prd.md
---

Build the MCP server that exposes WCP tools for reading and writing work items.

## Acceptance Criteria

- [ ] `wcp_list` returns filtered items
- [ ] `wcp_get` returns full item detail
- [ ] `wcp_update` changes status and fields
- [ ] `wcp_comment` appends to activity log

---

## Activity

**dave** — 2026-02-19 10:30
Started sketching the schema. Going with filesystem + markdown approach.

**pipeline-discovery** — 2026-02-19 14:00
Discovery complete. Found 3 existing patterns in the codebase.
```

---

## 7. Backwards Compatibility

N/A — greenfield project. No existing clients, APIs, or data to maintain compatibility with.

---

## 8. Edge Cases & Business Rules

| Scenario | Expected Behavior | Platform |
|----------|-------------------|----------|
| `wcp_create` called with a namespace that doesn't exist in config | Return error: "Namespace {ns} not found. Available: PIPE, SN, OS" | MCP Server |
| `wcp_get` called with a callsign that doesn't match any file | Return error: "Item {id} not found" | MCP Server |
| `wcp_update` called with an invalid status value | Return error: "Invalid status '{val}'. Valid values: backlog, todo, in_progress, in_review, done, cancelled" | MCP Server |
| `wcp_list` called on a namespace with zero items | Return empty list, not an error | MCP Server |
| Two agents call `wcp_update` on the same item concurrently | Last write wins (filesystem semantics). Acceptable for MVP — conflict resolution is out of scope. | MCP Server |
| Two agents call `wcp_create` concurrently in the same namespace | Config counter increment must be atomic — read config, increment, write config, then write file. Use file-level locking or sequential processing to prevent duplicate callsigns. | MCP Server |
| Human edits a file and introduces malformed YAML frontmatter | `wcp_get` returns the raw file content with a warning field. `wcp_list` skips the file with a warning in the response. Server does not crash. | MCP Server |
| `wcp_comment` called with empty body | Return error: "Comment body cannot be empty" | MCP Server |
| Work item file is deleted outside the MCP server | `wcp_get` returns "not found". `wcp_list` simply doesn't include it. No orphan tracking needed. | MCP Server |
| `WCP_DATA_PATH` env var points to a non-existent directory | Server returns clear error on startup with setup instructions | MCP Server |
| Config file has a namespace defined but the directory doesn't exist yet | `wcp_create` creates the namespace directory automatically. `wcp_list` returns empty list. | MCP Server |
| `wcp_update` with `artifacts` field replaces vs. appends | `artifacts` field uses append semantics by default (adds to list). To replace, pass the full list. [CONFIRM] | MCP Server |
| Very large activity log (hundreds of entries) in a single file | [INFERRED] No pagination for MVP. Return full file content. May need to revisit if files exceed reasonable size (>100KB). | MCP Server |

---

## 9. Export Requirements

N/A — no reports or data exports. Data is already in human-readable markdown files. Git history serves as the audit trail. Standard unix tools (`rg`, `grep`) can query across files.

---

## 10. Out of Scope

- **Adapters** (Linear, GitHub Issues, Jira) — future phases, not MVP
- **Git operations** — the MCP server does not commit, push, or pull. Git is managed externally.
- **HTTP API** — no REST/GraphQL endpoint. MCP tools only.
- **Authentication / authorization** — local tool, single user
- **Full-text search** across work item bodies — may be added later as `wcp_search`
- **Projects as first-class entities** — `project` is a string field, not its own file type
- **Ordering / position field** — items are ordered by priority + creation order
- **Activity log pagination** — full log returned every time
- **State machine / transition validation** — any status can move to any other status
- **Webhooks / notifications** — no event system
- **Auto-commit on write** — explicitly deferred per design principles
- **Pipeline-skills integration** — pipeline-skills will be updated separately after WCP is stable

---

## 11. Open Questions

| # | Question | Status | Decision | Blocking? |
|---|----------|--------|----------|-----------|
| 1 | Should `wcp_update` with `artifacts` append by default or require explicit append syntax (`artifacts+=`)? | Open | Leaning toward: `wcp_update` replaces `artifacts` if provided; add a separate mechanism or convention for append. | Yes |
| 2 | Should the MCP server auto-create namespace directories that exist in config but not on disk? | Open | Leaning toward: yes, create on first `wcp_create`. | No |
| 3 | Should `wcp_list` support sorting (e.g., by priority, updated date)? | Open | Leaning toward: sort by `updated` descending by default, no custom sort for MVP. | No |
| 4 | Should `wcp_create` accept a full markdown body, or should the body be set via a subsequent `wcp_update`? | Open | Leaning toward: accept optional `body` param on create. | No |
| 5 | Should the `parent` field support querying (e.g., `wcp_list parent=PIPE-1` to see sub-tasks)? | Open | Leaning toward: yes, `parent` is a filter on `wcp_list`. Already listed in MCP-002. | No |
| 6 | How should `wcp_update` handle the `body` (description between frontmatter and Activity)? Separate tool? Parameter on update? | Open | Leaning toward: `wcp_update` accepts optional `body` param that replaces the description section. | Yes |
| 7 | File-level locking strategy for concurrent `wcp_create` calls — use `proper-lockfile`, advisory locks, or just accept the race condition for MVP? | Open | Leaning toward: accept the race condition for MVP (single-user tool). | No |

> **Blocking questions remain — resolve Q1 and Q6 before pipeline intake.**

---

## 12. Release Plan

### Phases

| Phase | What Ships | Flag | Audience |
|-------|-----------|------|----------|
| Phase 1 (MVP) | All 6 MCP tools, filesystem storage, config management, seed namespaces | N/A — local tool | Dave (single user) |
| Phase 2 (Pipeline Integration) | Pipeline-skills updated to use WCP callsigns instead of slugs | N/A | Dave + pipeline agents |
| Phase 3 (Protocol Extraction) | Formal WCP spec, Linear adapter | N/A | Open source |

### Feature Flag Strategy
- N/A — local tool, not a SaaS product. No feature flags needed. Ship and iterate.

---

## 13. Assumptions

- The data directory (`WCP_DATA_PATH`) is on a local filesystem with standard POSIX file operations
- Single user / single machine — no concurrent multi-user access to the data directory
- Work item count per namespace stays in the low hundreds (filesystem scan is acceptable, no index needed)
- `@modelcontextprotocol/sdk` supports stdio transport and tool registration (confirmed — used by entity-index)
- `gray-matter` correctly round-trips YAML frontmatter without data loss (widely used, well-tested)
- The `tools/entity-index/` project in the same workspace provides a working reference for MCP server setup, `package.json` structure, and TypeScript build configuration
- Git operations (commit, push) are handled outside the MCP server — either manually or via hooks
- Agents calling WCP tools will follow the callsign convention and provide valid namespace/callsign values

---

## Appendix: Linked Documents

| Document | Link |
|----------|------|
| Framing Doc | `projects/inbox/framing.md` |
| Architectural Reference | `tools/entity-index/` (entity-index MCP server) |
| Pipeline Skills | `~/.claude/skills/` (primary consumer of WCP) |
| MCP SDK | `@modelcontextprotocol/sdk` (npm) |
