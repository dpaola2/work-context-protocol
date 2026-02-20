export interface Namespace {
  key: string;
  name: string;
  description: string;
  itemCount: number;
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

export interface WcpAdapter {
  listNamespaces(): Promise<Namespace[]>;
  listItems(namespace: string, filters?: ItemFilters): Promise<ItemSummary[]>;
  getItem(id: string): Promise<WorkItem>;
  createItem(namespace: string, input: CreateItemInput): Promise<string>;
  updateItem(id: string, changes: UpdateItemInput): Promise<void>;
  addComment(id: string, author: string, body: string): Promise<void>;
  attachArtifact(id: string, input: AttachArtifactInput): Promise<Artifact>;
  getArtifact(id: string, filename: string): Promise<ArtifactContent>;
  approveArtifact(id: string, input: ApproveArtifactInput): Promise<void>;
}
