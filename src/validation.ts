import { ValidationError } from "./errors.js";

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use shorter string as the "column" for space efficiency
  if (a.length > b.length) [a, b] = [b, a];

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    const curr = [j];
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1, // insertion
        prev[i] + 1, // deletion
        prev[i - 1] + cost, // substitution
      );
    }
    prev = curr;
  }
  return prev[a.length];
}

function closestMatch(value: string, valid: string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const v of valid) {
    const d = levenshtein(value.toLowerCase(), v.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  // Only suggest if reasonably close (at most half the length of the longer string)
  const maxLen = Math.max(value.length, best?.length ?? 0);
  if (bestDist <= Math.ceil(maxLen / 2)) return best;
  return undefined;
}

function formatError(
  value: string,
  valid: string[],
  fieldLabel: string,
): string {
  const suggestion = closestMatch(value, valid);
  let msg = `'${value}'. Valid ${fieldLabel}: ${valid.join(", ")}`;
  if (suggestion) {
    msg += `. Did you mean '${suggestion}'?`;
  }
  msg += ` Use wcp_schema to see all valid values.`;
  return msg;
}

export function validateStatus(value: string, validStatuses: string[]): void {
  if (!validStatuses.includes(value)) {
    throw new ValidationError(
      "status",
      formatError(value, validStatuses, "statuses"),
    );
  }
}

export function validatePriority(
  value: string,
  validPriorities: string[],
): void {
  if (!validPriorities.includes(value)) {
    throw new ValidationError(
      "priority",
      formatError(value, validPriorities, "priorities"),
    );
  }
}

export function validateType(value: string, validTypes: string[]): void {
  if (!validTypes.includes(value)) {
    throw new ValidationError(
      "type",
      formatError(value, validTypes, "types"),
    );
  }
}

export function validateArtifactType(
  value: string,
  validTypes: string[],
): void {
  if (!validTypes.includes(value)) {
    throw new ValidationError(
      "artifact_type",
      formatError(value, validTypes, "artifact types"),
    );
  }
}
