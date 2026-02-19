import { ValidationError } from "./errors.js";

export function parseCallsign(id: string): {
  namespace: string;
  number: number;
} {
  const match = id.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    throw new ValidationError(
      "id",
      `'${id}' is not a valid callsign. Expected format: NAMESPACE-NUMBER (e.g., PIPE-12)`,
    );
  }
  return { namespace: match[1], number: parseInt(match[2], 10) };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function now(): string {
  return new Date().toISOString();
}
