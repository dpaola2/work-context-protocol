# WCP — Claude Code Instructions

See [AGENTS.md](./AGENTS.md) for full project conventions, architecture, and code patterns.

## Quick Reference

- **Build:** `npx tsc -b`
- **Syntax check:** `npx tsc -b --noEmit`
- **Smoke tests:** `npx tsx packages/mcp/src/smoke-test.ts`
- **Key entry points:** `packages/mcp/src/index.ts` (MCP server), `packages/mcp/src/adapters/filesystem.ts` (all I/O), `packages/shared/src/types.ts` (interfaces)
- **Imports:** Always use `.js` extension (`import { foo } from "./bar.js"`); cross-package imports use package name (`import { ... } from "@wcp/shared"`)
- **Module system:** ESM with Node16 resolution, npm workspaces monorepo
- **Changelog:** `CHANGELOG.md` — update for every release. Follow [Keep a Changelog](https://keepachangelog.com/) format: `Breaking Changes` first, then `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`. Include upgrade instructions for any breaking changes. Current version: 0.2.0.
