# WCP — Claude Code Instructions

See [AGENTS.md](./AGENTS.md) for full project conventions, architecture, and code patterns.

## Quick Reference

- **Build:** `npx tsc`
- **Syntax check:** `npx tsc --noEmit`
- **Smoke tests:** `npx tsx src/smoke-test.ts`
- **Key entry points:** `src/index.ts` (MCP server), `src/adapters/filesystem.ts` (all I/O), `src/adapter.ts` (interfaces)
- **Imports:** Always use `.js` extension (`import { foo } from "./bar.js"`)
- **Module system:** ESM with Node16 resolution
