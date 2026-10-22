import { localDateTime } from "./date";

export interface ParsedTodo {
  marker: "-" | "*";
  checked: boolean;
  title: string;
}

export interface TodoMetadata {
  dueDate?: string;
  allDay?: boolean;
  priority?: 1 | 3 | 5;
  tags?: string[];
}

export interface TodoWithMetadata {
  title: string;
  metadata: TodoMetadata;
}

const TODO_PATTERN = /^(\s*[-*](?:\s+\{:[^}]*\})?\s*)\[([ xX])\]\s+([^\r\n]*)/;

export function parseTodoMarkdown(markdown: string): ParsedTodo | null {
  const firstLine = markdown.split(/\r?\n/, 1)[0] ?? "";
  const match = firstLine.match(TODO_PATTERN);
  if (!match) {
    return null;
  }

  return {
    marker: match[1].trim().startsWith("*") ? "*" : "-",
    checked: match[2].toLowerCase() === "x",
    title: match[3].trim()
  };
}

export function parseTodoMetadata(title: string): TodoWithMetadata {
  let text = title;
  const metadata: TodoMetadata = {};
  text = text.replace(
    /@due\(\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?\s*\)/gi,
    (match, yearText, monthText, dayText, hourText, minuteText) => {
      const parsed = parseLocalDate(
        Number(yearText),
        Number(monthText),
        Number(dayText),
        hourText === undefined ? 0 : Number(hourText),
        minuteText === undefined ? 0 : Number(minuteText)
      );
      if (!parsed) return match;
      metadata.dueDate = localDateTime(parsed);
      metadata.allDay = hourText === undefined;
      return " ";
    }
  );
  text = text.replace(/!p([135])\b/gi, (_match, level: string) => {
    metadata.priority = Number(level) as 1 | 3 | 5;
    return " ";
  });
  text = text.replace(/@tag\(\s*([^)]+?)\s*\)/gi, (_match, rawTags: string) => {
    const tags = rawTags
      .split(/[,，]/)
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean);
    if (tags.length > 0) {
      metadata.tags = [...new Set([...(metadata.tags ?? []), ...tags])];
    }
    return " ";
  });

  return {
    title: text.replace(/\s+/g, " ").trim(),
    metadata
  };
}

export function renderTodoMetadata(metadata: TodoMetadata): string {
  const parts: string[] = [];
  if (metadata.dueDate) {
    const match = metadata.dueDate.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (match) {
      parts.push(metadata.allDay ? `@due(${match[1]})` : `@due(${match[1]} ${match[2]})`);
    }
  }
  if (metadata.priority === 1 || metadata.priority === 3 || metadata.priority === 5) {
    parts.push(`!p${metadata.priority}`);
  }
  if (metadata.tags && metadata.tags.length > 0) {
    parts.push(`@tag(${metadata.tags.join(",")})`);
  }
  return parts.join(" ");
}

export function replaceTodoTitleMetadata(markdown: string, visibleTitle: string, metadata: TodoMetadata): string {
  const lines = markdown.split(/\r?\n/);
  const firstLine = lines[0] ?? "";
  const suffix = renderTodoMetadata(metadata);
  const title = `${visibleTitle}${suffix ? ` ${suffix}` : ""}`;
  if (!TODO_PATTERN.test(firstLine)) return markdown;
  lines[0] = firstLine.replace(TODO_PATTERN, `$1[$2] ${title}`);
  return lines.join("\n");
}

export function todoMetadataKey(metadata: TodoMetadata): string {
  if (
    metadata.dueDate === undefined
    && metadata.priority === undefined
    && (metadata.tags?.length ?? 0) === 0
  ) {
    return "";
  }
  return JSON.stringify({
    dueDate: metadata.dueDate,
    allDay: metadata.allDay,
    priority: metadata.priority,
    tags: metadata.tags
  });
}

function parseLocalDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number
): Date | undefined {
  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || !Number.isInteger(hours)
    || !Number.isInteger(minutes)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
  ) {
    return undefined;
  }
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

export function markTodoCompleted(markdown: string): string {
  return markdown.replace(TODO_PATTERN, "$1[x] $3");
}
