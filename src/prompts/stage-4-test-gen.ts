import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage } from "./helpers.js";

export async function testGenPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const gameplan = await adapter.getArtifact(item.id, "gameplan.md");

  return {
    description: `Stage 4: Test Generation for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "gameplan.md", gameplan.content),
      textMessage(
        `# Stage 4: Test Generation\n\n` +
          `You are a **test architect**. Generate the test suite for ${item.id}.\n\n` +
          `Read the repo's conventions file (CLAUDE.md, AGENTS.md, or CONVENTIONS.md) and follow its patterns.\n\n` +
          `## Output\n\nAttach via \`wcp_attach(${item.id}, ...)\` → \`test-coverage-matrix.md\``,
      ),
    ],
  };
}
