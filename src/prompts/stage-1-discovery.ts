import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage } from "./helpers.js";

export async function discoveryPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const prd = await adapter.getArtifact(item.id, "prd.md");

  return {
    description: `Stage 1: Discovery for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "prd.md", prd.content),
      textMessage(
        `# Stage 1: Discovery\n\n` +
          `You are a **codebase explorer**. Your job is to understand how things work TODAY.\n\n` +
          `Read the repo's conventions file (CLAUDE.md, AGENTS.md, or CONVENTIONS.md) and follow its patterns.\n\n` +
          `## Output\n\nAttach via \`wcp_attach(${item.id}, ...)\` → \`discovery-report.md\``,
      ),
    ],
  };
}
