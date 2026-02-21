import * as path from "path";
import { FilesystemAdapter } from "./adapters/filesystem.js";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(process.env.HOME || "~", "projects", "wcp-data");

async function adapterExpansionTest() {
  console.log(`\n=== WCP Adapter Expansion Tests (WCP-19 M1) ===`);
  console.log(`Data path: ${DATA_PATH}\n`);

  const adapter = new FilesystemAdapter(DATA_PATH);
  // Cast to access the 3 new methods that don't exist on the interface yet.
  // Tests will fail at runtime with "is not a function" — expected TDD behavior.
  const expanded = adapter as any;
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

  // ── 1. API-001: createNamespace() — happy path ────────────────────────
  console.log("\n1. API-001: createNamespace — happy path");

  const ns = await expanded.createNamespace(
    "EXPTEST",
    "Expansion Test",
    "Test namespace for adapter expansion",
  );
  check("createNamespace returns object", ns !== undefined && ns !== null);
  check("returned key matches", ns?.key === "EXPTEST");
  check("returned name matches", ns?.name === "Expansion Test");
  check(
    "returned description matches",
    ns?.description === "Test namespace for adapter expansion",
  );
  check("itemCount starts at 0", ns?.itemCount === 0);

  // Verify it appears in listNamespaces
  const namespaces = await adapter.listNamespaces();
  check(
    "new namespace appears in listNamespaces",
    namespaces.some((n) => n.key === "EXPTEST"),
  );

  // ── 2. createNamespace() — error cases ────────────────────────────────
  console.log("\n2. createNamespace — error cases");

  try {
    await expanded.createNamespace("EXPTEST", "Duplicate", "Should fail");
    check("duplicate key rejected", false, "should have thrown");
  } catch (e: any) {
    check("duplicate key rejected", e.code === "VALIDATION_ERROR");
  }

  try {
    await expanded.createNamespace("lowercase", "Bad Key", "Invalid");
    check("lowercase key rejected", false, "should have thrown");
  } catch (e: any) {
    check("lowercase key rejected", e.code === "VALIDATION_ERROR");
  }

  try {
    await expanded.createNamespace("123BAD", "Bad Key", "Starts with number");
    check("numeric-start key rejected", false, "should have thrown");
  } catch (e: any) {
    check("numeric-start key rejected", e.code === "VALIDATION_ERROR");
  }

  // ── 3. API-001: getSchema() — global defaults ────────────────────────
  console.log("\n3. API-001: getSchema — global defaults");

  const globalSchema = await expanded.getSchema();
  check("getSchema returns schema object", globalSchema !== undefined);
  check("has status field", globalSchema?.status !== undefined);
  check("has priority field", globalSchema?.priority !== undefined);
  check("has type field", globalSchema?.type !== undefined);
  check("has artifact_type field", globalSchema?.artifact_type !== undefined);
  check(
    "status defaults include backlog",
    globalSchema?.status?.defaults?.includes("backlog"),
  );
  check(
    "status defaults include done",
    globalSchema?.status?.defaults?.includes("done"),
  );
  check(
    "status extensions empty for global",
    globalSchema?.status?.extensions?.length === 0,
  );
  check(
    "status all equals defaults when no extensions",
    globalSchema?.status?.all?.length === globalSchema?.status?.defaults?.length,
  );
  check(
    "priority includes high",
    globalSchema?.priority?.values?.includes("high"),
  );
  check(
    "type includes feature",
    globalSchema?.type?.values?.includes("feature"),
  );
  check(
    "artifact_type defaults include prd",
    globalSchema?.artifact_type?.defaults?.includes("prd"),
  );

  // ── 4. getSchema(namespace) — with namespace ─────────────────────────
  console.log("\n4. getSchema — with namespace");

  const nsSchema = await expanded.getSchema("EXPTEST");
  check("getSchema(ns) returns schema", nsSchema !== undefined);
  check(
    "namespace schema has default statuses",
    nsSchema?.status?.defaults?.includes("backlog"),
  );
  check(
    "namespace extensions initially empty",
    nsSchema?.status?.extensions?.length === 0,
  );

  // ── 5. API-001: updateSchema() — add extensions ──────────────────────
  console.log("\n5. API-001: updateSchema — add extensions");

  const addResult = await expanded.updateSchema("EXPTEST", {
    addStatuses: ["deployed", "staging"],
    addArtifactTypes: ["release-notes"],
  });
  check("updateSchema returns result", addResult !== undefined);
  check(
    "result schema includes deployed",
    addResult?.schema?.status?.all?.includes("deployed"),
  );
  check(
    "result schema includes staging",
    addResult?.schema?.status?.all?.includes("staging"),
  );
  check(
    "result schema includes release-notes",
    addResult?.schema?.artifact_type?.all?.includes("release-notes"),
  );

  // Verify persistence via getSchema
  const afterAdd = await expanded.getSchema("EXPTEST");
  check(
    "persisted: deployed in extensions",
    afterAdd?.status?.extensions?.includes("deployed"),
  );
  check(
    "persisted: staging in extensions",
    afterAdd?.status?.extensions?.includes("staging"),
  );
  check(
    "persisted: release-notes in artifact extensions",
    afterAdd?.artifact_type?.extensions?.includes("release-notes"),
  );

  // ── 6. updateSchema() — idempotent add ────────────────────────────────
  console.log("\n6. updateSchema — idempotent add");

  const idempotentResult = await expanded.updateSchema("EXPTEST", {
    addStatuses: ["deployed"],
  });
  const deployedCount =
    idempotentResult?.schema?.status?.extensions?.filter(
      (s: string) => s === "deployed",
    )?.length ?? 0;
  check("idempotent: no duplicate deployed", deployedCount === 1);

  // ── 7. updateSchema() — skip defaults ─────────────────────────────────
  console.log("\n7. updateSchema — skip defaults");

  const skipResult = await expanded.updateSchema("EXPTEST", {
    addStatuses: ["backlog"],
  });
  check(
    "default status not added to extensions",
    !skipResult?.schema?.status?.extensions?.includes("backlog"),
  );

  // ── 8. updateSchema() — remove extensions ─────────────────────────────
  console.log("\n8. updateSchema — remove extensions");

  const removeResult = await expanded.updateSchema("EXPTEST", {
    removeStatuses: ["staging"],
    removeArtifactTypes: ["release-notes"],
  });
  check(
    "staging removed",
    !removeResult?.schema?.status?.all?.includes("staging"),
  );
  check(
    "deployed still present",
    removeResult?.schema?.status?.all?.includes("deployed"),
  );
  check(
    "release-notes removed",
    !removeResult?.schema?.artifact_type?.all?.includes("release-notes"),
  );

  // ── 9. updateSchema() — cannot remove defaults ────────────────────────
  console.log("\n9. updateSchema — cannot remove defaults");

  try {
    await expanded.updateSchema("EXPTEST", { removeStatuses: ["done"] });
    check("cannot remove default status", false, "should have thrown");
  } catch (e: any) {
    check("cannot remove default status", e.code === "VALIDATION_ERROR");
  }

  try {
    await expanded.updateSchema("EXPTEST", {
      removeArtifactTypes: ["prd"],
    });
    check("cannot remove default artifact type", false, "should have thrown");
  } catch (e: any) {
    check("cannot remove default artifact type", e.code === "VALIDATION_ERROR");
  }

  // ── 10. updateSchema/getSchema — namespace error cases ────────────────
  console.log("\n10. updateSchema/getSchema — namespace errors");

  try {
    await expanded.updateSchema("NOPE", { addStatuses: ["test"] });
    check(
      "updateSchema: non-existent namespace",
      false,
      "should have thrown",
    );
  } catch (e: any) {
    check(
      "updateSchema: non-existent namespace",
      e.code === "NAMESPACE_NOT_FOUND" || e.code === "VALIDATION_ERROR",
    );
  }

  try {
    await expanded.getSchema("NOPE");
    check("getSchema: non-existent namespace", false, "should have thrown");
  } catch (e: any) {
    check(
      "getSchema: non-existent namespace",
      e.code === "NAMESPACE_NOT_FOUND" || e.code === "VALIDATION_ERROR",
    );
  }

  // ── 11. Integration: create item in new namespace ─────────────────────
  console.log("\n11. Integration: create item in new namespace");

  const itemId = await adapter.createItem("EXPTEST", {
    title: "Test item in new namespace",
  });
  check("create item succeeds", /^EXPTEST-\d+$/.test(itemId));

  const item = await adapter.getItem(itemId);
  check("item retrievable", item.title === "Test item in new namespace");

  // ── 12. Integration: custom status validation ─────────────────────────
  console.log("\n12. Integration: custom status validation");

  // "deployed" was added via updateSchema above
  await adapter.updateItem(itemId, { status: "deployed" });
  const deployedItem = await adapter.getItem(itemId);
  check("custom status accepted", deployedItem.status === "deployed");

  // ── 13. Cleanup ───────────────────────────────────────────────────────
  console.log("\n13. Cleanup");
  await expanded.updateSchema("EXPTEST", { removeStatuses: ["deployed"] });
  const cleanedSchema = await expanded.getSchema("EXPTEST");
  check(
    "cleanup: extensions removed",
    cleanedSchema?.status?.extensions?.length === 0,
  );

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

adapterExpansionTest().catch((err) => {
  console.error("Adapter expansion test crashed:", err);
  process.exit(1);
});
