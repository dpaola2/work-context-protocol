import type Database from "better-sqlite3";
import type {
  WcpAdapter,
  Namespace,
  ItemSummary,
  WorkItem,
  Artifact,
  ArtifactContent,
  CreateItemInput,
  UpdateItemInput,
  AttachArtifactInput,
  ApproveArtifactInput,
  ItemFilters,
  ResolvedSchema,
  SchemaUpdateInput,
  SchemaUpdateResult,
} from "@wcp/shared";
import {
  DEFAULT_SCHEMA,
  NotFoundError,
  NamespaceNotFoundError,
  ValidationError,
  validateStatus,
  validatePriority,
  validateType,
  validateArtifactType,
  validateVerdict,
  parseCallsign,
  today,
  now,
} from "@wcp/shared";

interface NamespaceRow {
  key: string;
  name: string;
  description: string;
  next_id: number;
}

interface ItemRow {
  id: string;
  namespace_key: string;
  title: string;
  status: string;
  priority: string | null;
  type: string | null;
  project: string | null;
  assignee: string | null;
  parent: string | null;
  body: string;
  activity: string;
  created: string;
  updated: string;
}

interface ArtifactRow {
  item_id: string;
  filename: string;
  type: string;
  title: string;
  url: string;
  content: string;
  approval: string | null;
  approved_at: string | null;
}

interface SchemaExtRow {
  field: string;
  value: string;
}

export class SqliteAdapter implements WcpAdapter {
  constructor(private db: Database.Database) {}

  private resolveSchemaForNamespace(namespace?: string): ResolvedSchema {
    const extensions: SchemaExtRow[] = namespace
      ? (this.db
          .prepare(
            "SELECT field, value FROM namespace_schema_extensions WHERE namespace_key = ?",
          )
          .all(namespace) as SchemaExtRow[])
      : [];

    const statusExtensions = extensions
      .filter((e) => e.field === "status")
      .map((e) => e.value);
    const artifactExtensions = extensions
      .filter((e) => e.field === "artifact_type")
      .map((e) => e.value);

    return {
      status: {
        defaults: [...DEFAULT_SCHEMA.status],
        extensions: statusExtensions,
        all: [...DEFAULT_SCHEMA.status, ...statusExtensions],
      },
      priority: { values: [...DEFAULT_SCHEMA.priority] },
      type: { values: [...DEFAULT_SCHEMA.type] },
      artifact_type: {
        defaults: [...DEFAULT_SCHEMA.artifact_type],
        extensions: artifactExtensions,
        all: [...DEFAULT_SCHEMA.artifact_type, ...artifactExtensions],
      },
    };
  }

  private requireNamespace(key: string): NamespaceRow {
    const row = this.db
      .prepare("SELECT * FROM namespaces WHERE key = ?")
      .get(key) as NamespaceRow | undefined;
    if (!row) throw new NamespaceNotFoundError(key);
    return row;
  }

  private requireItem(id: string): ItemRow {
    const row = this.db
      .prepare("SELECT * FROM items WHERE id = ?")
      .get(id) as ItemRow | undefined;
    if (!row) throw new NotFoundError(id);
    return row;
  }

  private getArtifactsForItem(itemId: string): Artifact[] {
    return this.db
      .prepare("SELECT type, title, url FROM artifacts WHERE item_id = ?")
      .all(itemId) as Artifact[];
  }

  async listNamespaces(): Promise<Namespace[]> {
    const rows = this.db
      .prepare(
        `SELECT n.key, n.name, n.description,
                (SELECT COUNT(*) FROM items WHERE namespace_key = n.key) as itemCount
         FROM namespaces n
         ORDER BY n.key`,
      )
      .all() as Array<{ key: string; name: string; description: string; itemCount: number }>;

    return rows.map((r) => ({
      key: r.key,
      name: r.name,
      description: r.description,
      itemCount: r.itemCount,
    }));
  }

  async listItems(
    namespace: string,
    filters?: ItemFilters,
  ): Promise<ItemSummary[]> {
    this.requireNamespace(namespace);

    let sql = "SELECT * FROM items WHERE namespace_key = ?";
    const params: unknown[] = [namespace];

    if (filters?.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    if (filters?.priority) {
      sql += " AND priority = ?";
      params.push(filters.priority);
    }
    if (filters?.type) {
      sql += " AND type = ?";
      params.push(filters.type);
    }
    if (filters?.project) {
      sql += " AND project = ?";
      params.push(filters.project);
    }
    if (filters?.assignee) {
      sql += " AND assignee = ?";
      params.push(filters.assignee);
    }
    if (filters?.parent) {
      sql += " AND parent = ?";
      params.push(filters.parent);
    }

    sql += " ORDER BY updated DESC";

    const rows = this.db.prepare(sql).all(...params) as ItemRow[];

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority ?? undefined,
      type: r.type ?? undefined,
      project: r.project ?? undefined,
      assignee: r.assignee ?? undefined,
      parent: r.parent ?? undefined,
      created: r.created,
      updated: r.updated,
    }));
  }

  async getItem(id: string): Promise<WorkItem> {
    parseCallsign(id);
    const row = this.requireItem(id);
    const artifacts = this.getArtifactsForItem(id);

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority ?? undefined,
      type: row.type ?? undefined,
      project: row.project ?? undefined,
      assignee: row.assignee ?? undefined,
      parent: row.parent ?? undefined,
      created: row.created,
      updated: row.updated,
      body: row.body,
      activity: row.activity,
      artifacts,
    };
  }

  async createItem(
    namespace: string,
    input: CreateItemInput,
  ): Promise<string> {
    const ns = this.requireNamespace(namespace);
    const schema = this.resolveSchemaForNamespace(namespace);
    const status = input.status || "backlog";
    validateStatus(status, schema.status.all);
    if (input.priority) validatePriority(input.priority, schema.priority.values);
    if (input.type) validateType(input.type, schema.type.values);

    const id = `${namespace}-${ns.next_id}`;
    const todayStr = today();

    this.db.transaction(() => {
      this.db
        .prepare("UPDATE namespaces SET next_id = next_id + 1 WHERE key = ?")
        .run(namespace);

      this.db
        .prepare(
          `INSERT INTO items (id, namespace_key, title, status, priority, type, project, assignee, parent, body, created, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          namespace,
          input.title,
          status,
          input.priority ?? null,
          input.type ?? null,
          input.project ?? null,
          input.assignee ?? null,
          input.parent ?? null,
          input.body || "",
          todayStr,
          todayStr,
        );
    })();

    return id;
  }

  async updateItem(id: string, changes: UpdateItemInput): Promise<void> {
    const { namespace } = parseCallsign(id);
    this.requireNamespace(namespace);
    const row = this.requireItem(id);

    const schema = this.resolveSchemaForNamespace(namespace);
    if (changes.status) validateStatus(changes.status, schema.status.all);
    if (changes.priority)
      validatePriority(changes.priority, schema.priority.values);
    if (changes.type) validateType(changes.type, schema.type.values);

    // Auto-log status transition
    let activity = row.activity;
    if (changes.status !== undefined && changes.status !== row.status) {
      const timestamp = now();
      const entry = `**system** — ${timestamp}\nStatus changed: ${row.status} → ${changes.status}`;
      activity = activity ? activity + "\n\n" + entry : entry;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (changes.title !== undefined) {
      updates.push("title = ?");
      params.push(changes.title);
    }
    if (changes.status !== undefined) {
      updates.push("status = ?");
      params.push(changes.status);
    }
    if (changes.priority !== undefined) {
      updates.push("priority = ?");
      params.push(changes.priority);
    }
    if (changes.type !== undefined) {
      updates.push("type = ?");
      params.push(changes.type);
    }
    if (changes.project !== undefined) {
      updates.push("project = ?");
      params.push(changes.project);
    }
    if (changes.assignee !== undefined) {
      updates.push("assignee = ?");
      params.push(changes.assignee);
    }
    if (changes.parent !== undefined) {
      updates.push("parent = ?");
      params.push(changes.parent);
    }
    if (changes.body !== undefined) {
      updates.push("body = ?");
      params.push(changes.body);
    }

    // Always update activity (may have status transition entry) and timestamp
    updates.push("activity = ?");
    params.push(activity);
    updates.push("updated = ?");
    params.push(today());

    params.push(id);

    this.db
      .prepare(`UPDATE items SET ${updates.join(", ")} WHERE id = ?`)
      .run(...params);
  }

  async addComment(id: string, author: string, body: string): Promise<void> {
    if (!body || body.trim() === "") {
      throw new ValidationError("body", "Comment body cannot be empty");
    }

    const { namespace } = parseCallsign(id);
    this.requireNamespace(namespace);
    const row = this.requireItem(id);

    const timestamp = now();
    const comment = `**${author}** — ${timestamp}\n${body.trim()}`;
    const activity = row.activity
      ? row.activity + "\n\n" + comment
      : comment;

    this.db
      .prepare("UPDATE items SET activity = ?, updated = ? WHERE id = ?")
      .run(activity, today(), id);
  }

  async attachArtifact(
    id: string,
    input: AttachArtifactInput,
  ): Promise<Artifact> {
    if (!input.filename || input.filename.trim() === "") {
      throw new ValidationError(
        "filename",
        "Artifact filename cannot be empty",
      );
    }
    if (!input.content) {
      throw new ValidationError(
        "content",
        "Artifact content cannot be empty",
      );
    }

    const { namespace } = parseCallsign(id);
    this.requireNamespace(namespace);
    this.requireItem(id);

    const schema = this.resolveSchemaForNamespace(namespace);
    validateArtifactType(input.type, schema.artifact_type.all);

    const url = `${namespace}/${id}/${input.filename}`;
    const artifact: Artifact = {
      type: input.type,
      title: input.title,
      url,
    };

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO artifacts (item_id, filename, type, title, url, content)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(item_id, filename) DO UPDATE SET
             type = excluded.type,
             title = excluded.title,
             url = excluded.url,
             content = excluded.content`,
        )
        .run(id, input.filename, input.type, input.title, url, input.content);

      this.db
        .prepare("UPDATE items SET updated = ? WHERE id = ?")
        .run(today(), id);
    })();

    return artifact;
  }

  async getArtifact(id: string, filename: string): Promise<ArtifactContent> {
    if (!filename || filename.trim() === "") {
      throw new ValidationError(
        "filename",
        "Artifact filename cannot be empty",
      );
    }

    parseCallsign(id);
    this.requireItem(id);

    const row = this.db
      .prepare(
        "SELECT * FROM artifacts WHERE item_id = ? AND filename = ?",
      )
      .get(id, filename) as ArtifactRow | undefined;

    if (!row) {
      throw new NotFoundError(
        `Artifact '${filename}' not found for ${id}`,
      );
    }

    return {
      artifact: { type: row.type, title: row.title, url: row.url },
      content: row.content,
    };
  }

  async approveArtifact(
    id: string,
    input: ApproveArtifactInput,
  ): Promise<void> {
    const { namespace } = parseCallsign(id);
    this.requireNamespace(namespace);
    this.requireItem(id);

    validateVerdict(input.verdict);

    const artRow = this.db
      .prepare(
        "SELECT * FROM artifacts WHERE item_id = ? AND filename = ?",
      )
      .get(id, input.filename) as ArtifactRow | undefined;

    if (!artRow) {
      throw new NotFoundError(
        `Artifact '${input.filename}' not found for ${id}`,
      );
    }

    const timestamp = now();
    const approvedAt = input.verdict === "approved" ? timestamp : null;

    // Update artifact content to include approval frontmatter
    const updatedContent = setApprovalInContent(
      artRow.content,
      input.verdict,
      timestamp,
    );

    this.db
      .prepare(
        "UPDATE artifacts SET approval = ?, approved_at = ?, content = ? WHERE item_id = ? AND filename = ?",
      )
      .run(input.verdict, approvedAt, updatedContent, id, input.filename);

    // Log in activity
    const item = this.db
      .prepare("SELECT activity FROM items WHERE id = ?")
      .get(id) as { activity: string };

    const entry = `**system** — ${timestamp}\nArtifact ${input.filename}: ${input.verdict}`;
    const activity = item.activity
      ? item.activity + "\n\n" + entry
      : entry;

    this.db
      .prepare("UPDATE items SET activity = ?, updated = ? WHERE id = ?")
      .run(activity, today(), id);
  }

  async createNamespace(
    key: string,
    name: string,
    description: string,
  ): Promise<Namespace> {
    if (!/^[A-Z][A-Z0-9]*$/.test(key)) {
      throw new ValidationError(
        "namespace",
        `Invalid namespace key '${key}'. Must be uppercase letters/numbers, starting with a letter (e.g. 'PROJ').`,
      );
    }

    const existing = this.db
      .prepare("SELECT key FROM namespaces WHERE key = ?")
      .get(key);
    if (existing) {
      throw new ValidationError(
        "namespace",
        `Namespace '${key}' already exists.`,
      );
    }

    this.db
      .prepare(
        "INSERT INTO namespaces (key, name, description, next_id) VALUES (?, ?, ?, 1)",
      )
      .run(key, name, description);

    return { key, name, description, itemCount: 0 };
  }

  async getSchema(namespace?: string): Promise<ResolvedSchema> {
    if (namespace) {
      this.requireNamespace(namespace);
    }
    return this.resolveSchemaForNamespace(namespace);
  }

  async updateSchema(
    namespace: string,
    changes: SchemaUpdateInput,
  ): Promise<SchemaUpdateResult> {
    this.requireNamespace(namespace);

    const result: Record<string, string[]> = {};

    this.db.transaction(() => {
      if (changes.addStatuses?.length) {
        const added: string[] = [];
        for (const s of changes.addStatuses) {
          if (DEFAULT_SCHEMA.status.includes(s)) continue;
          const existing = this.db
            .prepare(
              "SELECT value FROM namespace_schema_extensions WHERE namespace_key = ? AND field = 'status' AND value = ?",
            )
            .get(namespace, s);
          if (existing) continue;
          this.db
            .prepare(
              "INSERT INTO namespace_schema_extensions (namespace_key, field, value) VALUES (?, 'status', ?)",
            )
            .run(namespace, s);
          added.push(s);
        }
        result.added_statuses = added;
      }

      if (changes.removeStatuses?.length) {
        for (const s of changes.removeStatuses) {
          if (DEFAULT_SCHEMA.status.includes(s)) {
            throw new ValidationError(
              "status",
              `Cannot remove default status '${s}'. Only namespace extensions can be removed.`,
            );
          }
        }
        const removed: string[] = [];
        for (const s of changes.removeStatuses) {
          const info = this.db
            .prepare(
              "DELETE FROM namespace_schema_extensions WHERE namespace_key = ? AND field = 'status' AND value = ?",
            )
            .run(namespace, s);
          if (info.changes > 0) removed.push(s);
        }
        result.removed_statuses = removed;
      }

      if (changes.addArtifactTypes?.length) {
        const added: string[] = [];
        for (const t of changes.addArtifactTypes) {
          if (DEFAULT_SCHEMA.artifact_type.includes(t)) continue;
          const existing = this.db
            .prepare(
              "SELECT value FROM namespace_schema_extensions WHERE namespace_key = ? AND field = 'artifact_type' AND value = ?",
            )
            .get(namespace, t);
          if (existing) continue;
          this.db
            .prepare(
              "INSERT INTO namespace_schema_extensions (namespace_key, field, value) VALUES (?, 'artifact_type', ?)",
            )
            .run(namespace, t);
          added.push(t);
        }
        result.added_artifact_types = added;
      }

      if (changes.removeArtifactTypes?.length) {
        for (const t of changes.removeArtifactTypes) {
          if (DEFAULT_SCHEMA.artifact_type.includes(t)) {
            throw new ValidationError(
              "artifact_type",
              `Cannot remove default artifact type '${t}'. Only namespace extensions can be removed.`,
            );
          }
        }
        const removed: string[] = [];
        for (const t of changes.removeArtifactTypes) {
          const info = this.db
            .prepare(
              "DELETE FROM namespace_schema_extensions WHERE namespace_key = ? AND field = 'artifact_type' AND value = ?",
            )
            .run(namespace, t);
          if (info.changes > 0) removed.push(t);
        }
        result.removed_artifact_types = removed;
      }
    })();

    const schema = this.resolveSchemaForNamespace(namespace);
    return { changes: result, schema };
  }
}

/**
 * Modifies artifact content to include approval frontmatter.
 * Matches the filesystem adapter's behavior of setting approval/pipeline_approved_at
 * in the artifact's YAML frontmatter.
 */
function setApprovalInContent(
  content: string,
  verdict: string,
  timestamp: string,
): string {
  if (content.startsWith("---\n")) {
    const endIdx = content.indexOf("\n---", 4);
    if (endIdx === -1) {
      return prependApproval(content, verdict, timestamp);
    }

    const fmLines = content
      .substring(4, endIdx)
      .split("\n")
      .filter(
        (line) =>
          !line.startsWith("approval:") &&
          !line.startsWith("pipeline_approved_at:"),
      );

    fmLines.push(`approval: ${verdict}`);
    if (verdict === "approved") {
      fmLines.push(`pipeline_approved_at: '${timestamp}'`);
    }

    const body = content.substring(endIdx + 4);
    return `---\n${fmLines.filter((l) => l.trim()).join("\n")}\n---${body}`;
  }
  return prependApproval(content, verdict, timestamp);
}

function prependApproval(
  content: string,
  verdict: string,
  timestamp: string,
): string {
  let fm = `approval: ${verdict}`;
  if (verdict === "approved") {
    fm += `\npipeline_approved_at: '${timestamp}'`;
  }
  return `---\n${fm}\n---\n${content}`;
}
