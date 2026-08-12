export const SOURCE_MARKER_PREFIX = "SiYuan-Block-ID:";
const SOURCE_MARKER_PATTERN = new RegExp(
  `^${SOURCE_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\S+)$`
);
const SIYUAN_BLOCK_ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/;

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

export function isSiYuanBlockId(value: string): boolean {
  return SIYUAN_BLOCK_ID_PATTERN.test(value);
}
