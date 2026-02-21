/**
 * WCP SSE Live Update Tests (WCP-19 M4)
 *
 * Tests the Server-Sent Events endpoint for live updates.
 * Verifies that mutations emit the correct events to connected clients.
 *
 * Expects the WCP server running at SERVER_URL.
 * Will fail if the server is not running — expected TDD behavior.
 */

const SERVER_URL =
  process.env.WCP_SERVER_URL || "http://localhost:3000";
const AUTH_KEY = process.env.WCP_TEST_API_KEY;

interface SSEEvent {
  event: string;
  data: any;
}

async function sseTest() {
  console.log(`\n=== WCP SSE Live Update Tests (WCP-19 M4) ===`);
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
    path: string,
    body?: any,
  ): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (AUTH_KEY) headers["Authorization"] = `Bearer ${AUTH_KEY}`;

    const res = await fetch(`${SERVER_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  /**
   * Connect to SSE endpoint and collect events for a given duration.
   * Returns collected events after the timeout.
   */
  function collectSSEEvents(
    durationMs: number,
    token?: string,
  ): Promise<SSEEvent[]> {
    return new Promise(async (resolve, reject) => {
      const events: SSEEvent[] = [];
      const sseUrl = token
        ? `${SERVER_URL}/api/events?token=${token}`
        : `${SERVER_URL}/api/events`;

      const controller = new AbortController();

      try {
        const res = await fetch(sseUrl, {
          headers: AUTH_KEY && !token
            ? { Authorization: `Bearer ${AUTH_KEY}` }
            : {},
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          resolve(events);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Read SSE stream in background
        const readLoop = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Parse SSE events from buffer
              const parts = buffer.split("\n\n");
              buffer = parts.pop() || "";

              for (const part of parts) {
                const lines = part.split("\n");
                let eventName = "message";
                let eventData = "";

                for (const line of lines) {
                  if (line.startsWith("event: ")) {
                    eventName = line.slice(7);
                  } else if (line.startsWith("data: ")) {
                    eventData = line.slice(6);
                  }
                }

                if (eventData) {
                  try {
                    events.push({
                      event: eventName,
                      data: JSON.parse(eventData),
                    });
                  } catch {
                    // Skip non-JSON events
                  }
                }
              }
            }
          } catch {
            // AbortError expected when we close the connection
          }
        };

        readLoop();

        // Close connection after duration
        setTimeout(() => {
          controller.abort();
          resolve(events);
        }, durationMs);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── Setup: Create test namespace ──────────────────────────────────────
  console.log("\n0. Setup");
  await request("POST", "/api/namespaces", {
    key: "SSETEST",
    name: "SSE Test",
    description: "Test namespace for SSE tests",
  });

  // ── 1. SSE connection ─────────────────────────────────────────────────
  console.log("\n1. UI-005: SSE connection");

  const sseUrl = AUTH_KEY
    ? `${SERVER_URL}/api/events?token=${AUTH_KEY}`
    : `${SERVER_URL}/api/events`;
  const sseRes = await fetch(sseUrl, {
    headers: AUTH_KEY ? { Authorization: `Bearer ${AUTH_KEY}` } : {},
  });
  check("SSE endpoint returns 200", sseRes.status === 200);
  check(
    "SSE content-type is text/event-stream",
    sseRes.headers.get("content-type")?.includes("text/event-stream") ?? false,
  );
  // Abort the connection after checking headers
  const sseController = new AbortController();
  sseController.abort();

  // ── 2. item_created event ─────────────────────────────────────────────
  console.log("\n2. UI-005: item_created event");

  // Start collecting events, then trigger a mutation
  const createEventsPromise = collectSSEEvents(2000);

  // Wait a moment for SSE connection to establish
  await new Promise((r) => setTimeout(r, 200));

  const newItem = await request("POST", "/api/namespaces/SSETEST/items", {
    title: "SSE test item",
  });
  const createEvents = await createEventsPromise;

  const itemCreatedEvent = createEvents.find(
    (e) => e.event === "item_created",
  );
  check("item_created event emitted", itemCreatedEvent !== undefined);
  check(
    "item_created has correct id",
    itemCreatedEvent?.data?.id === newItem.id,
  );
  check(
    "item_created has namespace",
    itemCreatedEvent?.data?.namespace === "SSETEST",
  );

  // Also check for namespace_updated (item count changed)
  const nsUpdatedOnCreate = createEvents.find(
    (e) => e.event === "namespace_updated" && e.data?.key === "SSETEST",
  );
  check(
    "namespace_updated emitted on item create",
    nsUpdatedOnCreate !== undefined,
  );

  // ── 3. item_updated event ─────────────────────────────────────────────
  console.log("\n3. UI-005: item_updated event");

  const updateEventsPromise = collectSSEEvents(2000);
  await new Promise((r) => setTimeout(r, 200));

  await request("PATCH", `/api/items/${newItem.id}`, {
    status: "in_progress",
  });
  const updateEvents = await updateEventsPromise;

  const itemUpdatedEvent = updateEvents.find(
    (e) => e.event === "item_updated" && e.data?.id === newItem.id,
  );
  check("item_updated event emitted on update", itemUpdatedEvent !== undefined);
  check(
    "item_updated has namespace",
    itemUpdatedEvent?.data?.namespace === "SSETEST",
  );

  // ── 4. item_updated on addComment ─────────────────────────────────────
  console.log("\n4. UI-005: item_updated on addComment");

  const commentEventsPromise = collectSSEEvents(2000);
  await new Promise((r) => setTimeout(r, 200));

  await request("POST", `/api/items/${newItem.id}/comments`, {
    author: "sse-test",
    body: "Testing SSE on comment.",
  });
  const commentEvents = await commentEventsPromise;

  const commentUpdateEvent = commentEvents.find(
    (e) => e.event === "item_updated" && e.data?.id === newItem.id,
  );
  check(
    "item_updated event emitted on comment",
    commentUpdateEvent !== undefined,
  );

  // ── 5. item_updated on attachArtifact ─────────────────────────────────
  console.log("\n5. UI-005: item_updated on attachArtifact");

  const attachEventsPromise = collectSSEEvents(2000);
  await new Promise((r) => setTimeout(r, 200));

  await request("POST", `/api/items/${newItem.id}/artifacts`, {
    type: "prd",
    title: "SSE Test PRD",
    filename: "prd.md",
    content: "# SSE Test\n\nContent.",
  });
  const attachEvents = await attachEventsPromise;

  const attachUpdateEvent = attachEvents.find(
    (e) => e.event === "item_updated" && e.data?.id === newItem.id,
  );
  check(
    "item_updated event emitted on attach",
    attachUpdateEvent !== undefined,
  );

  // ── 6. item_updated on approveArtifact ────────────────────────────────
  console.log("\n6. UI-005: item_updated on approveArtifact");

  const approveEventsPromise = collectSSEEvents(2000);
  await new Promise((r) => setTimeout(r, 200));

  await request(
    "POST",
    `/api/items/${newItem.id}/artifacts/prd.md/approve`,
    { verdict: "approved" },
  );
  const approveEvents = await approveEventsPromise;

  const approveUpdateEvent = approveEvents.find(
    (e) => e.event === "item_updated" && e.data?.id === newItem.id,
  );
  check(
    "item_updated event emitted on approve",
    approveUpdateEvent !== undefined,
  );

  // ── 7. namespace_created event ────────────────────────────────────────
  console.log("\n7. UI-005: namespace_created event");

  const nsEventsPromise = collectSSEEvents(2000);
  await new Promise((r) => setTimeout(r, 200));

  await request("POST", "/api/namespaces", {
    key: "SSETEST2",
    name: "SSE Test 2",
    description: "Second test namespace",
  });
  const nsEvents = await nsEventsPromise;

  const nsCreatedEvent = nsEvents.find(
    (e) => e.event === "namespace_created" && e.data?.key === "SSETEST2",
  );
  check("namespace_created event emitted", nsCreatedEvent !== undefined);

  // ── 8. schema_updated event ───────────────────────────────────────────
  console.log("\n8. UI-005: schema_updated event");

  const schemaEventsPromise = collectSSEEvents(2000);
  await new Promise((r) => setTimeout(r, 200));

  await request("PATCH", "/api/schema/SSETEST", {
    add_statuses: ["deployed"],
  });
  const schemaEvents = await schemaEventsPromise;

  const schemaUpdatedEvent = schemaEvents.find(
    (e) =>
      e.event === "schema_updated" && e.data?.namespace === "SSETEST",
  );
  check("schema_updated event emitted", schemaUpdatedEvent !== undefined);

  // Cleanup
  await request("PATCH", "/api/schema/SSETEST", {
    remove_statuses: ["deployed"],
  });

  // ── 9. SSE auth — token as query param (M5) ──────────────────────────
  console.log("\n9. SSE auth (M5)");

  if (AUTH_KEY) {
    // SSE with valid token as query param
    const authSseRes = await fetch(
      `${SERVER_URL}/api/events?token=${AUTH_KEY}`,
    );
    check(
      "SSE auth: valid token query param accepted",
      authSseRes.status === 200,
    );

    // SSE without token when auth is required
    const noAuthSseRes = await fetch(`${SERVER_URL}/api/events`);
    check(
      "SSE auth: missing token returns 401",
      noAuthSseRes.status === 401,
    );
  } else {
    console.log("    (SSE auth tests skipped — no WCP_TEST_API_KEY set)");
  }

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

sseTest().catch((err) => {
  console.error("SSE test crashed:", err);
  process.exit(1);
});
