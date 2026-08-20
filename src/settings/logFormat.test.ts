import { describe, expect, test } from "vitest";
import { createTranslator } from "../i18n";
import type { SyncResult } from "../core/types";
import { formatSyncLogs, summarizeSyncLog } from "./logFormat";

function fullLog(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    created: 2,
    recovered: 1,
    updated: 3,
    completed: 4,
    writtenBack: 5,
    failed: 6,
    skipped: 7,
    scanned: 8,
    rangeResults: [
      {
        rangeId: "range-1",
        rangeName: "Work",
        notebookId: "box-1",
        hpathPrefix: "/Work",
        scanned: 8,
        created: 2,
        recovered: 1,
        updated: 3,
        completed: 4,
        writtenBack: 5,
        failed: 6,
        skipped: 7,
        cursorOffset: 10,
        nextCursorOffset: 20,
        hasMore: true
      }
    ],
    rangeCursorOffsets: { "range-1": 20 },
    events: [
      {
        time: "2026-06-27T01:00:00.000Z",
        level: "info",
        blockId: "block-event",
        message: "Already localized event message"
      }
    ],
    failures: [
      { blockId: "block-failure", message: "network unavailable" },
      { message: "snapshot unavailable" }
    ],
    startedAt: "2026-06-27T01:00:00.000Z",
    finishedAt: "2026-06-27T01:00:01.000Z",
    ...overrides
  };
}

describe("formatSyncLogs", () => {
  test.each([
    ["en", "No sync logs yet."],
    ["zh-CN", "暂无同步日志。"]
  ])("formats an empty log list in %s", (locale, expected) => {
    expect(formatSyncLogs([], createTranslator(locale))).toBe(expected);
  });

  test("formats every fixed label in English and preserves localized event messages", () => {
    const text = formatSyncLogs([fullLog()], createTranslator("en"));

    expect(text).toContain("#1 2026-06-27T01:00:01.000Z");
    expect(text).toContain(
      "Summary: scanned 8, created 2, recovered 1, updated 3, completed 4, written back 5, skipped 7, failed 6"
    );
    expect(text).toContain(
      "Range Work (/Work): scanned 8, created 2, recovered 1, updated 3, completed 4, written back 5, skipped 7, failed 6"
    );
    expect(text).toContain("this run started at candidate 11; next run continues at candidate 21");
    expect(text).toContain("Failure [block block-failure]: network unavailable");
    expect(text).toContain("Failure: snapshot unavailable");
    expect(text).toContain(
      "[info] 2026-06-27T01:00:00.000Z [block block-event] Already localized event message"
    );
    expect(text).not.toMatch(/[\u3400-\u9fff]/u);
  });

  test("formats every fixed label naturally in Chinese", () => {
    const log = fullLog({
      events: [{ time: "2026-06-27T01:00:00.000Z", level: "info", message: "创建滴答任务：A" }]
    });
    const text = formatSyncLogs([log], createTranslator("zh-CN"));

    expect(text).toContain(
      "汇总：扫描 8，新增 2，恢复 1，更新 3，完成 4，回写 5，跳过 7，失败 6"
    );
    expect(text).toContain(
      "范围 Work（/Work）：扫描 8，新增 2，恢复 1，更新 3，完成 4，回写 5，跳过 7，失败 6"
    );
    expect(text).toContain("本轮从第 11 个候选任务开始，下轮从第 21 个候选任务继续");
    expect(text).toContain("失败（块 block-failure）：network unavailable");
    expect(text).toContain("失败：snapshot unavailable");
    expect(text).toContain("[info] 2026-06-27T01:00:00.000Z 创建滴答任务：A");
  });

  test("formats a completed cursor", () => {
    const log = fullLog({
      rangeResults: [{ ...fullLog().rangeResults[0], hasMore: false }]
    });

    expect(formatSyncLogs([log], createTranslator("en"))).toContain("reached the end");
    expect(formatSyncLogs([log], createTranslator("zh-CN"))).toContain("已扫到末尾");
  });

  test("renders missing recovered counts from legacy logs as zero", () => {
    const log = fullLog({ recovered: undefined });
    delete log.rangeResults[0].recovered;

    const text = formatSyncLogs([log], createTranslator("en"));

    expect(text).toContain("recovered 0");
    expect(text.match(/recovered 0/g)).toHaveLength(2);
  });
});

describe("summarizeSyncLog", () => {
  test("summarizes all counters in English", () => {
    expect(summarizeSyncLog(fullLog(), createTranslator("en"))).toBe(
      "scanned 8, created 2, recovered 1, updated 3, completed 4, written back 5, skipped 7, failed 6"
    );
  });

  test("summarizes all counters in Chinese and defaults legacy recovery to zero", () => {
    expect(summarizeSyncLog(fullLog({ recovered: undefined }), createTranslator("zh-CN"))).toBe(
      "扫描 8，新增 2，恢复 0，更新 3，完成 4，回写 5，跳过 7，失败 6"
    );
  });
});
