import { Hono } from "hono";
import type { Context, Next } from "hono";
import { SqliteAdapter } from "./adapter.js";
import { SSEBroker } from "./sse.js";
import {
  WcpError,
  parseCallsign,
} from "@wcp/shared";

export function createApp(adapter: SqliteAdapter, broker: SSEBroker, apiKey?: string): Hono {
  const app = new Hono();

  // Global error handler — maps WCP errors to HTTP status codes
  app.onError((err, c) => {
    if (err instanceof WcpError) {
      if (err.code === "NOT_FOUND" || err.code === "NAMESPACE_NOT_FOUND") {
        return c.json({ error: err.code, message: err.message }, 404);
      }
      if (err.code === "VALIDATION_ERROR") {
        return c.json({ error: err.code, message: err.message }, 400);
      }
      return c.json({ error: err.code, message: err.message }, 500);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[wcp] Unexpected error:", err);
    return c.json({ error: "INTERNAL_ERROR", message }, 500);
  });

  // --- Auth middleware ---

  if (apiKey) {
    app.use("/api/*", async (c: Context, next: Next) => {
      // SSE endpoint accepts token as query param
      if (c.req.path === "/api/events") {
        const queryToken = c.req.query("token");
        if (queryToken === apiKey) return next();
      }

      const authHeader = c.req.header("Authorization");
      if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
        return c.json({ error: "UNAUTHORIZED", message: "Invalid or missing API key" }, 401);
      }
      return next();
    });
  }

  // --- SSE endpoint ---

  app.get("/api/events", (c) => {
    let clientId: string;

    const stream = new ReadableStream({
      start(controller) {
        clientId = broker.addClient(controller);
      },
      cancel() {
        broker.removeClient(clientId);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });

  // --- Namespace endpoints ---

  app.get("/api/namespaces", async (c) => {
    const namespaces = await adapter.listNamespaces();
    return c.json({ namespaces, count: namespaces.length });
  });

  app.post("/api/namespaces", async (c) => {
    const body = await c.req.json();
    const namespace = await adapter.createNamespace(
      body.key,
      body.name,
      body.description,
    );
    broker.emit("namespace_created", { key: namespace.key });
    return c.json({ created: true, namespace }, 201);
  });

  // --- Item endpoints ---

  // --- All items across namespaces (UI-009) ---

  app.get("/api/items", async (c) => {
    const query = c.req.query();
    const filters: Record<string, string> = {};
    if (query.status) filters.status = query.status;
    if (query.priority) filters.priority = query.priority;
    if (query.type) filters.type = query.type;
    if (query.project) filters.project = query.project;
    if (query.assignee) filters.assignee = query.assignee;
    if (query.parent) filters.parent = query.parent;

    const items = adapter.listAllItems(
      Object.keys(filters).length ? filters : undefined,
    );
    return c.json({ items, count: items.length });
  });

  app.get("/api/namespaces/:namespace/items", async (c) => {
    const namespace = c.req.param("namespace");
    const query = c.req.query();
    const filters: Record<string, string> = {};
    if (query.status) filters.status = query.status;
    if (query.priority) filters.priority = query.priority;
    if (query.type) filters.type = query.type;
    if (query.project) filters.project = query.project;
    if (query.assignee) filters.assignee = query.assignee;
    if (query.parent) filters.parent = query.parent;

    const items = await adapter.listItems(
      namespace,
      Object.keys(filters).length ? filters : undefined,
    );
    return c.json({ items, count: items.length });
  });

  app.post("/api/namespaces/:namespace/items", async (c) => {
    const namespace = c.req.param("namespace");
    const body = await c.req.json();
    const id = await adapter.createItem(namespace, body);
    broker.emit("item_created", { id, namespace });
    broker.emit("namespace_updated", { key: namespace });
    return c.json({ id }, 201);
  });

  app.get("/api/items/:id", async (c) => {
    const id = c.req.param("id");
    parseCallsign(id); // validates format — throws ValidationError for malformed
    const item = await adapter.getItem(id);
    return c.json({ item });
  });

  app.patch("/api/items/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    await adapter.updateItem(id, body);
    const { namespace } = parseCallsign(id);
    broker.emit("item_updated", { id, namespace });
    return c.json({ updated: true });
  });

  // --- Comment endpoint ---

  app.post("/api/items/:id/comments", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    await adapter.addComment(id, body.author, body.body);
    const { namespace } = parseCallsign(id);
    broker.emit("item_updated", { id, namespace });
    return c.json({ commented: true });
  });

  // --- Artifact endpoints ---

  app.post("/api/items/:id/artifacts", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const artifact = await adapter.attachArtifact(id, body);
    const { namespace } = parseCallsign(id);
    broker.emit("item_updated", { id, namespace });
    return c.json({ attached: true, artifact }, 201);
  });

  app.get("/api/items/:id/artifacts/:filename", async (c) => {
    const id = c.req.param("id");
    const filename = c.req.param("filename");
    const result = await adapter.getArtifact(id, filename);
    return c.json(result);
  });

  app.post("/api/items/:id/artifacts/:filename/approve", async (c) => {
    const id = c.req.param("id");
    const filename = c.req.param("filename");
    const body = await c.req.json();
    await adapter.approveArtifact(id, { filename, verdict: body.verdict });
    const { namespace } = parseCallsign(id);
    broker.emit("item_updated", { id, namespace });
    return c.json({ approved: true, verdict: body.verdict });
  });

  // --- Schema endpoints ---

  app.get("/api/schema", async (c) => {
    const schema = await adapter.getSchema();
    return c.json({ schema, namespace: null });
  });

  app.get("/api/schema/:namespace", async (c) => {
    const namespace = c.req.param("namespace");
    const schema = await adapter.getSchema(namespace);
    return c.json({ schema, namespace });
  });

  app.patch("/api/schema/:namespace", async (c) => {
    const namespace = c.req.param("namespace");
    const body = await c.req.json();
    const result = await adapter.updateSchema(namespace, {
      addStatuses: body.add_statuses,
      removeStatuses: body.remove_statuses,
      addArtifactTypes: body.add_artifact_types,
      removeArtifactTypes: body.remove_artifact_types,
    });
    broker.emit("schema_updated", { namespace });
    return c.json({
      updated: true,
      changes: result.changes,
      schema: result.schema,
    });
  });

  return app;
}
