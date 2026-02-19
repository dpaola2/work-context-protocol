import { ValidationError } from "./errors.js";

const VALID_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
] as const;

const VALID_PRIORITIES = ["urgent", "high", "medium", "low"] as const;

const VALID_TYPES = ["feature", "bug", "chore", "spike"] as const;

export function validateStatus(value: string): void {
  if (!(VALID_STATUSES as readonly string[]).includes(value)) {
    throw new ValidationError(
      "status",
      `'${value}'. Valid values: ${VALID_STATUSES.join(", ")}`,
    );
  }
}

export function validatePriority(value: string): void {
  if (!(VALID_PRIORITIES as readonly string[]).includes(value)) {
    throw new ValidationError(
      "priority",
      `'${value}'. Valid values: ${VALID_PRIORITIES.join(", ")}`,
    );
  }
}

export function validateType(value: string): void {
  if (!(VALID_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(
      "type",
      `'${value}'. Valid values: ${VALID_TYPES.join(", ")}`,
    );
  }
}
