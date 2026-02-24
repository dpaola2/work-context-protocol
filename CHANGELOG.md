# Changelog

All notable changes to WCP are documented here.

## [0.4.0] — 2026-02-24

### Added

- **Filesystem-to-cloud migration script** — `npx wcp-migrate` migrates all namespaces, work items, artifacts, and activity logs from the local filesystem adapter to [WCP Cloud](https://workcontextprotocol.io). Supports `--dry-run`, `--namespace` filtering, and handles rate limiting with automatic retries. (WCPC-10)
- **Auto-create setup work item** — When the first namespace is created, WCP now auto-creates a "Set up WCP in your project" work item with instructions for adding WCP to the project's `CLAUDE.md`.

### Fixed

- **Auto-create config on first run** — The MCP server no longer crashes when the data directory or `config.yaml` doesn't exist. On first run, it auto-creates both with sensible defaults (`{ namespaces: {} }`), so the user's first interaction is `wcp_create_namespace` instead of debugging a missing file error. (WCPC-32)

### Changed

- README updated with Claude Cowork compatibility note, "Connect a project to a namespace" section, and `--scope user` for WCP Cloud install command

## [0.3.0] — 2026-02-23

### Breaking Changes

**Server package removed.** The `@wcp/server` package (Hono REST API, SQLite, web dashboard) has been removed. For hosted WCP, use [WCP Cloud](https://workcontextprotocol.io) — one line, no local server needed:

```bash
claude mcp add --transport http wcp https://workcontextprotocol.io/mcp
```

**HTTP adapter removed.** `WCP_ADAPTER=http` is no longer supported. WCP Cloud speaks MCP natively — connect directly with `claude mcp add`.

**Environment variables removed:** `WCP_ADAPTER`, `WCP_SERVER_URL`, `WCP_API_KEY`.

### Changed

- Repositioned as protocol spec + local filesystem adapter
- README rewritten: WCP Cloud as recommended path, filesystem as free self-host option

### Removed

- `@wcp/server` package (Hono REST API, SQLite adapter, web dashboard, Docker, migration script, QA seed data)
- `HttpAdapter` from `@wcp/mcp`
- Server test suites (110 + 34 + 13 + 32 = 189 server tests)
- HTTP benchmark

## [0.2.0] — 2026-02-22

### Breaking Changes

**MCP server entry point has moved.** Due to the monorepo restructure, the compiled entry point changed:

- **Old:** `dist/index.js`
- **New:** `packages/mcp/dist/index.js`

Update your MCP config:

```bash
# Claude Code CLI
claude mcp add wcp --scope user \
  -e WCP_DATA_PATH=/path/to/wcp-data \
  -- node /path/to/wcp/packages/mcp/dist/index.js
```

```json
// .mcp.json
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

Existing filesystem adapter behavior is unchanged. If you don't set `WCP_ADAPTER`, everything works as before (just with the new path).

### Added

- **WCP Server** — Hono REST API backed by SQLite with WAL mode, schema versioning, and forward-only migrations. Run with `WCP_DB_PATH=./wcp.db npx tsx packages/server/src/index.ts`.
- **HTTP Adapter** — Set `WCP_ADAPTER=http` + `WCP_SERVER_URL` to use WCP from any machine without syncing files.
- **Live Web Dashboard** — Read-only SPA at the server URL with namespace list, item list, item detail, cross-namespace "All Items" view, and SSE-powered live updates.
- **Bearer token auth** — Set `WCP_API_KEY` on server and MCP config. Disabled if unset.
- **Docker support** — `docker build -t wcp-server -f packages/server/Dockerfile .` produces a runnable image with volume-persisted SQLite.
- **Filesystem-to-SQLite migration** — `npx tsx packages/server/src/migrate-fs.ts --source <path> --db <path>` imports all namespaces, items, activity logs, artifacts, and schema extensions. Idempotent.
- **QA seed script** — `npx tsx packages/server/src/seed-qa.ts` populates test data for manual QA.
- **`WcpAdapter` expanded to 12 methods** — `createNamespace()`, `getSchema()`, `updateSchema()` added to the adapter interface. All 12 MCP tools now route through the adapter.
- **Monorepo restructure** — `@wcp/shared` (types, validation, schema), `@wcp/mcp` (MCP server + adapters), `@wcp/server` (REST API + SQLite + web UI). Build with `npx tsc -b`.

### Changed

- `DEFAULT_SCHEMA.artifact_type` expanded from `["adr", "plan"]` to include all 9 standard types: `prd`, `discovery`, `architecture`, `adr`, `gameplan`, `plan`, `test-matrix`, `review`, `qa-plan`.
- Build command changed from `npx tsc` to `npx tsc -b` (TypeScript project references).

## [0.1.0] — 2026-02-19

Initial release. Filesystem adapter with markdown storage, 12 MCP tools, schema validation, artifact storage, activity log, and approval mechanism.
