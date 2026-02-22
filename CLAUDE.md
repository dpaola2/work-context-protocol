# WCP — Claude Code Instructions

See [AGENTS.md](./AGENTS.md) for full project conventions, architecture, code patterns, and pipeline configuration.

## Work Tracking (CRITICAL)

This project is tracked in WCP namespace `WCP`.

**When the user asks "where are we", "status", "what's next", or starts a new session:** immediately call `wcp_list` with namespace `WCP` and `wcp_get` on active items to load current state. Do this BEFORE responding.

- `wcp_list` with namespace `WCP` — see all work items and their status
- `wcp_get` on active items — full context, body, and activity log
- `wcp_comment` — log session progress before ending a session
- `wcp_update` — change item status as work progresses

## Quick Reference

- **Build:** `npx tsc`
- **Syntax check:** `npx tsc --noEmit`
- **Smoke tests:** `npx tsx src/smoke-test.ts`
- **Key entry points:** `src/index.ts` (MCP server), `src/adapters/filesystem.ts` (all I/O), `src/adapter.ts` (interfaces)
- **Imports:** Always use `.js` extension (`import { foo } from "./bar.js"`)
- **Module system:** ESM with Node16 resolution
