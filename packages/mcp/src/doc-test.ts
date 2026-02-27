import * as path from "path";
import { FilesystemAdapter } from "./adapters/filesystem.js";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(process.env.HOME || "~", "projects", "wcp-data");

async function docTest() {
  console.log(`\n=== WCP Document Test ===`);
  console.log(`Data path: ${DATA_PATH}\n`);

  const adapter = new FilesystemAdapter(DATA_PATH);
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

  // 1. Create document with auto-generated slug
  console.log("\n1. wcp_doc_create — auto-generated slug");
  const doc1 = await adapter.createDocument("TEST", {
    title: "Architecture Overview",
    body: "This describes the system architecture.",
    type: "adr",
  });
  check("returns document", !!doc1);
  check("slug auto-generated", doc1.slug === "architecture-overview");
  check("title preserved", doc1.title === "Architecture Overview");
  check("body preserved", doc1.body === "This describes the system architecture.");
  check("type set", doc1.type === "adr");
  check("has created date", !!doc1.created);
  check("has updated date", !!doc1.updated);

  // 2. Create document with custom slug
  console.log("\n2. wcp_doc_create — custom slug");
  const doc2 = await adapter.createDocument("TEST", {
    title: "Project Roadmap",
    slug: "roadmap",
    body: "## Q1 Goals\n\n- Ship MVP",
  });
  check("custom slug used", doc2.slug === "roadmap");
  check("title preserved", doc2.title === "Project Roadmap");

  // 3. Create document with parent
  console.log("\n3. wcp_doc_create — with parent");
  const parentId = await adapter.createItem("TEST", {
    title: "Doc test parent item",
    type: "feature",
  });
  const doc3 = await adapter.createDocument("TEST", {
    title: "Meeting Notes",
    body: "Discussed requirements.",
    parent: parentId,
    type: "meeting-notes",
  });
  check("parent set", doc3.parent === parentId);

  // 4. Get document
  console.log("\n4. wcp_doc_get");
  const retrieved = await adapter.getDocument("TEST/roadmap");
  check("retrieves by ref", retrieved.slug === "roadmap");
  check("title matches", retrieved.title === "Project Roadmap");
  check("body matches", retrieved.body === "## Q1 Goals\n\n- Ship MVP");

  // 5. List documents
  console.log("\n5. wcp_doc_list");
  const allDocs = await adapter.listDocuments("TEST");
  check("lists all documents", allDocs.length >= 3);
  check("includes roadmap", allDocs.some((d) => d.slug === "roadmap"));
  check("includes architecture-overview", allDocs.some((d) => d.slug === "architecture-overview"));

  // 6. List documents with parent filter
  console.log("\n6. wcp_doc_list — parent filter");
  const parentDocs = await adapter.listDocuments("TEST", { parent: parentId });
  check("filters by parent", parentDocs.length >= 1);
  check("filtered doc has correct parent", parentDocs.every((d) => d.parent === parentId));
  check("includes meeting-notes", parentDocs.some((d) => d.slug === "meeting-notes"));

  // Non-matching parent
  const noDocs = await adapter.listDocuments("TEST", { parent: "TEST-99999" });
  check("no match returns empty", noDocs.length === 0);

  // 7. Update document — body
  console.log("\n7. wcp_doc_update — body");
  await adapter.updateDocument("TEST/roadmap", { body: "## Q1 Goals\n\n- Ship MVP\n- Onboard 10 users" });
  const afterBodyUpdate = await adapter.getDocument("TEST/roadmap");
  check("body updated", afterBodyUpdate.body.includes("Onboard 10 users"));
  check("title unchanged", afterBodyUpdate.title === "Project Roadmap");

  // 8. Update document — title
  console.log("\n8. wcp_doc_update — title");
  await adapter.updateDocument("TEST/roadmap", { title: "Product Roadmap" });
  const afterTitleUpdate = await adapter.getDocument("TEST/roadmap");
  check("title updated", afterTitleUpdate.title === "Product Roadmap");
  check("body unchanged", afterTitleUpdate.body.includes("Onboard 10 users"));

  // 9. Rename document
  console.log("\n9. wcp_doc_rename");
  await adapter.renameDocument("TEST/architecture-overview", "arch");
  const afterRename = await adapter.getDocument("TEST/arch");
  check("renamed doc accessible", afterRename.title === "Architecture Overview");
  check("slug updated in frontmatter", afterRename.slug === "arch");

  // Old ref should 404
  try {
    await adapter.getDocument("TEST/architecture-overview");
    check("old ref returns not found", false, "should have thrown");
  } catch (e: any) {
    check("old ref returns not found", e.code === "NOT_FOUND");
  }

  // 10. Slug auto-generation edge cases
  console.log("\n10. Slug auto-generation edge cases");
  const specialDoc = await adapter.createDocument("TEST", {
    title: "  Hello, World! (v2.0) — Final  ",
  });
  check("special chars slugified", specialDoc.slug === "hello-world-v2-0-final");

  // 11. Error cases
  console.log("\n11. Error handling");

  // Duplicate slug
  try {
    await adapter.createDocument("TEST", { title: "Product Roadmap", slug: "roadmap" });
    check("duplicate slug error", false, "should have thrown");
  } catch (e: any) {
    check("duplicate slug error", e.code === "VALIDATION_ERROR");
  }

  // Non-existent namespace
  try {
    await adapter.createDocument("NOPE", { title: "test" });
    check("non-existent namespace error (create)", false, "should have thrown");
  } catch (e: any) {
    check("non-existent namespace error (create)", e.code === "NAMESPACE_NOT_FOUND");
  }

  try {
    await adapter.getDocument("NOPE/test");
    check("non-existent namespace error (get)", false, "should have thrown");
  } catch (e: any) {
    check("non-existent namespace error (get)", e.code === "NAMESPACE_NOT_FOUND");
  }

  try {
    await adapter.listDocuments("NOPE");
    check("non-existent namespace error (list)", false, "should have thrown");
  } catch (e: any) {
    check("non-existent namespace error (list)", e.code === "NAMESPACE_NOT_FOUND");
  }

  // Non-existent document
  try {
    await adapter.getDocument("TEST/does-not-exist");
    check("non-existent doc error", false, "should have thrown");
  } catch (e: any) {
    check("non-existent doc error", e.code === "NOT_FOUND");
  }

  try {
    await adapter.updateDocument("TEST/does-not-exist", { body: "nope" });
    check("update non-existent doc error", false, "should have thrown");
  } catch (e: any) {
    check("update non-existent doc error", e.code === "NOT_FOUND");
  }

  try {
    await adapter.renameDocument("TEST/does-not-exist", "new-slug");
    check("rename non-existent doc error", false, "should have thrown");
  } catch (e: any) {
    check("rename non-existent doc error", e.code === "NOT_FOUND");
  }

  // Invalid ref format
  try {
    await adapter.getDocument("badref");
    check("invalid ref format error", false, "should have thrown");
  } catch (e: any) {
    check("invalid ref format error", e.code === "VALIDATION_ERROR");
  }

  // Invalid slug on rename
  try {
    await adapter.renameDocument("TEST/roadmap", "INVALID SLUG!");
    check("invalid slug on rename error", false, "should have thrown");
  } catch (e: any) {
    check("invalid slug on rename error", e.code === "VALIDATION_ERROR");
  }

  // Rename to existing slug
  try {
    await adapter.renameDocument("TEST/roadmap", "arch");
    check("rename to existing slug error", false, "should have thrown");
  } catch (e: any) {
    check("rename to existing slug error", e.code === "VALIDATION_ERROR");
  }

  // 12. Create document with empty body
  console.log("\n12. Edge cases");
  const emptyDoc = await adapter.createDocument("TEST", {
    title: "Empty Document",
  });
  check("empty body creates doc", !!emptyDoc);
  const retrievedEmpty = await adapter.getDocument(`TEST/${emptyDoc.slug}`);
  check("empty body reads back empty", retrievedEmpty.body === "");

  // 13. Namespace doc count in listNamespaces
  console.log("\n13. Namespace docCount");
  const namespaces = await adapter.listNamespaces();
  const testNs = namespaces.find((n) => n.key === "TEST");
  check("namespace has docCount", testNs !== undefined && testNs.docCount >= 1);

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

docTest().catch((err) => {
  console.error("Doc test crashed:", err);
  process.exit(1);
});
