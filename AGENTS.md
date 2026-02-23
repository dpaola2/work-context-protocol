# WCP — Agent Conventions

## Project Overview

WCP (Work Context Protocol) is an MCP server that provides structured work item tracking via markdown files with YAML frontmatter. It exposes 12 tools over MCP for creating, reading, updating, and organizing work items by namespace.

**Runtime:** Node.js + TypeScript (ES2022, Node16 module resolution)
**Transport:** MCP stdio
**Storage:** Filesystem — markdown files in a configurable data directory

## Architecture

### Monorepo Structure

WCP is organized as an npm workspace monorepo with TypeScript project references:

| Package | Path | Purpose |
|---------|------|---------|
| `@wcp/shared` | `packages/shared/` | Types, errors, validation, schema logic — zero runtime deps |
| `@wcp/mcp` | `packages/mcp/` | MCP server, FilesystemAdapter, config YAML I/O, parser |

Build order is enforced by `tsconfig.json` project references (`tsc -b` builds shared → mcp).

### Key Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types.ts` | Protocol contract — all interfaces (`WcpAdapter`, `WorkItem`, `Namespace`, schema types, config types) |
| `packages/shared/src/errors.ts` | Error hierarchy — `WcpError` → `NotFoundError`, `NamespaceNotFoundError`, `ValidationError` |
| `packages/shared/src/validation.ts` | Field validators — `validateStatus()`, `validatePriority()`, `validateType()`, `validateArtifactType()`, `validateVerdict()` |
| `packages/shared/src/schema.ts` | `resolveSchema()` — merges global defaults with namespace extensions. Schema mutation functions |
| `packages/shared/src/utils.ts` | `parseCallsign()`, `today()` (date-only), `now()` (ISO 8601 with ms) |
| `packages/mcp/src/adapters/filesystem.ts` | All I/O logic — the only `WcpAdapter` implementation. All 12 adapter methods |
| `packages/mcp/src/index.ts` | MCP server setup — tool handlers, each a thin pass-through to the adapter |
| `packages/mcp/src/parser.ts` | `parseWorkItem()` / `serializeWorkItem()` — markdown ↔ frontmatter/body/activity round-trip |
| `packages/mcp/src/config.ts` | `readConfig()` / `writeConfig()` for `.wcp/config.yaml` |
| `packages/mcp/src/seed.ts` | Data seeding script |

### Design Principles

- **Work-item-centric:** Every piece of data belongs to a work item (frontmatter, body, activity log, or artifact)
- **Compose on existing primitives:** New use cases should be satisfied by composing readers over existing data — not adding new tools or fields
- **Adapter pattern:** `WcpAdapter` interface defines the contract. `FilesystemAdapter` is the implementation. The interface exists so other tools (like WCP Cloud) can implement the same protocol
- **Activity log is append-only:** Timestamped, human/agent-readable. The right primitive for state transitions

### Work Item File Format

```markdown
---
id: NS-1
title: Example item
status: backlog
created: 2026-02-19
updated: 2026-02-19
---

Body content here.

---

## Activity

**author** — 2026-02-19T10:00:00.000Z
Comment text here.
```

- Frontmatter: YAML between `---` fences (parsed by `gray-matter`)
- Body: free-form markdown between frontmatter and activity separator
- Activity separator: literal `---\n\n## Activity`
- Activity entries: `**author** — {ISO timestamp}\n{body}`, separated by blank lines (`\n\n`)

### Timestamp Conventions

- `today()` → `"2026-02-19"` (date-only, for `created`/`updated` frontmatter)
- `now()` → `"2026-02-19T22:30:00.000Z"` (ISO 8601 with ms, for activity log entries)

## Code Patterns

### Error Handling

All adapter methods throw typed errors from `src/errors.ts`:
- `NotFoundError` — item or artifact doesn't exist
- `NamespaceNotFoundError` — namespace not in config
- `ValidationError` — invalid field value

MCP tool handlers catch `WcpError` and return structured error responses. Other errors propagate.

### Activity Log Append Pattern

Used by `addComment()` and should be followed by any code that appends to the activity log:

```typescript
const timestamp = now();
const entry = `**${author}** — ${timestamp}\n${body}`;

if (parsed.activity) {
    parsed.activity = parsed.activity + "\n\n" + entry;
} else {
    parsed.activity = entry;
}
```

### Schema Validation

Every write operation (`createItem`, `updateItem`, `attachArtifact`) resolves the schema for the target namespace and validates field values before mutation. The pattern:

```typescript
const resolved = resolveSchema(config, namespace);
if (changes.status) validateStatus(changes.status, resolved.status.all);
```

## Pipeline Configuration

### Repository Details

| Field | Value |
|-------|-------|
| Default branch | `main` |
| Branch prefix | `pipeline/` |
| Test command | `npx tsx packages/mcp/src/smoke-test.ts` |
| Syntax check command | `npx tsc -b --noEmit` |
| Build command | `npx tsc -b` |
| Remote | `git@github.com:dpaola2/work-context-protocol.git` |

### Framework & Stack

| Field | Value |
|-------|-------|
| Language | TypeScript (ES2022, strict mode) |
| Runtime | Node.js |
| Module system | ESM (`"type": "module"` in package.json, Node16 module resolution) |
| Test framework | Custom smoke test (no Jest/Vitest/Mocha) |
| Test data pattern | manual (inline `adapter.createItem()` calls) |
| Assertion pattern | `check(label, condition, detail?)` helper function |
| Syntax check | `npx tsc --noEmit` |
| Package manager | npm |
| Key dependencies | `@modelcontextprotocol/sdk`, `gray-matter`, `zod` |

### Directory Structure

| Directory | Contents |
|-----------|----------|
| `packages/shared/src/` | Shared types, errors, validation, schema (zero runtime deps) |
| `packages/mcp/src/` | MCP server source and test files |
| `packages/mcp/src/adapters/` | Adapter implementation (`filesystem.ts`) |
| `packages/mcp/src/smoke-test.ts` | Main smoke test suite |
| `packages/mcp/src/status-transition-test.ts` | Status transition auto-log tests (WCP-9) |
| `packages/mcp/src/approve-test.ts` | Approval tool tests (WCP-11) |
| `packages/mcp/src/adapter-expansion-test.ts` | Adapter expansion tests (WCP-19 M1) |
| `packages/*/dist/` | Compiled JavaScript output per package |

### Test Conventions

- **No formal test framework.** Tests are standalone TypeScript scripts that run via `npx tsx`.
- **Pattern:** Create a function containing sequential test cases, use a `check(label, ok, detail?)` helper for assertions, exit with code 1 on any failure.
- **Test data:** Created inline using `adapter.createItem("OS", { ... })` in the OS namespace. Tests do not clean up after themselves.
- **Error testing:** Use try/catch blocks, assert on `e.code` values (`"NOT_FOUND"`, `"VALIDATION_ERROR"`, `"NAMESPACE_NOT_FOUND"`).
- **String assertions:** Use `includes()` for activity log content, not strict equality. This avoids brittle tests when new entries are appended.
- **Artifact frontmatter:** `gray-matter` handles round-trip parsing of artifact YAML frontmatter. `matter(content)` → `{ data, content }`, `matter.stringify(content, data)` recombines. Works cleanly even on files with no existing frontmatter (adds `---` header).
- **Schema mutation tests:** Use `addNamespaceStatuses()` / `removeNamespaceStatuses()` directly, with cleanup in `finally` blocks.
- **New test files** should follow the `smoke-test.ts` pattern exactly — same `check()` helper, same structure, same exit behavior.

### Import Conventions

- All internal imports use `.js` extension (required by Node16 module resolution): `import { foo } from "./bar.js"`
- Cross-package imports use the package name: `import { WcpAdapter, validateStatus } from "@wcp/shared"`
- Type-only imports use `import type { ... }` syntax
