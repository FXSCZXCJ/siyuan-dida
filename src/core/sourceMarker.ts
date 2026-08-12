export const SOURCE_MARKER_PREFIX = "SiYuan-Block-ID:";
const SOURCE_MARKER_PATTERN = new RegExp(
  `^${SOURCE_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\S+)$`
);

export function buildTaskSourceContent(sourceLabel: string, blockId: string): string {
  return `${sourceLabel}\n${SOURCE_MARKER_PREFIX} ${blockId}`;
}

export function parseSourceBlockId(content: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(SOURCE_MARKER_PATTERN);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}
