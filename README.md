# WCP — Work Context Protocol

A structured way for AI agents and humans to track work. Open protocol with 12 MCP tools. Works with Claude Code, Claude Cowork, and any MCP-compatible client. Organize tasks into namespaces, attach documents, log activity, and query everything through MCP.

## Why WCP?

AI agents need persistent context across sessions. They need to know what's been done, what's in progress, and what's next — not just for one conversation, but across an entire project. WCP gives agents (and humans) a shared workspace for tracking all of that: tasks, status, comments, attached documents, and history.

WCP works anywhere MCP does — Claude Code for developers, Claude Cowork for everyone else, or any other MCP-compatible client.

**Without WCP:** Every agent session starts from scratch. Context lives in chat logs, scattered notes, or your head.

**With WCP:** An agent picks up `PROJ-12`, reads the description, checks the activity log to see what the last agent did, updates the status, and leaves a comment for the next session.

## WCP Cloud (recommended)

The fastest way to get started. Hosted, managed, just works.

```bash
claude mcp add --transport http --scope user wcp https://workcontextprotocol.io/mcp
```

That's it. One line. Your agent now has full access to all 12 WCP tools. Works with Claude Code, and as a custom connector in Claude Cowork. Visit [workcontextprotocol.io](https://workcontextprotocol.io) to learn more.

## Self-hosted filesystem mode

Free, local, git-trackable, Obsidian-compatible. All your data stays on your machine as markdown files.

### Install

```bash
git clone https://github.com/dpaola2/work-context-protocol.git ~/projects/wcp
cd ~/projects/wcp
npm install
npx tsc -b
```

### Set up a data directory

```bash
mkdir -p ~/projects/wcp-data/.wcp
```

### Add WCP to Claude Code / Claude Cowork

```bash
claude mcp add wcp --scope user \
  -e WCP_DATA_PATH=~/projects/wcp-data \
  -- node ~/projects/wcp/packages/mcp/dist/index.js
```

> **Note:** The `--` (double dash, then a space) is important! It separates Claude CLI options from the command to run. `-- node` means "run `node` with the following arguments." Don't combine them into `--node` — that's not a valid flag.

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

## Testing

189 automated tests across 4 suites:

```bash
npx tsx packages/mcp/src/smoke-test.ts              # 84 tests
npx tsx packages/mcp/src/status-transition-test.ts   # 26 tests
npx tsx packages/mcp/src/approve-test.ts             # 35 tests
npx tsx packages/mcp/src/adapter-expansion-test.ts   # 44 tests
```

## Connect a project to a namespace

To make Claude Code automatically track work in a specific namespace when you're working in a project directory, add a section to that project's `CLAUDE.md`:

```markdown
## Work Tracking (CRITICAL)

This project is tracked in WCP namespace `YOUR_NS`.

**When the user asks "where are we", "status", "what's next", or starts a new session:** immediately call `wcp_list` with namespace `YOUR_NS` and `wcp_get` on active items to load current state. Do this BEFORE responding.

- `wcp_list` with namespace `YOUR_NS` — see all work items and their status
- `wcp_get` on active items — full context, body, and activity log
- `wcp_comment` — log session progress before ending a session
- `wcp_update` — change item status as work progresses
```

Replace `YOUR_NS` with your namespace key (e.g., `PROJ`). Claude Code reads `CLAUDE.md` at session start, so the agent will always know which namespace to use. This works identically with the filesystem adapter and [WCP Cloud](https://workcontextprotocol.io).

## Migrate to WCP Cloud

If you're currently using the local filesystem adapter and want to switch to [WCP Cloud](https://workcontextprotocol.io) (hosted, no local server needed), you can migrate all your data:

1. Sign up at [workcontextprotocol.io](https://workcontextprotocol.io) and get your bearer token
2. Run the migration:

```bash
cd ~/projects/wcp
npm run build
npm run migrate -- --url https://workcontextprotocol.io/mcp --token <YOUR_TOKEN>
```

This reads your local data directory and pushes everything — namespaces, work items, comments, artifacts, and approval verdicts — to WCP Cloud. Original timestamps and callsigns are preserved.

**Options:**
- `--data-path <path>` — path to your WCP data directory (default: `$WCP_DATA_PATH` or `~/projects/wcp-data`)
- `--dry-run` — parse and report what would be migrated without making any API calls

The migration is idempotent — if a namespace or item already exists in the cloud, it's skipped.

3. Once verified, swap your MCP config from the local server to the cloud:

```bash
claude mcp remove wcp
claude mcp add --transport http wcp https://workcontextprotocol.io/mcp
```

## Architecture

WCP is organized as an npm workspaces monorepo:

| Package | Path | Purpose |
|---------|------|---------|
| `@wcp/shared` | `packages/shared/` | Types, errors, validation, schema — zero runtime deps |
| `@wcp/mcp` | `packages/mcp/` | MCP server + FilesystemAdapter |

The adapter pattern separates protocol from storage:

```
Claude Code / Claude Cowork / any MCP client
  └── MCP Server (packages/mcp/src/index.ts)
        └── 12 Tool Handlers
              └── WcpAdapter interface (packages/shared/src/types.ts)
                    └── FilesystemAdapter → markdown files
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WCP_DATA_PATH` | `~/projects/wcp-data` | Path to filesystem data directory |

## Design principles

1. **Evolve from working systems.** Build the tool. Use it. Extract the protocol from what works.
2. **Keep it simple.** Markdown + YAML for storage. No ORM, no framework magic.
3. **Contextualize work, don't just store it.** WCP's job is to organize the current state of a piece of work — description, status, activity history, attached documents — so whoever picks it up next has full context.
4. **Bidirectional.** Agents read context AND write back — status, comments, artifacts.
5. **No enforced transitions.** Pure data layer. No automations, triggers, or enforced state machines.
6. **Compose, don't extend.** New use cases should be satisfied by reading existing data, not adding tools or fields to WCP.

## License

MIT
