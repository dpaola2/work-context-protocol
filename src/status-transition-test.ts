import * as fs from "fs";
import * as path from "path";
import { FilesystemAdapter } from "./adapters/filesystem.js";
import { readConfig, writeConfig } from "./config.js";
import {
  addNamespaceStatuses,
  removeNamespaceStatuses,
} from "./schema.js";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(process.env.HOME || "~", "projects", "wcp-data");

async function statusTransitionTest() {
  console.log(`\n=== WCP Status Transition Auto-Log Tests (WCP-9) ===`);
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

  // ── LOG-001: Status change produces activity log entry ──────────────
  console.log("\n1. LOG-001: Status change produces activity entry");
  const id1 = await adapter.createItem("TEST", {
    title: "LOG-001 test",
    type: "chore",
  });
  await adapter.updateItem(id1, { status: "in_progress" });
  const item1 = await adapter.getItem(id1);
  check(
    "LOG-001: activity contains transition entry",
    item1.activity.includes("Status changed"),
  );

  // ── LOG-002: Entry includes system author, ISO timestamp, old/new ───
  console.log("\n2. LOG-002: Entry metadata");
  check(
    "LOG-002: entry has system author",
    item1.activity.includes("**system**"),
  );
  check(
    "LOG-002: entry has ISO 8601 timestamp",
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(item1.activity),
  );
  check(
    "LOG-002: entry references old status (backlog)",
    item1.activity.includes("backlog"),
  );
  check(
    "LOG-002: entry references new status (in_progress)",
    item1.activity.includes("in_progress"),
  );

  // ── LOG-003: Entry format matches spec ──────────────────────────────
  console.log("\n3. LOG-003: Entry format");
  check(
    "LOG-003: matches format 'Status changed: {old} → {new}'",
    item1.activity.includes("Status changed: backlog → in_progress"),
  );

  // ── LOG-004: Same-status update is a no-op ──────────────────────────
  console.log("\n4. LOG-004: Same-status no-op");
  const id4 = await adapter.createItem("TEST", {
    title: "LOG-004 test",
    type: "chore",
  });
  await adapter.updateItem(id4, { status: "in_progress" });
  await adapter.updateItem(id4, { status: "in_progress" }); // same status
  const item4 = await adapter.getItem(id4);
  const count4 = (item4.activity.match(/Status changed:/g) || []).length;
  check(
    "LOG-004: exactly one transition entry (same-status ignored)",
    count4 === 1,
  );

  // ── LOG-005: Entry at end of activity log, blank-line separated ─────
  console.log("\n5. LOG-005: Entry position and separation");
  const id5 = await adapter.createItem("TEST", {
    title: "LOG-005 test",
    type: "chore",
  });
  await adapter.addComment(id5, "test-user", "Existing comment before transition.");
  await adapter.updateItem(id5, { status: "in_progress" });
  const item5 = await adapter.getItem(id5);
  const commentIdx = item5.activity.indexOf("Existing comment before transition.");
  const transitionIdx = item5.activity.indexOf("Status changed:");
  check(
    "LOG-005: transition entry appears after existing comment",
    transitionIdx > commentIdx,
  );
  // The system entry should be separated by a blank line from the prior comment
  check(
    "LOG-005: blank-line separated from prior entry",
    item5.activity.includes("\n\n**system**"),
  );

  // ── LOG-006: Only status logged when multiple fields change ─────────
  console.log("\n6. LOG-006: Multi-field update");
  const id6 = await adapter.createItem("TEST", {
    title: "LOG-006 test",
    type: "chore",
  });
  await adapter.updateItem(id6, {
    status: "in_progress",
    priority: "high",
    assignee: "someone",
  });
  const item6 = await adapter.getItem(id6);
  check(
    "LOG-006: status transition is logged",
    item6.activity.includes("Status changed: backlog → in_progress"),
  );
  // Verify no other field changes are logged
  check(
    "LOG-006: no priority change entry",
    !item6.activity.includes("Priority changed"),
  );
  check(
    "LOG-006: no assignee change entry",
    !item6.activity.includes("Assignee changed"),
  );

  // ── LOG-007: Entry is part of updateItem() file write ───────────────
  // This is implicitly verified by LOG-001 — the entry appears in the
  // activity log immediately after updateItem() returns, before any
  // external addComment() call.
  console.log("\n7. LOG-007: Entry written as part of updateItem()");
  check(
    "LOG-007: entry visible immediately after updateItem (see LOG-001)",
    item1.activity.includes("Status changed: backlog → in_progress"),
  );

  // ── PARSE-001 & PARSE-002: Parseability ─────────────────────────────
  console.log("\n8. PARSE-001/002: Parseability");
  const parseMatch = item1.activity.match(/Status changed: (.+) → (.+)/);
  check(
    "PARSE-001: format is regex-parseable",
    parseMatch !== null,
  );
  check(
    "PARSE-001: old status extractable",
    parseMatch?.[1] === "backlog",
  );
  check(
    "PARSE-001: new status extractable",
    parseMatch?.[2] === "in_progress",
  );
  check(
    "PARSE-002: uses unicode arrow separator (U+2192)",
    item1.activity.includes(" → "),
  );

  // ── SCOPE-001: wcp_create does NOT produce transition entry ─────────
  console.log("\n9. SCOPE-001: Create does not log");
  const id9 = await adapter.createItem("TEST", {
    title: "SCOPE-001 test",
    status: "todo",
    type: "chore",
  });
  const item9a = await adapter.getItem(id9);
  check(
    "SCOPE-001: no transition entry after create",
    !item9a.activity.includes("Status changed"),
  );
  // Also verify that a subsequent update DOES produce exactly one entry
  await adapter.updateItem(id9, { status: "in_progress" });
  const item9b = await adapter.getItem(id9);
  const count9 = (item9b.activity.match(/Status changed:/g) || []).length;
  check(
    "SCOPE-001: only update produces entry, not create",
    count9 === 1,
  );

  // ── SCOPE-002: Non-status field changes don't generate entries ──────
  console.log("\n10. SCOPE-002: Non-status changes ignored");
  const id10 = await adapter.createItem("TEST", {
    title: "SCOPE-002 test",
    type: "chore",
  });
  // First, do a real status change
  await adapter.updateItem(id10, { status: "in_progress" });
  // Then change only non-status fields
  await adapter.updateItem(id10, { priority: "high" });
  await adapter.updateItem(id10, { assignee: "someone" });
  await adapter.updateItem(id10, { title: "Renamed item" });
  const item10 = await adapter.getItem(id10);
  const count10 = (item10.activity.match(/Status changed:/g) || []).length;
  check(
    "SCOPE-002: exactly one entry (non-status changes ignored)",
    count10 === 1,
  );

  // ── Edge case: Multiple rapid status changes ────────────────────────
  console.log("\n11. Edge: Multiple rapid status changes");
  const id11 = await adapter.createItem("TEST", {
    title: "Rapid changes test",
    type: "chore",
  });
  await adapter.updateItem(id11, { status: "todo" });
  await adapter.updateItem(id11, { status: "in_progress" });
  await adapter.updateItem(id11, { status: "in_review" });
  const item11 = await adapter.getItem(id11);
  const count11 = (item11.activity.match(/Status changed:/g) || []).length;
  check("Edge: three transitions produce three entries", count11 === 3);
  check(
    "Edge: first transition logged (backlog → todo)",
    item11.activity.includes("backlog → todo"),
  );
  check(
    "Edge: second transition logged (todo → in_progress)",
    item11.activity.includes("todo → in_progress"),
  );
  check(
    "Edge: third transition logged (in_progress → in_review)",
    item11.activity.includes("in_progress → in_review"),
  );

  // ── Edge case: Namespace-extended status values ─────────────────────
  console.log("\n12. Edge: Extended status values");
  const config = readConfig(DATA_PATH);
  addNamespaceStatuses(config, "TEST", ["stage_0_prd"]);
  writeConfig(DATA_PATH, config);
  try {
    const id12 = await adapter.createItem("TEST", {
      title: "Extended status test",
      type: "chore",
    });
    await adapter.updateItem(id12, { status: "stage_0_prd" });
    const item12 = await adapter.getItem(id12);
    check(
      "Edge: extended status logged normally",
      item12.activity.includes("backlog → stage_0_prd"),
    );
  } finally {
    // Cleanup: remove extension
    const cleanConfig = readConfig(DATA_PATH);
    removeNamespaceStatuses(cleanConfig, "TEST", ["stage_0_prd"]);
    writeConfig(DATA_PATH, cleanConfig);
  }

  // ── Edge case: Body-only update produces no transition entry ────────
  console.log("\n13. Edge: Body-only update");
  const id13 = await adapter.createItem("TEST", {
    title: "Body-only test",
    type: "chore",
  });
  await adapter.updateItem(id13, { status: "in_progress" }); // real change
  await adapter.updateItem(id13, { body: "Updated body content." }); // body only
  const item13 = await adapter.getItem(id13);
  const count13 = (item13.activity.match(/Status changed:/g) || []).length;
  check(
    "Edge: body-only update does not produce transition entry",
    count13 === 1,
  );

  // ── Summary ─────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

statusTransitionTest().catch((err) => {
  console.error("Status transition test crashed:", err);
  process.exit(1);
});
