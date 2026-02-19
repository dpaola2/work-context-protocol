import matter from "gray-matter";

export interface ParsedWorkItem {
  frontmatter: Record<string, any>;
  body: string;
  activity: string;
}

const ACTIVITY_SEPARATOR = "---\n\n## Activity";

export function parseWorkItem(fileContent: string): ParsedWorkItem {
  const { data, content } = matter(fileContent);

  const sepIndex = content.indexOf(ACTIVITY_SEPARATOR);

  if (sepIndex === -1) {
    return {
      frontmatter: data,
      body: content.trim(),
      activity: "",
    };
  }

  return {
    frontmatter: data,
    body: content.slice(0, sepIndex).trim(),
    activity: content.slice(sepIndex + ACTIVITY_SEPARATOR.length).trim(),
  };
}

export function serializeWorkItem(item: ParsedWorkItem): string {
  const bodySection = item.body ? `\n${item.body}\n` : "";
  const activitySection = item.activity
    ? `\n---\n\n## Activity\n\n${item.activity}\n`
    : "\n---\n\n## Activity\n";

  return matter.stringify(bodySection + activitySection, item.frontmatter);
}
