import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage } from "./helpers.js";

export async function gameplanPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const prd = await adapter.getArtifact(item.id, "prd.md");
  const discovery = await adapter.getArtifact(item.id, "discovery-report.md");
  const arch = await adapter.getArtifact(item.id, "architecture-proposal.md");

  return {
    description: `Stage 3: Gameplan for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "prd.md", prd.content),
      embedArtifact(item.id, "discovery-report.md", discovery.content),
      embedArtifact(item.id, "architecture-proposal.md", arch.content),
      textMessage(
        `# Stage 3: Gameplan\n\n` +
          `You are a **project planner**. Create the engineering gameplan for ${item.id}.\n\n` +
          `Read the repo's conventions file (CLAUDE.md, AGENTS.md, or CONVENTIONS.md) and follow its patterns.\n\n` +
          `## Output\n\nAttach via \`wcp_attach(${item.id}, ...)\` → \`gameplan.md\` with \`approval: pending\` in YAML frontmatter.`,
      ),
    ],
  };
}

export async function gameplanReviewPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const gameplan = await adapter.getArtifact(item.id, "gameplan.md");

  return {
    description: `Stage 3: Gameplan Review for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "gameplan.md", gameplan.content),
      textMessage(
        `# Gameplan Review\n\n` +
          `The gameplan for ${item.id} is ready for review.\n\n` +
          `Please review the gameplan above. When you have a decision, call:\n` +
          `\`wcp_approve("${item.id}", "gameplan.md", "approved")\` or\n` +
          `\`wcp_approve("${item.id}", "gameplan.md", "rejected")\``,
      ),
    ],
  };
}
