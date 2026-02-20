import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage } from "./helpers.js";

export async function architecturePrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const prd = await adapter.getArtifact(item.id, "prd.md");
  const discovery = await adapter.getArtifact(item.id, "discovery-report.md");

  return {
    description: `Stage 2: Architecture for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "prd.md", prd.content),
      embedArtifact(item.id, "discovery-report.md", discovery.content),
      textMessage(
        `# Stage 2: Architecture\n\n` +
          `You are a **software architect**. Design the architecture for ${item.id}.\n\n` +
          `Read the repo's conventions file (CLAUDE.md, AGENTS.md, or CONVENTIONS.md) and follow its patterns.\n\n` +
          `## Output\n\nAttach via \`wcp_attach(${item.id}, ...)\` → \`architecture-proposal.md\` with \`approval: pending\` in YAML frontmatter.`,
      ),
    ],
  };
}

export async function architectureReviewPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const arch = await adapter.getArtifact(item.id, "architecture-proposal.md");

  return {
    description: `Stage 2: Architecture Review for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "architecture-proposal.md", arch.content),
      textMessage(
        `# Architecture Review\n\n` +
          `The architecture proposal for ${item.id} is ready for review.\n\n` +
          `Please review the architecture proposal above. When you have a decision, call:\n` +
          `\`wcp_approve("${item.id}", "architecture-proposal.md", "approved")\` or\n` +
          `\`wcp_approve("${item.id}", "architecture-proposal.md", "rejected")\``,
      ),
    ],
  };
}
