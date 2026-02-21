/**
 * Filesystem→SQLite Migration Script
 *
 * Reads a WCP filesystem data directory (config.yaml + .md files + artifacts)
 * and imports everything into a SQLite database.
 *
 * Usage: npx tsx packages/server/src/migrate-fs.ts --source <data-path> --db <sqlite-path>
 *
 * Idempotent: safe to re-run. Uses INSERT OR REPLACE for all records.
 */

import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import matter from "gray-matter";
import { initDatabase } from "./db.js";
import type { WcpConfig, Artifact } from "@wcp/shared";

const ACTIVITY_SEPARATOR = "---\n\n## Activity";

function parseArgs(): { source: string; db: string } {
  const args = process.argv.slice(2);
  let source = "";
  let db = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) {
      source = args[++i];
    } else if (args[i] === "--db" && args[i + 1]) {
      db = args[++i];
    }
  }

  if (!source || !db) {
    console.error("Usage: npx tsx packages/server/src/migrate-fs.ts --source <data-path> --db <sqlite-path>");
    process.exit(1);
  }

  return { source, db };
}

function parseWorkItem(fileContent: string): {
  frontmatter: Record<string, any>;
  body: string;
  activity: string;
} {
  const { data, content } = matter(fileContent);
  const sepIndex = content.indexOf(ACTIVITY_SEPARATOR);

  if (sepIndex === -1) {
    return { frontmatter: data, body: content.trim(), activity: "" };
  }

  return {
    frontmatter: data,
    body: content.slice(0, sepIndex).trim(),
    activity: content.slice(sepIndex + ACTIVITY_SEPARATOR.length).trim(),
  };
}

function migrate(source: string, dbPath: string): void {
  console.log(`[wcp-migrate] Source: ${source}`);
  console.log(`[wcp-migrate] Database: ${dbPath}`);

  // Read config
  const configPath = path.join(source, ".wcp", "config.yaml");
  if (!fs.existsSync(configPath)) {
    console.error(`[wcp-migrate] ERROR: config.yaml not found at ${configPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = yaml.load(raw) as WcpConfig;

  // Initialize database
  const db = initDatabase(dbPath);

  const insertNs = db.prepare(
    "INSERT OR REPLACE INTO namespaces (key, name, description, next_id) VALUES (?, ?, ?, ?)",
  );
  const insertExtension = db.prepare(
    "INSERT OR IGNORE INTO namespace_schema_extensions (namespace_key, field, value) VALUES (?, ?, ?)",
  );
  const insertItem = db.prepare(
    `INSERT OR REPLACE INTO items
     (id, namespace_key, title, status, priority, type, project, assignee, parent, body, activity, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertArtifact = db.prepare(
    `INSERT OR REPLACE INTO artifacts
     (item_id, filename, type, title, url, content, approval, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let nsCount = 0;
  let itemCount = 0;
  let artifactCount = 0;
  let extensionCount = 0;

  // Migrate namespaces
  const migrateAll = db.transaction(() => {
    for (const [key, ns] of Object.entries(config.namespaces)) {
      insertNs.run(key, ns.name, ns.description || "", ns.next);
      nsCount++;

      // Migrate schema extensions
      if (ns.schema?.statuses) {
        for (const status of ns.schema.statuses) {
          insertExtension.run(key, "status", status);
          extensionCount++;
        }
      }
      if (ns.schema?.artifact_types) {
        for (const at of ns.schema.artifact_types) {
          insertExtension.run(key, "artifact_type", at);
          extensionCount++;
        }
      }
    }

    // Migrate items and artifacts for each namespace
    for (const nsKey of Object.keys(config.namespaces)) {
      const nsDir = path.join(source, nsKey);
      if (!fs.existsSync(nsDir)) continue;

      const entries = fs.readdirSync(nsDir);
      for (const entry of entries) {
        // Work item files: {ID}.md (e.g., WCP-19.md)
        if (!entry.endsWith(".md")) continue;
        const id = entry.slice(0, -3); // Remove .md

        const itemPath = path.join(nsDir, entry);
        const content = fs.readFileSync(itemPath, "utf-8");
        const parsed = parseWorkItem(content);
        const fm = parsed.frontmatter;

        insertItem.run(
          id,
          nsKey,
          fm.title || id,
          fm.status || "backlog",
          fm.priority || null,
          fm.type || null,
          fm.project || null,
          fm.assignee || null,
          fm.parent || null,
          parsed.body,
          parsed.activity,
          fm.created || "",
          fm.updated || "",
        );
        itemCount++;

        // Migrate artifacts from companion directory
        const artifactDir = path.join(nsDir, id);
        if (fs.existsSync(artifactDir) && fs.statSync(artifactDir).isDirectory()) {
          const artifactFiles = fs.readdirSync(artifactDir);
          const fmArtifacts: Artifact[] = fm.artifacts || [];

          for (const artFile of artifactFiles) {
            const artPath = path.join(artifactDir, artFile);
            if (!fs.statSync(artPath).isFile()) continue;

            const artContent = fs.readFileSync(artPath, "utf-8");
            const url = `${nsKey}/${id}/${artFile}`;

            // Find metadata from work item frontmatter
            const meta = fmArtifacts.find((a) => a.url === url);

            // Parse artifact frontmatter for approval fields
            const artParsed = matter(artContent);
            const approval = artParsed.data.approval ? String(artParsed.data.approval) : null;
            const approvedAt = artParsed.data.pipeline_approved_at
              ? String(artParsed.data.pipeline_approved_at)
              : null;

            insertArtifact.run(
              id,
              artFile,
              meta?.type || "unknown",
              meta?.title || artFile,
              url,
              artContent,
              approval,
              approvedAt,
            );
            artifactCount++;
          }
        }
      }
    }
  });

  migrateAll();
  db.close();

  console.log(`[wcp-migrate] Migration complete:`);
  console.log(`  Namespaces: ${nsCount}`);
  console.log(`  Items: ${itemCount}`);
  console.log(`  Artifacts: ${artifactCount}`);
  console.log(`  Schema extensions: ${extensionCount}`);
}

const { source, db } = parseArgs();
migrate(source, db);
