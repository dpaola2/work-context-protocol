export class WcpError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export class NotFoundError extends WcpError {
  constructor(id: string) {
    super("NOT_FOUND", `Item ${id} not found`);
  }
}

export class NamespaceNotFoundError extends WcpError {
  constructor(ns: string) {
    super(
      "NAMESPACE_NOT_FOUND",
      `Namespace ${ns} not found. Use wcp_namespaces to see available namespaces.`,
    );
  }
}

export class ValidationError extends WcpError {
  constructor(field: string, message: string) {
    super("VALIDATION_ERROR", `Invalid ${field}: ${message}`);
  }
}
