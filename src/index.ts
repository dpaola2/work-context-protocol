import * as os from "os";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FilesystemAdapter } from "./adapters/filesystem.js";
import type { WcpAdapter } from "./adapter.js";
import { WcpError } from "./errors.js";
import { readConfig, writeConfig } from "./config.js";
import {
  resolveSchema,
  addNamespaceStatuses,
  removeNamespaceStatuses,
  addNamespaceArtifactTypes,
  removeNamespaceArtifactTypes,
} from "./schema.js";
import { workPromptHandler } from "./prompts/work.js";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(os.homedir(), "projects", "wcp-data");

function jsonResponse(data: any) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResponse(err: WcpError) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: err.code, message: err.message }),
      },
    ],
    isError: true as const,
  };
}

const adapter: WcpAdapter = new FilesystemAdapter(DATA_PATH);

const server = new McpServer(
  {
    name: "wcp",
    version: "1.0.0",
  },
  {
    instructions: `# Work Context Protocol (WCP)

WCP is a work item tracker for AI agents and humans. It stores structured work items as markdown files with YAML frontmatter, organized by namespace.

## Core Concepts

- **Namespaces** organize work by domain (e.g., PIPE for pipeline work, SN for show notes). Each namespace has a directory of work items.
- **Work items** are identified by callsigns like PIPE-12 or SN-3. Each has: frontmatter (structured fields), a markdown body (description/specs), and an activity log (append-only comments).
- **Artifacts** are documents attached to work items (PRDs, architecture proposals, gameplans, etc.). Stored in a companion directory alongside the work item.

## Workflow

1. **Start**: Call wcp_namespaces to see available namespaces and their item counts.
2. **Find work**: Call wcp_list with a namespace to see items. Filter by status, priority, type, project, assignee, or parent.
3. **Read details**: Call wcp_get with a callsign to see full item content including body, artifacts list, and activity log.
4. **Create work**: Call wcp_create with a namespace and title. Auto-generates a callsign. Defaults to status=backlog.
5. **Update work**: Call wcp_update to change status, assignee, priority, or other fields. Use the body param to update the description.
6. **Log progress**: Call wcp_comment to append to the activity log with your author name and a message.
7. **Attach documents**: Call wcp_attach to store artifact files (PRDs, specs, proposals) on a work item. These are stored in a companion directory.
8. **Read documents**: Call wcp_get_artifact to retrieve the content of an attached artifact.

## Schema Discovery

Call **wcp_schema** to discover valid field values. Namespaces can extend statuses and artifact types.

- **wcp_schema(namespace?)** — returns valid values for all fields. If namespace is provided, includes namespace-specific extensions merged with defaults.
- **wcp_schema_update(namespace, ...)** — add or remove custom statuses and artifact types for a namespace.

## Field Values

Use wcp_schema for the authoritative list. Defaults:

- **status**: backlog, todo, in_progress, in_review, done, cancelled (extensible per namespace)
- **priority**: urgent, high, medium, low (fixed)
- **type**: feature, bug, chore, spike (fixed)
- **artifact types**: prd, discovery, architecture, adr, gameplan, plan, test-matrix, review, qa-plan (extensible per namespace)

## Artifact Convention

When running a multi-stage pipeline (e.g., PRD → discovery → architecture → gameplan → implementation), attach each document as an artifact:
- wcp_attach with filename "prd.md", type "prd"
- wcp_attach with filename "discovery-report.md", type "discovery"
- wcp_attach with filename "architecture-proposal.md", type "architecture"
- wcp_attach with filename "gameplan.md", type "gameplan"

Use wcp_comment to log stage transitions and decisions in the activity log.`,
  },
);

// --- wcp_namespaces ---
server.tool(
  "wcp_namespaces",
  "List all configured namespaces with name, description, and item count.",
  {},
  async () => {
    try {
      const namespaces = await adapter.listNamespaces();
      return jsonResponse({ namespaces, count: namespaces.length });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_create_namespace ---
server.tool(
  "wcp_create_namespace",
  "Create a new namespace for organizing work items. The key must be uppercase letters (e.g. 'PROJ', 'OPS'). Returns the created namespace.",
  {
    key: z
      .string()
      .describe("Uppercase namespace key, e.g. 'PROJ'. Must be unique."),
    name: z.string().describe("Human-readable name, e.g. 'Project Alpha'"),
    description: z.string().describe("What this namespace is for"),
  },
  async ({ key, name, description }) => {
    try {
      if (!/^[A-Z][A-Z0-9]*$/.test(key)) {
        return errorResponse(
          new WcpError(
            "VALIDATION_ERROR",
            `Invalid namespace key '${key}'. Must be uppercase letters/numbers, starting with a letter (e.g. 'PROJ').`,
          ),
        );
      }

      const config = readConfig(DATA_PATH);
      if (config.namespaces[key]) {
        return errorResponse(
          new WcpError(
            "VALIDATION_ERROR",
            `Namespace '${key}' already exists.`,
          ),
        );
      }

      config.namespaces[key] = { name, description, next: 1 };
      writeConfig(DATA_PATH, config);

      return jsonResponse({
        created: true,
        namespace: { key, name, description, itemCount: 0 },
      });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_list ---
server.tool(
  "wcp_list",
  "List work items in a namespace, optionally filtered by status, priority, type, project, assignee, or parent.",
  {
    namespace: z.string().describe("Namespace key, e.g. 'PIPE'"),
    status: z.string().optional().describe("Filter by status"),
    priority: z.string().optional().describe("Filter by priority"),
    type: z.string().optional().describe("Filter by type"),
    project: z.string().optional().describe("Filter by project"),
    assignee: z.string().optional().describe("Filter by assignee"),
    parent: z.string().optional().describe("Filter by parent callsign"),
  },
  async ({ namespace, ...filters }) => {
    try {
      const items = await adapter.listItems(namespace, filters);
      return jsonResponse({ items, count: items.length });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_get ---
server.tool(
  "wcp_get",
  "Get a work item by callsign (e.g. 'PIPE-12'). Returns full content: frontmatter, body, and activity log.",
  {
    id: z.string().describe("Work item callsign, e.g. 'PIPE-12'"),
  },
  async ({ id }) => {
    try {
      const item = await adapter.getItem(id);
      return jsonResponse({ item });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_create ---
server.tool(
  "wcp_create",
  "Create a new work item in a namespace. Returns the new callsign.",
  {
    namespace: z.string().describe("Namespace key, e.g. 'PIPE'"),
    title: z.string().describe("Work item title"),
    status: z.string().optional().describe("Status (default: backlog). Use wcp_schema to see valid values"),
    priority: z.string().optional().describe("Priority: urgent, high, medium, low"),
    type: z.string().optional().describe("Type: feature, bug, chore, spike"),
    project: z.string().optional().describe("Project name"),
    assignee: z.string().optional().describe("Assignee"),
    parent: z.string().optional().describe("Parent callsign"),
    body: z.string().optional().describe("Markdown body/description"),
  },
  async ({ namespace, ...input }) => {
    try {
      const id = await adapter.createItem(namespace, input);
      return jsonResponse({ id });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_update ---
const artifactSchema = z.object({
  type: z.string().describe("Artifact type"),
  title: z.string().describe("Artifact title"),
  url: z.string().describe("Artifact URL or path"),
});

server.tool(
  "wcp_update",
  "Update a work item's fields. Only provided fields are changed.",
  {
    id: z.string().describe("Work item callsign, e.g. 'PIPE-12'"),
    title: z.string().optional().describe("New title"),
    status: z.string().optional().describe("New status. Use wcp_schema to see valid values"),
    priority: z.string().optional().describe("New priority"),
    type: z.string().optional().describe("New type"),
    project: z.string().optional().describe("New project"),
    assignee: z.string().optional().describe("New assignee"),
    parent: z.string().optional().describe("New parent callsign"),
    body: z.string().optional().describe("New markdown body (replaces existing)"),
    addArtifacts: z
      .array(artifactSchema)
      .optional()
      .describe("Artifacts to append to the existing list"),
  },
  async ({ id, ...changes }) => {
    try {
      await adapter.updateItem(id, changes);
      return jsonResponse({ updated: true });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_comment ---
server.tool(
  "wcp_comment",
  "Add a comment to a work item's activity log.",
  {
    id: z.string().describe("Work item callsign, e.g. 'PIPE-12'"),
    author: z.string().describe("Comment author"),
    body: z.string().describe("Comment body (markdown)"),
  },
  async ({ id, author, body }) => {
    try {
      await adapter.addComment(id, author, body);
      return jsonResponse({ commented: true });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_attach ---
server.tool(
  "wcp_attach",
  "Attach an artifact file to a work item. Stores the content in a companion directory ({NS}/{ID}/) and registers it in the work item's artifacts list. If an artifact with the same filename already exists, it is overwritten.",
  {
    id: z.string().describe("Work item callsign, e.g. 'PIPE-12'"),
    type: z.string().describe("Artifact type. Use wcp_schema to see valid values"),
    title: z.string().describe("Human-readable artifact title"),
    filename: z.string().describe("Filename to store as, e.g. 'prd.md', 'architecture-proposal.md'"),
    content: z.string().describe("Full content of the artifact file"),
  },
  async ({ id, ...input }) => {
    try {
      const artifact = await adapter.attachArtifact(id, input);
      return jsonResponse({ attached: true, artifact });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_get_artifact ---
server.tool(
  "wcp_get_artifact",
  "Retrieve the content of an artifact attached to a work item.",
  {
    id: z.string().describe("Work item callsign, e.g. 'PIPE-12'"),
    filename: z.string().describe("Artifact filename, e.g. 'prd.md'"),
  },
  async ({ id, filename }) => {
    try {
      const result = await adapter.getArtifact(id, filename);
      return jsonResponse(result);
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_approve ---
server.tool(
  "wcp_approve",
  "Record an approval decision on an artifact. Sets the approval field in the artifact's YAML frontmatter and logs the decision to the work item's activity log.",
  {
    id: z.string().describe("Work item callsign, e.g. 'PIPE-12'"),
    artifact: z.string().describe("Artifact filename, e.g. 'architecture-proposal.md'"),
    verdict: z.string().describe("Approval verdict: 'approved' or 'rejected'"),
  },
  async ({ id, artifact, verdict }) => {
    try {
      await adapter.approveArtifact(id, { filename: artifact, verdict });
      return jsonResponse({ approved: true, verdict });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_schema ---
server.tool(
  "wcp_schema",
  "Returns valid values for all work item fields (status, priority, type, artifact_type). If namespace is provided, includes namespace-specific extensions merged with defaults. Use this to discover valid values before creating or updating work items.",
  {
    namespace: z
      .string()
      .optional()
      .describe(
        "Namespace key (e.g. 'PIPE'). If provided, includes namespace extensions",
      ),
  },
  async ({ namespace }) => {
    try {
      const config = readConfig(DATA_PATH);
      if (namespace && !config.namespaces[namespace]) {
        return errorResponse(
          new WcpError(
            "NAMESPACE_NOT_FOUND",
            `Namespace ${namespace} not found. Use wcp_namespaces to see available namespaces.`,
          ),
        );
      }
      const schema = resolveSchema(config, namespace);
      return jsonResponse({ schema, namespace: namespace ?? null });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- wcp_schema_update ---
server.tool(
  "wcp_schema_update",
  "Add or remove custom statuses and artifact types for a namespace. Cannot modify fixed enums (priority, type) or remove global defaults. Returns the updated schema.",
  {
    namespace: z.string().describe("Namespace key, e.g. 'PIPE'"),
    add_statuses: z
      .array(z.string())
      .optional()
      .describe("Status values to add as namespace extensions"),
    remove_statuses: z
      .array(z.string())
      .optional()
      .describe("Status extensions to remove (cannot remove defaults)"),
    add_artifact_types: z
      .array(z.string())
      .optional()
      .describe("Artifact type values to add as namespace extensions"),
    remove_artifact_types: z
      .array(z.string())
      .optional()
      .describe(
        "Artifact type extensions to remove (cannot remove defaults)",
      ),
  },
  async ({
    namespace,
    add_statuses,
    remove_statuses,
    add_artifact_types,
    remove_artifact_types,
  }) => {
    try {
      const config = readConfig(DATA_PATH);
      if (!config.namespaces[namespace]) {
        return errorResponse(
          new WcpError(
            "NAMESPACE_NOT_FOUND",
            `Namespace ${namespace} not found. Use wcp_namespaces to see available namespaces.`,
          ),
        );
      }

      const changes: Record<string, string[]> = {};

      if (add_statuses?.length) {
        changes.added_statuses = addNamespaceStatuses(
          config,
          namespace,
          add_statuses,
        );
      }
      if (remove_statuses?.length) {
        changes.removed_statuses = removeNamespaceStatuses(
          config,
          namespace,
          remove_statuses,
        );
      }
      if (add_artifact_types?.length) {
        changes.added_artifact_types = addNamespaceArtifactTypes(
          config,
          namespace,
          add_artifact_types,
        );
      }
      if (remove_artifact_types?.length) {
        changes.removed_artifact_types = removeNamespaceArtifactTypes(
          config,
          namespace,
          remove_artifact_types,
        );
      }

      writeConfig(DATA_PATH, config);

      const schema = resolveSchema(config, namespace);
      return jsonResponse({ updated: true, changes, schema });
    } catch (err) {
      if (err instanceof WcpError) return errorResponse(err);
      throw err;
    }
  },
);

// --- /work prompt ---
server.registerPrompt(
  "work",
  {
    title: "Work on item",
    description:
      "Determines the next pipeline stage for a work item and provides context-loaded instructions.",
    argsSchema: {
      id: z.string().describe("Work item callsign, e.g. 'PIPE-3'"),
    },
  },
  async ({ id }) => {
    return workPromptHandler(adapter, id);
  },
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[wcp] MCP server running on stdio, data: ${DATA_PATH}`);
}

main().catch((err) => {
  console.error("[wcp] Fatal error:", err);
  process.exit(1);
});
