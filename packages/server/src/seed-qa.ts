import type { WcpAdapter, Namespace, ItemSummary } from "@wcp/shared";
import { initDatabase } from "./db.js";
import { SqliteAdapter } from "./adapter.js";

// ---------------------------------------------------------------------------
// Inline HTTP adapter for remote seeding — avoids cross-package import from
// @wcp/mcp. Only the methods used by the seed script need full implementations.
// ---------------------------------------------------------------------------

function createHttpAdapter(serverUrl: string, apiKey?: string): WcpAdapter {
  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(`${serverUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`HTTP ${res.status}: ${(err as { message: string }).message || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    async listNamespaces() {
      return (await req<{ namespaces: Namespace[] }>("GET", "/api/namespaces")).namespaces;
    },
    async createNamespace(key, name, description) {
      return (await req<{ namespace: Namespace }>("POST", "/api/namespaces", { key, name, description })).namespace;
    },
    async listItems(ns) {
      return (await req<{ items: ItemSummary[] }>("GET", `/api/namespaces/${ns}/items`)).items;
    },
    async listAllItems(filters) {
      const params = new URLSearchParams();
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v) params.set(k, v);
        }
      }
      const qs = params.toString();
      return (await req<{ items: ItemSummary[] }>("GET", `/api/items${qs ? `?${qs}` : ""}`)).items;
    },
    async createItem(ns, input) {
      return (await req<{ id: string }>("POST", `/api/namespaces/${ns}/items`, input)).id;
    },
    async getItem(id) {
      return (await req<{ item: any }>("GET", `/api/items/${id}`)).item;
    },
    async updateItem(id, changes) {
      await req("PATCH", `/api/items/${id}`, changes);
    },
    async addComment(id, author, body) {
      await req("POST", `/api/items/${id}/comments`, { author, body });
    },
    async attachArtifact(id, input) {
      return (await req<{ artifact: any }>("POST", `/api/items/${id}/artifacts`, input)).artifact;
    },
    async getArtifact(id, filename) {
      return req("GET", `/api/items/${id}/artifacts/${filename}`);
    },
    async approveArtifact(id, input) {
      await req("POST", `/api/items/${id}/artifacts/${input.filename}/approve`, { verdict: input.verdict });
    },
    async getSchema(ns?) {
      return (await req<{ schema: any }>("GET", ns ? `/api/schema/${ns}` : "/api/schema")).schema;
    },
    async updateSchema(ns, changes) {
      return req("PATCH", `/api/schema/${ns}`, {
        add_statuses: changes.addStatuses,
        remove_statuses: changes.removeStatuses,
        add_artifact_types: changes.addArtifactTypes,
        remove_artifact_types: changes.removeArtifactTypes,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const QA_NAMESPACES = ["QATEST", "QAEMPTY", "QAEXT"] as const;

async function seedQA() {
  const mode = process.env.WCP_SEED_MODE || "sqlite";
  let adapter: WcpAdapter;

  if (mode === "http") {
    const url = process.env.WCP_SERVER_URL;
    if (!url) {
      console.error("Error: WCP_SEED_MODE=http requires WCP_SERVER_URL to be set.");
      console.error("Example: WCP_SEED_MODE=http WCP_SERVER_URL=http://localhost:3000 npx tsx packages/server/src/seed-qa.ts");
      process.exit(1);
    }
    console.log(`Seeding via HTTP: ${url}`);
    adapter = createHttpAdapter(url, process.env.WCP_API_KEY);
  } else {
    const dbPath = process.env.WCP_DB_PATH || "wcp.db";
    console.log(`Seeding SQLite database: ${dbPath}`);
    const db = initDatabase(dbPath);
    adapter = new SqliteAdapter(db);
  }

  // Idempotency check — skip if QA namespaces already exist
  const existing = await adapter.listNamespaces();
  const existingKeys = new Set(existing.map((n) => n.key));
  const alreadyExists = QA_NAMESPACES.filter((k) => existingKeys.has(k));

  if (alreadyExists.length > 0) {
    console.log(`\nQA namespaces already exist: ${alreadyExists.join(", ")}`);
    console.log("Skipping seed to avoid duplicates. To re-seed, delete QA namespaces first.");
    for (const key of alreadyExists) {
      const ns = existing.find((n) => n.key === key)!;
      console.log(`  ${key}: ${ns.itemCount} items`);
    }
    return;
  }

  const summary: { namespace: string; items: string[] }[] = [];

  // -------------------------------------------------------------------------
  // QATEST — Main test namespace with diverse data
  // -------------------------------------------------------------------------
  console.log("\nCreating QATEST namespace...");
  await adapter.createNamespace("QATEST", "QA Test Suite", "Comprehensive test data for manual QA validation");
  const qatestItems: string[] = [];

  // 1. Backlog feature — rich markdown body
  const id1 = await adapter.createItem("QATEST", {
    title: "Design user onboarding flow",
    status: "backlog",
    priority: "medium",
    type: "feature",
    project: "product-v2",
    body: "## Overview\n\nDesign a new user onboarding experience.\n\n## Requirements\n\n- Welcome screen with app overview\n- Step-by-step configuration wizard\n- Progress indicator\n- Skip option for advanced users\n\n## Acceptance Criteria\n\n- [ ] Welcome screen displays on first login\n- [ ] Wizard completes in under 5 minutes\n- [ ] All steps are skippable",
  });
  qatestItems.push(id1);

  // 2. Todo bug — high priority, assigned
  const id2 = await adapter.createItem("QATEST", {
    title: "Fix login timeout on slow connections",
    status: "todo",
    priority: "high",
    type: "bug",
    assignee: "alice",
    body: "Users on slow connections (>500ms latency) experience timeouts during login.\n\n### Steps to Reproduce\n\n1. Throttle network to 3G\n2. Navigate to login page\n3. Enter credentials and submit\n4. Observe timeout error after 5 seconds\n\n### Expected\n\nLogin should succeed within 30 seconds.",
  });
  qatestItems.push(id2);

  // 3. In-progress feature — activity log with multiple authors
  const id3 = await adapter.createItem("QATEST", {
    title: "Implement search API endpoint",
    status: "in_progress",
    priority: "high",
    type: "feature",
    project: "api-v3",
    assignee: "bob",
    body: "Add full-text search across work items.\n\n```\nGET /api/search?q=<query>&namespace=<optional>\n```\n\nReturns matching items ranked by relevance.",
  });
  await adapter.addComment(id3, "bob", "Started working on the search index. Using SQLite FTS5.");
  await adapter.addComment(id3, "alice", "Make sure to handle special characters in search queries.");
  await adapter.addComment(id3, "bob", "Good point — added escaping for quotes and backslashes.");
  qatestItems.push(id3);

  // 4. In-review chore — low priority
  const id4 = await adapter.createItem("QATEST", {
    title: "Upgrade TypeScript to 5.9",
    status: "in_review",
    priority: "low",
    type: "chore",
    assignee: "charlie",
    body: "Upgrade TypeScript from 5.7 to 5.9 for improved type inference and performance.",
  });
  await adapter.addComment(id4, "charlie", "PR ready for review. All tests pass.");
  qatestItems.push(id4);

  // 5. Done feature — completed with activity
  const id5 = await adapter.createItem("QATEST", {
    title: "Add namespace creation API",
    status: "done",
    priority: "high",
    type: "feature",
    project: "api-v3",
    assignee: "dave",
    body: "Implemented `POST /api/namespaces` endpoint for creating new namespaces.",
  });
  await adapter.addComment(id5, "dave", "Implementation complete. Added validation for namespace key format.");
  await adapter.addComment(id5, "alice", "LGTM — merging.");
  qatestItems.push(id5);

  // 6. Cancelled spike
  const id6 = await adapter.createItem("QATEST", {
    title: "Evaluate GraphQL for API layer",
    status: "cancelled",
    priority: "low",
    type: "spike",
    body: "Investigate whether GraphQL would be a better fit than REST.\n\n**Conclusion:** Cancelled — REST is simpler and sufficient for our use case.",
  });
  await adapter.addComment(id6, "dave", "After research, decided REST is the right choice. Cancelling this spike.");
  qatestItems.push(id6);

  // 7. Urgent bug — in progress
  const id7 = await adapter.createItem("QATEST", {
    title: "Data loss on concurrent writes",
    status: "in_progress",
    priority: "urgent",
    type: "bug",
    assignee: "dave",
    body: "Two concurrent MCP sessions writing to the same item can cause data loss.\n\n### Root Cause\n\nThe filesystem adapter reads, modifies, and writes without locking.\n\n### Fix\n\nMigrate to SQLite with WAL mode for proper write serialization.",
  });
  qatestItems.push(id7);

  // 8. Feature with multiple artifacts
  const id8 = await adapter.createItem("QATEST", {
    title: "Server adapter: HTTP API + SQLite",
    status: "in_progress",
    priority: "high",
    type: "feature",
    project: "server-adapter",
    assignee: "dave",
    body: "# Server Adapter\n\nBuild a remote WCP server backed by SQLite with a REST API.\n\n## Key Components\n\n- SQLite database with WAL mode\n- Hono-based REST API\n- HTTP adapter for MCP server\n- Read-only web dashboard\n\n## Architecture\n\n```\nClaude Code → MCP (HttpAdapter) → HTTP → Server (SqliteAdapter) → SQLite\n```",
  });
  await adapter.attachArtifact(id8, {
    type: "prd",
    title: "PRD: Server Adapter",
    filename: "prd.md",
    content: "# PRD: WCP Server Adapter\n\n## Goals\n\n- Eliminate cross-machine sync friction\n- Provide real-time visibility via web dashboard\n- Maintain backwards compatibility\n\n## Requirements\n\n- All 12 WcpAdapter methods as HTTP endpoints\n- SQLite with WAL mode\n- Bearer token authentication",
  });
  await adapter.attachArtifact(id8, {
    type: "architecture",
    title: "Architecture Proposal",
    filename: "architecture.md",
    content: "# Architecture\n\n## Data Model\n\n5 SQLite tables: meta, namespaces, namespace_schema_extensions, items, artifacts\n\n## API Design\n\n13 REST endpoints mapping to 12 WcpAdapter methods + SSE events.",
  });
  await adapter.attachArtifact(id8, {
    type: "adr",
    title: "ADR-1: Hono Framework",
    filename: "adr-1.md",
    content: "# ADR-1: Hono as Server Framework\n\n**Status:** Accepted\n\n## Decision\n\nUse Hono for the REST API server.\n\n## Rationale\n\n- Minimal footprint (~14kb)\n- TypeScript-first\n- Web Standards API compatible",
  });
  await adapter.addComment(id8, "pipeline/architecture", "Architecture proposal attached and approved.");
  await adapter.addComment(id8, "dave", "Starting implementation. M1 (monorepo restructure) complete.");
  qatestItems.push(id8);

  // 9. Item with extensive activity log — pagination testing (25 comments)
  const id9 = await adapter.createItem("QATEST", {
    title: "Long-running project with extensive history",
    status: "in_progress",
    priority: "medium",
    type: "feature",
    project: "activity-test",
    body: "This item has a long activity log for testing pagination in the web UI.",
  });
  const authors = ["alice", "bob", "charlie"];
  for (let i = 1; i <= 25; i++) {
    const author = authors[i % 3];
    const detail = i % 5 === 0
      ? "Major checkpoint reached — all tests passing."
      : "Incremental progress, moving to next task.";
    await adapter.addComment(id9, author, `Progress update #${i}: Completed step ${i} of 25. ${detail}`);
  }
  qatestItems.push(id9);

  // 10. Child item — parent is item 8
  const id10 = await adapter.createItem("QATEST", {
    title: "Implement SQLite schema initialization",
    status: "done",
    priority: "medium",
    type: "chore",
    parent: id8,
    assignee: "dave",
    body: "Create the `db.ts` module that initializes SQLite with WAL mode, creates the v1 schema (5 tables), and implements the forward-only migration runner.",
  });
  await adapter.addComment(id10, "dave", "Schema initialization complete. 5 tables + 7 indexes created.");
  qatestItems.push(id10);

  // 11. Minimal item — no optional fields
  const id11 = await adapter.createItem("QATEST", {
    title: "Minimal backlog item",
    body: "This item has only required fields — no priority, type, project, or assignee.",
  });
  qatestItems.push(id11);

  // 12. Item with markdown tables and code blocks
  const id12 = await adapter.createItem("QATEST", {
    title: "Document API endpoints",
    status: "todo",
    priority: "medium",
    type: "chore",
    body: "## API Documentation\n\nDocument all REST endpoints:\n\n| Method | Path | Purpose |\n|--------|------|--------|\n| GET | /api/namespaces | List namespaces |\n| POST | /api/namespaces | Create namespace |\n| GET | /api/items/:id | Get item detail |\n| PATCH | /api/items/:id | Update item |\n\n### Example Request\n\n```json\n{\n  \"title\": \"New item\",\n  \"status\": \"backlog\",\n  \"priority\": \"medium\"\n}\n```\n\n### Example Response\n\n```json\n{\n  \"id\": \"WCP-20\"\n}\n```",
  });
  qatestItems.push(id12);

  summary.push({ namespace: "QATEST", items: qatestItems });

  // -------------------------------------------------------------------------
  // QAEMPTY — Intentionally empty (tests empty state UI)
  // -------------------------------------------------------------------------
  console.log("Creating QAEMPTY namespace...");
  await adapter.createNamespace("QAEMPTY", "QA Empty Namespace", "Intentionally empty — tests empty state UI rendering");
  summary.push({ namespace: "QAEMPTY", items: [] });

  // -------------------------------------------------------------------------
  // QAEXT — Schema extensions (custom statuses + artifact types)
  // -------------------------------------------------------------------------
  console.log("Creating QAEXT namespace...");
  await adapter.createNamespace("QAEXT", "QA Schema Extensions", "Tests custom statuses and artifact types");

  await adapter.updateSchema("QAEXT", {
    addStatuses: ["deployed", "blocked"],
    addArtifactTypes: ["changelog", "runbook"],
  });

  const qaextItems: string[] = [];

  // Item with custom "deployed" status
  const ext1 = await adapter.createItem("QAEXT", {
    title: "Feature deployed to production",
    status: "deployed",
    priority: "high",
    type: "feature",
    body: "This item uses a custom 'deployed' status extension.",
  });
  qaextItems.push(ext1);

  // Item with "blocked" status
  const ext2 = await adapter.createItem("QAEXT", {
    title: "Blocked by external dependency",
    status: "blocked",
    priority: "medium",
    type: "chore",
    body: "Waiting on a third-party API update. Using custom 'blocked' status.",
  });
  await adapter.addComment(ext2, "alice", "Blocked — upstream API v3 not released yet.");
  qaextItems.push(ext2);

  // Item with custom artifact types
  const ext3 = await adapter.createItem("QAEXT", {
    title: "Release v2.1.0",
    status: "done",
    priority: "medium",
    type: "chore",
    body: "Release changelog and runbook for v2.1.0.",
  });
  await adapter.attachArtifact(ext3, {
    type: "changelog",
    title: "v2.1.0 Changelog",
    filename: "changelog.md",
    content: "# v2.1.0 Changelog\n\n## Features\n- Server adapter with SQLite backend\n- HTTP adapter for remote access\n- Live web dashboard with SSE\n\n## Bug Fixes\n- Fixed concurrent write data loss",
  });
  await adapter.attachArtifact(ext3, {
    type: "runbook",
    title: "v2.1.0 Deployment Runbook",
    filename: "runbook.md",
    content: "# Deployment Runbook\n\n1. Build Docker image: `docker build -t wcp-server .`\n2. Push to registry\n3. Deploy to VPS\n4. Run migration script\n5. Verify health endpoint",
  });
  qaextItems.push(ext3);

  // Standard item (uses default statuses in extended namespace)
  const ext4 = await adapter.createItem("QAEXT", {
    title: "Standard item in extended namespace",
    status: "in_progress",
    priority: "low",
    type: "spike",
    body: "This item uses a standard status in a namespace with schema extensions — verifying defaults still work.",
  });
  qaextItems.push(ext4);

  summary.push({ namespace: "QAEXT", items: qaextItems });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n=== QA Seed Complete ===\n");
  console.log("Namespaces created:");
  for (const { namespace, items } of summary) {
    console.log(`  ${namespace}: ${items.length} items`);
    for (const id of items) {
      console.log(`    ${id}`);
    }
  }

  const totalItems = summary.reduce((sum, s) => sum + s.items.length, 0);
  console.log(`\nTotal: ${summary.length} namespaces, ${totalItems} items`);

  console.log("\nKey callsigns for QA scenarios:");
  console.log(`  All statuses:        ${qatestItems.slice(0, 7).join(", ")}`);
  console.log(`  Activity pagination: ${qatestItems[8]} (25 comments)`);
  console.log(`  Multiple artifacts:  ${qatestItems[7]} (3 artifacts: prd, architecture, adr)`);
  console.log(`  Parent/child:        ${qatestItems[9]} → parent ${qatestItems[7]}`);
  console.log(`  Minimal item:        ${qatestItems[10]} (no optional fields)`);
  console.log(`  Markdown tables:     ${qatestItems[11]}`);
  console.log(`  Schema extensions:   ${qaextItems[0]} (deployed), ${qaextItems[1]} (blocked)`);
  console.log(`  Custom artifacts:    ${qaextItems[2]} (changelog + runbook)`);
  console.log(`  Empty namespace:     QAEMPTY (0 items)`);
}

seedQA().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
