/**
 * QA Test Data Seed Script for /work Prompt Pipeline
 *
 * Creates test work items in the TEST namespace covering every stage scenario
 * that /work can return. Run via: npx tsx src/prompts/seed-test-data.ts
 *
 * Idempotent — overwrites existing items on re-run.
 */

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { FilesystemAdapter } from "../adapters/filesystem.js";
import { serializeWorkItem } from "../parser.js";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(process.env.HOME || "~", "projects", "wcp-data");

const NS = "TEST";
const NS_DIR = path.join(DATA_PATH, NS);

// ── Helpers ──────────────────────────────────────────────────────────

function writeItem(
  callsign: string,
  title: string,
  body: string,
  artifacts: Array<{ type: string; title: string; url: string }> = [],
) {
  const filePath = path.join(NS_DIR, `${callsign}.md`);
  const content = serializeWorkItem({
    frontmatter: {
      id: callsign,
      title,
      status: "in_progress",
      created: "2026-02-20",
      updated: "2026-02-20",
      ...(artifacts.length > 0 ? { artifacts } : {}),
    },
    body,
    activity: "",
  });
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeArtifact(
  callsign: string,
  filename: string,
  opts: {
    stage?: number;
    stageName?: string;
    completedAt?: string;
    approval?: string;
    approvedAt?: string;
    content?: string;
  } = {},
) {
  const dir = path.join(NS_DIR, callsign);
  fs.mkdirSync(dir, { recursive: true });

  const fm: Record<string, any> = {};
  if (opts.stage !== undefined) fm.pipeline_stage = opts.stage;
  if (opts.stageName) fm.pipeline_stage_name = opts.stageName;
  fm.pipeline_project = callsign;
  if (opts.completedAt) fm.pipeline_completed_at = opts.completedAt;
  if (opts.approval) fm.approval = opts.approval;
  if (opts.approvedAt) fm.pipeline_approved_at = opts.approvedAt;

  const body = opts.content || `# ${filename}\n\nTest artifact content for ${callsign}.`;
  const fileContent = matter.stringify(body, fm);
  fs.writeFileSync(path.join(dir, filename), fileContent, "utf-8");
}

function artifactRef(callsign: string, filename: string, type: string, title: string) {
  return { type, title, url: `${NS}/${callsign}/${filename}` };
}

// Standard timestamps — each stage 30 minutes apart
const T = {
  prd: "2026-02-20T08:00:00-0500",
  discovery: "2026-02-20T08:30:00-0500",
  architecture: "2026-02-20T09:00:00-0500",
  gameplan: "2026-02-20T09:30:00-0500",
  testMatrix: "2026-02-20T10:00:00-0500",
  progress: "2026-02-20T10:30:00-0500",
  review: "2026-02-20T11:00:00-0500",
  qaPlan: "2026-02-20T11:30:00-0500",
};

// ── Scenario Definitions ─────────────────────────────────────────────

interface Scenario {
  callsign: string;
  title: string;
  body: string;
  artifacts: Array<{ type: string; title: string; url: string }>;
  artifactFiles: Array<{
    filename: string;
    opts: Parameters<typeof writeArtifact>[2];
  }>;
  expectedStage: string;
  description: string;
}

function buildScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  // 1. needs_body — item with no body
  scenarios.push({
    callsign: "TEST-900",
    title: "Seed: No body (needs_body)",
    body: "",
    artifacts: [],
    artifactFiles: [],
    expectedStage: "needs_body",
    description: "Item with no body triggers needs_body",
  });

  // 2. prd — body only, no artifacts
  scenarios.push({
    callsign: "TEST-901",
    title: "Seed: Body only (prd stage)",
    body: "This item has a body but no artifacts. /work should return the PRD generation prompt.",
    artifacts: [],
    artifactFiles: [],
    expectedStage: "prd",
    description: "Item with body, no artifacts triggers prd",
  });

  // 3. discovery — has prd.md only
  scenarios.push({
    callsign: "TEST-902",
    title: "Seed: Has PRD (discovery stage)",
    body: "Item with PRD attached. /work should return discovery prompt.",
    artifacts: [artifactRef("TEST-902", "prd.md", "prd", "PRD")],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
    ],
    expectedStage: "discovery",
    description: "Item with prd.md triggers discovery",
  });

  // 4. architecture — has prd + discovery
  scenarios.push({
    callsign: "TEST-903",
    title: "Seed: Has PRD + Discovery (architecture stage)",
    body: "Item with PRD and discovery. /work should return architecture prompt.",
    artifacts: [
      artifactRef("TEST-903", "prd.md", "prd", "PRD"),
      artifactRef("TEST-903", "discovery-report.md", "discovery", "Discovery Report"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: T.discovery } },
    ],
    expectedStage: "architecture",
    description: "Item with prd + discovery triggers architecture",
  });

  // 5. architecture_review — architecture with approval: pending
  scenarios.push({
    callsign: "TEST-904",
    title: "Seed: Architecture pending review (architecture_review gate)",
    body: "Item at architecture review gate. /work should present review prompt.",
    artifacts: [
      artifactRef("TEST-904", "prd.md", "prd", "PRD"),
      artifactRef("TEST-904", "discovery-report.md", "discovery", "Discovery Report"),
      artifactRef("TEST-904", "architecture-proposal.md", "architecture", "Architecture Proposal"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: T.discovery } },
      { filename: "architecture-proposal.md", opts: { stage: 2, stageName: "architecture", completedAt: T.architecture, approval: "pending" } },
    ],
    expectedStage: "architecture_review",
    description: "Architecture with approval: pending triggers architecture_review",
  });

  // 6. gameplan — approved architecture, no gameplan
  scenarios.push({
    callsign: "TEST-905",
    title: "Seed: Approved architecture (gameplan stage)",
    body: "Item with approved architecture. /work should return gameplan prompt.",
    artifacts: [
      artifactRef("TEST-905", "prd.md", "prd", "PRD"),
      artifactRef("TEST-905", "discovery-report.md", "discovery", "Discovery Report"),
      artifactRef("TEST-905", "architecture-proposal.md", "architecture", "Architecture Proposal"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: T.discovery } },
      { filename: "architecture-proposal.md", opts: { stage: 2, stageName: "architecture", completedAt: T.architecture, approval: "approved", approvedAt: "2026-02-20T09:15:00-0500" } },
    ],
    expectedStage: "gameplan",
    description: "Approved architecture triggers gameplan",
  });

  // 7. gameplan_review — approved arch + gameplan with approval: pending
  scenarios.push({
    callsign: "TEST-906",
    title: "Seed: Gameplan pending review (gameplan_review gate)",
    body: "Item at gameplan review gate. /work should present gameplan review prompt.",
    artifacts: [
      artifactRef("TEST-906", "prd.md", "prd", "PRD"),
      artifactRef("TEST-906", "discovery-report.md", "discovery", "Discovery Report"),
      artifactRef("TEST-906", "architecture-proposal.md", "architecture", "Architecture Proposal"),
      artifactRef("TEST-906", "gameplan.md", "gameplan", "Gameplan"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: T.discovery } },
      { filename: "architecture-proposal.md", opts: { stage: 2, stageName: "architecture", completedAt: T.architecture, approval: "approved", approvedAt: "2026-02-20T09:15:00-0500" } },
      {
        filename: "gameplan.md",
        opts: {
          stage: 3,
          stageName: "gameplan",
          completedAt: T.gameplan,
          approval: "pending",
          content: "# Gameplan\n\n## M1: First milestone\nDo the thing.\n\n## M2: Second milestone\nDo the other thing.",
        },
      },
    ],
    expectedStage: "gameplan_review",
    description: "Gameplan with approval: pending triggers gameplan_review",
  });

  // 8. test_generation — all pre-implementation artifacts approved, no test matrix
  scenarios.push({
    callsign: "TEST-907",
    title: "Seed: Approved gameplan (test_generation stage)",
    body: "Item with approved gameplan. /work should return test generation prompt.",
    artifacts: [
      artifactRef("TEST-907", "prd.md", "prd", "PRD"),
      artifactRef("TEST-907", "discovery-report.md", "discovery", "Discovery Report"),
      artifactRef("TEST-907", "architecture-proposal.md", "architecture", "Architecture Proposal"),
      artifactRef("TEST-907", "gameplan.md", "gameplan", "Gameplan"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: T.discovery } },
      { filename: "architecture-proposal.md", opts: { stage: 2, stageName: "architecture", completedAt: T.architecture, approval: "approved", approvedAt: "2026-02-20T09:15:00-0500" } },
      {
        filename: "gameplan.md",
        opts: {
          stage: 3,
          stageName: "gameplan",
          completedAt: T.gameplan,
          approval: "approved",
          approvedAt: "2026-02-20T09:45:00-0500",
          content: "# Gameplan\n\n## M1: First milestone\nDo the thing.\n\n## M2: Second milestone\nDo the other thing.",
        },
      },
    ],
    expectedStage: "test_generation",
    description: "Approved gameplan with no test-coverage-matrix triggers test_generation",
  });

  // 9. implementation — mid-implementation with progress.md (M1 done, M2 next)
  scenarios.push({
    callsign: "TEST-908",
    title: "Seed: Mid-implementation (implementation stage M2)",
    body: "Item mid-implementation. M1 done, M2 next. /work should return implementation prompt for M2.",
    artifacts: [
      artifactRef("TEST-908", "prd.md", "prd", "PRD"),
      artifactRef("TEST-908", "discovery-report.md", "discovery", "Discovery Report"),
      artifactRef("TEST-908", "architecture-proposal.md", "architecture", "Architecture Proposal"),
      artifactRef("TEST-908", "gameplan.md", "gameplan", "Gameplan"),
      artifactRef("TEST-908", "test-coverage-matrix.md", "test-matrix", "Test Coverage Matrix"),
      artifactRef("TEST-908", "progress.md", "plan", "Implementation Progress"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: T.discovery } },
      { filename: "architecture-proposal.md", opts: { stage: 2, stageName: "architecture", completedAt: T.architecture, approval: "approved", approvedAt: "2026-02-20T09:15:00-0500" } },
      {
        filename: "gameplan.md",
        opts: {
          stage: 3,
          stageName: "gameplan",
          completedAt: T.gameplan,
          approval: "approved",
          approvedAt: "2026-02-20T09:45:00-0500",
          content: "# Gameplan\n\n## M1: First milestone\nDo the thing.\n\n## M2: Second milestone\nDo the other thing.\n\n## M3: Third milestone\nFinish up.",
        },
      },
      { filename: "test-coverage-matrix.md", opts: { stage: 4, stageName: "test-generation", completedAt: T.testMatrix } },
      {
        filename: "progress.md",
        opts: {
          stage: 5,
          stageName: "implementation",
          completedAt: T.progress,
          content: "# Implementation Progress\n\nM1 complete, M2 in progress.",
        },
      },
    ],
    expectedStage: "implementation (M2 of 3)",
    description: "Mid-implementation with M1 done triggers implementation for M2",
  });

  // 10. complete — all artifacts present and gates approved
  scenarios.push({
    callsign: "TEST-909",
    title: "Seed: All stages complete (complete)",
    body: "Item with all pipeline artifacts. /work should return completion message.",
    artifacts: [
      artifactRef("TEST-909", "prd.md", "prd", "PRD"),
      artifactRef("TEST-909", "discovery-report.md", "discovery", "Discovery Report"),
      artifactRef("TEST-909", "architecture-proposal.md", "architecture", "Architecture Proposal"),
      artifactRef("TEST-909", "gameplan.md", "gameplan", "Gameplan"),
      artifactRef("TEST-909", "test-coverage-matrix.md", "test-matrix", "Test Coverage Matrix"),
      artifactRef("TEST-909", "progress.md", "plan", "Implementation Progress"),
      artifactRef("TEST-909", "review-report.md", "review", "Review Report"),
      artifactRef("TEST-909", "qa-plan.md", "qa-plan", "QA Plan"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: T.discovery } },
      { filename: "architecture-proposal.md", opts: { stage: 2, stageName: "architecture", completedAt: T.architecture, approval: "approved", approvedAt: "2026-02-20T09:15:00-0500" } },
      {
        filename: "gameplan.md",
        opts: {
          stage: 3,
          stageName: "gameplan",
          completedAt: T.gameplan,
          approval: "approved",
          approvedAt: "2026-02-20T09:45:00-0500",
          content: "# Gameplan\n\n## M1: Only milestone\nDo the thing.",
        },
      },
      { filename: "test-coverage-matrix.md", opts: { stage: 4, stageName: "test-generation", completedAt: T.testMatrix } },
      {
        filename: "progress.md",
        opts: {
          stage: 5,
          stageName: "implementation",
          completedAt: T.progress,
          content: "# Implementation Progress\n\nAll milestones complete.",
        },
      },
      { filename: "review-report.md", opts: { stage: 6, stageName: "review", completedAt: T.review } },
      { filename: "qa-plan.md", opts: { stage: 7, stageName: "qa-plan", completedAt: T.qaPlan } },
    ],
    expectedStage: "complete",
    description: "All pipeline artifacts present and gates approved triggers complete",
  });

  // 11. stale — PRD completed_at AFTER discovery completed_at
  scenarios.push({
    callsign: "TEST-910",
    title: "Seed: Stale artifact (stale)",
    body: "Item where PRD was updated after discovery. /work should detect staleness.",
    artifacts: [
      artifactRef("TEST-910", "prd.md", "prd", "PRD"),
      artifactRef("TEST-910", "discovery-report.md", "discovery", "Discovery Report"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: "2026-02-20T15:00:00-0500" } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: "2026-02-20T10:00:00-0500" } },
    ],
    expectedStage: "stale (discovery-report.md stale due to prd.md)",
    description: "PRD completed_at > discovery completed_at triggers stale",
  });

  // 12. rejected gate — architecture with approval: rejected
  scenarios.push({
    callsign: "TEST-911",
    title: "Seed: Rejected architecture (architecture_review re-present)",
    body: "Item with rejected architecture. /work should re-present review prompt.",
    artifacts: [
      artifactRef("TEST-911", "prd.md", "prd", "PRD"),
      artifactRef("TEST-911", "discovery-report.md", "discovery", "Discovery Report"),
      artifactRef("TEST-911", "architecture-proposal.md", "architecture", "Architecture Proposal"),
    ],
    artifactFiles: [
      { filename: "prd.md", opts: { stage: 0, stageName: "prd", completedAt: T.prd } },
      { filename: "discovery-report.md", opts: { stage: 1, stageName: "discovery", completedAt: T.discovery } },
      { filename: "architecture-proposal.md", opts: { stage: 2, stageName: "architecture", completedAt: T.architecture, approval: "rejected" } },
    ],
    expectedStage: "architecture_review (rejected — re-presents review)",
    description: "Rejected architecture re-presents architecture_review prompt",
  });

  return scenarios;
}

// ── Progress.md special handling ──────────────────────────────────────
// progress.md for TEST-908 needs pipeline_m1_completed_at in its frontmatter
// so that milestone detection works correctly.

function writeProgressWithMilestones(callsign: string) {
  const dir = path.join(NS_DIR, callsign);
  fs.mkdirSync(dir, { recursive: true });

  const fm: Record<string, any> = {
    pipeline_stage: 5,
    pipeline_stage_name: "implementation",
    pipeline_project: callsign,
    pipeline_m1_completed_at: "2026-02-20T10:30:00-0500",
  };

  const body = "# Implementation Progress\n\nM1 complete, M2 in progress.";
  const fileContent = matter.stringify(body, fm);
  fs.writeFileSync(path.join(dir, "progress.md"), fileContent, "utf-8");
}

// For TEST-909 (complete), all milestones must be done
function writeProgressAllComplete(callsign: string) {
  const dir = path.join(NS_DIR, callsign);
  fs.mkdirSync(dir, { recursive: true });

  const fm: Record<string, any> = {
    pipeline_stage: 5,
    pipeline_stage_name: "implementation",
    pipeline_project: callsign,
    pipeline_m1_completed_at: "2026-02-20T10:30:00-0500",
  };

  const body = "# Implementation Progress\n\nAll milestones complete.";
  const fileContent = matter.stringify(body, fm);
  fs.writeFileSync(path.join(dir, "progress.md"), fileContent, "utf-8");
}

// ── Main ─────────────────────────────────────────────────────────────

async function seed() {
  console.log(`\n=== WCP /work Prompt — QA Test Data Seed ===`);
  console.log(`Data path: ${DATA_PATH}`);
  console.log(`Namespace: ${NS}\n`);

  // Ensure namespace directory exists
  fs.mkdirSync(NS_DIR, { recursive: true });

  // Verify adapter can connect
  const adapter = new FilesystemAdapter(DATA_PATH);
  const namespaces = await adapter.listNamespaces();
  const testNs = namespaces.find((n) => n.key === NS);
  if (!testNs) {
    console.error(`ERROR: ${NS} namespace not found in config. Add it first.`);
    process.exit(1);
  }

  const scenarios = buildScenarios();

  for (const scenario of scenarios) {
    console.log(`  ${scenario.callsign}: ${scenario.description}`);

    // Write work item file
    writeItem(scenario.callsign, scenario.title, scenario.body, scenario.artifacts);

    // Write artifact files
    for (const af of scenario.artifactFiles) {
      writeArtifact(scenario.callsign, af.filename, af.opts);
    }

    // Special handling for progress.md with milestone frontmatter
    if (scenario.callsign === "TEST-908") {
      writeProgressWithMilestones("TEST-908");
    }
    if (scenario.callsign === "TEST-909") {
      writeProgressAllComplete("TEST-909");
    }
  }

  // Print summary table
  console.log(`\n${"─".repeat(80)}`);
  console.log(`\n  Summary: ${scenarios.length} test items created/updated\n`);
  console.log(`  ${"Callsign".padEnd(12)} ${"Expected Stage".padEnd(50)} Description`);
  console.log(`  ${"─".repeat(12)} ${"─".repeat(50)} ${"─".repeat(30)}`);
  for (const s of scenarios) {
    console.log(`  ${s.callsign.padEnd(12)} ${s.expectedStage.padEnd(50)} ${s.description}`);
  }

  console.log(`\n  To test: run /work <callsign> for each item and verify the stage.\n`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
