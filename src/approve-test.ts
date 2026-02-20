import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { FilesystemAdapter } from "./adapters/filesystem.js";
import type { ApproveArtifactInput } from "./adapter.js";
import { validateVerdict } from "./validation.js";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(process.env.HOME || "~", "projects", "wcp-data");

async function approveTest() {
  console.log(`\n=== WCP Approval Tool Tests (WCP-11 M1) ===`);
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

  // ── Setup: Create a test item with gate artifact ──────────────────────
  const testId = await adapter.createItem("TEST", {
    title: "APR test item",
    type: "feature",
    body: "Test item for approval testing.",
  });

  // Attach an architecture artifact with approval: pending in frontmatter
  const archContent = [
    "---",
    "pipeline_stage: 2",
    "pipeline_stage_name: architecture",
    `pipeline_project: "${testId}"`,
    'pipeline_completed_at: "2026-02-20T10:00:00-0500"',
    "approval: pending",
    "---",
    "",
    "# Architecture Proposal",
    "",
    "This is a test architecture proposal.",
  ].join("\n");

  await adapter.attachArtifact(testId, {
    type: "architecture",
    title: "Architecture Proposal",
    filename: "architecture-proposal.md",
    content: archContent,
  });

  // ── APR-001: wcp_approve accepts id, artifact, verdict ────────────────
  console.log("\n1. APR-001: wcp_approve tool parameters");

  // Verify the method exists and accepts the correct parameters
  const input: ApproveArtifactInput = {
    filename: "architecture-proposal.md",
    verdict: "approved",
  };
  await adapter.approveArtifact(testId, input);
  check("APR-001: approveArtifact accepts (id, { filename, verdict })", true);

  // ── APR-002: Approve sets approval + pipeline_approved_at ─────────────
  console.log("\n2. APR-002: Approve sets frontmatter fields");

  const { content: approvedContent } = await adapter.getArtifact(
    testId,
    "architecture-proposal.md",
  );
  const approvedFm = matter(approvedContent).data;
  check(
    "APR-002: approval field set to 'approved'",
    approvedFm.approval === "approved",
  );
  check(
    "APR-002: pipeline_approved_at is set",
    !!approvedFm.pipeline_approved_at,
  );
  // Verify it's a valid ISO timestamp
  check(
    "APR-002: pipeline_approved_at is valid ISO timestamp",
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(
      String(approvedFm.pipeline_approved_at),
    ),
  );
  // Verify existing frontmatter fields are preserved
  check(
    "APR-002: existing pipeline_stage preserved",
    approvedFm.pipeline_stage === 2,
  );
  check(
    "APR-002: existing pipeline_stage_name preserved",
    approvedFm.pipeline_stage_name === "architecture",
  );

  // ── APR-002: Reject sets approval, removes pipeline_approved_at ───────
  console.log("\n3. APR-002: Reject clears pipeline_approved_at");

  await adapter.approveArtifact(testId, {
    filename: "architecture-proposal.md",
    verdict: "rejected",
  });
  const { content: rejectedContent } = await adapter.getArtifact(
    testId,
    "architecture-proposal.md",
  );
  const rejectedFm = matter(rejectedContent).data;
  check(
    "APR-002: approval field set to 'rejected'",
    rejectedFm.approval === "rejected",
  );
  check(
    "APR-002: pipeline_approved_at removed on reject",
    rejectedFm.pipeline_approved_at === undefined,
  );

  // ── APR-003: Activity log entries ─────────────────────────────────────
  console.log("\n4. APR-003: Activity log entries");

  const afterVerdicts = await adapter.getItem(testId);
  // Should have two entries: one for approve, one for reject
  check(
    "APR-003: activity contains system author",
    afterVerdicts.activity.includes("**system**"),
  );
  check(
    "APR-003: activity contains artifact filename",
    afterVerdicts.activity.includes("architecture-proposal.md"),
  );
  // Check for the approve entry
  check(
    "APR-003: activity logs approved verdict",
    afterVerdicts.activity.includes("approved"),
  );
  // Check for the reject entry
  check(
    "APR-003: activity logs rejected verdict",
    afterVerdicts.activity.includes("rejected"),
  );
  // Verify the format: "Artifact {filename}: {verdict}"
  check(
    "APR-003: entry format matches 'Artifact {filename}: {verdict}'",
    afterVerdicts.activity.includes(
      "Artifact architecture-proposal.md: approved",
    ),
  );
  check(
    "APR-003: reject entry format matches",
    afterVerdicts.activity.includes(
      "Artifact architecture-proposal.md: rejected",
    ),
  );
  // Verify ISO timestamp in the entry
  check(
    "APR-003: entry has ISO 8601 timestamp",
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(afterVerdicts.activity),
  );

  // ── APR-004: Error — artifact does not exist ──────────────────────────
  console.log("\n5. APR-004: Error — missing artifact");

  try {
    await adapter.approveArtifact(testId, {
      filename: "nonexistent.md",
      verdict: "approved",
    });
    check("APR-004: NOT_FOUND for missing artifact", false, "should have thrown");
  } catch (e: any) {
    check("APR-004: NOT_FOUND for missing artifact", e.code === "NOT_FOUND");
  }

  // ── APR-004: Error — invalid verdict with suggestion ──────────────────
  console.log("\n6. APR-004: Error — invalid verdict");

  try {
    await adapter.approveArtifact(testId, {
      filename: "architecture-proposal.md",
      verdict: "approvd",
    });
    check(
      "APR-004: VALIDATION_ERROR for invalid verdict",
      false,
      "should have thrown",
    );
  } catch (e: any) {
    check(
      "APR-004: VALIDATION_ERROR for invalid verdict",
      e.code === "VALIDATION_ERROR",
    );
    check(
      "APR-004: error suggests 'approved' for typo 'approvd'",
      e.message.includes("approved"),
    );
  }

  // Completely wrong verdict value
  try {
    await adapter.approveArtifact(testId, {
      filename: "architecture-proposal.md",
      verdict: "maybe",
    });
    check(
      "APR-004: VALIDATION_ERROR for 'maybe'",
      false,
      "should have thrown",
    );
  } catch (e: any) {
    check(
      "APR-004: VALIDATION_ERROR for 'maybe'",
      e.code === "VALIDATION_ERROR",
    );
  }

  // ── APR-004: Error — invalid callsign ─────────────────────────────────
  console.log("\n7. APR-004: Error — invalid callsign");

  try {
    await adapter.approveArtifact("NOPE-999", {
      filename: "architecture-proposal.md",
      verdict: "approved",
    });
    check("APR-004: error for non-existent namespace", false, "should have thrown");
  } catch (e: any) {
    check(
      "APR-004: error for non-existent namespace",
      e.code === "NOT_FOUND" || e.code === "NAMESPACE_NOT_FOUND",
    );
  }

  try {
    await adapter.approveArtifact("bad-callsign", {
      filename: "architecture-proposal.md",
      verdict: "approved",
    });
    check("APR-004: error for malformed callsign", false, "should have thrown");
  } catch (e: any) {
    check(
      "APR-004: error for malformed callsign",
      e.code === "VALIDATION_ERROR",
    );
  }

  // ── Updated timestamp on work item ────────────────────────────────────
  console.log("\n8. Updated timestamp after approval");

  // Re-approve to test timestamp update
  await adapter.approveArtifact(testId, {
    filename: "architecture-proposal.md",
    verdict: "approved",
  });
  const afterReApprove = await adapter.getItem(testId);
  check(
    "updated timestamp is set after approval",
    !!afterReApprove.updated,
  );
  check(
    "updated timestamp is a date string",
    /^\d{4}-\d{2}-\d{2}$/.test(afterReApprove.updated),
  );

  // ── validateVerdict standalone function ────────────────────────────────
  console.log("\n9. validateVerdict function");

  try {
    validateVerdict("approved");
    check("validateVerdict: 'approved' passes", true);
  } catch {
    check("validateVerdict: 'approved' passes", false);
  }

  try {
    validateVerdict("rejected");
    check("validateVerdict: 'rejected' passes", true);
  } catch {
    check("validateVerdict: 'rejected' passes", false);
  }

  try {
    validateVerdict("maybe");
    check("validateVerdict: 'maybe' rejected", false, "should have thrown");
  } catch (e: any) {
    check("validateVerdict: 'maybe' rejected", e.code === "VALIDATION_ERROR");
  }

  try {
    validateVerdict("approve");
    check("validateVerdict: 'approve' rejected", false, "should have thrown");
  } catch (e: any) {
    check("validateVerdict: 'approve' rejected", e.code === "VALIDATION_ERROR");
    check(
      "validateVerdict: suggests 'approved' for 'approve'",
      e.message.includes("approved"),
    );
  }

  // ── Edge: Approve artifact without existing frontmatter ────────────────
  console.log("\n10. Edge: Artifact without existing frontmatter");

  await adapter.attachArtifact(testId, {
    type: "prd",
    title: "Plain PRD",
    filename: "prd.md",
    content: "# Plain PRD\n\nNo frontmatter here.",
  });
  await adapter.approveArtifact(testId, {
    filename: "prd.md",
    verdict: "approved",
  });
  const { content: plainApproved } = await adapter.getArtifact(testId, "prd.md");
  const plainFm = matter(plainApproved).data;
  check(
    "Edge: approval added to frontmatter-less artifact",
    plainFm.approval === "approved",
  );
  check(
    "Edge: pipeline_approved_at added",
    !!plainFm.pipeline_approved_at,
  );
  // The original content should still be there
  check(
    "Edge: original content preserved",
    plainApproved.includes("# Plain PRD"),
  );
  check(
    "Edge: original body preserved",
    plainApproved.includes("No frontmatter here."),
  );

  // ── Edge: Re-approve after rejection ──────────────────────────────────
  console.log("\n11. Edge: Re-approve after rejection");

  // Reject first
  await adapter.approveArtifact(testId, {
    filename: "architecture-proposal.md",
    verdict: "rejected",
  });
  // Then approve
  await adapter.approveArtifact(testId, {
    filename: "architecture-proposal.md",
    verdict: "approved",
  });
  const { content: reApprovedContent } = await adapter.getArtifact(
    testId,
    "architecture-proposal.md",
  );
  const reApprovedFm = matter(reApprovedContent).data;
  check(
    "Edge: re-approved after rejection",
    reApprovedFm.approval === "approved",
  );
  check(
    "Edge: pipeline_approved_at restored after re-approval",
    !!reApprovedFm.pipeline_approved_at,
  );

  // ── Edge: Approve non-gate artifact ───────────────────────────────────
  console.log("\n12. Edge: Approve non-gate artifact (prd.md)");

  // This should succeed — approval is set but /work won't gate on it
  await adapter.approveArtifact(testId, {
    filename: "prd.md",
    verdict: "approved",
  });
  const { content: nonGateContent } = await adapter.getArtifact(testId, "prd.md");
  const nonGateFm = matter(nonGateContent).data;
  check(
    "Edge: non-gate artifact approval succeeds",
    nonGateFm.approval === "approved",
  );

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

approveTest().catch((err) => {
  console.error("Approve test crashed:", err);
  process.exit(1);
});
