import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage } from "./helpers.js";

export async function reviewPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const messages = [embedWorkItem(item)];

  // Embed all available artifacts for review context
  const artifactFiles = [
    "prd.md",
    "discovery-report.md",
    "architecture-proposal.md",
    "gameplan.md",
    "test-coverage-matrix.md",
    "progress.md",
  ];

  for (const filename of artifactFiles) {
    try {
      const artifact = await adapter.getArtifact(item.id, filename);
      messages.push(embedArtifact(item.id, filename, artifact.content));
    } catch {
      // Artifact not found — skip
    }
  }

  messages.push(
    textMessage(
      `# Stage 6: Code Review\n\n` +
        `You are a **code reviewer**. Review the implementation for ${item.id}.\n\n` +
        `Read the repo's conventions file (CLAUDE.md, AGENTS.md, or CONVENTIONS.md) and follow its patterns.\n\n` +
        `## Output\n\nAttach via \`wcp_attach(${item.id}, ...)\` → \`review-report.md\``,
    ),
  );

  return {
    description: `Stage 6: Code Review for ${item.id}`,
    messages,
  };
}
