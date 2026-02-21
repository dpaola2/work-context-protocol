import type {
  WcpAdapter,
  Namespace,
  ItemSummary,
  WorkItem,
  CreateItemInput,
  UpdateItemInput,
  ItemFilters,
  Artifact,
  ArtifactContent,
  AttachArtifactInput,
  ApproveArtifactInput,
  ResolvedSchema,
  SchemaUpdateInput,
  SchemaUpdateResult,
} from "@wcp/shared";
import {
  WcpError,
  NotFoundError,
  NamespaceNotFoundError,
  ValidationError,
} from "@wcp/shared";

export class HttpAdapter implements WcpAdapter {
  constructor(
    private serverUrl: string,
    private apiKey?: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new WcpError(
        "CONNECTION_ERROR",
        `WCP server unreachable at ${this.serverUrl}: ${message}`,
      );
    }

    const json = await res.json();
    if (!res.ok) {
      if (json.error === "NOT_FOUND") throw new NotFoundError(json.message);
      if (json.error === "NAMESPACE_NOT_FOUND") throw new NamespaceNotFoundError(json.message);
      if (json.error === "VALIDATION_ERROR") throw new ValidationError("field", json.message);
      throw new WcpError(json.error || "UNKNOWN", json.message || res.statusText);
    }
    return json as T;
  }

  async listNamespaces(): Promise<Namespace[]> {
    const res = await this.request<{ namespaces: Namespace[] }>("GET", "/api/namespaces");
    return res.namespaces;
  }

  async createNamespace(key: string, name: string, description: string): Promise<Namespace> {
    const res = await this.request<{ namespace: Namespace }>("POST", "/api/namespaces", {
      key,
      name,
      description,
    });
    return res.namespace;
  }

  async listItems(namespace: string, filters?: ItemFilters): Promise<ItemSummary[]> {
    const params = new URLSearchParams();
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v);
      }
    }
    const qs = params.toString();
    const path = `/api/namespaces/${namespace}/items${qs ? `?${qs}` : ""}`;
    const res = await this.request<{ items: ItemSummary[] }>("GET", path);
    return res.items;
  }

  async createItem(namespace: string, input: CreateItemInput): Promise<string> {
    const res = await this.request<{ id: string }>("POST", `/api/namespaces/${namespace}/items`, input);
    return res.id;
  }

  async getItem(id: string): Promise<WorkItem> {
    const res = await this.request<{ item: WorkItem }>("GET", `/api/items/${id}`);
    return res.item;
  }

  async updateItem(id: string, changes: UpdateItemInput): Promise<void> {
    await this.request("PATCH", `/api/items/${id}`, changes);
  }

  async addComment(id: string, author: string, body: string): Promise<void> {
    await this.request("POST", `/api/items/${id}/comments`, { author, body });
  }

  async attachArtifact(id: string, input: AttachArtifactInput): Promise<Artifact> {
    const res = await this.request<{ artifact: Artifact }>("POST", `/api/items/${id}/artifacts`, input);
    return res.artifact;
  }

  async getArtifact(id: string, filename: string): Promise<ArtifactContent> {
    return this.request<ArtifactContent>("GET", `/api/items/${id}/artifacts/${filename}`);
  }

  async approveArtifact(id: string, input: ApproveArtifactInput): Promise<void> {
    await this.request("POST", `/api/items/${id}/artifacts/${input.filename}/approve`, {
      verdict: input.verdict,
    });
  }

  async getSchema(namespace?: string): Promise<ResolvedSchema> {
    const path = namespace ? `/api/schema/${namespace}` : "/api/schema";
    const res = await this.request<{ schema: ResolvedSchema }>("GET", path);
    return res.schema;
  }

  async updateSchema(namespace: string, changes: SchemaUpdateInput): Promise<SchemaUpdateResult> {
    const res = await this.request<{ changes: Record<string, string[]>; schema: ResolvedSchema }>(
      "PATCH",
      `/api/schema/${namespace}`,
      {
        add_statuses: changes.addStatuses,
        remove_statuses: changes.removeStatuses,
        add_artifact_types: changes.addArtifactTypes,
        remove_artifact_types: changes.removeArtifactTypes,
      },
    );
    return { changes: res.changes, schema: res.schema };
  }
}
