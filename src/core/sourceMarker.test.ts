import { describe, expect, test } from "vitest";
import {
  SOURCE_MARKER_PREFIX,
  buildTaskSourceContent,
  parseSourceBlockId
} from "./sourceMarker";

describe("task source markers", () => {
  test("builds localized source content with a language-independent marker line", () => {
    expect(buildTaskSourceContent("Source: SiYuan Notes", "20260812123456-block-id")).toBe(
      "Source: SiYuan Notes\nSiYuan-Block-ID: 20260812123456-block-id"
    );
    expect(buildTaskSourceContent("来源：思源笔记", "20260812123456-block-id")).toBe(
      "来源：思源笔记\nSiYuan-Block-ID: 20260812123456-block-id"
    );
    expect(SOURCE_MARKER_PREFIX).toBe("SiYuan-Block-ID:");
  });

  test("parses a marker from LF content", () => {
    expect(parseSourceBlockId("Source: SiYuan Notes\nSiYuan-Block-ID: block-lf")).toBe("block-lf");
  });

  test("parses a marker from CRLF content", () => {
    expect(parseSourceBlockId("Source: SiYuan Notes\r\nSiYuan-Block-ID: block-crlf\r\nDetails")).toBe("block-crlf");
  });

  test("returns undefined when content has no marker", () => {
    expect(parseSourceBlockId("Source: SiYuan Notes")).toBeUndefined();
  });

  test("returns undefined for malformed markers", () => {
    expect(parseSourceBlockId("SiYuan-Block-ID:")).toBeUndefined();
    expect(parseSourceBlockId("SiYuan-Block-ID block-id")).toBeUndefined();
    expect(parseSourceBlockId("prefix SiYuan-Block-ID: block-id")).toBeUndefined();
  });
});
