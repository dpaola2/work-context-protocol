import { serve } from "@hono/node-server";
import { initDatabase } from "./db.js";
import { SqliteAdapter } from "./adapter.js";
import { createApp } from "./routes.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const DB_PATH = process.env.WCP_DB_PATH || "wcp.db";

console.error(`[wcp] Database: ${DB_PATH}`);
const db = initDatabase(DB_PATH);
const adapter = new SqliteAdapter(db);
const app = createApp(adapter);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.error(`[wcp] Server listening on http://localhost:${PORT}`);
});
