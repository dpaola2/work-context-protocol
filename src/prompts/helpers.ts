import matter from "gray-matter";
import type { WcpAdapter, WorkItem } from "../adapter.js";
import { PIPELINE_CHAIN, GATE_ARTIFACTS } from "./detect-stage.js";
import type { ArtifactState } from "./detect-stage.js";

// ── Prompt message types ─────────────────────────────────────────────
// Structural types matching the MCP SDK's PromptMessage / GetPromptResult.
// The [key: string]: unknown index signature satisfies the SDK's JSON-RPC
// extensibility requirement.

export interface PromptMessage {
  [key: string]: unknown;
  role: "user" | "assistant";
  content:
    | { type: "text"; text: string }
    | {
        type: "resource";
        resource: { uri: string; mimeType?: string; text: string };
      };
}

export interface GetPromptResult {
  [key: string]: unknown;
  description?: string;
  messages: PromptMessage[];
}

// ── Frontmatter parsing ──────────────────────────────────────────────

export function parseArtifactFrontmatter(
  content: string,
): Record<string, any> {
  try {
    const { data } = matter(content);
    return data;
  } catch {
    return {};
  }
}

// ── Artifact state building ──────────────────────────────────────────

export async function buildArtifactStates(
  adapter: WcpAdapter,
  item: WorkItem,
): Promise<Map<string, ArtifactState>> {
  const states = new Map<string, ArtifactState>();

  // Build a set of existing artifact filenames from work item metadata
  const existingFiles = new Set(
    item.artifacts.map((a) => a.url.split("/").pop()!),
  );

  for (const filename of PIPELINE_CHAIN) {
    if (!existingFiles.has(filename)) {
      states.set(filename, { filename, exists: false });
      continue;
    }

    try {
      const { content } = await adapter.getArtifact(item.id, filename);
      const fm = parseArtifactFrontmatter(content);

      const state: ArtifactState = {
        filename,
        exists: true,
        completedAt: fm.pipeline_completed_at,
      };

      // Only check approval for gate artifacts
      if (GATE_ARTIFACTS.includes(filename)) {
        state.approval = fm.approval ?? "pending";
      }

      // Extract milestone data from gameplan
      if (filename === "gameplan.md") {
        const headings = content.match(/^## M\d+:/gm) ?? [];
        state.milestoneCount = headings.length;
      }

      // Extract completed milestone count from progress
      if (filename === "progress.md") {
        let completed = 0;
        for (let i = 1; i <= 100; i++) {
          if (fm[`pipeline_m${i}_completed_at`]) {
            completed++;
          } else {
            break;
          }
        }
        state.completedMilestones = completed;
      }

      states.set(filename, state);
    } catch {
      // Artifact listed in frontmatter but file missing — treat as non-existent
      states.set(filename, { filename, exists: false });
    }
  }

  return states;
}

// ── Milestone extraction ─────────────────────────────────────────────

export function extractMilestone(
  gameplanContent: string,
  milestoneNum: number,
): string | null {
  const pattern = new RegExp(`^## M${milestoneNum}:.*$`, "m");
  const match = pattern.exec(gameplanContent);
  if (!match) return null;

  const start = match.index;
  const rest = gameplanContent.slice(start + match[0].length);
  const nextPattern = /^## M\d+:/m;
  const nextMatch = nextPattern.exec(rest);
  const end = nextMatch
    ? start + match[0].length + nextMatch.index
    : gameplanContent.length;

  return gameplanContent.slice(start, end).trim();
}

// ── Message builder helpers ──────────────────────────────────────────

export function embedWorkItem(item: WorkItem): PromptMessage {
  return {
    role: "user",
    content: {
      type: "resource",
      resource: {
        uri: `wcp://${item.id}`,
        mimeType: "text/markdown",
        text: `# ${item.title}\n\n${item.body}`,
      },
    },
  };
}

export function embedArtifact(
  id: string,
  filename: string,
  content: string,
): PromptMessage {
  return {
    role: "user",
    content: {
      type: "resource",
      resource: {
        uri: `wcp://${id}/${filename}`,
        mimeType: "text/markdown",
        text: content,
      },
    },
  };
}

export function textMessage(text: string): PromptMessage {
  return {
    role: "user",
    content: { type: "text", text },
  };
}
