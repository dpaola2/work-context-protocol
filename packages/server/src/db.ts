import Database from "better-sqlite3";

const CURRENT_SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO meta (key, value) VALUES ('schema_version', '1');

CREATE TABLE namespaces (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  next_id INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE namespace_schema_extensions (
  namespace_key TEXT NOT NULL REFERENCES namespaces(key) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (namespace_key, field, value)
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  namespace_key TEXT NOT NULL REFERENCES namespaces(key),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT,
  type TEXT,
  project TEXT,
  assignee TEXT,
  parent TEXT,
  body TEXT NOT NULL DEFAULT '',
  activity TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);

CREATE INDEX idx_items_namespace ON items(namespace_key);
CREATE INDEX idx_items_ns_status ON items(namespace_key, status);
CREATE INDEX idx_items_ns_updated ON items(namespace_key, updated DESC);
CREATE INDEX idx_items_ns_priority ON items(namespace_key, priority);
CREATE INDEX idx_items_ns_type ON items(namespace_key, type);
CREATE INDEX idx_items_ns_assignee ON items(namespace_key, assignee);
CREATE INDEX idx_items_parent ON items(parent);

CREATE TABLE artifacts (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT NOT NULL,
  approval TEXT,
  approved_at TEXT,
  PRIMARY KEY (item_id, filename)
);
`;

type Migration = (db: Database.Database) => void;

// Each entry migrates FROM version N TO version N+1.
// Index 0 = v1→v2, index 1 = v2→v3, etc.
const migrations: Migration[] = [];

function getCurrentVersion(db: Database.Database): number {
  const hasMeta = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='meta'",
  ).get();

  if (!hasMeta) return 0;

  const row = db.prepare(
    "SELECT value FROM meta WHERE key = 'schema_version'",
  ).get() as { value: string } | undefined;

  return row ? parseInt(row.value, 10) : 0;
}

function runMigrations(db: Database.Database, fromVersion: number): void {
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = migrations[v - 1];
    db.transaction(() => {
      migrate(db);
      db.prepare(
        "UPDATE meta SET value = ? WHERE key = 'schema_version'",
      ).run(String(v + 1));
    })();
    console.error(`[wcp] Migrated schema v${v} → v${v + 1}`);
  }
}

export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const version = getCurrentVersion(db);

  if (version === 0) {
    db.exec(SCHEMA_V1);
    console.error("[wcp] Created database schema v1");
  } else if (version < CURRENT_SCHEMA_VERSION) {
    runMigrations(db, version);
  } else if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${version} is newer than code version ${CURRENT_SCHEMA_VERSION}. ` +
      `Update the server code.`,
    );
  }

  return db;
}
