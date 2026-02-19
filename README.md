# WCP — Work Context Protocol

A standard way for AI agents to read and write project/task context, regardless of the underlying project management system. Markdown files in a git repo. No database. No business logic.

## How it works

You organize work into **namespaces** — each namespace is a project or area of focus. Inside each namespace, work items are **markdown files** with YAML frontmatter for structured fields, a free-form body for description, and an append-only activity log. Every item gets a **callsign** like `PIPE-12` — a short, unique identifier that agents and humans use to reference it.

AI agents interact with WCP through 6 MCP tools. They can list what needs doing, pick up a task, update its status as they work, and leave comments about what they did. Humans can do the same — either through the agent, or by opening the markdown files directly in any editor (including Obsidian).

### Concepts

| Concept | What it is | Example |
|---------|-----------|---------|
| **Namespace** | A project or area of focus. Each one is a directory. | `PIPE` (Pipeline Skills), `SN` (Show Notes) |
| **Work item** | A task, feature, bug, or spike. One markdown file. | `PIPE/PIPE-12.md` |
| **Callsign** | A unique ID: `{NAMESPACE}-{NUMBER}`. Auto-generated. | `PIPE-12`, `SN-3`, `OS-7` |
| **Status** | Where the item is in its lifecycle. | `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` |
| **Activity log** | Append-only history at the bottom of each item. | Comments from agents and humans with timestamps |

### What a work item looks like

```markdown
---
id: PIPE-12
title: Add WCP MCP server
status: in_progress
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

- [ ] `wcp_list` returns filtered items
- [ ] `wcp_get` returns full item detail
- [ ] `wcp_update` changes status and fields
- [ ] `wcp_comment` appends to activity log

---

## Activity

**dave** — 2026-02-19T10:30:00-05:00
Started sketching the schema. Going with filesystem + markdown approach.

**pipeline-discovery** — 2026-02-19T14:00:00-05:00
Discovery complete. Found 3 existing patterns in the codebase.
Architecture doc drafted and linked above.

**dave** — 2026-02-19T16:00:00-05:00
Reviewed architecture. Approved. Moving to implementation.
```

The frontmatter is structured data. The body is whatever you want. The activity log is a running record of what happened.

### Typical agent workflow

```
1. Agent reads:    wcp_get PIPE-12
                   → full item with description, criteria, history

2. Agent starts:   wcp_update PIPE-12 status=in_progress

3. Agent reports:  wcp_comment PIPE-12 "Discovery complete. 3 existing
                   patterns found. Architecture doc drafted."

4. Agent links:    wcp_update PIPE-12 addArtifacts=[{type: "prd",
                   title: "Architecture", url: "..."}]

5. Agent finishes: wcp_update PIPE-12 status=in_review
```

### Data directory structure

All work items live in a **data directory** — a plain git repo. Each namespace is a directory. Each work item is a file. The callsign is the filename.

```
wcp-data/                          ← git repo
├── .wcp/
│   └── config.yaml                ← namespace definitions + counters
├── PIPE/
│   ├── PIPE-1.md
│   ├── PIPE-2.md
│   └── PIPE-3.md
├── SN/
│   ├── SN-1.md
│   └── SN-2.md
└── OS/
    └── OS-1.md
```

The config file defines your namespaces:

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
    next: 3
  OS:
    name: Operating System
    description: Personal OS tooling and improvements
    next: 2
```

The `next` counter tracks the next available number. WCP increments it on create.

This directory is also a valid Obsidian vault — browse your work items with backlinks, search, and all the Obsidian features. It's also grep-able: `rg "status: todo" PIPE/` shows all your todos.

Git gives you version history, audit trail, branching, and diffing for free. Push to GitHub for backup.

## MCP tools

WCP exposes 6 tools via the Model Context Protocol:

| Tool | Action | Key parameters |
|------|--------|---------------|
| `wcp_namespaces` | List all namespaces | — |
| `wcp_list` | List/filter work items | `namespace` (required), `status`, `priority`, `type`, `project`, `assignee`, `parent` |
| `wcp_get` | Read one item (full content) | `id` (callsign, e.g. `PIPE-12`) |
| `wcp_create` | Create new work item | `namespace`, `title` (required), `status`, `priority`, `type`, `body`, ... |
| `wcp_update` | Update fields | `id` (required), `status`, `title`, `body`, `addArtifacts`, ... |
| `wcp_comment` | Append to activity log | `id`, `author`, `body` (all required) |

## Install

```bash
git clone <repo-url> ~/projects/wcp
cd ~/projects/wcp
npm install
npm run build
```

## Configure

WCP is an MCP server. You configure it in the `.mcp.json` of whatever project will use it. The server reads one environment variable: `WCP_DATA_PATH` — the path to the data directory.

### Single context

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "wcp": {
      "command": "node",
      "args": ["/Users/you/projects/wcp/dist/index.js"],
      "env": {
        "WCP_DATA_PATH": "/Users/you/projects/wcp-data"
      }
    }
  }
}
```

### Multiple contexts

The same WCP binary can serve different data directories. Add multiple entries to `.mcp.json`, each with its own `WCP_DATA_PATH`:

```json
{
  "mcpServers": {
    "wcp_personal": {
      "command": "node",
      "args": ["/Users/you/projects/wcp/dist/index.js"],
      "env": {
        "WCP_DATA_PATH": "/Users/you/projects/personal-wcp-data"
      }
    },
    "wcp_work": {
      "command": "node",
      "args": ["/Users/you/projects/wcp/dist/index.js"],
      "env": {
        "WCP_DATA_PATH": "/Users/you/work/wcp-data"
      }
    }
  }
}
```

Each entry spawns its own server process. Claude Code prefixes tool names with the server name, so you get `wcp_personal_list` and `wcp_work_list` as separate tools.

This configuration lives in your project, not in WCP. WCP itself is stateless — it reads `WCP_DATA_PATH` from the environment and operates against that directory. Nothing is hardcoded.

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

Use whatever namespace keys make sense for your work. Keys should be short uppercase strings — they become directory names and callsign prefixes.

## Architecture

WCP separates protocol from storage via an adapter pattern:

- **Protocol** (`src/adapter.ts`) — the `WcpAdapter` interface defining the 6 operations and their types. This is the spec.
- **Filesystem adapter** (`src/adapters/filesystem.ts`) — implements `WcpAdapter` by reading/writing markdown files with YAML frontmatter.
- **MCP server** (`src/index.ts`) — registers the 6 tools, wires them to the adapter, handles errors.

Future adapters (Linear, GitHub Issues, Jira) would implement the same `WcpAdapter` interface against different backends, without changing any tool signatures.

See `architecture-proposal.md` and `decisions/ADR-001-adapter-pattern.md` for the full design rationale.

## Design principles

1. **Evolve from working systems.** Build the tool. Use it. Extract the protocol from what works.
2. **Keep it simple.** 6 tools. Markdown files. YAML frontmatter. That's it.
3. **Bidirectional.** Agents read context AND write back — status, comments, artifacts.
4. **Markdown is the data format.** Human-readable, grep-able, Obsidian-compatible, git-trackable.
5. **No business logic.** Pure data layer. No automations, triggers, or enforced transitions.
6. **No git operations.** WCP reads and writes files. Git commit/push is your concern.
