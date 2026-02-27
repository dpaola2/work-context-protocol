// --- Schema-related types ---

export interface ExtensibleField {
  defaults: string[];
  extensions: string[];
  all: string[];
}

export interface FixedField {
  values: string[];
}

export interface ResolvedSchema {
  status: ExtensibleField;
  priority: FixedField;
  type: FixedField;
  artifact_type: ExtensibleField;
}

// --- Config types ---

export interface NamespaceSchemaConfig {
  statuses?: string[];
  artifact_types?: string[];
}

export interface SchemaConfig {
  status: string[];
  priority: string[];
  type: string[];
  artifact_type: string[];
}

export const DEFAULT_SCHEMA: SchemaConfig = {
  status: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
  priority: ["urgent", "high", "medium", "low"],
  type: ["feature", "bug", "chore", "spike"],
  artifact_type: [
    "prd",
    "discovery",
    "architecture",
    "adr",
    "gameplan",
    "plan",
    "test-matrix",
    "review",
    "qa-plan",
  ],
};

export interface NamespaceConfig {
  name: string;
  description: string;
  next: number;
  schema?: NamespaceSchemaConfig;
}

export interface WcpConfig {
  schema?: SchemaConfig;
  namespaces: Record<string, NamespaceConfig>;
}

// --- Data types ---

export interface Namespace {
  key: string;
  name: string;
  description: string;
  itemCount: number;
  docCount: number;
}

export interface Artifact {
  type: string;
  title: string;
  url: string;
}

export interface ItemSummary {
  id: string;
  title: string;
  status: string;
  priority?: string;
  type?: string;
  project?: string;
  assignee?: string;
  parent?: string;
  created: string;
  updated: string;
}

export interface WorkItem extends ItemSummary {
  body: string;
  activity: string;
  artifacts: Artifact[];
  warning?: string;
}

export interface CreateItemInput {
  title: string;
  status?: string;
  priority?: string;
  type?: string;
  project?: string;
  assignee?: string;
  parent?: string;
  body?: string;
  artifacts?: Artifact[];
}

export interface UpdateItemInput {
  title?: string;
  status?: string;
  priority?: string;
  type?: string;
  project?: string;
  assignee?: string;
  parent?: string;
  body?: string;
  addArtifacts?: Artifact[];
}

export interface ItemFilters {
  status?: string;
  priority?: string;
  type?: string;
  project?: string;
  assignee?: string;
  parent?: string;
}

export interface AttachArtifactInput {
  type: string;
  title: string;
  filename: string;
  content: string;
}

export interface ArtifactContent {
  artifact: Artifact;
  content: string;
}

export interface ApproveArtifactInput {
  filename: string;
  verdict: string;
}

// --- Document types ---

export interface Document {
  slug: string;
  title: string;
  type?: string;
  parent?: string;
  created: string;
  updated: string;
  body: string;
}

export interface DocumentSummary {
  slug: string;
  title: string;
  type?: string;
  parent?: string;
  created: string;
  updated: string;
}

export interface CreateDocumentInput {
  title: string;
  slug?: string;
  type?: string;
  parent?: string;
  body?: string;
}

export interface UpdateDocumentInput {
  title?: string;
  body?: string;
}

export interface DocumentFilters {
  parent?: string;
}

// --- New types for adapter expansion ---

export interface SchemaUpdateInput {
  addStatuses?: string[];
  removeStatuses?: string[];
  addArtifactTypes?: string[];
  removeArtifactTypes?: string[];
}

export interface SchemaUpdateResult {
  changes: Record<string, string[]>;
  schema: ResolvedSchema;
}

// --- Adapter interface (expanded to 17 methods) ---

export interface WcpAdapter {
  listNamespaces(): Promise<Namespace[]>;
  listItems(namespace: string, filters?: ItemFilters): Promise<ItemSummary[]>;
  listAllItems(filters?: ItemFilters): Promise<ItemSummary[]>;
  getItem(id: string): Promise<WorkItem>;
  createItem(namespace: string, input: CreateItemInput): Promise<string>;
  updateItem(id: string, changes: UpdateItemInput): Promise<void>;
  addComment(id: string, author: string, body: string): Promise<void>;
  attachArtifact(id: string, input: AttachArtifactInput): Promise<Artifact>;
  getArtifact(id: string, filename: string): Promise<ArtifactContent>;
  approveArtifact(id: string, input: ApproveArtifactInput): Promise<void>;
  createNamespace(key: string, name: string, description: string): Promise<Namespace>;
  getSchema(namespace?: string): Promise<ResolvedSchema>;
  updateSchema(namespace: string, changes: SchemaUpdateInput): Promise<SchemaUpdateResult>;

  // Document methods
  createDocument(namespace: string, input: CreateDocumentInput): Promise<Document>;
  getDocument(ref: string): Promise<Document>;
  listDocuments(namespace: string, filters?: DocumentFilters): Promise<DocumentSummary[]>;
  updateDocument(ref: string, changes: UpdateDocumentInput): Promise<void>;
  renameDocument(ref: string, newSlug: string): Promise<void>;
}
