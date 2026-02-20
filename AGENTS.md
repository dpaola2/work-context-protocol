# WCP — Agent Conventions

## Project Overview

WCP (Work Context Protocol) is an MCP server that provides structured work item tracking via markdown files with YAML frontmatter. It exposes 12 tools over MCP for creating, reading, updating, and organizing work items by namespace.

**Runtime:** Node.js + TypeScript (ES2022, Node16 module resolution)
**Transport:** MCP stdio
**Storage:** Filesystem — markdown files in a configurable data directory

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/adapter.ts` | Protocol contract — all TypeScript interfaces (`WcpAdapter`, `WorkItem`, `UpdateItemInput`, etc.) |
| `src/adapters/filesystem.ts` | All I/O logic — the only `WcpAdapter` implementation. Read/write/query operations on markdown files |
| `src/index.ts` | MCP server setup — 12 tool handlers, each a thin pass-through to the adapter |
| `src/parser.ts` | `parseWorkItem()` / `serializeWorkItem()` — markdown ↔ frontmatter/body/activity round-trip |
| `src/schema.ts` | `resolveSchema()` — merges global defaults with namespace extensions. Called on every write |
| `src/validation.ts` | Field validators — `validateStatus()`, `validatePriority()`, `validateType()`, `validateArtifactType()`, `validateVerdict()` |
| `src/utils.ts` | `parseCallsign()`, `today()` (date-only), `now()` (ISO 8601 with ms) |
| `src/errors.ts` | Error hierarchy — `WcpError` → `NotFoundError`, `NamespaceNotFoundError`, `ValidationError` |
| `src/config.ts` | `readConfig()` / `writeConfig()` for `.wcp/config.yaml` |
| `src/seed.ts` | Data seeding script |

### Design Principles

- **Work-item-centric:** Every piece of data belongs to a work item (frontmatter, body, activity log, or artifact)
- **Compose on existing primitives:** New use cases should be satisfied by composing readers over existing data — not adding new tools or fields
- **Adapter pattern:** `WcpAdapter` interface defines the contract. `FilesystemAdapter` is the only implementation. Future adapters (Linear, SQLite) can implement differently
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
| Test command | `npx tsx src/smoke-test.ts` |
| Syntax check command | `npx tsc --noEmit` |
| Build command | `npx tsc` |
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
| `src/` | All source and test files (flat structure) |
| `src/adapters/` | Adapter implementations (`filesystem.ts`) |
| `src/smoke-test.ts` | Main smoke test suite |
| `src/status-transition-test.ts` | Status transition auto-log tests (WCP-9) |
| `dist/` | Compiled JavaScript output |

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
- Type-only imports use `import type { ... }` syntax
