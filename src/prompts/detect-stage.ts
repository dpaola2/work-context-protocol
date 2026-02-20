import type { WorkItem } from "../adapter.js";

/** Parsed state of a single artifact */
export interface ArtifactState {
  filename: string;
  exists: boolean;
  approval?: "approved" | "rejected" | "pending";
  completedAt?: string;
  milestoneCount?: number;
  completedMilestones?: number;
}

/** The artifact filenames that form the pipeline chain, in order */
export const PIPELINE_CHAIN: readonly string[] = [
  "prd.md",
  "discovery-report.md",
  "architecture-proposal.md",
  "gameplan.md",
  "test-coverage-matrix.md",
  "progress.md",
  "review-report.md",
  "qa-plan.md",
];

/** Artifacts that require explicit approval before the pipeline proceeds */
export const GATE_ARTIFACTS: readonly string[] = [
  "architecture-proposal.md",
  "gameplan.md",
];

/** The detected pipeline stage — a discriminated union */
export type PipelineStage =
  | { type: "needs_body" }
  | { type: "stale"; artifact: string; upstream: string }
  | { type: "prd" }
  | { type: "discovery" }
  | { type: "architecture" }
  | { type: "gameplan" }
  | { type: "test_generation" }
  | { type: "implementation"; milestone: number; totalMilestones: number }
  | { type: "review" }
  | { type: "qa_plan" }
  | { type: "architecture_review" }
  | { type: "gameplan_review" }
  | { type: "complete" };

/**
 * Pure function — no I/O. Determines the current pipeline stage from
 * a work item and its artifact state map.
 */
export function detectPipelineStage(
  item: WorkItem,
  artifacts: Map<string, ArtifactState>,
): PipelineStage {
  // 1. Check body
  if (!item.body || item.body.trim() === "") {
    return { type: "needs_body" };
  }

  // 2. Check staleness — compare adjacent pairs in the chain
  for (let i = 0; i < PIPELINE_CHAIN.length - 1; i++) {
    const upstream = artifacts.get(PIPELINE_CHAIN[i]);
    const downstream = artifacts.get(PIPELINE_CHAIN[i + 1]);
    if (
      upstream?.exists &&
      downstream?.exists &&
      upstream.completedAt &&
      downstream.completedAt
    ) {
      if (upstream.completedAt > downstream.completedAt) {
        return {
          type: "stale",
          artifact: downstream.filename,
          upstream: upstream.filename,
        };
      }
    }
  }

  // 3. Walk the pipeline chain — check artifact presence and gates
  if (!artifacts.get("prd.md")?.exists) {
    return { type: "prd" };
  }

  if (!artifacts.get("discovery-report.md")?.exists) {
    return { type: "discovery" };
  }

  if (!artifacts.get("architecture-proposal.md")?.exists) {
    return { type: "architecture" };
  }

  const archApproval = artifacts.get("architecture-proposal.md")!.approval;
  if (archApproval !== "approved") {
    return { type: "architecture_review" };
  }

  if (!artifacts.get("gameplan.md")?.exists) {
    return { type: "gameplan" };
  }

  const gameplanApproval = artifacts.get("gameplan.md")!.approval;
  if (gameplanApproval !== "approved") {
    return { type: "gameplan_review" };
  }

  if (!artifacts.get("test-coverage-matrix.md")?.exists) {
    return { type: "test_generation" };
  }

  // 4. Milestone progression
  const gameplanState = artifacts.get("gameplan.md")!;
  const progressState = artifacts.get("progress.md");

  const totalMilestones = gameplanState.milestoneCount;
  const completedMilestones = progressState?.completedMilestones;

  if (totalMilestones !== undefined && completedMilestones !== undefined) {
    // Concrete milestone data available — use it
    if (completedMilestones < totalMilestones) {
      return {
        type: "implementation",
        milestone: completedMilestones + 1,
        totalMilestones,
      };
    }
  } else if (!artifacts.get("review-report.md")?.exists) {
    // No concrete milestone data and no review-report — default to implementation
    return {
      type: "implementation",
      milestone: 1,
      totalMilestones: totalMilestones ?? 1,
    };
  }

  // 5. Post-implementation
  if (!artifacts.get("review-report.md")?.exists) {
    return { type: "review" };
  }

  if (!artifacts.get("qa-plan.md")?.exists) {
    return { type: "qa_plan" };
  }

  // 6. All done
  return { type: "complete" };
}
