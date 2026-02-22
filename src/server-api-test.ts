/**
 * WCP Server API Tests (WCP-19 M2 + M5)
 *
 * Exercises all 12 REST API endpoints, error handling, schema validation,
 * auth middleware, status auto-logging, and database behavior.
 *
 * Expects the WCP server running at SERVER_URL.
 * Will fail if the server is not running — expected TDD behavior.
 */

const SERVER_URL =
  process.env.WCP_SERVER_URL || "http://localhost:3000";

async function serverApiTest() {
  console.log(`\n=== WCP Server API Tests (WCP-19 M2 + M5) ===`);
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
    token?: string,
  ): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${SERVER_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  // ── 1. GET /api/namespaces — initial state ────────────────────────────
  console.log("\n1. API-001: GET /api/namespaces");

  const nsListRes = await request("GET", "/api/namespaces");
  check("returns 200", nsListRes.status === 200);
  check(
    "response has namespaces array",
    Array.isArray(nsListRes.json.namespaces),
  );
  check("response has count field", typeof nsListRes.json.count === "number");

  // ── 2. POST /api/namespaces — create namespace ────────────────────────
  console.log("\n2. API-001/API-010: POST /api/namespaces");

  const createNsRes = await request("POST", "/api/namespaces", {
    key: "SRVTEST",
    name: "Server Test",
    description: "Test namespace for server API tests",
  });
  check("returns 201", createNsRes.status === 201);
  check("response has created flag", createNsRes.json.created === true);
  check(
    "returned namespace key matches",
    createNsRes.json.namespace?.key === "SRVTEST",
  );
  check(
    "returned namespace name matches",
    createNsRes.json.namespace?.name === "Server Test",
  );
  check(
    "returned namespace itemCount is 0",
    createNsRes.json.namespace?.itemCount === 0,
  );

  // Verify it appears in list
  const nsListAfter = await request("GET", "/api/namespaces");
  check(
    "new namespace in list",
    nsListAfter.json.namespaces?.some(
      (n: any) => n.key === "SRVTEST",
    ),
  );

  // ── 3. POST /api/namespaces — error cases ─────────────────────────────
  console.log("\n3. API-002/API-003: POST /api/namespaces — errors");

  const dupNsRes = await request("POST", "/api/namespaces", {
    key: "SRVTEST",
    name: "Duplicate",
    description: "Should fail",
  });
  check("duplicate key returns 400", dupNsRes.status === 400);
  check(
    "error format: has error code",
    dupNsRes.json.error === "VALIDATION_ERROR",
  );
  check(
    "error format: has message",
    typeof dupNsRes.json.message === "string",
  );

  const badKeyRes = await request("POST", "/api/namespaces", {
    key: "lowercase",
    name: "Bad",
    description: "Invalid key",
  });
  check("invalid key returns 400", badKeyRes.status === 400);

  // ── 4. POST /api/namespaces/:ns/items — create item ──────────────────
  console.log("\n4. API-001/API-007: POST /api/namespaces/:ns/items");

  const createItemRes = await request(
    "POST",
    "/api/namespaces/SRVTEST/items",
    {
      title: "Server test item",
      type: "chore",
      body: "Created by server API test.",
    },
  );
  check("returns 201", createItemRes.status === 201);
  check(
    "returns callsign",
    /^SRVTEST-\d+$/.test(createItemRes.json.id),
  );
  const testItemId = createItemRes.json.id;

  // API-007: Atomic counter — create a second item
  const createItem2Res = await request(
    "POST",
    "/api/namespaces/SRVTEST/items",
    { title: "Second item" },
  );
  check(
    "API-007: second item has incremented ID",
    createItem2Res.json.id !== testItemId,
  );

  // ── 5. GET /api/namespaces/:ns/items — list items ────────────────────
  console.log("\n5. API-001: GET /api/namespaces/:ns/items");

  const listRes = await request("GET", "/api/namespaces/SRVTEST/items");
  check("returns 200", listRes.status === 200);
  check("response has items array", Array.isArray(listRes.json.items));
  check("items count matches", listRes.json.count >= 2);
  check(
    "created item in list",
    listRes.json.items?.some((i: any) => i.id === testItemId),
  );

  // Filter by status
  const filteredRes = await request(
    "GET",
    "/api/namespaces/SRVTEST/items?status=backlog",
  );
  check(
    "filter by status works",
    filteredRes.json.items?.every((i: any) => i.status === "backlog"),
  );

  // Non-existent namespace
  const noNsRes = await request("GET", "/api/namespaces/NOPE/items");
  check(
    "API-003: non-existent namespace returns 404",
    noNsRes.status === 404,
  );
  check(
    "API-003: error code is NAMESPACE_NOT_FOUND",
    noNsRes.json.error === "NAMESPACE_NOT_FOUND",
  );

  // ── 6. GET /api/items/:id — get item detail ──────────────────────────
  console.log("\n6. API-001: GET /api/items/:id");

  const getRes = await request("GET", `/api/items/${testItemId}`);
  check("returns 200", getRes.status === 200);
  check("has item object", getRes.json.item !== undefined);
  check("item id matches", getRes.json.item?.id === testItemId);
  check(
    "item title matches",
    getRes.json.item?.title === "Server test item",
  );
  check(
    "item status defaults to backlog",
    getRes.json.item?.status === "backlog",
  );
  check(
    "item body preserved",
    getRes.json.item?.body === "Created by server API test.",
  );
  check("item has created date", typeof getRes.json.item?.created === "string");
  check("item has updated date", typeof getRes.json.item?.updated === "string");
  check(
    "item has artifacts array",
    Array.isArray(getRes.json.item?.artifacts),
  );
  check(
    "item has activity string",
    typeof getRes.json.item?.activity === "string",
  );

  // Non-existent item
  const noItemRes = await request("GET", "/api/items/SRVTEST-9999");
  check("API-003: non-existent item returns 404", noItemRes.status === 404);
  check(
    "API-003: error code is NOT_FOUND",
    noItemRes.json.error === "NOT_FOUND",
  );

  // ── 7. PATCH /api/items/:id — update item ────────────────────────────
  console.log("\n7. API-001/API-005/API-006: PATCH /api/items/:id");

  const updateRes = await request("PATCH", `/api/items/${testItemId}`, {
    status: "in_progress",
    assignee: "server-test",
  });
  check("returns 200", updateRes.status === 200);
  check("response has updated flag", updateRes.json.updated === true);

  // Verify changes persisted
  const afterUpdate = await request("GET", `/api/items/${testItemId}`);
  check(
    "status updated",
    afterUpdate.json.item?.status === "in_progress",
  );
  check(
    "assignee set",
    afterUpdate.json.item?.assignee === "server-test",
  );

  // API-005: Status transition auto-logged
  check(
    "API-005: activity contains status transition",
    afterUpdate.json.item?.activity?.includes("Status changed"),
  );
  check(
    "API-005: transition shows old and new status",
    afterUpdate.json.item?.activity?.includes("backlog → in_progress"),
  );

  // API-006: Updated timestamp
  check(
    "API-006: updated date is set",
    typeof afterUpdate.json.item?.updated === "string" &&
      afterUpdate.json.item.updated.length > 0,
  );

  // API-002: Schema validation — invalid status
  const badStatusRes = await request("PATCH", `/api/items/${testItemId}`, {
    status: "invalid_status",
  });
  check(
    "API-002: invalid status returns 400",
    badStatusRes.status === 400,
  );
  check(
    "API-002: validation error code",
    badStatusRes.json.error === "VALIDATION_ERROR",
  );

  // ── 8. POST /api/items/:id/comments — add comment ────────────────────
  console.log("\n8. API-001: POST /api/items/:id/comments");

  const commentRes = await request(
    "POST",
    `/api/items/${testItemId}/comments`,
    {
      author: "server-test",
      body: "This is a test comment from the server API test.",
    },
  );
  check("returns 200", commentRes.status === 200);
  check("response has commented flag", commentRes.json.commented === true);

  // Verify comment in activity
  const afterComment = await request("GET", `/api/items/${testItemId}`);
  check(
    "activity contains comment author",
    afterComment.json.item?.activity?.includes("server-test"),
  );
  check(
    "activity contains comment body",
    afterComment.json.item?.activity?.includes(
      "This is a test comment from the server API test.",
    ),
  );

  // Empty comment rejected
  const emptyCommentRes = await request(
    "POST",
    `/api/items/${testItemId}/comments`,
    { author: "test", body: "" },
  );
  check("empty comment returns 400", emptyCommentRes.status === 400);

  // ── 9. POST /api/items/:id/artifacts — attach artifact ────────────────
  console.log("\n9. API-001/API-008: POST /api/items/:id/artifacts");

  const attachRes = await request(
    "POST",
    `/api/items/${testItemId}/artifacts`,
    {
      type: "prd",
      title: "Test PRD",
      filename: "prd.md",
      content: "# Test PRD\n\nThis is a test PRD for server API tests.",
    },
  );
  check("returns 201", attachRes.status === 201);
  check("response has attached flag", attachRes.json.attached === true);
  check(
    "response has artifact metadata",
    attachRes.json.artifact?.type === "prd",
  );
  check(
    "artifact URL has correct format",
    attachRes.json.artifact?.url?.includes(`${testItemId}/prd.md`),
  );

  // Verify artifact registered on item
  const afterAttach = await request("GET", `/api/items/${testItemId}`);
  check(
    "API-008: artifact registered in item",
    afterAttach.json.item?.artifacts?.some(
      (a: any) => a.url?.includes("prd.md"),
    ),
  );

  // Overwrite existing artifact
  const overwriteRes = await request(
    "POST",
    `/api/items/${testItemId}/artifacts`,
    {
      type: "prd",
      title: "Updated PRD",
      filename: "prd.md",
      content: "# Updated PRD\n\nRevised content.",
    },
  );
  check("overwrite returns 201", overwriteRes.status === 201);
  check(
    "overwritten title updated",
    overwriteRes.json.artifact?.title === "Updated PRD",
  );

  // Invalid artifact type
  const badTypeRes = await request(
    "POST",
    `/api/items/${testItemId}/artifacts`,
    {
      type: "bogus-type",
      title: "Bad",
      filename: "bad.md",
      content: "nope",
    },
  );
  check(
    "API-002: invalid artifact type returns 400",
    badTypeRes.status === 400,
  );

  // ── 10. GET /api/items/:id/artifacts/:filename — get artifact ─────────
  console.log("\n10. API-001/API-008: GET /api/items/:id/artifacts/:filename");

  const getArtRes = await request(
    "GET",
    `/api/items/${testItemId}/artifacts/prd.md`,
  );
  check("returns 200", getArtRes.status === 200);
  check(
    "API-008: content from database",
    getArtRes.json.content?.includes("Updated PRD"),
  );
  check(
    "artifact metadata returned",
    getArtRes.json.artifact?.type === "prd",
  );

  // Non-existent artifact
  const noArtRes = await request(
    "GET",
    `/api/items/${testItemId}/artifacts/nope.md`,
  );
  check("missing artifact returns 404", noArtRes.status === 404);

  // ── 11. POST /api/items/:id/artifacts/:fn/approve — approve artifact ──
  console.log("\n11. API-001: POST /api/items/:id/artifacts/:fn/approve");

  const approveRes = await request(
    "POST",
    `/api/items/${testItemId}/artifacts/prd.md/approve`,
    { verdict: "approved" },
  );
  check("returns 200", approveRes.status === 200);
  check("response has approved flag", approveRes.json.approved === true);
  check("response has verdict", approveRes.json.verdict === "approved");

  // Verify approval persisted in artifact content
  const approvedArt = await request(
    "GET",
    `/api/items/${testItemId}/artifacts/prd.md`,
  );
  check(
    "approval set in artifact",
    approvedArt.json.content?.includes("approved"),
  );

  // Verify activity log entry
  const afterApprove = await request("GET", `/api/items/${testItemId}`);
  check(
    "approval logged in activity",
    afterApprove.json.item?.activity?.includes("Artifact prd.md: approved"),
  );

  // Invalid verdict
  const badVerdictRes = await request(
    "POST",
    `/api/items/${testItemId}/artifacts/prd.md/approve`,
    { verdict: "maybe" },
  );
  check("invalid verdict returns 400", badVerdictRes.status === 400);

  // ── 12. GET /api/schema — global schema ───────────────────────────────
  console.log("\n12. API-001/API-009: GET /api/schema");

  const schemaRes = await request("GET", "/api/schema");
  check("returns 200", schemaRes.status === 200);
  check("has schema object", schemaRes.json.schema !== undefined);
  check(
    "status has defaults",
    schemaRes.json.schema?.status?.defaults?.includes("backlog"),
  );
  check(
    "priority has values",
    schemaRes.json.schema?.priority?.values?.includes("high"),
  );
  check("namespace is null for global", schemaRes.json.namespace === null);

  // ── 13. GET /api/schema/:namespace — namespace schema ─────────────────
  console.log("\n13. API-009: GET /api/schema/:namespace");

  const nsSchemaRes = await request("GET", "/api/schema/SRVTEST");
  check("returns 200", nsSchemaRes.status === 200);
  check(
    "has namespace-specific schema",
    nsSchemaRes.json.schema !== undefined,
  );
  check(
    "includes default statuses",
    nsSchemaRes.json.schema?.status?.defaults?.includes("backlog"),
  );

  // ── 14. PATCH /api/schema/:namespace — update schema ──────────────────
  console.log("\n14. API-009: PATCH /api/schema/:namespace");

  const updateSchemaRes = await request("PATCH", "/api/schema/SRVTEST", {
    add_statuses: ["deployed"],
    add_artifact_types: ["release-notes"],
  });
  check("returns 200", updateSchemaRes.status === 200);
  check(
    "response has updated flag",
    updateSchemaRes.json.updated === true,
  );
  check(
    "changes include added statuses",
    updateSchemaRes.json.changes?.added_statuses?.includes("deployed"),
  );
  check(
    "updated schema includes deployed",
    updateSchemaRes.json.schema?.status?.all?.includes("deployed"),
  );

  // Verify custom status is now valid for items
  const customStatusRes = await request(
    "PATCH",
    `/api/items/${testItemId}`,
    { status: "deployed" },
  );
  check(
    "API-009: custom status accepted after schema update",
    customStatusRes.status === 200,
  );

  // Cannot remove default status
  const removeDefaultRes = await request("PATCH", "/api/schema/SRVTEST", {
    remove_statuses: ["done"],
  });
  check(
    "cannot remove default status returns 400",
    removeDefaultRes.status === 400,
  );

  // ── 15. Error response format consistency ─────────────────────────────
  console.log("\n15. API-003: Error response format");

  // 404 — item not found
  const notFoundRes = await request("GET", "/api/items/SRVTEST-9999");
  check(
    "404 has error field",
    typeof notFoundRes.json.error === "string",
  );
  check(
    "404 has message field",
    typeof notFoundRes.json.message === "string",
  );

  // 400 — validation error
  const validationRes = await request(
    "PATCH",
    `/api/items/${testItemId}`,
    { priority: "super" },
  );
  check(
    "400 validation has error field",
    validationRes.json.error === "VALIDATION_ERROR",
  );
  check(
    "400 validation has message field",
    typeof validationRes.json.message === "string",
  );

  // ── 16. API-005: Status transition auto-log ───────────────────────────
  console.log("\n16. API-005: Status transition details");

  // Change status again to verify transition logged
  await request("PATCH", `/api/items/${testItemId}`, {
    status: "done",
  });
  const transitionItem = await request("GET", `/api/items/${testItemId}`);
  check(
    "API-005: second transition logged",
    transitionItem.json.item?.activity?.includes("deployed → done"),
  );

  // Same-status update should NOT produce transition entry
  await request("PATCH", `/api/items/${testItemId}`, {
    status: "done",
  });
  const sameStatusItem = await request("GET", `/api/items/${testItemId}`);
  const transitionCount = (
    sameStatusItem.json.item?.activity?.match(/Status changed:/g) || []
  ).length;
  // Should have exactly 3: backlog→in_progress, in_progress→deployed, deployed→done
  check(
    "API-005: same-status update produces no extra entry",
    transitionCount === 3,
  );

  // ── 17. API-006: Updated timestamp on all mutations ───────────────────
  console.log("\n17. API-006: Updated timestamp");

  const beforeMutation = await request("GET", `/api/items/${testItemId}`);
  const beforeUpdated = beforeMutation.json.item?.updated;

  await request("POST", `/api/items/${testItemId}/comments`, {
    author: "timestamp-test",
    body: "Testing updated timestamp.",
  });
  const afterMutation = await request("GET", `/api/items/${testItemId}`);
  check(
    "API-006: updated timestamp is a date string",
    /^\d{4}-\d{2}-\d{2}$/.test(afterMutation.json.item?.updated),
  );

  // ── 18. API-007: Atomic namespace counter ─────────────────────────────
  console.log("\n18. API-007: Atomic namespace counter");

  // Create items and verify sequential IDs
  const id1 = (
    await request("POST", "/api/namespaces/SRVTEST/items", {
      title: "Counter test 1",
    })
  ).json.id;
  const id2 = (
    await request("POST", "/api/namespaces/SRVTEST/items", {
      title: "Counter test 2",
    })
  ).json.id;

  const num1 = parseInt(id1.split("-")[1], 10);
  const num2 = parseInt(id2.split("-")[1], 10);
  check("API-007: sequential IDs", num2 === num1 + 1);

  // ── 19. Create with all optional fields ───────────────────────────────
  console.log("\n19. Create with all optional fields");

  const fullCreateRes = await request(
    "POST",
    "/api/namespaces/SRVTEST/items",
    {
      title: "Full item",
      status: "todo",
      priority: "high",
      type: "feature",
      project: "test-project",
      assignee: "dave",
      parent: testItemId,
      body: "# Full item\n\nWith all fields set.",
    },
  );
  check("full create returns 201", fullCreateRes.status === 201);

  const fullItem = await request(
    "GET",
    `/api/items/${fullCreateRes.json.id}`,
  );
  check(
    "status set on create",
    fullItem.json.item?.status === "todo",
  );
  check(
    "priority set on create",
    fullItem.json.item?.priority === "high",
  );
  check(
    "type set on create",
    fullItem.json.item?.type === "feature",
  );
  check(
    "project set on create",
    fullItem.json.item?.project === "test-project",
  );
  check(
    "assignee set on create",
    fullItem.json.item?.assignee === "dave",
  );
  check(
    "parent set on create",
    fullItem.json.item?.parent === testItemId,
  );
  check(
    "body set on create",
    fullItem.json.item?.body?.includes("Full item"),
  );

  // ── 20. Namespace item count updates ──────────────────────────────────
  console.log("\n20. Namespace item count");

  const nsWithItems = await request("GET", "/api/namespaces");
  const srvNs = nsWithItems.json.namespaces?.find(
    (n: any) => n.key === "SRVTEST",
  );
  check(
    "namespace itemCount reflects created items",
    srvNs?.itemCount >= 5,
  );

  // ── 21. List items — filter combinations ──────────────────────────────
  console.log("\n21. List items — filter combinations");

  const byPriority = await request(
    "GET",
    "/api/namespaces/SRVTEST/items?priority=high",
  );
  check(
    "filter by priority",
    byPriority.json.items?.every((i: any) => i.priority === "high"),
  );

  const byType = await request(
    "GET",
    "/api/namespaces/SRVTEST/items?type=feature",
  );
  check(
    "filter by type",
    byType.json.items?.every((i: any) => i.type === "feature"),
  );

  const byAssignee = await request(
    "GET",
    "/api/namespaces/SRVTEST/items?assignee=dave",
  );
  check(
    "filter by assignee",
    byAssignee.json.items?.every((i: any) => i.assignee === "dave"),
  );

  const byParent = await request(
    "GET",
    `/api/namespaces/SRVTEST/items?parent=${testItemId}`,
  );
  check(
    "filter by parent",
    byParent.json.items?.every((i: any) => i.parent === testItemId),
  );

  // ── 22. Update body preserves activity ────────────────────────────────
  console.log("\n22. Update body preserves activity");

  await request("POST", `/api/items/${testItemId}/comments`, {
    author: "body-test",
    body: "Comment before body update.",
  });
  await request("PATCH", `/api/items/${testItemId}`, {
    body: "New body content after update.",
  });
  const afterBodyUpdate = await request(
    "GET",
    `/api/items/${testItemId}`,
  );
  check(
    "body replaced",
    afterBodyUpdate.json.item?.body === "New body content after update.",
  );
  check(
    "activity preserved after body update",
    afterBodyUpdate.json.item?.activity?.includes(
      "Comment before body update.",
    ),
  );

  // ── 23. Create in non-existent namespace ──────────────────────────────
  console.log("\n23. Error: create in non-existent namespace");

  const noNsCreateRes = await request("POST", "/api/namespaces/NOPE/items", {
    title: "Should fail",
  });
  check(
    "create in non-existent namespace returns 404",
    noNsCreateRes.status === 404,
  );

  // ── 24. Malformed callsign ────────────────────────────────────────────
  console.log("\n24. Error: malformed callsign");

  const malformedRes = await request("GET", "/api/items/bad-callsign");
  check(
    "malformed callsign returns 400",
    malformedRes.status === 400,
  );

  const lowercaseRes = await request("GET", "/api/items/srvtest-1");
  check(
    "lowercase callsign returns 400",
    lowercaseRes.status === 400,
  );

  // ── 25. Auth — bearer token (M5) ─────────────────────────────────────
  console.log("\n25. Auth: bearer token (M5)");

  // When WCP_API_KEY is set on the server, unauthenticated requests should fail.
  // We test auth by making a request with and without a token.
  // The test expects the server to be running with WCP_API_KEY=test-key for auth tests.
  const AUTH_KEY = process.env.WCP_TEST_API_KEY || "test-key";

  // Request without token (should fail if auth is enabled)
  const noAuthRes = await request("GET", "/api/namespaces");
  // This will be 200 if auth is disabled (no WCP_API_KEY on server),
  // or 401 if auth is enabled. We test the auth-enabled scenario.
  if (noAuthRes.status === 401) {
    check("auth: unauthenticated request returns 401", true);
    check(
      "auth: 401 response has error",
      noAuthRes.json.error === "UNAUTHORIZED" ||
        typeof noAuthRes.json.error === "string",
    );

    // Request with valid token
    const authRes = await request(
      "GET",
      "/api/namespaces",
      undefined,
      AUTH_KEY,
    );
    check("auth: authenticated request returns 200", authRes.status === 200);

    // Request with wrong token
    const badAuthRes = await request(
      "GET",
      "/api/namespaces",
      undefined,
      "wrong-token",
    );
    check(
      "auth: wrong token returns 401",
      badAuthRes.status === 401,
    );
  } else {
    // Auth is disabled — verify server works without it
    check(
      "auth: disabled mode — request succeeds without token",
      noAuthRes.status === 200,
    );
    console.log(
      "    (Auth tests skipped — server running without WCP_API_KEY)",
    );
  }

  // ── 26. Database edge cases (M7) ─────────────────────────────────────
  console.log("\n26. Edge cases (M7)");

  // Empty filter returns empty list (not an error)
  const emptyFilter = await request(
    "GET",
    "/api/namespaces/SRVTEST/items?status=cancelled",
  );
  check(
    "empty filter returns empty array",
    Array.isArray(emptyFilter.json.items) &&
      emptyFilter.json.items.length === 0,
  );

  // Multiple artifacts on same item
  await request("POST", `/api/items/${testItemId}/artifacts`, {
    type: "architecture",
    title: "Architecture",
    filename: "arch.md",
    content: "# Architecture\n\nTest.",
  });
  const multiArt = await request("GET", `/api/items/${testItemId}`);
  check(
    "multiple artifacts supported",
    multiArt.json.item?.artifacts?.length >= 2,
  );

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

serverApiTest().catch((err) => {
  console.error("Server API test crashed:", err);
  process.exit(1);
});
