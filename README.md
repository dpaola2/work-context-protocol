# WCP — Work Context Protocol

A standard way for AI agents to read and write project/task context, regardless of the underlying project management system. Markdown files in a git repo. No database. No business logic.

## How it works

You organize work into **namespaces** — each namespace is a project or area of focus. Inside each namespace, work items are **markdown files** with YAML frontmatter for structured fields, a free-form body for description, and an append-only activity log. Every item gets a **callsign** like `PIPE-12` — a short, unique identifier that agents and humans use to reference it.

AI agents interact with WCP through 12 MCP tools. They can list what needs doing, pick up a task, update its status as they work, leave comments about what they did, and attach documents. Humans can do the same — either through the agent, or by opening the markdown files directly in any editor (including Obsidian).

### Concepts

| Concept | What it is | Example |
|---------|-----------|---------|
| **Namespace** | A project or area of focus. Each one is a directory. | `PROJ` (My Project), `OPS` (Operations) |
| **Work item** | A task, feature, bug, or spike. One markdown file. | `PROJ/PROJ-12.md` |
| **Callsign** | A unique ID: `{NAMESPACE}-{NUMBER}`. Auto-generated. | `PROJ-12`, `OPS-3`, `WCP-7` |
| **Status** | Semantic label for where the item is. No enforced transitions. | `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` |
| **Activity log** | Append-only history at the bottom of each item. | Comments from agents and humans with timestamps |
| **Artifact** | A document attached to a work item. Stored in a companion directory. | `WCP-1/plan.md`, `WCP-1/ADR-001-adapter-pattern.md` |

### What a work item looks like

```markdown
---
id: WCP-1
title: Build WCP MVP
status: in_progress
priority: high
type: feature
project: wcp-mvp
assignee: dave
created: 2026-02-19
updated: 2026-02-19
artifacts:
  - type: plan
    title: Implementation Plan
    url: WCP/WCP-1/plan.md
  - type: adr
    title: ADR-001 Adapter Pattern
    url: WCP/WCP-1/ADR-001-adapter-pattern.md
---

Build the MCP server that exposes WCP tools for reading and writing work items.

## Acceptance Criteria

- [x] 12 MCP tools functional
- [x] Filesystem adapter with markdown storage
- [ ] At least one real project tracked for 1 week

---

## Activity

**dave** — 2026-02-19T10:30:00-05:00
Started sketching the schema.

**claude** — 2026-02-19T10:57:00-05:00
All 11 tools built. 41/41 tests passing.
```

### Artifact storage

Artifacts are stored in a **companion directory** next to the work item. `WCP-1.md` gets a `WCP-1/` directory:

```
WCP/
├── WCP-1.md                         ← work item
└── WCP-1/                           ← artifacts
    ├── plan.md
    ├── ADR-001-adapter-pattern.md
    └── meeting-notes.md
```

Use `wcp_attach` to store artifacts and `wcp_get_artifact` to retrieve them. Artifacts are registered in the work item's frontmatter automatically.

### Data directory structure

All data lives in a **data directory** — a plain git repo, also a valid Obsidian vault.

```
wcp-data/
├── .wcp/
│   └── config.yaml                ← namespace definitions + counters
├── WCP/
│   ├── WCP-1.md
│   └── WCP-1/
│       ├── plan.md
│       └── ADR-001-adapter-pattern.md
├── PROJ/
│   ├── PROJ-1.md
│   └── PROJ-2.md
└── OPS/
    └── OPS-1.md
```

The config file defines your namespaces:

```yaml
# .wcp/config.yaml
schema:
  status: [backlog, todo, in_progress, in_review, done, cancelled]
  priority: [urgent, high, medium, low]
  type: [feature, bug, chore, spike]
  artifact_type: [adr, plan]

namespaces:
  WCP:
    name: Work Context Protocol
    description: WCP development
    next: 2
  PROJ:
    name: My Other Project
    description: Another area of work
    next: 3
    schema:
      statuses: [blocked]
      artifact_types: [prd, architecture, runbook]
```

The `schema` block defines global defaults for field values. The `status` and `artifact_type` fields are **extensible** — namespaces can add their own values via per-namespace `schema` blocks (see `PROJ` above). The `priority` and `type` fields are fixed. If the top-level `schema` key is omitted, built-in defaults are used. Default artifact types are intentionally minimal (`adr`, `plan`) — add domain-specific types per namespace.

The `next` counter tracks the next available number. WCP increments it on create. Use `wcp_schema` to discover valid values at runtime.

## MCP tools

WCP exposes 12 tools via the Model Context Protocol:

| Tool | Action | Key parameters |
|------|--------|---------------|
| `wcp_namespaces` | List all namespaces | — |
| `wcp_create_namespace` | Create a new namespace | `key`, `name`, `description` (all required) |
| `wcp_list` | List/filter work items | `namespace` (required), `status`, `priority`, `type`, `project`, `assignee`, `parent` |
| `wcp_get` | Read one item (full content) | `id` (callsign, e.g. `PROJ-12`) |
| `wcp_create` | Create new work item | `namespace`, `title` (required), `status`, `priority`, `type`, `body`, ... |
| `wcp_update` | Update fields | `id` (required), `status`, `title`, `body`, `addArtifacts`, ... |
| `wcp_comment` | Append to activity log | `id`, `author`, `body` (all required) |
| `wcp_attach` | Store an artifact file | `id`, `type`, `title`, `filename`, `content` (all required) |
| `wcp_get_artifact` | Retrieve an artifact | `id`, `filename` (both required) |
| `wcp_approve` | Record approval on an artifact | `id`, `artifact` (filename), `verdict` (all required) |
| `wcp_schema` | Discover valid field values | `namespace` (optional) |
| `wcp_schema_update` | Extend statuses/artifact types | `namespace` (required), `add_statuses`, `remove_statuses`, `add_artifact_types`, `remove_artifact_types` |

The server includes instructions that are sent to agents during the MCP handshake, so they understand how to use the tools without additional prompting.

## Install

```bash
git clone <repo-url> ~/projects/wcp
cd ~/projects/wcp
npm install
npm run build
```

## Configure

### Global (all Claude Code sessions)

```bash
claude mcp add wcp --scope user -e WCP_DATA_PATH=/path/to/wcp-data -- node /path/to/wcp/dist/index.js
```

### Per-project

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "wcp": {
      "command": "node",
      "args": ["/path/to/wcp/dist/index.js"],
      "env": {
        "WCP_DATA_PATH": "/path/to/wcp-data"
      }
    }
  }
}
```

## Set up a data directory

```bash
mkdir -p ~/projects/wcp-data/.wcp
cd ~/projects/wcp-data
git init
```

Create `.wcp/config.yaml` with your namespaces:

```yaml
namespaces:
  MYPROJECT:
    name: My Project
    description: What this project is about
    next: 1
```

Or use `wcp_create_namespace` to add namespaces without manually editing config.yaml — the tool creates the namespace entry and sets up the counter automatically.

You can also use the seed script to create a starter directory:

```bash
WCP_DATA_PATH=~/projects/wcp-data npm run seed
```

## Architecture

WCP separates protocol from storage via an adapter pattern:

```
MCP Server (index.ts)
  └── Tool Handlers (12 tools)
        └── WcpAdapter (interface)
              └── FilesystemAdapter (MVP)
              └── LinearAdapter (future)
              └── JiraAdapter (future)
```

- **Protocol** (`src/adapter.ts`) — the `WcpAdapter` interface defining operations and their types
- **Filesystem adapter** (`src/adapters/filesystem.ts`) — reads/writes markdown + YAML frontmatter
- **MCP server** (`src/index.ts`) — registers tools, wires them to the adapter, handles errors

Future adapters implement the same `WcpAdapter` interface against different backends without changing any tool signatures.

## Design principles

1. **Evolve from working systems.** Build the tool. Use it. Extract the protocol from what works.
2. **Keep it simple.** Markdown files. YAML frontmatter. That's it.
3. **Contextualize work, don't just store it.** WCP's job isn't to be a database of work items. It's to organize the current state of a piece of work — description, status, activity history, attached documents — so whoever picks it up next has full context.
4. **Bidirectional.** Agents read context AND write back — status, comments, artifacts.
5. **Markdown is the data format.** Human-readable, grep-able, Obsidian-compatible, git-trackable.
6. **No enforced transitions.** Pure data layer. No automations, triggers, or enforced state machines.
7. **No git operations.** WCP reads and writes files. Git commit/push is your concern.
