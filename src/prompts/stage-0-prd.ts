import type { WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, textMessage } from "./helpers.js";

export async function prdPrompt(item: WorkItem): Promise<GetPromptResult> {
  return {
    description: `Stage 0: PRD for ${item.id}`,
    messages: [
      embedWorkItem(item),
      textMessage(
        `# Stage 0: PRD Generation\n\n` +
          `You are a **product requirements writer**. Generate a PRD for ${item.id}.\n\n` +
          `Read the repo's conventions file (CLAUDE.md, AGENTS.md, or CONVENTIONS.md) and follow its patterns.\n\n` +
          `## Output\n\nAttach via \`wcp_attach(${item.id}, ...)\` → \`prd.md\``,
      ),
    ],
  };
}
