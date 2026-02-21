/**
 * WCP HTTP Adapter Tests (WCP-19 M3)
 *
 * Tests the HttpAdapter class that implements WcpAdapter over HTTP.
 * Also tests adapter selection logic (CFG-002, CFG-003) and error mapping (HTTP-005).
 *
 * This test will fail on import because HttpAdapter doesn't exist yet — expected TDD behavior.
 * When the implementation exists, it expects the WCP server running at SERVER_URL.
 */

import * as path from "path";
// This import will fail with MODULE_NOT_FOUND — expected TDD failure.
// HttpAdapter is created in M3: packages/mcp/src/adapters/http.ts
import { HttpAdapter } from "./adapters/http.js";

const SERVER_URL =
  process.env.WCP_SERVER_URL || "http://localhost:3000";
const API_KEY = process.env.WCP_API_KEY;

async function httpAdapterTest() {
  console.log(`\n=== WCP HTTP Adapter Tests (WCP-19 M3) ===`);
  console.log(`Server URL: ${SERVER_URL}\n`);

  let pass = 0;
  let fail = 0;

  function check(label: string, ok: boolean, detail?: string) {
    if (ok) {
      console.log(`  PASS  ${label}`);
      pass++;
    } else {
      console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
      fail++;
    }
  }

  // ── 1. HTTP-001: HttpAdapter constructor ──────────────────────────────
  console.log("\n1. HTTP-001: HttpAdapter constructor");

  const adapter = new HttpAdapter(SERVER_URL, API_KEY);
  check("HttpAdapter instantiates", adapter !== undefined);

  // ── 2. HTTP-001: listNamespaces ───────────────────────────────────────
  console.log("\n2. HTTP-001: listNamespaces");

  const namespaces = await adapter.listNamespaces();
  check("listNamespaces returns array", Array.isArray(namespaces));
  check(
    "namespace objects have expected shape",
    namespaces.length === 0 ||
      (typeof namespaces[0].key === "string" &&
        typeof namespaces[0].name === "string"),
  );

  // ── 3. HTTP-001: createNamespace ──────────────────────────────────────
  console.log("\n3. HTTP-001: createNamespace");

  const ns = await adapter.createNamespace(
    "HTTPTEST",
    "HTTP Adapter Test",
    "Test namespace for HTTP adapter tests",
  );
  check("createNamespace returns namespace", ns?.key === "HTTPTEST");
  check("namespace has correct name", ns?.name === "HTTP Adapter Test");

  // ── 4. HTTP-001: createItem ───────────────────────────────────────────
  console.log("\n4. HTTP-001: createItem");

  const itemId = await adapter.createItem("HTTPTEST", {
    title: "HTTP adapter test item",
    type: "chore",
    body: "Created via HTTP adapter.",
  });
  check("createItem returns callsign", /^HTTPTEST-\d+$/.test(itemId));

  // ── 5. HTTP-001: listItems ────────────────────────────────────────────
  console.log("\n5. HTTP-001: listItems");

  const items = await adapter.listItems("HTTPTEST");
  check("listItems returns array", Array.isArray(items));
  check(
    "created item in list",
    items.some((i: any) => i.id === itemId),
  );

  // With filters
  const filtered = await adapter.listItems("HTTPTEST", { status: "backlog" });
  check(
    "filter works through HTTP adapter",
    filtered.every((i: any) => i.status === "backlog"),
  );

  // ── 6. HTTP-001: getItem ──────────────────────────────────────────────
  console.log("\n6. HTTP-001: getItem");

  const item = await adapter.getItem(itemId);
  check("getItem returns item", item.id === itemId);
  check("title matches", item.title === "HTTP adapter test item");
  check("body preserved", item.body === "Created via HTTP adapter.");
  check("has artifacts array", Array.isArray(item.artifacts));
  check("has activity string", typeof item.activity === "string");

  // ── 7. HTTP-001: updateItem ───────────────────────────────────────────
  console.log("\n7. HTTP-001: updateItem");

  await adapter.updateItem(itemId, {
    status: "in_progress",
    assignee: "http-test",
  });
  const updated = await adapter.getItem(itemId);
  check("status updated via adapter", updated.status === "in_progress");
  check("assignee set via adapter", updated.assignee === "http-test");

  // ── 8. HTTP-001: addComment ───────────────────────────────────────────
  console.log("\n8. HTTP-001: addComment");

  await adapter.addComment(itemId, "http-test", "Comment via HTTP adapter.");
  const commented = await adapter.getItem(itemId);
  check(
    "comment in activity",
    commented.activity.includes("Comment via HTTP adapter."),
  );

  // ── 9. HTTP-001: attachArtifact ───────────────────────────────────────
  console.log("\n9. HTTP-001: attachArtifact");

  const artifact = await adapter.attachArtifact(itemId, {
    type: "prd",
    title: "HTTP Test PRD",
    filename: "prd.md",
    content: "# HTTP Test PRD\n\nContent.",
  });
  check("attachArtifact returns metadata", artifact.type === "prd");
  check(
    "artifact URL correct",
    artifact.url.includes(`${itemId}/prd.md`),
  );

  // ── 10. HTTP-001: getArtifact ─────────────────────────────────────────
  console.log("\n10. HTTP-001: getArtifact");

  const retrieved = await adapter.getArtifact(itemId, "prd.md");
  check(
    "getArtifact returns content",
    retrieved.content.includes("HTTP Test PRD"),
  );
  check("artifact metadata returned", retrieved.artifact.type === "prd");

  // ── 11. HTTP-001: approveArtifact ─────────────────────────────────────
  console.log("\n11. HTTP-001: approveArtifact");

  await adapter.approveArtifact(itemId, {
    filename: "prd.md",
    verdict: "approved",
  });
  const approvedArt = await adapter.getArtifact(itemId, "prd.md");
  check(
    "approval set in artifact content",
    approvedArt.content.includes("approved"),
  );

  // ── 12. HTTP-001: getSchema ───────────────────────────────────────────
  console.log("\n12. HTTP-001: getSchema");

  const globalSchema = await adapter.getSchema();
  check("getSchema returns schema", globalSchema !== undefined);
  check(
    "global schema has status defaults",
    globalSchema.status?.defaults?.includes("backlog"),
  );

  const nsSchema = await adapter.getSchema("HTTPTEST");
  check(
    "namespace schema has defaults",
    nsSchema.status?.defaults?.includes("backlog"),
  );

  // ── 13. HTTP-001: updateSchema ────────────────────────────────────────
  console.log("\n13. HTTP-001: updateSchema");

  const schemaResult = await adapter.updateSchema("HTTPTEST", {
    addStatuses: ["deployed"],
  });
  check(
    "updateSchema returns result",
    schemaResult?.schema?.status?.all?.includes("deployed"),
  );

  // Cleanup
  await adapter.updateSchema("HTTPTEST", {
    removeStatuses: ["deployed"],
  });

  // ── 14. HTTP-004: Server unreachable error ────────────────────────────
  console.log("\n14. HTTP-004: Server unreachable");

  const badAdapter = new HttpAdapter("http://localhost:99999", API_KEY);
  try {
    await badAdapter.listNamespaces();
    check("HTTP-004: unreachable server throws", false, "should have thrown");
  } catch (e: any) {
    check("HTTP-004: unreachable server throws", true);
    check(
      "HTTP-004: error message includes server URL",
      e.message?.includes("localhost:99999") ||
        e.message?.includes("unreachable") ||
        e.message?.includes("ECONNREFUSED"),
    );
  }

  // ── 15. HTTP-005: Error mapping ───────────────────────────────────────
  console.log("\n15. HTTP-005: Error mapping");

  // NOT_FOUND → NotFoundError
  try {
    await adapter.getItem("HTTPTEST-9999");
    check("HTTP-005: NOT_FOUND mapped", false, "should have thrown");
  } catch (e: any) {
    check("HTTP-005: NOT_FOUND mapped", e.code === "NOT_FOUND");
  }

  // NAMESPACE_NOT_FOUND → NamespaceNotFoundError
  try {
    await adapter.listItems("NOPE");
    check(
      "HTTP-005: NAMESPACE_NOT_FOUND mapped",
      false,
      "should have thrown",
    );
  } catch (e: any) {
    check(
      "HTTP-005: NAMESPACE_NOT_FOUND mapped",
      e.code === "NAMESPACE_NOT_FOUND",
    );
  }

  // VALIDATION_ERROR → ValidationError
  try {
    await adapter.updateItem(itemId, { status: "bogus" as any });
    check(
      "HTTP-005: VALIDATION_ERROR mapped",
      false,
      "should have thrown",
    );
  } catch (e: any) {
    check(
      "HTTP-005: VALIDATION_ERROR mapped",
      e.code === "VALIDATION_ERROR",
    );
  }

  // ── 16. HTTP-003: Stateless pass-through ──────────────────────────────
  console.log("\n16. HTTP-003: Stateless pass-through");

  // Create a second adapter instance pointing to the same server.
  // Both should see the same data (no local caching).
  const adapter2 = new HttpAdapter(SERVER_URL, API_KEY);
  const item2 = await adapter2.getItem(itemId);
  check(
    "HTTP-003: second adapter sees same data",
    item2.title === "HTTP adapter test item",
  );

  // Mutate via first adapter, read via second
  await adapter.addComment(itemId, "stateless-test", "Cross-adapter comment.");
  const crossRead = await adapter2.getItem(itemId);
  check(
    "HTTP-003: mutation visible from other adapter instance",
    crossRead.activity.includes("Cross-adapter comment."),
  );

  // ── 17. CFG-003: Missing WCP_SERVER_URL ───────────────────────────────
  console.log("\n17. CFG-003: Missing WCP_SERVER_URL");

  // This tests the adapter selection logic.
  // When WCP_ADAPTER=http but WCP_SERVER_URL is not set, it should throw at startup.
  // We simulate this by trying to construct an HttpAdapter with an empty URL.
  try {
    const emptyAdapter = new HttpAdapter("", API_KEY);
    // If constructor doesn't validate, the first request should fail
    await emptyAdapter.listNamespaces();
    check("CFG-003: empty URL produces error", false, "should have thrown");
  } catch (e: any) {
    check("CFG-003: empty URL produces error", true);
  }

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

httpAdapterTest().catch((err) => {
  console.error("HTTP adapter test crashed:", err);
  process.exit(1);
});
