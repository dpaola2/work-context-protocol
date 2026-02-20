import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage } from "./helpers.js";

export async function qaPlanPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const messages = [embedWorkItem(item)];

  // Embed PRD, gameplan, and review report
  const artifactFiles = ["prd.md", "gameplan.md", "review-report.md"];
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
      `# Stage 7: QA Plan\n\n` +
        `You are a **QA planner**. Create the QA plan for ${item.id}.\n\n` +
        `Read the repo's conventions file (CLAUDE.md, AGENTS.md, or CONVENTIONS.md) and follow its patterns.\n\n` +
        `## Output\n\nAttach via \`wcp_attach(${item.id}, ...)\` → \`qa-plan.md\``,
    ),
  );

  return {
    description: `Stage 7: QA Plan for ${item.id}`,
    messages,
  };
}
