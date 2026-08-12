import { describe, expect, test } from "vitest";
import { createTranslator } from "../i18n";
import { getRangeValidationMessage, getTargetProjectWarning, RangeValidationError } from "./ranges";

const details = {
  rangeIndex: 2,
  rangeId: "range-2",
  rangeName: "Weekly",
  conflictingRangeIndex: 1,
  conflictingRangeId: "range-1",
  conflictingRangeName: "Work"
};

describe("getRangeValidationMessage", () => {
  test.each([
    ["missing_notebook" as const, "Sync range 2 is missing a notebook."],
    ["missing_path" as const, "Sync range 2 is missing a document path."],
    ["missing_target" as const, "Sync range 2 is missing a Dida list."],
    ["duplicate_range_id" as const, "Sync ranges 1 and 2 have the same internal ID."],
    ["overlapping_ranges" as const, "Sync ranges 1 and 2 overlap."]
  ])("translates %s in English", (code, expected) => {
    expect(getRangeValidationMessage(new RangeValidationError(code, details), createTranslator("en"))).toBe(expected);
  });

  test("translates validation errors in Chinese", () => {
    expect(
      getRangeValidationMessage(
        new RangeValidationError("overlapping_ranges", details),
        createTranslator("zh-CN")
      )
    ).toBe("同步范围 1 和 2 存在重叠。");
  });

  test("preserves unknown error messages", () => {
    expect(getRangeValidationMessage(new Error("original message"), createTranslator("en"))).toBe("original message");
  });
});

describe("getTargetProjectWarning", () => {
  const t = createTranslator("en");

  test("warns when a saved range changes to another non-empty target", () => {
    expect(getTargetProjectWarning(" project-1 ", "project-2", t)).toBe(
      "Existing bindings remain in their original Dida lists; only new tasks use the newly selected list."
    );
  });

  test.each([
    ["project-1", "project-1"],
    [" project-1 ", "project-1"],
    ["", "project-2"],
    ["project-1", ""]
  ])("does not warn for equivalent or non-target values", (original, current) => {
    expect(getTargetProjectWarning(original, current, t)).toBe("");
  });

  test("localizes the warning", () => {
    expect(getTargetProjectWarning("project-1", "project-2", createTranslator("zh-CN"))).toBe(
      "已有绑定仍保留在原滴答清单中；只有新同步的任务会使用新选择的清单。"
    );
  });
});
