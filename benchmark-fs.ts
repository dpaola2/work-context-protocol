/**
 * WCP Filesystem Adapter Benchmark
 *
 * Measures latency of each WcpAdapter method on the filesystem adapter.
 * Creates a temporary data directory with seeded items, runs N iterations
 * per operation, and reports p50/p95/p99 stats in microseconds.
 *
 * Usage:
 *   npx tsx benchmark-fs.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import yaml from "js-yaml";
import { FilesystemAdapter } from "./packages/mcp/src/adapters/filesystem.js";

const ITERATIONS = 100;

// ── Setup: create a temporary WCP data directory with seed data ──────────

function setupTempData(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wcp-bench-"));

  // Create .wcp/config.yaml
  const wcpDir = path.join(tmpDir, ".wcp");
  fs.mkdirSync(wcpDir, { recursive: true });

  const config = {
    namespaces: {
      BENCH: { name: "Benchmark", description: "Benchmark namespace", next: 1 },
      SEED: { name: "Seed Data", description: "Pre-seeded namespace for read benchmarks", next: 51 },
    },
  };
  fs.writeFileSync(path.join(wcpDir, "config.yaml"), yaml.dump(config), "utf-8");

  // Create SEED namespace with 50 items of varying sizes
  const seedDir = path.join(tmpDir, "SEED");
  fs.mkdirSync(seedDir, { recursive: true });

  for (let i = 1; i <= 50; i++) {
    const status = i % 5 === 0 ? "done" : i % 3 === 0 ? "in_progress" : "backlog";
    const priority = ["low", "medium", "high", "urgent"][i % 4];
    const body = "Description line.\n".repeat(5 + (i % 20));
    const activity = Array.from(
      { length: Math.min(i, 10) },
      (_, j) => `**user${j}** — 2025-01-${String(j + 1).padStart(2, "0")} 10:00\nComment number ${j + 1} on item ${i}.`,
    ).join("\n\n");

    const content = `---
id: SEED-${i}
title: Seed item number ${i}
status: ${status}
priority: ${priority}
type: chore
created: 2025-01-01
updated: 2025-01-15
---

${body}

---activity---

${activity}
`;
    fs.writeFileSync(path.join(seedDir, `SEED-${i}.md`), content, "utf-8");
  }

  // Create one item with many artifacts
  const richDir = path.join(seedDir, "SEED-1");
  fs.mkdirSync(richDir, { recursive: true });
  const smallArtifact = "# Small ADR\n\nDecision: use filesystem.\n";
  const largeArtifact = "# Large Gameplan\n\n" + "Step details paragraph. ".repeat(200) + "\n";
  fs.writeFileSync(path.join(richDir, "adr.md"), smallArtifact, "utf-8");
  fs.writeFileSync(path.join(richDir, "gameplan.md"), largeArtifact, "utf-8");

  // Register artifacts in SEED-1's frontmatter
  const seed1Path = path.join(seedDir, "SEED-1.md");
  const seed1Content = fs.readFileSync(seed1Path, "utf-8");
  const updatedContent = seed1Content.replace(
    "type: chore",
    `type: chore
artifacts:
  - type: adr
    title: Small ADR
    url: SEED/SEED-1/adr.md
  - type: plan
    title: Large Gameplan
    url: SEED/SEED-1/gameplan.md`,
  );
  fs.writeFileSync(seed1Path, updatedContent, "utf-8");

  return tmpDir;
}

// ── Timing helpers ──────────────────────────────────────────────────────

interface TimingResult {
  name: string;
  times: number[];
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(name: string, times: number[]): TimingResult {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    name,
    times: sorted,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: times.reduce((a, b) => a + b, 0) / times.length,
  };
}

async function bench(name: string, fn: () => Promise<void>, n = ITERATIONS): Promise<TimingResult> {
  const times: number[] = [];
  // Warmup (3 calls, not counted — lets OS cache file pages)
  for (let w = 0; w < 3; w++) {
    try { await fn(); } catch { /* ignore warmup errors */ }
  }

  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await fn();
    const elapsed = (performance.now() - start) * 1000; // convert ms → µs
    times.push(elapsed);
  }
  return stats(name, times);
}

function fmt(us: number): string {
  if (us >= 1000) return `${(us / 1000).toFixed(2)}ms`;
  return `${us.toFixed(0)}µs`;
}

// ── Benchmark suite ─────────────────────────────────────────────────────

async function run() {
  const tmpDir = setupTempData();
  const adapter = new FilesystemAdapter(tmpDir);

  console.log(`\nWCP Filesystem Adapter Benchmark`);
  console.log(`Data path: ${tmpDir}`);
  console.log(`Seed data: 50 items in SEED namespace`);
  console.log(`Iterations: ${ITERATIONS} per operation (+ 3 warmup)\n`);

  const results: TimingResult[] = [];

  // ── Read operations ─────────────────────────────────────────────────

  console.log("Benchmarking read operations...");

  results.push(await bench("listNamespaces", async () => {
    await adapter.listNamespaces();
  }));

  results.push(await bench("listItems (SEED, no filter)", async () => {
    await adapter.listItems("SEED");
  }));

  results.push(await bench("listItems (SEED, status=done)", async () => {
    await adapter.listItems("SEED", { status: "done" });
  }));

  results.push(await bench("listAllItems (no filter)", async () => {
    await adapter.listAllItems();
  }));

  results.push(await bench("getItem (small: SEED-2)", async () => {
    await adapter.getItem("SEED-2");
  }));

  results.push(await bench("getItem (large: SEED-50)", async () => {
    await adapter.getItem("SEED-50");
  }));

  results.push(await bench("getSchema (global)", async () => {
    await adapter.getSchema();
  }));

  results.push(await bench("getSchema (namespace: SEED)", async () => {
    await adapter.getSchema("SEED");
  }));

  // ── Artifact reads ────────────────────────────────────────────────

  console.log("Benchmarking artifact reads...");

  results.push(await bench("getArtifact (small ADR)", async () => {
    await adapter.getArtifact("SEED-1", "adr.md");
  }));

  results.push(await bench("getArtifact (large gameplan)", async () => {
    await adapter.getArtifact("SEED-1", "gameplan.md");
  }));

  // ── Write operations ──────────────────────────────────────────────

  console.log("Benchmarking write operations...");

  // Create a temp item to benchmark updates/comments against
  const testItemId = await adapter.createItem("BENCH", {
    title: "Benchmark temp item",
    type: "chore",
    body: "Created by filesystem benchmark. Safe to delete.",
  });
  console.log(`  Created temp item: ${testItemId}`);

  results.push(await bench("createItem", async () => {
    await adapter.createItem("BENCH", {
      title: `Bench item ${Date.now()}`,
      type: "chore",
      body: "Benchmark iteration.",
    });
  }));

  results.push(await bench("updateItem (status)", async () => {
    await adapter.updateItem(testItemId, { status: "in_progress" });
  }));

  results.push(await bench("updateItem (multi-field)", async () => {
    await adapter.updateItem(testItemId, {
      status: "in_progress",
      assignee: "bench",
      priority: "low",
    });
  }));

  results.push(await bench("addComment", async () => {
    await adapter.addComment(testItemId, "benchmark", `Iteration at ${Date.now()}`);
  }));

  results.push(await bench("attachArtifact (small)", async () => {
    await adapter.attachArtifact(testItemId, {
      type: "plan",
      title: "Bench artifact",
      filename: "bench.md",
      content: "# Benchmark\n\nSmall artifact content for timing.",
    });
  }));

  const largeContent = "# Large Artifact\n\n" + "Lorem ipsum dolor sit amet. ".repeat(500);
  results.push(await bench("attachArtifact (large ~14KB)", async () => {
    await adapter.attachArtifact(testItemId, {
      type: "plan",
      title: "Large bench artifact",
      filename: "bench-large.md",
      content: largeContent,
    });
  }));

  results.push(await bench("approveArtifact", async () => {
    await adapter.approveArtifact(testItemId, {
      filename: "bench.md",
      verdict: "approved",
    });
  }));

  // ── Output ────────────────────────────────────────────────────────

  console.log("\n");
  console.log("## Results\n");
  console.log("| Operation | p50 | p95 | p99 | min | max | mean |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of results) {
    console.log(
      `| ${r.name} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${fmt(r.min)} | ${fmt(r.max)} | ${fmt(r.mean)} |`,
    );
  }

  // Summary
  const allReads = results.filter((r) =>
    r.name.startsWith("list") || r.name.startsWith("get"),
  );
  const allWrites = results.filter(
    (r) =>
      r.name.startsWith("create") ||
      r.name.startsWith("update") ||
      r.name.startsWith("add") ||
      r.name.startsWith("attach") ||
      r.name.startsWith("approve"),
  );

  const avgRead = allReads.reduce((s, r) => s + r.mean, 0) / allReads.length;
  const avgWrite = allWrites.reduce((s, r) => s + r.mean, 0) / allWrites.length;

  console.log("\n## Summary\n");
  console.log(`- Average read latency (mean): ${fmt(avgRead)}`);
  console.log(`- Average write latency (mean): ${fmt(avgWrite)}`);
  console.log(`- Iterations per operation: ${ITERATIONS}`);

  // Flag slow operations (> 10ms for filesystem is notable)
  const slow = results.filter((r) => r.p50 > 10000);
  if (slow.length > 0) {
    console.log("\n### Slow operations (p50 > 10ms)\n");
    for (const r of slow) {
      console.log(`- **${r.name}**: p50=${fmt(r.p50)}`);
    }
  }

  // Cleanup temp directory
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n> Temp directory cleaned up: ${tmpDir}`);
  console.log("Done.\n");
}

run().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
