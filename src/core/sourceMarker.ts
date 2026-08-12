export const SOURCE_MARKER_PREFIX = "SiYuan-Block-ID:";

export function buildTaskSourceContent(sourceLabel: string, blockId: string): string {
  return `${sourceLabel}\n${SOURCE_MARKER_PREFIX} ${blockId}`;
}

export function parseSourceBlockId(content: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^SiYuan-Block-ID: (\S+)$/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}
