// Types
export type {
  ExtensibleField,
  FixedField,
  ResolvedSchema,
  NamespaceSchemaConfig,
  SchemaConfig,
  NamespaceConfig,
  WcpConfig,
  Namespace,
  Artifact,
  ItemSummary,
  WorkItem,
  CreateItemInput,
  UpdateItemInput,
  ItemFilters,
  AttachArtifactInput,
  ArtifactContent,
  ApproveArtifactInput,
  SchemaUpdateInput,
  SchemaUpdateResult,
  WcpAdapter,
  Document,
  DocumentSummary,
  CreateDocumentInput,
  UpdateDocumentInput,
  DocumentFilters,
} from "./types.js";

export { DEFAULT_SCHEMA } from "./types.js";

// Errors
export {
  WcpError,
  NotFoundError,
  NamespaceNotFoundError,
  ValidationError,
} from "./errors.js";

// Validation
export {
  validateStatus,
  validatePriority,
  validateType,
  validateVerdict,
  validateArtifactType,
} from "./validation.js";

// Schema
export {
  resolveSchema,
  addNamespaceStatuses,
  removeNamespaceStatuses,
  addNamespaceArtifactTypes,
  removeNamespaceArtifactTypes,
} from "./schema.js";

// Utils
export {
  parseCallsign,
  parseDocRef,
  slugify,
  today,
  now,
} from "./utils.js";
