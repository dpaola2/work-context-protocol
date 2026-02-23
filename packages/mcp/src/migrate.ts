#!/usr/bin/env node

/**
 * WCP Filesystem-to-Cloud Migration Script
 *
 * Reads local WCP filesystem data and pushes it to WCP Cloud via MCP JSON-RPC.
 *
 * Usage:
 *   npm run migrate -- --url https://workcontextprotocol.io/mcp --token <TOKEN>
 *
 * Options:
 *   --url       WCP Cloud MCP endpoint URL (required)
 *   --token     Bearer token for authentication (required)
 *   --data-path Path to WCP data directory (default: WCP_DATA_PATH or ~/projects/wcp-data)
 *   --dry-run   Parse and report what would be migrated without making API calls
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readConfig } from "./config.js";
import { parseWorkItem } from "./parser.js";
import { DEFAULT_SCHEMA, parseCallsign } from "@wcp/shared";

// ─── Types ───────────────────────────────────────────────────

interface MigrateArgs {
  url: string;
  token: string;
  dataPath: string;
  dryRun: boolean;
}

interface ParsedComment {
  author: string;
  timestamp: string;
  body: string;
}

interface MigrationItem {
  callsign: string;
  namespace: string;
  frontmatter: Record<string, any>;
  body: string;
  comments: ParsedComment[];
  artifacts: Array<{
    type: string;
    title: string;
    filename: string;
    content: string;
    approval?: string;
  }>;
}

interface MigrationPlan {
  namespaces: Array<{
    key: string;
    name: string;
    description: string;
    schemaExtensions: {
      statuses: string[];
      artifactTypes: string[];
    };
  }>;
  items: MigrationItem[];
}

interface MigrationStats {
  namespaces: { created: number; skipped: number; failed: number };
  schemas: { updated: number; skipped: number; failed: number };
  items: { created: number; skipped: number; failed: number };
  comments: { created: number; failed: number };
  artifacts: { attached: number; failed: number };
  approvals: { applied: number; failed: number };
}

// ─── CLI Argument Parsing ────────────────────────────────────

function parseArgs(): MigrateArgs {
  const args = process.argv.slice(2);
  let url = "";
  let token = "";
  let dataPath = process.env.WCP_DATA_PATH || path.join(os.homedir(), "projects", "wcp-data");
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        url = args[++i];
        break;
      case "--token":
        token = args[++i];
        break;
      case "--data-path":
        dataPath = args[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--help":
      case "-h":
        console.log(`
WCP Filesystem-to-Cloud Migration

Usage:
  npm run migrate -- --url <URL> --token <TOKEN> [options]

Options:
  --url        WCP Cloud MCP endpoint URL (required)
  --token      Bearer token for authentication (required)
  --data-path  Path to WCP data directory (default: $WCP_DATA_PATH or ~/projects/wcp-data)
  --dry-run    Parse and report what would be migrated, no API calls
  --help       Show this help message
`);
        process.exit(0);
    }
  }

  if (!dryRun && (!url || !token)) {
    console.error("Error: --url and --token are required (unless using --dry-run)");
    process.exit(1);
  }

  return { url, token, dataPath, dryRun };
}

// ─── Activity Log Parser ─────────────────────────────────────

function parseActivityLog(activity: string): ParsedComment[] {
  if (!activity || activity.trim() === "") return [];

  const comments: ParsedComment[] = [];

  // Split on the pattern: **author** — timestamp at the start of a line
  // Each entry starts with **author** — timestamp, followed by body lines
  const entryPattern = /^\*\*(.+?)\*\* — (.+)$/gm;
  const matches: Array<{ author: string; timestamp: string; index: number }> = [];

  let match;
  while ((match = entryPattern.exec(activity)) !== null) {
    matches.push({
      author: match[1],
      timestamp: match[2],
      index: match.index,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const headerEnd = activity.indexOf("\n", matches[i].index);
    if (headerEnd === -1) {
      // Single-line entry with no body
      comments.push({
        author: matches[i].author,
        timestamp: matches[i].timestamp,
        body: "",
      });
      continue;
    }

    // Body extends from after the header line to the start of the next entry (or end)
    const bodyStart = headerEnd + 1;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : activity.length;
    const body = activity.slice(bodyStart, bodyEnd).trim();

    comments.push({
      author: matches[i].author,
      timestamp: matches[i].timestamp,
      body,
    });
  }

  return comments;
}

// ─── Filesystem Reader ───────────────────────────────────────

function buildMigrationPlan(dataPath: string): MigrationPlan {
  const config = readConfig(dataPath);
  const globalSchema = config.schema || DEFAULT_SCHEMA;
  const defaultStatuses = DEFAULT_SCHEMA.status;
  const defaultArtifactTypes = DEFAULT_SCHEMA.artifact_type;

  const plan: MigrationPlan = { namespaces: [], items: [] };

  for (const [key, ns] of Object.entries(config.namespaces)) {
    // Determine schema extensions (values beyond the defaults)
    const customStatuses = ns.schema?.statuses?.filter(
      (s) => !defaultStatuses.includes(s)
    ) || [];
    const customArtifactTypes = ns.schema?.artifact_types?.filter(
      (t) => !defaultArtifactTypes.includes(t)
    ) || [];

    // Also pick up any global schema extensions beyond defaults
    const globalExtraStatuses = globalSchema.status.filter(
      (s) => !defaultStatuses.includes(s) && !customStatuses.includes(s)
    );
    const globalExtraArtifactTypes = globalSchema.artifact_type.filter(
      (t) => !defaultArtifactTypes.includes(t) && !customArtifactTypes.includes(t)
    );

    plan.namespaces.push({
      key,
      name: ns.name,
      description: ns.description,
      schemaExtensions: {
        statuses: [...customStatuses, ...globalExtraStatuses],
        artifactTypes: [...customArtifactTypes, ...globalExtraArtifactTypes],
      },
    });

    // Read work items
    const nsDir = path.join(dataPath, key);
    if (!fs.existsSync(nsDir)) continue;

    const files = fs.readdirSync(nsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(nsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      try {
        const parsed = parseWorkItem(content);
        const fm = parsed.frontmatter;
        const callsign = fm.id || file.replace(".md", "");
        const { namespace: nsKey } = parseCallsign(callsign);

        // Parse activity log into individual comments
        const comments = parseActivityLog(parsed.activity);

        // Read artifacts from companion directory
        const artifacts: MigrationItem["artifacts"] = [];
        const artifactDir = path.join(nsDir, callsign);
        if (fs.existsSync(artifactDir) && fs.statSync(artifactDir).isDirectory()) {
          const artifactFiles = fs.readdirSync(artifactDir);
          for (const af of artifactFiles) {
            const afPath = path.join(artifactDir, af);
            if (!fs.statSync(afPath).isFile()) continue;
            const artifactContent = fs.readFileSync(afPath, "utf-8");

            // Find matching metadata in frontmatter artifacts array
            const fmArtifacts: Array<{ type: string; title: string; url: string }> = fm.artifacts || [];
            const url = `${nsKey}/${callsign}/${af}`;
            const meta = fmArtifacts.find((a) => a.url === url);

            // Check for approval in artifact frontmatter
            let approval: string | undefined;
            if (artifactContent.startsWith("---\n")) {
              const endIdx = artifactContent.indexOf("\n---", 4);
              if (endIdx !== -1) {
                const fmBlock = artifactContent.slice(4, endIdx);
                const approvalMatch = fmBlock.match(/^approval:\s*(.+)$/m);
                if (approvalMatch) {
                  approval = approvalMatch[1].trim();
                }
              }
            }

            artifacts.push({
              type: meta?.type || "plan",
              title: meta?.title || af.replace(".md", ""),
              filename: af,
              content: artifactContent,
              approval,
            });
          }
        }

        plan.items.push({
          callsign,
          namespace: nsKey,
          frontmatter: fm,
          body: parsed.body,
          comments,
          artifacts,
        });
      } catch (err) {
        console.error(`  Warning: Failed to parse ${filePath}, skipping: ${err}`);
      }
    }
  }

  // Sort items by namespace, then by callsign number (migrate in order)
  plan.items.sort((a, b) => {
    if (a.namespace !== b.namespace) return a.namespace.localeCompare(b.namespace);
    const aNum = parseCallsign(a.callsign).number;
    const bNum = parseCallsign(b.callsign).number;
    return aNum - bNum;
  });

  return plan;
}

// ─── MCP JSON-RPC Client ─────────────────────────────────────

class McpClient {
  private requestId = 0;
  private sessionId: string | null = null;

  constructor(
    private url: string,
    private token: string,
  ) {}

  async initialize(): Promise<void> {
    const response = await this.send("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "wcp-migrate", version: "1.0.0" },
    });

    if (response.error) {
      throw new Error(`MCP initialize failed: ${JSON.stringify(response.error)}`);
    }

    // Send initialized notification
    await this.notify("notifications/initialized", {});
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const response = await this.send("tools/call", { name, arguments: args });

    if (response.error) {
      throw new Error(`Tool ${name} failed: ${JSON.stringify(response.error)}`);
    }

    const text = response.result?.content?.[0]?.text;
    if (!text) return response.result;

    const parsed = JSON.parse(text);
    if (parsed.error) {
      throw new Error(`Tool ${name} error: ${parsed.message || parsed.error}`);
    }
    return parsed;
  }

  private async send(method: string, params: Record<string, any>): Promise<any> {
    const id = ++this.requestId;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${this.token}`,
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.url, { method: "POST", headers, body });

    // Capture session ID from response
    const sid = response.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return response.json();
  }

  private async notify(method: string, params: Record<string, any>): Promise<void> {
    const body = JSON.stringify({ jsonrpc: "2.0", method, params });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.token}`,
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    await fetch(this.url, { method: "POST", headers, body });
  }
}

// ─── Migration Executor ──────────────────────────────────────

async function executeMigration(client: McpClient, plan: MigrationPlan): Promise<MigrationStats> {
  const stats: MigrationStats = {
    namespaces: { created: 0, skipped: 0, failed: 0 },
    schemas: { updated: 0, skipped: 0, failed: 0 },
    items: { created: 0, skipped: 0, failed: 0 },
    comments: { created: 0, failed: 0 },
    artifacts: { attached: 0, failed: 0 },
    approvals: { applied: 0, failed: 0 },
  };

  // Step 1: Create namespaces
  console.log("\n── Creating namespaces ──────────────────────");
  for (const ns of plan.namespaces) {
    try {
      await client.callTool("wcp_create_namespace", {
        key: ns.key,
        name: ns.name,
        description: ns.description,
      });
      console.log(`  ✓ Created namespace ${ns.key}`);
      stats.namespaces.created++;
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        console.log(`  ○ Namespace ${ns.key} already exists, skipping`);
        stats.namespaces.skipped++;
      } else {
        console.error(`  ✗ Failed to create namespace ${ns.key}: ${err.message}`);
        stats.namespaces.failed++;
      }
    }
  }

  // Step 2: Update schemas with extensions
  console.log("\n── Updating schemas ────────────────────────");
  for (const ns of plan.namespaces) {
    const { statuses, artifactTypes } = ns.schemaExtensions;
    if (statuses.length === 0 && artifactTypes.length === 0) {
      console.log(`  ○ No schema extensions for ${ns.key}`);
      stats.schemas.skipped++;
      continue;
    }

    try {
      const args: Record<string, any> = { namespace: ns.key };
      if (statuses.length > 0) args.add_statuses = statuses;
      if (artifactTypes.length > 0) args.add_artifact_types = artifactTypes;
      await client.callTool("wcp_schema_update", args);
      console.log(`  ✓ Updated schema for ${ns.key} (+${statuses.length} statuses, +${artifactTypes.length} artifact types)`);
      stats.schemas.updated++;
    } catch (err: any) {
      console.error(`  ✗ Failed to update schema for ${ns.key}: ${err.message}`);
      stats.schemas.failed++;
    }
  }

  // Step 3: Create items
  console.log("\n── Creating items ──────────────────────────");
  for (const item of plan.items) {
    const fm = item.frontmatter;
    try {
      const args: Record<string, any> = {
        namespace: item.namespace,
        title: fm.title,
        id: item.callsign,
        body: item.body || "",
      };
      if (fm.status) args.status = fm.status;
      if (fm.priority) args.priority = fm.priority;
      if (fm.type) args.type = fm.type;
      if (fm.project) args.project = fm.project;
      if (fm.assignee) args.assignee = fm.assignee;
      if (fm.parent) args.parent = fm.parent;
      if (fm.created) args.created_at = String(fm.created);
      if (fm.updated) args.updated_at = String(fm.updated);

      await client.callTool("wcp_create", args);
      console.log(`  ✓ Created ${item.callsign}: ${fm.title}`);
      stats.items.created++;
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        console.log(`  ○ ${item.callsign} already exists, skipping`);
        stats.items.skipped++;
      } else {
        console.error(`  ✗ Failed to create ${item.callsign}: ${err.message}`);
        stats.items.failed++;
        continue; // Skip comments/artifacts if item creation failed
      }
    }

    // Step 4: Attach artifacts (before comments, so approval comments don't get duplicated)
    for (const artifact of item.artifacts) {
      try {
        await client.callTool("wcp_attach", {
          id: item.callsign,
          type: artifact.type,
          title: artifact.title,
          filename: artifact.filename,
          content: artifact.content,
        });
        console.log(`    ✓ Attached ${artifact.filename}`);
        stats.artifacts.attached++;
      } catch (err: any) {
        console.error(`    ✗ Failed to attach ${artifact.filename}: ${err.message}`);
        stats.artifacts.failed++;
      }
    }

    // Step 5: Replay approval verdicts
    for (const artifact of item.artifacts) {
      if (!artifact.approval || (artifact.approval !== "approved" && artifact.approval !== "rejected")) continue;
      try {
        await client.callTool("wcp_approve", {
          id: item.callsign,
          artifact: artifact.filename,
          verdict: artifact.approval,
        });
        console.log(`    ✓ Applied ${artifact.approval} verdict on ${artifact.filename}`);
        stats.approvals.applied++;
      } catch (err: any) {
        console.error(`    ✗ Failed to approve ${artifact.filename}: ${err.message}`);
        stats.approvals.failed++;
      }
    }

    // Step 6: Replay comments with original timestamps
    for (const comment of item.comments) {
      try {
        await client.callTool("wcp_comment", {
          id: item.callsign,
          author: comment.author,
          body: comment.body || "(empty comment)",
          timestamp: comment.timestamp,
        });
        stats.comments.created++;
      } catch (err: any) {
        console.error(`    ✗ Failed to add comment by ${comment.author}: ${err.message}`);
        stats.comments.failed++;
      }
    }

    if (item.comments.length > 0) {
      console.log(`    ✓ Replayed ${item.comments.length} comments`);
    }
  }

  return stats;
}

// ─── Dry Run Reporter ────────────────────────────────────────

function printDryRun(plan: MigrationPlan): void {
  console.log("\n═══ DRY RUN — No changes will be made ═══\n");

  console.log(`Namespaces (${plan.namespaces.length}):`);
  for (const ns of plan.namespaces) {
    const extensions = [];
    if (ns.schemaExtensions.statuses.length > 0) {
      extensions.push(`+${ns.schemaExtensions.statuses.length} statuses`);
    }
    if (ns.schemaExtensions.artifactTypes.length > 0) {
      extensions.push(`+${ns.schemaExtensions.artifactTypes.length} artifact types`);
    }
    const ext = extensions.length > 0 ? ` (${extensions.join(", ")})` : "";
    console.log(`  ${ns.key}: ${ns.name}${ext}`);
  }

  console.log(`\nWork Items (${plan.items.length}):`);
  for (const item of plan.items) {
    const fm = item.frontmatter;
    const parts = [item.callsign, fm.title];
    if (fm.status) parts.push(`[${fm.status}]`);
    console.log(`  ${parts.join(" — ")}`);

    if (item.artifacts.length > 0) {
      console.log(`    Artifacts: ${item.artifacts.map((a) => a.filename).join(", ")}`);
    }
    if (item.comments.length > 0) {
      console.log(`    Comments: ${item.comments.length}`);
    }
  }

  const totalComments = plan.items.reduce((sum, i) => sum + i.comments.length, 0);
  const totalArtifacts = plan.items.reduce((sum, i) => sum + i.artifacts.length, 0);
  const totalApprovals = plan.items.reduce(
    (sum, i) => sum + i.artifacts.filter((a) => a.approval === "approved" || a.approval === "rejected").length,
    0
  );

  console.log(`\n── Summary ──`);
  console.log(`  Namespaces:  ${plan.namespaces.length}`);
  console.log(`  Items:       ${plan.items.length}`);
  console.log(`  Comments:    ${totalComments}`);
  console.log(`  Artifacts:   ${totalArtifacts}`);
  console.log(`  Approvals:   ${totalApprovals}`);
}

function printStats(stats: MigrationStats): void {
  console.log("\n══════════════════════════════════════════════");
  console.log("  Migration Complete");
  console.log("══════════════════════════════════════════════");
  console.log(`  Namespaces:  ${stats.namespaces.created} created, ${stats.namespaces.skipped} skipped, ${stats.namespaces.failed} failed`);
  console.log(`  Schemas:     ${stats.schemas.updated} updated, ${stats.schemas.skipped} skipped, ${stats.schemas.failed} failed`);
  console.log(`  Items:       ${stats.items.created} created, ${stats.items.skipped} skipped, ${stats.items.failed} failed`);
  console.log(`  Comments:    ${stats.comments.created} created, ${stats.comments.failed} failed`);
  console.log(`  Artifacts:   ${stats.artifacts.attached} attached, ${stats.artifacts.failed} failed`);
  console.log(`  Approvals:   ${stats.approvals.applied} applied, ${stats.approvals.failed} failed`);
  console.log("══════════════════════════════════════════════\n");

  const totalFailed =
    stats.namespaces.failed +
    stats.schemas.failed +
    stats.items.failed +
    stats.comments.failed +
    stats.artifacts.failed +
    stats.approvals.failed;

  if (totalFailed > 0) {
    console.log(`⚠ ${totalFailed} operation(s) failed. Review the output above for details.`);
  } else {
    console.log("All operations completed successfully!");
  }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log("WCP Filesystem → Cloud Migration");
  console.log(`Data path: ${args.dataPath}`);

  if (!fs.existsSync(args.dataPath)) {
    console.error(`Error: Data directory not found: ${args.dataPath}`);
    process.exit(1);
  }

  console.log("Reading filesystem data...");
  const plan = buildMigrationPlan(args.dataPath);

  if (args.dryRun) {
    printDryRun(plan);
    return;
  }

  console.log(`\nConnecting to ${args.url}...`);
  const client = new McpClient(args.url, args.token);
  await client.initialize();
  console.log("Connected!");

  const stats = await executeMigration(client, plan);
  printStats(stats);
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
