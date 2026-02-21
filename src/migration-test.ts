/**
 * WCP Filesystem→SQLite Migration Tests (WCP-19 M5)
 *
 * Tests the migration script that imports existing filesystem data
 * (config.yaml + .md files) into a SQLite database.
 *
 * This test exercises the migration against the real wcp-data directory
 * and verifies the resulting SQLite database via the server API.
 *
 * Will fail because the migration script doesn't exist yet — expected TDD behavior.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(process.env.HOME || "~", "projects", "wcp-data");

const SERVER_URL =
  process.env.WCP_SERVER_URL || "http://localhost:3000";

async function migrationTest() {
  console.log(`\n=== WCP Filesystem→SQLite Migration Tests (WCP-19 M5) ===`);
  console.log(`Data path: ${DATA_PATH}`);
  console.log(`Server URL: ${SERVER_URL}\n`);

  let pass = 0;
  let fail = 0;

  function check(label: string, ok: boolean, detail?: string) {
    if (ok) {
      console.log(`  PASS  ${label}`);
      pass++;
    } else {
      console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
      fail++;
    }
  }

  async function request(
    method: string,
    apiPath: string,
    body?: any,
  ): Promise<{ status: number; json: any }> {
    const res = await fetch(`${SERVER_URL}${apiPath}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  // ── Pre-check: Verify filesystem data exists ──────────────────────────
  console.log("\n0. Pre-check: Filesystem data");

  const configPath = path.join(DATA_PATH, ".wcp", "config.yaml");
  check(
    "config.yaml exists",
    fs.existsSync(configPath),
  );

  // ── 1. Run migration script ───────────────────────────────────────────
  console.log("\n1. Run migration script");

  // The migration script is at packages/server/src/migrate-fs.ts
  // It reads from DATA_PATH and writes to a SQLite database.
  // We run it as a subprocess and verify it succeeds.
  const { execSync } = await import("child_process");

  const testDbPath = path.join(os.tmpdir(), `wcp-migration-test-${Date.now()}.db`);

  try {
    const output = execSync(
      `npx tsx packages/server/src/migrate-fs.ts --source "${DATA_PATH}" --db "${testDbPath}"`,
      { encoding: "utf-8", timeout: 30000 },
    );
    check("migration script exits successfully", true);
    check(
      "migration script produces output",
      output.length > 0,
    );

    // ── 2. Verify namespaces migrated ─────────────────────────────────────
    console.log("\n2. Namespaces migrated");

    // Start the server against the migrated database and verify via API.
    // For now, we verify the database file was created.
    check(
      "SQLite database file created",
      fs.existsSync(testDbPath),
    );

    // Use better-sqlite3 to verify database contents directly.
    // This import will fail if better-sqlite3 is not installed — expected TDD.
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(testDbPath, { readonly: true });

    // Check namespaces
    const namespaces = db.prepare("SELECT * FROM namespaces").all() as any[];
    check(
      "namespaces table has rows",
      namespaces.length > 0,
    );

    // The filesystem config should have at least WCP, PIPE, and other namespaces
    const nsKeys = namespaces.map((n: any) => n.key);
    check(
      "WCP namespace migrated",
      nsKeys.includes("WCP"),
    );

    // Verify namespace fields
    const wcpNs = namespaces.find((n: any) => n.key === "WCP");
    check(
      "namespace has name",
      typeof wcpNs?.name === "string" && wcpNs.name.length > 0,
    );
    check(
      "namespace has description",
      typeof wcpNs?.description === "string",
    );
    check(
      "namespace has next_id counter",
      typeof wcpNs?.next_id === "number" && wcpNs.next_id > 0,
    );

    // ── 3. Verify items migrated ──────────────────────────────────────────
    console.log("\n3. Items migrated");

    const items = db.prepare("SELECT * FROM items").all() as any[];
    check("items table has rows", items.length > 0);

    // WCP-19 should exist (the very item we're working on)
    const wcp19 = items.find((i: any) => i.id === "WCP-19");
    check("WCP-19 item migrated", wcp19 !== undefined);
    check(
      "WCP-19 has correct title",
      wcp19?.title?.includes("Server adapter"),
    );
    check("WCP-19 has status", typeof wcp19?.status === "string");
    check("WCP-19 has created date", typeof wcp19?.created === "string");
    check("WCP-19 has updated date", typeof wcp19?.updated === "string");
    check(
      "WCP-19 has namespace_key",
      wcp19?.namespace_key === "WCP",
    );

    // Verify body migrated
    check(
      "WCP-19 body migrated",
      typeof wcp19?.body === "string" && wcp19.body.length > 0,
    );

    // ── 4. Verify activity logs migrated ──────────────────────────────────
    console.log("\n4. Activity logs migrated");

    check(
      "WCP-19 activity migrated",
      typeof wcp19?.activity === "string" && wcp19.activity.length > 0,
    );
    check(
      "WCP-19 activity contains expected content",
      wcp19?.activity?.includes("pipeline") || wcp19?.activity?.includes("claude"),
    );

    // ── 5. Verify artifacts migrated ──────────────────────────────────────
    console.log("\n5. Artifacts migrated");

    const artifacts = db.prepare("SELECT * FROM artifacts").all() as any[];
    check("artifacts table has rows", artifacts.length > 0);

    // WCP-19 has multiple artifacts (prd.md, architecture-proposal.md, etc.)
    const wcp19Artifacts = artifacts.filter(
      (a: any) => a.item_id === "WCP-19",
    );
    check(
      "WCP-19 artifacts migrated",
      wcp19Artifacts.length > 0,
    );

    // Verify artifact fields
    const prdArtifact = wcp19Artifacts.find(
      (a: any) => a.filename === "prd.md",
    );
    check("PRD artifact migrated", prdArtifact !== undefined);
    check(
      "artifact has type",
      typeof prdArtifact?.type === "string",
    );
    check(
      "artifact has title",
      typeof prdArtifact?.title === "string",
    );
    check(
      "artifact has URL",
      prdArtifact?.url?.includes("WCP-19/prd.md"),
    );
    check(
      "artifact has content",
      typeof prdArtifact?.content === "string" && prdArtifact.content.length > 0,
    );

    // ── 6. Verify schema extensions migrated ────────────────────────────
    console.log("\n6. Schema extensions migrated");

    const extensions = db
      .prepare("SELECT * FROM namespace_schema_extensions")
      .all() as any[];
    // Extensions may or may not exist depending on current config
    check(
      "namespace_schema_extensions table exists",
      true, // If we got here, the table exists (query didn't throw)
    );

    // ── 7. Verify schema versioning ─────────────────────────────────────
    console.log("\n7. Schema versioning");

    const meta = db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as any;
    check("schema_version exists in meta", meta !== undefined);
    check(
      "schema_version is 1",
      meta?.value === "1",
    );

    // ── 8. Idempotency — re-run migration ───────────────────────────────
    console.log("\n8. Idempotency");

    db.close();

    const output2 = execSync(
      `npx tsx packages/server/src/migrate-fs.ts --source "${DATA_PATH}" --db "${testDbPath}"`,
      { encoding: "utf-8", timeout: 30000 },
    );
    check("migration re-run exits successfully", true);

    // Verify counts haven't doubled
    const db2 = new Database(testDbPath, { readonly: true });
    const itemCount2 = (
      db2.prepare("SELECT COUNT(*) as count FROM items").get() as any
    )?.count;
    const itemCount1 = items.length;
    check(
      "idempotent: item count unchanged after re-run",
      itemCount2 === itemCount1,
    );

    const nsCount2 = (
      db2.prepare("SELECT COUNT(*) as count FROM namespaces").get() as any
    )?.count;
    check(
      "idempotent: namespace count unchanged after re-run",
      nsCount2 === namespaces.length,
    );

    db2.close();

    // ── Cleanup ─────────────────────────────────────────────────────────
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  } catch (err: any) {
    // Migration script failed or module not found — expected TDD behavior
    check(
      "migration script runs",
      false,
      err.message?.includes("MODULE_NOT_FOUND") || err.message?.includes("Cannot find")
        ? "migration script not yet implemented"
        : err.message,
    );
  }

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

migrationTest().catch((err) => {
  console.error("Migration test crashed:", err);
  process.exit(1);
});
