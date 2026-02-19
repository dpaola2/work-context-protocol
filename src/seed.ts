import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import type { WcpConfig } from "./config.js";
import { serializeWorkItem } from "./parser.js";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(process.env.HOME || "~", "projects", "wcp-data");

function seed() {
  console.log(`Seeding WCP data at: ${DATA_PATH}`);

  // Create directory structure
  fs.mkdirSync(path.join(DATA_PATH, ".wcp"), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, "PIPE"), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, "SN"), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, "OS"), { recursive: true });

  // Write config
  const configPath = path.join(DATA_PATH, ".wcp", "config.yaml");
  if (fs.existsSync(configPath)) {
    console.log("  config.yaml already exists, skipping config.");
  } else {
    const config: WcpConfig = {
      namespaces: {
        PIPE: {
          name: "Pipeline Skills",
          description: "Agent pipeline framework development",
          next: 3,
        },
        SN: {
          name: "Show Notes",
          description: "AI podcast summarizer",
          next: 2,
        },
        OS: {
          name: "Operating System",
          description: "Personal OS tooling and improvements",
          next: 1,
        },
      },
    };
    fs.writeFileSync(configPath, yaml.dump(config), "utf-8");
    console.log("  Created .wcp/config.yaml");
  }

  // Seed PIPE items
  writeIfMissing(
    path.join(DATA_PATH, "PIPE", "PIPE-1.md"),
    serializeWorkItem({
      frontmatter: {
        id: "PIPE-1",
        title: "Design pipeline skill discovery",
        status: "done",
        priority: "high",
        type: "feature",
        project: "pipeline-mvp",
        assignee: "dave",
        created: "2026-02-18",
        updated: "2026-02-18",
      },
      body: "Research and design how pipeline skills are discovered and registered.\n\n## Acceptance Criteria\n\n- [x] Skills are auto-discovered from ~/.claude/skills/\n- [x] Each skill has a manifest with name, description, triggers",
      activity:
        '**dave** — 2026-02-18T09:00:00-05:00\nStarted design work.\n\n**dave** — 2026-02-18T16:00:00-05:00\nDesign complete. Moving to implementation.',
    }),
  );

  writeIfMissing(
    path.join(DATA_PATH, "PIPE", "PIPE-2.md"),
    serializeWorkItem({
      frontmatter: {
        id: "PIPE-2",
        title: "Implement WCP MCP server",
        status: "in_progress",
        priority: "high",
        type: "feature",
        project: "wcp-mvp",
        assignee: "dave",
        created: "2026-02-19",
        updated: "2026-02-19",
        artifacts: [
          { type: "prd", title: "WCP PRD", url: "projects/wcp/prd.md" },
        ],
      },
      body: "Build the MCP server that exposes WCP tools for reading and writing work items.\n\n## Acceptance Criteria\n\n- [ ] All 6 MCP tools functional\n- [ ] Filesystem adapter with markdown storage\n- [ ] Adapter pattern for future backends",
      activity:
        "**dave** — 2026-02-19T09:30:00-05:00\nKicked off project. PRD and architecture complete.",
    }),
  );

  // Seed SN item
  writeIfMissing(
    path.join(DATA_PATH, "SN", "SN-1.md"),
    serializeWorkItem({
      frontmatter: {
        id: "SN-1",
        title: "Add transcript chunking for long episodes",
        status: "backlog",
        priority: "medium",
        type: "feature",
        project: "show-notes",
        created: "2026-02-19",
        updated: "2026-02-19",
      },
      body: "Long podcast episodes (>2hrs) exceed context windows. Need to chunk transcripts and summarize in passes.",
      activity: "",
    }),
  );

  console.log("Seed complete.");
}

function writeIfMissing(filePath: string, content: string) {
  const name = path.basename(filePath);
  if (fs.existsSync(filePath)) {
    console.log(`  ${name} already exists, skipping.`);
  } else {
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`  Created ${name}`);
  }
}

seed();
