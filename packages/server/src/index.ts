import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { initDatabase } from "./db.js";
import { SqliteAdapter } from "./adapter.js";
import { createApp } from "./routes.js";
import { SSEBroker } from "./sse.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const DB_PATH = process.env.WCP_DB_PATH || "wcp.db";

console.error(`[wcp] Database: ${DB_PATH}`);
const db = initDatabase(DB_PATH);
const adapter = new SqliteAdapter(db);
const broker = new SSEBroker();
const app = createApp(adapter, broker);

// Serve static files from public directory
app.use("/*", serveStatic({ root: "./packages/server/public" }));

// SPA fallback — serve index.html for unmatched GET requests
app.get("/*", serveStatic({ root: "./packages/server/public", path: "index.html" }));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.error(`[wcp] Server listening on http://localhost:${PORT}`);
});
