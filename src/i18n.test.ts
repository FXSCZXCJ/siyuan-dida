import { describe, expect, test } from "vitest";
import { createTranslator } from "./i18n";

describe("createTranslator", () => {
  test("uses Simplified Chinese for a zh-CN locale", () => {
    const t = createTranslator("zh-CN");

    expect(t("saveSettings")).toBe("保存设置");
  });

  test("uses English and interpolates dynamic values for other locales", () => {
    const t = createTranslator("en-US");

    expect(t("syncComplete", { summary: "1 created" })).toBe("Dida sync complete: 1 created");
  });

  test("provides localized range validation copy", () => {
    expect(createTranslator("en")("rangeValidationMissingNotebook", { range: 3 })).toBe(
      "Sync range 3 is missing a notebook."
    );
    expect(createTranslator("zh-CN")("targetProjectChangedWarning")).toBe(
      "已有绑定仍保留在原滴答清单中；只有新同步的任务会使用新选择的清单。"
    );
  });
});
