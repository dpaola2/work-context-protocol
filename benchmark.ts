/**
 * WCP HTTP Adapter Benchmark (WCP-35)
 *
 * Measures end-to-end latency of each WcpAdapter method over the HTTP adapter.
 * Runs N iterations per operation and reports p50/p95/p99 stats.
 *
 * Usage:
 *   WCP_SERVER_URL=https://wcp.davepaola.com WCP_API_KEY=<key> npx tsx benchmark.ts
 */

import { HttpAdapter } from "./packages/mcp/src/adapters/http.js";

const SERVER_URL = process.env.WCP_SERVER_URL || "https://wcp.davepaola.com";
const API_KEY = process.env.WCP_API_KEY;
const ITERATIONS = 20;
// Generate a unique namespace key using only uppercase letters
function randomLetters(n: number): string {
  return Array.from({ length: n }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join("");
}
const BENCH_NS = `BN${randomLetters(3)}`; // e.g. BNXYZ

const adapter = new HttpAdapter(SERVER_URL, API_KEY);

// ── Timing helpers ──────────────────────────────────────────────────────────

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
  // Warmup (1 call, not counted)
  try { await fn(); } catch { /* ignore warmup errors */ }

  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return stats(name, times);
}

// ── Benchmark suite ─────────────────────────────────────────────────────────

async function run() {
  console.log(`\nWCP HTTP Adapter Benchmark`);
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Iterations: ${ITERATIONS} per operation (+ 1 warmup)\n`);

  // Measure baseline network latency
  const pingStart = performance.now();
  await fetch(`${SERVER_URL}/api/namespaces`, {
    headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
  });
  const pingMs = (performance.now() - pingStart).toFixed(0);
  console.log(`Baseline fetch to /api/namespaces: ${pingMs}ms\n`);

  const results: TimingResult[] = [];

  // ── Read operations ─────────────────────────────────────────────────────

  console.log("Benchmarking read operations...");

  results.push(await bench("listNamespaces", async () => {
    await adapter.listNamespaces();
  }));

  results.push(await bench("listItems (TEST, no filter)", async () => {
    await adapter.listItems("TEST");
  }));

  results.push(await bench("listItems (WCP, status=done)", async () => {
    await adapter.listItems("WCP", { status: "done" });
  }));

  results.push(await bench("listAllItems (no filter)", async () => {
    await adapter.listAllItems();
  }));

  results.push(await bench("getItem (small: WCP-1)", async () => {
    await adapter.getItem("WCP-1");
  }));

  results.push(await bench("getItem (large: WCP-19)", async () => {
    await adapter.getItem("WCP-19");
  }));

  results.push(await bench("getSchema (global)", async () => {
    await adapter.getSchema();
  }));

  results.push(await bench("getSchema (namespace: WCP)", async () => {
    await adapter.getSchema("WCP");
  }));

  // ── Artifact reads ────────────────────────────────────────────────────

  console.log("Benchmarking artifact reads...");

  // WCP-19 has 16 artifacts — good for benchmarking
  results.push(await bench("getArtifact (small ADR)", async () => {
    await adapter.getArtifact("WCP-19", "adr-1-normalized-sqlite.md");
  }));

  results.push(await bench("getArtifact (large gameplan)", async () => {
    await adapter.getArtifact("WCP-19", "gameplan.md");
  }));

  // ── Write operations ──────────────────────────────────────────────────

  console.log("Benchmarking write operations...");

  // Create a temporary namespace for write benchmarks
  await adapter.createNamespace(BENCH_NS, "Benchmark", "Temporary benchmark namespace");
  console.log(`  Created temp namespace: ${BENCH_NS}`);

  const testItemId = await adapter.createItem(BENCH_NS, {
    title: "Benchmark temp item",
    type: "chore",
    body: "Created by WCP-35 benchmark. Safe to delete.",
  });
  console.log(`  Created temp item: ${testItemId}`);

  results.push(await bench("createItem", async () => {
    await adapter.createItem(BENCH_NS, {
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

  // ── Output ────────────────────────────────────────────────────────────

  console.log("\n");
  console.log("## Results\n");
  console.log("| Operation | p50 | p95 | p99 | min | max | mean |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.p50.toFixed(0)}ms | ${r.p95.toFixed(0)}ms | ${r.p99.toFixed(0)}ms | ${r.min.toFixed(0)}ms | ${r.max.toFixed(0)}ms | ${r.mean.toFixed(0)}ms |`,
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
  const avgWrite =
    allWrites.reduce((s, r) => s + r.mean, 0) / allWrites.length;

  console.log("\n## Summary\n");
  console.log(`- Baseline network RTT: ~${pingMs}ms`);
  console.log(`- Average read latency (mean): ${avgRead.toFixed(0)}ms`);
  console.log(`- Average write latency (mean): ${avgWrite.toFixed(0)}ms`);
  console.log(`- Iterations per operation: ${ITERATIONS}`);

  // Flag slow operations
  const slow = results.filter((r) => r.p50 > 500);
  if (slow.length > 0) {
    console.log("\n### Slow operations (p50 > 500ms)\n");
    for (const r of slow) {
      console.log(`- **${r.name}**: p50=${r.p50.toFixed(0)}ms`);
    }
  }

  console.log(`\n> Note: Temporary namespace ${BENCH_NS} was created with ~21 items.`);
  console.log(`> Clean up via the web dashboard if desired.\n`);
  console.log("Done.");
}

run().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
