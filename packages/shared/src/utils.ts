import { ValidationError } from "./errors.js";

export function parseDocRef(ref: string): { namespace: string; slug: string } {
  const slashIdx = ref.indexOf("/");
  if (slashIdx === -1 || slashIdx === 0 || slashIdx === ref.length - 1) {
    throw new ValidationError(
      "ref",
      `'${ref}' is not a valid document reference. Expected format: NS/slug (e.g., PROJ/roadmap)`,
    );
  }
  const namespace = ref.slice(0, slashIdx);
  const slug = ref.slice(slashIdx + 1);
  if (!/^[A-Z][A-Z0-9]*$/.test(namespace)) {
    throw new ValidationError(
      "ref",
      `'${ref}' has an invalid namespace. Namespace must be uppercase letters/numbers starting with a letter.`,
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new ValidationError(
      "ref",
      `'${ref}' has an invalid slug. Slugs must be lowercase alphanumeric with hyphens.`,
    );
  }
  return { namespace, slug };
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

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
