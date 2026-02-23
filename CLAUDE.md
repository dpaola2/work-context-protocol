# WCP — Claude Code Instructions

See [AGENTS.md](./AGENTS.md) for full project conventions, architecture, and code patterns.

## Work Tracking (CRITICAL)

This project is tracked in WCP namespace `WCP`.

**When the user asks "where are we", "status", "what's next", or starts a new session:** immediately call `wcp_list` with namespace `WCP` and `wcp_get` on active items to load current state. Do this BEFORE responding.

- `wcp_list` with namespace `WCP` — see all work items and their status
- `wcp_get` on active items — full context, body, and activity log
- `wcp_comment` — log session progress before ending a session
- `wcp_update` — change item status as work progresses

## Quick Reference

- **Build:** `npx tsc -b`
- **Syntax check:** `npx tsc -b --noEmit`
- **Smoke tests:** `npx tsx packages/mcp/src/smoke-test.ts`
- **Key entry points:** `packages/mcp/src/index.ts` (MCP server), `packages/mcp/src/adapters/filesystem.ts` (all I/O), `packages/shared/src/types.ts` (interfaces)
- **Imports:** Always use `.js` extension (`import { foo } from "./bar.js"`); cross-package imports use package name (`import { ... } from "@wcp/shared"`)
- **Module system:** ESM with Node16 resolution, npm workspaces monorepo
- **Changelog:** `CHANGELOG.md` — update for every release. Follow [Keep a Changelog](https://keepachangelog.com/) format: `Breaking Changes` first, then `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`. Include upgrade instructions for any breaking changes. Current version: 0.3.0.
