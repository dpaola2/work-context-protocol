import type { WcpAdapter } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { buildArtifactStates, embedWorkItem, textMessage } from "./helpers.js";
import { detectPipelineStage } from "./detect-stage.js";
import { prdPrompt } from "./stage-0-prd.js";
import { discoveryPrompt } from "./stage-1-discovery.js";
import {
  architecturePrompt,
  architectureReviewPrompt,
} from "./stage-2-architecture.js";
import {
  gameplanPrompt,
  gameplanReviewPrompt,
} from "./stage-3-gameplan.js";
import { testGenPrompt } from "./stage-4-test-gen.js";
import { implementationPrompt } from "./stage-5-implementation.js";
import { reviewPrompt } from "./stage-6-review.js";
import { qaPlanPrompt } from "./stage-7-qa-plan.js";

export async function workPromptHandler(
  adapter: WcpAdapter,
  id: string,
): Promise<GetPromptResult> {
  // 1. Load work item
  const item = await adapter.getItem(id);

  // 2. Build artifact state map
  const artifactStates = await buildArtifactStates(adapter, item);

  // 3. Detect pipeline stage
  const stage = detectPipelineStage(item, artifactStates);

  // 4. Dispatch to stage-specific prompt builder
  switch (stage.type) {
    case "needs_body":
      return {
        description: `Add a description to ${item.id}`,
        messages: [
          textMessage(
            `Add a description to ${item.id} first. ` +
              `Use \`wcp_update("${item.id}", { body: "..." })\` to set the work item body before running /work.`,
          ),
        ],
      };

    case "stale":
      return {
        description: `Stale artifact detected for ${item.id}`,
        messages: [
          embedWorkItem(item),
          textMessage(
            `# Stale Artifact Detected\n\n` +
              `Your **${stage.artifact}** was generated before the latest **${stage.upstream}** changes.\n\n` +
              `**Options:**\n` +
              `1. **Regenerate** — Delete the stale artifact and re-run \`/work ${item.id}\` to regenerate it from the updated upstream.\n` +
              `2. **Proceed** — Keep the current version and continue with the next stage.\n\n` +
              `To regenerate, delete the stale artifact by re-attaching it, then run \`/work ${item.id}\` again.`,
          ),
        ],
      };

    case "prd":
      return prdPrompt(item);

    case "discovery":
      return discoveryPrompt(item, adapter);

    case "architecture":
      return architecturePrompt(item, adapter);

    case "architecture_review":
      return architectureReviewPrompt(item, adapter);

    case "gameplan":
      return gameplanPrompt(item, adapter);

    case "gameplan_review":
      return gameplanReviewPrompt(item, adapter);

    case "test_generation":
      return testGenPrompt(item, adapter);

    case "implementation":
      return implementationPrompt(
        item,
        adapter,
        stage.milestone,
        stage.totalMilestones,
      );

    case "review":
      return reviewPrompt(item, adapter);

    case "qa_plan":
      return qaPlanPrompt(item, adapter);

    case "complete":
      return {
        description: `Pipeline complete for ${item.id}`,
        messages: [
          textMessage(
            `# Pipeline Complete\n\n` +
              `All pipeline stages are done for ${item.id}. ` +
              `Run \`/create-pr ${item.id}\` to push the branch and open a pull request.`,
          ),
        ],
      };
  }
}
