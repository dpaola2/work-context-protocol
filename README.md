# WCP — Work Context Protocol

A structured way for AI agents and humans to track work. Organize tasks into namespaces, attach documents, log activity, and query everything through 12 MCP tools. Two storage modes: local markdown files or a remote SQLite server with a live web dashboard.

## Why WCP?

AI agents need persistent context across sessions. They need to know what's been done, what's in progress, and what's next — not just for one conversation, but across an entire project. WCP gives agents (and humans) a shared workspace for tracking all of that: tasks, status, comments, attached documents, and history.

**Without WCP:** Every agent session starts from scratch. Context lives in chat logs, scattered notes, or your head.

**With WCP:** An agent picks up `PROJ-12`, reads the description, checks the activity log to see what the last agent did, updates the status, and leaves a comment for the next session.

## Two modes

| Mode | Best for | Storage | Setup |
|------|----------|---------|-------|
| **Filesystem** (default) | Single machine, git-tracked, Obsidian-compatible | Markdown files in a directory | Point at a folder |
| **Server** | Multiple machines, live web dashboard, no git sync | SQLite database over HTTP | Run the server, point MCP at it |

You can start with filesystem mode and migrate to server mode later — there's a migration script that imports everything.

## Quick start

### Install

```bash
git clone https://github.com/dpaola2/work-context-protocol.git ~/projects/wcp
cd ~/projects/wcp
npm install
npx tsc -b
```

### Option A: Filesystem mode (simplest)

Set up a data directory:

```bash
mkdir -p ~/projects/wcp-data/.wcp
```

Add WCP to Claude Code:

```bash
claude mcp add wcp --scope user \
  -e WCP_DATA_PATH=~/projects/wcp-data \
  -- node ~/projects/wcp/packages/mcp/dist/index.js
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "wcp": {
      "command": "node",
      "args": ["/path/to/wcp/packages/mcp/dist/index.js"],
      "env": {
        "WCP_DATA_PATH": "/path/to/wcp-data"
      }
    }
  }
}
```

Then use `wcp_create_namespace` to create your first namespace — no manual config editing needed.

### Option B: Server mode (multi-machine, web dashboard)

Start the server:

```bash
WCP_DB_PATH=./wcp.db npx tsx packages/server/src/index.ts
```

The server creates a fresh SQLite database if it doesn't exist. Open http://localhost:3000 to see the web dashboard.

Point your MCP server at it:

```bash
claude mcp add wcp --scope user \
  -e WCP_ADAPTER=http \
  -e WCP_SERVER_URL=http://localhost:3000 \
  -- node ~/projects/wcp/packages/mcp/dist/index.js
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "wcp": {
      "command": "node",
      "args": ["/path/to/wcp/packages/mcp/dist/index.js"],
      "env": {
        "WCP_ADAPTER": "http",
        "WCP_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

#### Authentication

Set `WCP_API_KEY` on both the server and the MCP config to enable bearer token auth:

```bash
# Server
WCP_API_KEY=your-secret WCP_DB_PATH=./wcp.db npx tsx packages/server/src/index.ts

# MCP config — add to env block
"WCP_API_KEY": "your-secret"
```

If `WCP_API_KEY` is not set, auth is disabled (convenient for local dev).

#### Docker

```bash
docker build -t wcp-server -f packages/server/Dockerfile .
docker run -p 3000:3000 -v wcp-data:/data -e WCP_API_KEY=your-secret wcp-server
```

SQLite data persists in the `/data` volume. Container restarts preserve all data.

## Migrating from filesystem to server

If you've been using filesystem mode and want to switch to the server:

```bash
npx tsx packages/server/src/migrate-fs.ts \
  --source ~/projects/wcp-data \
  --db ./wcp.db
```

This reads your `config.yaml`, all work item `.md` files, activity logs, and artifacts, and imports everything into SQLite. The script is idempotent — safe to re-run.

Then start the server pointing at the migrated database:

```bash
WCP_DB_PATH=./wcp.db npx tsx packages/server/src/index.ts
```

Your filesystem data directory is not modified. You can keep using it as a backup or with Obsidian.

## How it works

You organize work into **namespaces** — each namespace is a project or area of focus. Inside each namespace, work items have YAML frontmatter for structured fields, a free-form body for description, and an append-only activity log. Every item gets a **callsign** like `PIPE-12` — a short, unique identifier that agents and humans use to reference it.

AI agents interact with WCP through 12 MCP tools. They can list what needs doing, pick up a task, update its status as they work, leave comments about what they did, and attach documents.

### Concepts

| Concept | What it is | Example |
|---------|-----------|---------|
| **Namespace** | A project or area of focus | `PROJ` (My Project), `OPS` (Operations) |
| **Work item** | A task, feature, bug, or spike | `PROJ-12` |
| **Callsign** | A unique ID: `{NAMESPACE}-{NUMBER}`. Auto-generated. | `PROJ-12`, `OPS-3`, `WCP-7` |
| **Status** | Where the item is. No enforced transitions. | `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` |
| **Activity log** | Append-only history on each item | Comments from agents and humans with timestamps |
| **Artifact** | A document attached to a work item | PRDs, architecture docs, plans, ADRs |

### What a work item looks like

```markdown
---
id: WCP-1
title: Build WCP MVP
status: in_progress
priority: high
type: feature
assignee: dave
created: 2026-02-19
updated: 2026-02-19
artifacts:
  - type: plan
    title: Implementation Plan
    url: WCP/WCP-1/plan.md
---

Build the MCP server that exposes WCP tools for reading and writing work items.

## Acceptance Criteria

- [x] 12 MCP tools functional
- [x] Filesystem adapter with markdown storage

---

## Activity

**dave** — 2026-02-19T10:30:00-05:00
Started sketching the schema.

**claude** — 2026-02-19T10:57:00-05:00
All 12 tools built. 84/84 tests passing.
```

### Schema

Statuses and artifact types are **extensible** per namespace. Priority and type are fixed.

| Field | Default values | Extensible? |
|-------|---------------|-------------|
| **status** | `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` | Yes |
| **priority** | `urgent`, `high`, `medium`, `low` | No |
| **type** | `feature`, `bug`, `chore`, `spike` | No |
| **artifact_type** | `prd`, `discovery`, `architecture`, `adr`, `gameplan`, `plan`, `test-matrix`, `review`, `qa-plan` | Yes |

Use `wcp_schema` to discover valid values at runtime. Use `wcp_schema_update` to add custom statuses or artifact types to a namespace.

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

The MCP server includes instructions that are sent to agents during the handshake, so they understand how to use the tools without additional prompting.

## Web dashboard

When running in server mode, open `http://localhost:3000` (or wherever you deployed it) to see a read-only web dashboard with:

- **Namespace list** — all namespaces with item counts
- **Item list** — filterable by status, priority, and type
- **Item detail** — rendered markdown body, activity log, artifacts
- **All items** — cross-namespace view with filters
- **Live updates** — SSE-powered, no refresh needed. When an agent creates or updates an item via MCP, the dashboard updates automatically.

The dashboard is read-only. All mutations go through MCP tools or the REST API.

## Testing

### Automated tests (378 total)

```bash
# Filesystem adapter tests (no server needed)
npx tsx packages/mcp/src/smoke-test.ts              # 84 tests
npx tsx packages/mcp/src/status-transition-test.ts   # 26 tests
npx tsx packages/mcp/src/approve-test.ts             # 35 tests
npx tsx packages/mcp/src/adapter-expansion-test.ts   # 44 tests

# Server tests (start a test server first)
rm -f /tmp/wcp-test.db && WCP_DB_PATH=/tmp/wcp-test.db npx tsx packages/server/src/index.ts &
npx tsx src/server-api-test.ts                       # 110 tests
npx tsx src/http-adapter-test.ts                     # 34 tests
npx tsx src/sse-test.ts                              # 13 tests
npx tsx src/migration-test.ts                        # 32 tests
```

### Manual QA with seed data

```bash
rm -f /tmp/wcp-qa.db && WCP_DB_PATH=/tmp/wcp-qa.db npx tsx packages/server/src/seed-qa.ts
WCP_DB_PATH=/tmp/wcp-qa.db npx tsx packages/server/src/index.ts
```

This creates 3 test namespaces with 16 items covering all statuses, priorities, types, artifacts, activity logs, schema extensions, and parent/child relationships.

## Architecture

WCP is organized as an npm workspaces monorepo:

| Package | Path | Purpose |
|---------|------|---------|
| `@wcp/shared` | `packages/shared/` | Types, errors, validation, schema — zero runtime deps |
| `@wcp/mcp` | `packages/mcp/` | MCP server + FilesystemAdapter + HttpAdapter |
| `@wcp/server` | `packages/server/` | Hono REST API + SQLite + web dashboard |

The adapter pattern separates protocol from storage:

```
Claude Code / any MCP client
  └── MCP Server (packages/mcp/src/index.ts)
        └── 12 Tool Handlers
              └── WcpAdapter interface (packages/shared/src/types.ts)
                    ├── FilesystemAdapter → markdown files
                    └── HttpAdapter → HTTP → WCP Server → SQLite
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WCP_ADAPTER` | `filesystem` | Adapter to use: `filesystem` or `http` |
| `WCP_DATA_PATH` | — | Path to filesystem data directory (filesystem mode) |
| `WCP_SERVER_URL` | — | Server URL (http mode, e.g. `http://localhost:3000`) |
| `WCP_API_KEY` | — | Bearer token for auth (server + MCP config). Disabled if unset. |
| `WCP_DB_PATH` | `wcp.db` | SQLite database path (server only) |
| `PORT` | `3000` | Server listen port (server only) |

## Design principles

1. **Evolve from working systems.** Build the tool. Use it. Extract the protocol from what works.
2. **Keep it simple.** Markdown + YAML for filesystem. SQLite for server. No ORM, no framework magic.
3. **Contextualize work, don't just store it.** WCP's job is to organize the current state of a piece of work — description, status, activity history, attached documents — so whoever picks it up next has full context.
4. **Bidirectional.** Agents read context AND write back — status, comments, artifacts.
5. **No enforced transitions.** Pure data layer. No automations, triggers, or enforced state machines.
6. **Compose, don't extend.** New use cases should be satisfied by reading existing data, not adding tools or fields to WCP.
