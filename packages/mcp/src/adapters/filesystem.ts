import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import type {
  WcpAdapter,
  WcpConfig,
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
  Document,
  DocumentSummary,
  CreateDocumentInput,
  UpdateDocumentInput,
  DocumentFilters,
} from "@wcp/shared";
import {
  NotFoundError,
  NamespaceNotFoundError,
  ValidationError,
  resolveSchema,
  addNamespaceStatuses,
  removeNamespaceStatuses,
  addNamespaceArtifactTypes,
  removeNamespaceArtifactTypes,
  validateStatus,
  validatePriority,
  validateType,
  validateArtifactType,
  validateVerdict,
  parseCallsign,
  parseDocRef,
  slugify,
  today,
  now,
} from "@wcp/shared";
import { readConfig, writeConfig } from "../config.js";
import { parseWorkItem, serializeWorkItem } from "../parser.js";

export class FilesystemAdapter implements WcpAdapter {
  constructor(private dataPath: string) {
    // Auto-create data directory and config on first run
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    const wcpDir = path.join(dataPath, ".wcp");
    const configPath = path.join(wcpDir, "config.yaml");
    if (!fs.existsSync(configPath)) {
      if (!fs.existsSync(wcpDir)) {
        fs.mkdirSync(wcpDir, { recursive: true });
      }
      const defaultConfig: WcpConfig = { namespaces: {} };
      writeConfig(dataPath, defaultConfig);
    }
  }

  async listNamespaces(): Promise<Namespace[]> {
    const config = readConfig(this.dataPath);
    const namespaces: Namespace[] = [];

    for (const [key, ns] of Object.entries(config.namespaces)) {
      const nsDir = path.join(this.dataPath, key);
      let itemCount = 0;
      if (fs.existsSync(nsDir)) {
        const files = fs.readdirSync(nsDir).filter((f) => f.endsWith(".md"));
        itemCount = files.length;
      }
      const docsDir = path.join(this.dataPath, key, "_docs");
      let docCount = 0;
      if (fs.existsSync(docsDir)) {
        docCount = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md")).length;
      }
      namespaces.push({
        key,
        name: ns.name,
        description: ns.description,
        itemCount,
        docCount,
      });
    }

    return namespaces;
  }

  async listItems(
    namespace: string,
    filters?: ItemFilters,
  ): Promise<ItemSummary[]> {
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const nsDir = path.join(this.dataPath, namespace);
    if (!fs.existsSync(nsDir)) {
      return [];
    }

    const files = fs.readdirSync(nsDir).filter((f) => f.endsWith(".md"));
    const items: ItemSummary[] = [];

    for (const file of files) {
      const filePath = path.join(nsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      try {
        const parsed = parseWorkItem(content);
        const fm = parsed.frontmatter;

        const summary: ItemSummary = {
          id: fm.id,
          title: fm.title,
          status: fm.status,
          priority: fm.priority,
          type: fm.type,
          project: fm.project,
          assignee: fm.assignee,
          parent: fm.parent,
          created: String(fm.created),
          updated: String(fm.updated),
        };

        // Apply filters
        if (filters) {
          if (filters.status && summary.status !== filters.status) continue;
          if (filters.priority && summary.priority !== filters.priority)
            continue;
          if (filters.type && summary.type !== filters.type) continue;
          if (filters.project && summary.project !== filters.project) continue;
          if (filters.assignee && summary.assignee !== filters.assignee)
            continue;
          if (filters.parent && summary.parent !== filters.parent) continue;
        }

        items.push(summary);
      } catch {
        // Skip files with malformed frontmatter
        continue;
      }
    }

    // Sort by updated descending
    items.sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
    );

    return items;
  }

  async listAllItems(filters?: ItemFilters): Promise<ItemSummary[]> {
    const config = readConfig(this.dataPath);
    const allItems: ItemSummary[] = [];

    for (const namespace of Object.keys(config.namespaces)) {
      const items = await this.listItems(namespace, filters);
      allItems.push(...items);
    }

    // Sort merged results by updated descending
    allItems.sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
    );

    return allItems;
  }

  async getItem(id: string): Promise<WorkItem> {
    const { namespace } = parseCallsign(id);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const filePath = path.join(this.dataPath, namespace, `${id}.md`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError(id);
    }

    const content = fs.readFileSync(filePath, "utf-8");

    try {
      const parsed = parseWorkItem(content);
      const fm = parsed.frontmatter;

      return {
        id: fm.id || id,
        title: fm.title || "(untitled)",
        status: fm.status || "unknown",
        priority: fm.priority,
        type: fm.type,
        project: fm.project,
        assignee: fm.assignee,
        parent: fm.parent,
        created: String(fm.created || ""),
        updated: String(fm.updated || ""),
        body: parsed.body,
        activity: parsed.activity,
        artifacts: fm.artifacts || [],
      };
    } catch {
      // Malformed YAML — return raw content with a warning
      return {
        id,
        title: "(parse error)",
        status: "unknown",
        created: "",
        updated: "",
        body: content,
        activity: "",
        artifacts: [],
        warning: `Failed to parse frontmatter for ${id}. Returning raw file content.`,
      };
    }
  }

  async createItem(
    namespace: string,
    input: CreateItemInput,
  ): Promise<string> {
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    // Validate optional fields against resolved schema
    const resolved = resolveSchema(config, namespace);
    const status = input.status || "backlog";
    validateStatus(status, resolved.status.all);
    if (input.priority) validatePriority(input.priority, resolved.priority.values);
    if (input.type) validateType(input.type, resolved.type.values);

    // Increment counter
    const num = config.namespaces[namespace].next;
    config.namespaces[namespace].next = num + 1;

    const callsign = `${namespace}-${num}`;
    const todayStr = today();

    // Build frontmatter
    const frontmatter: Record<string, any> = {
      id: callsign,
      title: input.title,
      status,
      created: todayStr,
      updated: todayStr,
    };
    if (input.priority) frontmatter.priority = input.priority;
    if (input.type) frontmatter.type = input.type;
    if (input.project) frontmatter.project = input.project;
    if (input.assignee) frontmatter.assignee = input.assignee;
    if (input.parent) frontmatter.parent = input.parent;
    if (input.artifacts && input.artifacts.length > 0) {
      frontmatter.artifacts = input.artifacts;
    }

    const fileContent = serializeWorkItem({
      frontmatter,
      body: input.body || "",
      activity: "",
    });

    // Auto-create namespace directory if needed
    const nsDir = path.join(this.dataPath, namespace);
    if (!fs.existsSync(nsDir)) {
      fs.mkdirSync(nsDir, { recursive: true });
    }

    // Write config first (counter increment), then the file
    writeConfig(this.dataPath, config);

    const filePath = path.join(nsDir, `${callsign}.md`);
    fs.writeFileSync(filePath, fileContent, "utf-8");

    return callsign;
  }

  async updateItem(id: string, changes: UpdateItemInput): Promise<void> {
    const { namespace } = parseCallsign(id);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const filePath = path.join(this.dataPath, namespace, `${id}.md`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError(id);
    }

    // Validate fields against resolved schema
    const resolved = resolveSchema(config, namespace);
    if (changes.status) validateStatus(changes.status, resolved.status.all);
    if (changes.priority) validatePriority(changes.priority, resolved.priority.values);
    if (changes.type) validateType(changes.type, resolved.type.values);

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parseWorkItem(content);

    // Auto-log status transition before mutating frontmatter
    if (changes.status !== undefined && changes.status !== parsed.frontmatter.status) {
      const timestamp = now();
      const entry = `**system** — ${timestamp}\nStatus changed: ${parsed.frontmatter.status} → ${changes.status}`;
      if (parsed.activity) {
        parsed.activity = parsed.activity + "\n\n" + entry;
      } else {
        parsed.activity = entry;
      }
    }

    // Update frontmatter fields
    if (changes.title !== undefined) parsed.frontmatter.title = changes.title;
    if (changes.status !== undefined)
      parsed.frontmatter.status = changes.status;
    if (changes.priority !== undefined)
      parsed.frontmatter.priority = changes.priority;
    if (changes.type !== undefined) parsed.frontmatter.type = changes.type;
    if (changes.project !== undefined)
      parsed.frontmatter.project = changes.project;
    if (changes.assignee !== undefined)
      parsed.frontmatter.assignee = changes.assignee;
    if (changes.parent !== undefined)
      parsed.frontmatter.parent = changes.parent;

    // Append artifacts
    if (changes.addArtifacts && changes.addArtifacts.length > 0) {
      if (!parsed.frontmatter.artifacts) {
        parsed.frontmatter.artifacts = [];
      }
      parsed.frontmatter.artifacts.push(...changes.addArtifacts);
    }

    // Update body if provided
    if (changes.body !== undefined) {
      parsed.body = changes.body;
    }

    // Always update the updated date
    parsed.frontmatter.updated = today();

    const newContent = serializeWorkItem(parsed);
    fs.writeFileSync(filePath, newContent, "utf-8");
  }

  async addComment(id: string, author: string, body: string): Promise<void> {
    if (!body || body.trim() === "") {
      throw new ValidationError("body", "Comment body cannot be empty");
    }

    const { namespace } = parseCallsign(id);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const filePath = path.join(this.dataPath, namespace, `${id}.md`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError(id);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parseWorkItem(content);

    // Append new comment
    const timestamp = now();
    const comment = `**${author}** — ${timestamp}\n${body.trim()}`;

    if (parsed.activity) {
      parsed.activity = parsed.activity + "\n\n" + comment;
    } else {
      parsed.activity = comment;
    }

    // Update the updated date
    parsed.frontmatter.updated = today();

    const newContent = serializeWorkItem(parsed);
    fs.writeFileSync(filePath, newContent, "utf-8");
  }

  async attachArtifact(
    id: string,
    input: AttachArtifactInput,
  ): Promise<Artifact> {
    if (!input.filename || input.filename.trim() === "") {
      throw new ValidationError("filename", "Artifact filename cannot be empty");
    }
    if (!input.content) {
      throw new ValidationError("content", "Artifact content cannot be empty");
    }

    const { namespace } = parseCallsign(id);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    // Validate artifact type against resolved schema
    const resolved = resolveSchema(config, namespace);
    validateArtifactType(input.type, resolved.artifact_type.all);

    const itemPath = path.join(this.dataPath, namespace, `${id}.md`);
    if (!fs.existsSync(itemPath)) {
      throw new NotFoundError(id);
    }

    // Create companion directory for artifacts
    const artifactDir = path.join(this.dataPath, namespace, id);
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    // Write the artifact file
    const artifactPath = path.join(artifactDir, input.filename);
    fs.writeFileSync(artifactPath, input.content, "utf-8");

    // Register in work item frontmatter
    const url = `${namespace}/${id}/${input.filename}`;
    const artifact: Artifact = {
      type: input.type,
      title: input.title,
      url,
    };

    const content = fs.readFileSync(itemPath, "utf-8");
    const parsed = parseWorkItem(content);

    if (!parsed.frontmatter.artifacts) {
      parsed.frontmatter.artifacts = [];
    }

    // Replace existing artifact with same filename, or append
    const existingIdx = parsed.frontmatter.artifacts.findIndex(
      (a: Artifact) => a.url === url,
    );
    if (existingIdx >= 0) {
      parsed.frontmatter.artifacts[existingIdx] = artifact;
    } else {
      parsed.frontmatter.artifacts.push(artifact);
    }

    parsed.frontmatter.updated = today();

    const newContent = serializeWorkItem(parsed);
    fs.writeFileSync(itemPath, newContent, "utf-8");

    return artifact;
  }

  async getArtifact(id: string, filename: string): Promise<ArtifactContent> {
    if (!filename || filename.trim() === "") {
      throw new ValidationError("filename", "Artifact filename cannot be empty");
    }

    const { namespace } = parseCallsign(id);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const itemPath = path.join(this.dataPath, namespace, `${id}.md`);
    if (!fs.existsSync(itemPath)) {
      throw new NotFoundError(id);
    }

    const artifactPath = path.join(this.dataPath, namespace, id, filename);
    if (!fs.existsSync(artifactPath)) {
      throw new NotFoundError(
        `Artifact '${filename}' not found for ${id}`,
      );
    }

    const content = fs.readFileSync(artifactPath, "utf-8");

    // Find the matching artifact metadata from the work item
    const itemContent = fs.readFileSync(itemPath, "utf-8");
    const parsed = parseWorkItem(itemContent);
    const url = `${namespace}/${id}/${filename}`;
    const artifacts = parsed.frontmatter.artifacts || [];
    const artifact = artifacts.find((a: Artifact) => a.url === url) || {
      type: "unknown",
      title: filename,
      url,
    };

    return { artifact, content };
  }

  async approveArtifact(id: string, input: ApproveArtifactInput): Promise<void> {
    const { namespace } = parseCallsign(id);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    validateVerdict(input.verdict);

    const itemPath = path.join(this.dataPath, namespace, `${id}.md`);
    if (!fs.existsSync(itemPath)) {
      throw new NotFoundError(id);
    }

    const artifactPath = path.join(this.dataPath, namespace, id, input.filename);
    if (!fs.existsSync(artifactPath)) {
      throw new NotFoundError(`Artifact '${input.filename}' not found for ${id}`);
    }

    // Parse artifact frontmatter and set approval fields
    const artifactContent = fs.readFileSync(artifactPath, "utf-8");
    const parsed = matter(artifactContent);

    parsed.data.approval = input.verdict;
    if (input.verdict === "approved") {
      parsed.data.pipeline_approved_at = now();
    } else {
      delete parsed.data.pipeline_approved_at;
    }

    const newArtifactContent = matter.stringify(parsed.content, parsed.data);
    fs.writeFileSync(artifactPath, newArtifactContent, "utf-8");

    // Append activity log entry to work item
    const itemContent = fs.readFileSync(itemPath, "utf-8");
    const parsedItem = parseWorkItem(itemContent);

    const timestamp = now();
    const entry = `**system** — ${timestamp}\nArtifact ${input.filename}: ${input.verdict}`;
    if (parsedItem.activity) {
      parsedItem.activity = parsedItem.activity + "\n\n" + entry;
    } else {
      parsedItem.activity = entry;
    }

    parsedItem.frontmatter.updated = today();
    const newItemContent = serializeWorkItem(parsedItem);
    fs.writeFileSync(itemPath, newItemContent, "utf-8");
  }

  // --- New methods (adapter expansion) ---

  async createNamespace(key: string, name: string, description: string): Promise<Namespace> {
    if (!/^[A-Z][A-Z0-9]*$/.test(key)) {
      throw new ValidationError(
        "namespace",
        `Invalid namespace key '${key}'. Must be uppercase letters/numbers, starting with a letter (e.g. 'PROJ').`,
      );
    }

    const config = readConfig(this.dataPath);
    if (config.namespaces[key]) {
      throw new ValidationError(
        "namespace",
        `Namespace '${key}' already exists.`,
      );
    }

    config.namespaces[key] = { name, description, next: 1 };
    writeConfig(this.dataPath, config);

    return { key, name, description, itemCount: 0, docCount: 0 };
  }

  async getSchema(namespace?: string): Promise<ResolvedSchema> {
    const config = readConfig(this.dataPath);
    if (namespace && !config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }
    return resolveSchema(config, namespace);
  }

  async updateSchema(namespace: string, changes: SchemaUpdateInput): Promise<SchemaUpdateResult> {
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const result: Record<string, string[]> = {};

    if (changes.addStatuses?.length) {
      result.added_statuses = addNamespaceStatuses(config, namespace, changes.addStatuses);
    }
    if (changes.removeStatuses?.length) {
      result.removed_statuses = removeNamespaceStatuses(config, namespace, changes.removeStatuses);
    }
    if (changes.addArtifactTypes?.length) {
      result.added_artifact_types = addNamespaceArtifactTypes(config, namespace, changes.addArtifactTypes);
    }
    if (changes.removeArtifactTypes?.length) {
      result.removed_artifact_types = removeNamespaceArtifactTypes(config, namespace, changes.removeArtifactTypes);
    }

    writeConfig(this.dataPath, config);

    const schema = resolveSchema(config, namespace);
    return { changes: result, schema };
  }

  // --- Document methods ---

  async createDocument(namespace: string, input: CreateDocumentInput): Promise<Document> {
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const slug = input.slug || slugify(input.title);
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new ValidationError(
        "slug",
        `'${slug}' is not a valid slug. Must be lowercase alphanumeric with hyphens, starting with a letter or number.`,
      );
    }

    const docsDir = path.join(this.dataPath, namespace, "_docs");
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const filePath = path.join(docsDir, `${slug}.md`);
    if (fs.existsSync(filePath)) {
      throw new ValidationError("slug", `Document '${namespace}/${slug}' already exists.`);
    }

    const todayStr = today();
    const frontmatter: Record<string, any> = {
      title: input.title,
      slug,
      created: todayStr,
      updated: todayStr,
    };
    if (input.type) frontmatter.type = input.type;
    if (input.parent) frontmatter.parent = input.parent;

    const body = input.body || "";
    const content = matter.stringify(body ? `\n${body}\n` : "", frontmatter);
    fs.writeFileSync(filePath, content, "utf-8");

    return {
      slug,
      title: input.title,
      type: input.type,
      parent: input.parent,
      created: todayStr,
      updated: todayStr,
      body,
    };
  }

  async getDocument(ref: string): Promise<Document> {
    const { namespace, slug } = parseDocRef(ref);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const filePath = path.join(this.dataPath, namespace, "_docs", `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError(`Document '${ref}'`);
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);

    return {
      slug: data.slug || slug,
      title: data.title || "(untitled)",
      type: data.type,
      parent: data.parent,
      created: String(data.created || ""),
      updated: String(data.updated || ""),
      body: content.trim(),
    };
  }

  async listDocuments(namespace: string, filters?: DocumentFilters): Promise<DocumentSummary[]> {
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const docsDir = path.join(this.dataPath, namespace, "_docs");
    if (!fs.existsSync(docsDir)) {
      return [];
    }

    const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md"));
    const docs: DocumentSummary[] = [];

    for (const file of files) {
      const filePath = path.join(docsDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");

      try {
        const { data } = matter(raw);
        const summary: DocumentSummary = {
          slug: data.slug || file.replace(/\.md$/, ""),
          title: data.title || "(untitled)",
          type: data.type,
          parent: data.parent,
          created: String(data.created || ""),
          updated: String(data.updated || ""),
        };

        if (filters?.parent && summary.parent !== filters.parent) continue;

        docs.push(summary);
      } catch {
        continue;
      }
    }

    docs.sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
    );

    return docs;
  }

  async updateDocument(ref: string, changes: UpdateDocumentInput): Promise<void> {
    const { namespace, slug } = parseDocRef(ref);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const filePath = path.join(this.dataPath, namespace, "_docs", `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError(`Document '${ref}'`);
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);

    if (changes.title !== undefined) data.title = changes.title;
    data.updated = today();

    const body = changes.body !== undefined ? changes.body : content.trim();
    const newContent = matter.stringify(body ? `\n${body}\n` : "", data);
    fs.writeFileSync(filePath, newContent, "utf-8");
  }

  async renameDocument(ref: string, newSlug: string): Promise<void> {
    if (!newSlug || !/^[a-z0-9][a-z0-9-]*$/.test(newSlug)) {
      throw new ValidationError(
        "slug",
        `'${newSlug}' is not a valid slug. Must be lowercase alphanumeric with hyphens.`,
      );
    }

    const { namespace, slug } = parseDocRef(ref);
    const config = readConfig(this.dataPath);
    if (!config.namespaces[namespace]) {
      throw new NamespaceNotFoundError(namespace);
    }

    const docsDir = path.join(this.dataPath, namespace, "_docs");
    const oldPath = path.join(docsDir, `${slug}.md`);
    if (!fs.existsSync(oldPath)) {
      throw new NotFoundError(`Document '${ref}'`);
    }

    const newPath = path.join(docsDir, `${newSlug}.md`);
    if (fs.existsSync(newPath)) {
      throw new ValidationError("slug", `Document '${namespace}/${newSlug}' already exists.`);
    }

    // Update slug in frontmatter
    const raw = fs.readFileSync(oldPath, "utf-8");
    const { data, content } = matter(raw);
    data.slug = newSlug;
    data.updated = today();

    const newContent = matter.stringify(content, data);
    fs.writeFileSync(newPath, newContent, "utf-8");
    fs.unlinkSync(oldPath);
  }
}
