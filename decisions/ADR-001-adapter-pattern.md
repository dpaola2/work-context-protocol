# ADR-001: Protocol + Adapter Separation

**Date:** 2026-02-19
**Status:** Accepted
**Project:** wcp-mvp
**Stage:** 2

## Context

WCP is described as a "protocol" — a standard interface for AI agents to read/write work context, regardless of the underlying PM system. The framing doc explicitly plans for multiple storage backends: filesystem (MVP), Linear, GitHub Issues, Jira.

The question is whether to build the adapter abstraction now or hardwire the filesystem implementation and refactor later.

The reference project (entity-index) hardwires SQLite directly into its tool handlers. This is fine for entity-index because it will only ever use SQLite. WCP is different — the protocol IS the product, and the filesystem is just the first backend.

## Decision

Separate the codebase into two layers:

1. **Protocol layer** (`adapter.ts` + `index.ts`) — defines the `WcpAdapter` interface with 6 async methods matching the 6 MCP tools, plus shared types. Tool handlers in `index.ts` call the adapter interface, never storage-specific code.

2. **Storage layer** (`adapters/filesystem.ts` + `parser.ts` + `config.ts`) — implements `WcpAdapter` for the filesystem+markdown backend. Future adapters go in `adapters/linear.ts`, etc.

The adapter is instantiated in `index.ts` and injected into tool handlers. For MVP, it's hardcoded: `const adapter = new FilesystemAdapter(DATA_PATH)`. When a second adapter exists, we add a config-driven selection — but not before.

## Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Adapter interface (chosen)** | Future adapters are clean additions. Protocol and storage can be reasoned about independently. Matches the project's stated purpose. | Slightly more files than a flat structure. Interface indirection (negligible runtime cost). |
| **Flat / hardwired (entity-index style)** | Fewer files. No abstraction overhead. Faster initial build. | Adding a second backend requires refactoring every tool handler. Protocol and storage are entangled. Contradicts the project's purpose. |
| **Plugin system (dynamic loading)** | Adapters loadable at runtime from config. Third-party extensibility. | Over-engineered for a single-user MVP. Dynamic loading hurts type safety. Adds complexity nobody needs yet. |

## Consequences

- Every tool handler calls `adapter.methodName()` — never `fs.readFileSync()` or `matter.parse()` directly
- The adapter interface must be async (because future adapters need network I/O), even though the filesystem adapter is synchronous under the hood
- Adding a new adapter means: implement `WcpAdapter`, add a constructor call in `index.ts`. No tool handler changes.
- Filesystem-specific modules (`parser.ts`, `config.ts`) are NOT part of the protocol — they're implementation details of one adapter
- The adapter interface becomes the de facto protocol specification: if you implement these 6 methods with these types, you're WCP-compatible
