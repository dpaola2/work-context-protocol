import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage, extractMilestone } from "./helpers.js";

export async function implementationPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
  milestone: number,
  totalMilestones: number,
): Promise<GetPromptResult> {
  const gameplan = await adapter.getArtifact(item.id, "gameplan.md");
  const milestoneSection = extractMilestone(gameplan.content, milestone);

  const messages = [embedWorkItem(item)];

  // Embed milestone section or full gameplan as fallback
  if (milestoneSection) {
    messages.push(
      embedArtifact(item.id, "gameplan.md", milestoneSection),
    );
  } else {
    messages.push(
      embedArtifact(item.id, "gameplan.md", gameplan.content),
    );
  }

  // Embed test coverage matrix if available
  try {
    const testMatrix = await adapter.getArtifact(item.id, "test-coverage-matrix.md");
    messages.push(
      embedArtifact(item.id, "test-coverage-matrix.md", testMatrix.content),
    );
  } catch {
    // No test matrix — proceed without it
  }

  messages.push(
    textMessage(
      `# Stage 5: Implementation — Milestone M${milestone} of ${totalMilestones}\n\n` +
        `You are a **code builder**. Implement milestone M${milestone} for ${item.id}.\n\n` +
        `Read the repo's conventions file (CLAUDE.md, AGENTS.md, or CONVENTIONS.md) and follow its patterns.\n\n` +
        `## Output\n\nCommit implementation code and update \`progress.md\` via \`wcp_attach(${item.id}, ...)\`.`,
    ),
  );

  return {
    description: `Stage 5: Implementation M${milestone}/${totalMilestones} for ${item.id}`,
    messages,
  };
}
