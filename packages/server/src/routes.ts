import { Hono } from "hono";
import { SqliteAdapter } from "./adapter.js";
import {
  WcpError,
  parseCallsign,
} from "@wcp/shared";

export function createApp(adapter: SqliteAdapter): Hono {
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
    return c.json({ created: true, namespace }, 201);
  });

  // --- Item endpoints ---

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
    return c.json({ updated: true });
  });

  // --- Comment endpoint ---

  app.post("/api/items/:id/comments", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    await adapter.addComment(id, body.author, body.body);
    return c.json({ commented: true });
  });

  // --- Artifact endpoints ---

  app.post("/api/items/:id/artifacts", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const artifact = await adapter.attachArtifact(id, body);
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
    return c.json({
      updated: true,
      changes: result.changes,
      schema: result.schema,
    });
  });

  return app;
}
