import {
  DEFAULT_SCHEMA,
  type WcpConfig,
  type SchemaConfig,
} from "./config.js";
import { ValidationError } from "./errors.js";

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

function getGlobalSchema(config: WcpConfig): SchemaConfig {
  return config.schema ?? DEFAULT_SCHEMA;
}

export function resolveSchema(
  config: WcpConfig,
  namespace?: string,
): ResolvedSchema {
  const global = getGlobalSchema(config);
  const nsSchema = namespace
    ? config.namespaces[namespace]?.schema
    : undefined;

  const statusExtensions = nsSchema?.statuses ?? [];
  const artifactExtensions = nsSchema?.artifact_types ?? [];

  return {
    status: {
      defaults: [...global.status],
      extensions: [...statusExtensions],
      all: [...global.status, ...statusExtensions],
    },
    priority: {
      values: [...global.priority],
    },
    type: {
      values: [...global.type],
    },
    artifact_type: {
      defaults: [...global.artifact_type],
      extensions: [...artifactExtensions],
      all: [...global.artifact_type, ...artifactExtensions],
    },
  };
}

export function addNamespaceStatuses(
  config: WcpConfig,
  namespace: string,
  statuses: string[],
): string[] {
  const ns = config.namespaces[namespace];
  if (!ns) {
    throw new ValidationError(
      "namespace",
      `'${namespace}' not found. Use wcp_namespaces to see available namespaces.`,
    );
  }

  const global = getGlobalSchema(config);
  if (!ns.schema) ns.schema = {};
  if (!ns.schema.statuses) ns.schema.statuses = [];

  const added: string[] = [];
  for (const s of statuses) {
    if (global.status.includes(s) || ns.schema.statuses.includes(s)) continue;
    ns.schema.statuses.push(s);
    added.push(s);
  }
  return added;
}

export function removeNamespaceStatuses(
  config: WcpConfig,
  namespace: string,
  statuses: string[],
): string[] {
  const ns = config.namespaces[namespace];
  if (!ns) {
    throw new ValidationError(
      "namespace",
      `'${namespace}' not found. Use wcp_namespaces to see available namespaces.`,
    );
  }

  const global = getGlobalSchema(config);
  for (const s of statuses) {
    if (global.status.includes(s)) {
      throw new ValidationError(
        "status",
        `Cannot remove default status '${s}'. Only namespace extensions can be removed.`,
      );
    }
  }

  if (!ns.schema?.statuses) return [];

  const removed: string[] = [];
  ns.schema.statuses = ns.schema.statuses.filter((s) => {
    if (statuses.includes(s)) {
      removed.push(s);
      return false;
    }
    return true;
  });

  cleanupNamespaceSchema(ns);
  return removed;
}

export function addNamespaceArtifactTypes(
  config: WcpConfig,
  namespace: string,
  types: string[],
): string[] {
  const ns = config.namespaces[namespace];
  if (!ns) {
    throw new ValidationError(
      "namespace",
      `'${namespace}' not found. Use wcp_namespaces to see available namespaces.`,
    );
  }

  const global = getGlobalSchema(config);
  if (!ns.schema) ns.schema = {};
  if (!ns.schema.artifact_types) ns.schema.artifact_types = [];

  const added: string[] = [];
  for (const t of types) {
    if (
      global.artifact_type.includes(t) ||
      ns.schema.artifact_types.includes(t)
    )
      continue;
    ns.schema.artifact_types.push(t);
    added.push(t);
  }
  return added;
}

export function removeNamespaceArtifactTypes(
  config: WcpConfig,
  namespace: string,
  types: string[],
): string[] {
  const ns = config.namespaces[namespace];
  if (!ns) {
    throw new ValidationError(
      "namespace",
      `'${namespace}' not found. Use wcp_namespaces to see available namespaces.`,
    );
  }

  const global = getGlobalSchema(config);
  for (const t of types) {
    if (global.artifact_type.includes(t)) {
      throw new ValidationError(
        "artifact_type",
        `Cannot remove default artifact type '${t}'. Only namespace extensions can be removed.`,
      );
    }
  }

  if (!ns.schema?.artifact_types) return [];

  const removed: string[] = [];
  ns.schema.artifact_types = ns.schema.artifact_types.filter((t) => {
    if (types.includes(t)) {
      removed.push(t);
      return false;
    }
    return true;
  });

  cleanupNamespaceSchema(ns);
  return removed;
}

function cleanupNamespaceSchema(ns: { schema?: { statuses?: string[]; artifact_types?: string[] } }): void {
  if (!ns.schema) return;
  if (ns.schema.statuses?.length === 0) delete ns.schema.statuses;
  if (ns.schema.artifact_types?.length === 0) delete ns.schema.artifact_types;
  if (
    !ns.schema.statuses &&
    !ns.schema.artifact_types
  ) {
    delete ns.schema;
  }
}
