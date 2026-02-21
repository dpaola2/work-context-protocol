import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";

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
  artifact_type: ["adr", "plan"],
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

export function readConfig(dataPath: string): WcpConfig {
  const configPath = path.join(dataPath, ".wcp", "config.yaml");
  const raw = fs.readFileSync(configPath, "utf-8");
  return yaml.load(raw) as WcpConfig;
}

export function writeConfig(dataPath: string, config: WcpConfig): void {
  const configPath = path.join(dataPath, ".wcp", "config.yaml");
  fs.writeFileSync(configPath, yaml.dump(config), "utf-8");
}
