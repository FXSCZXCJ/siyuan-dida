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

  test("provides localized invalid loaded-configuration status and correction copy", () => {
    expect(createTranslator("en")("configurationInvalidStatus")).toBe("Dida: configuration invalid");
    expect(
      createTranslator("en")("configurationInvalidSyncBlocked", {
        message: "Sync ranges 1 and 2 overlap."
      })
    ).toBe(
      "Saved sync ranges are invalid: Sync ranges 1 and 2 overlap. Correct and save them in plugin settings before syncing."
    );
    expect(createTranslator("zh-CN")("configurationInvalidStatus")).toBe("滴答：配置无效");
    expect(
      createTranslator("zh-CN")("configurationInvalidSyncBlocked", {
        message: "同步范围 1 和 2 存在重叠。"
      })
    ).toBe("已保存的同步范围无效：同步范围 1 和 2 存在重叠。请先在插件设置中修正并保存，然后再同步。");
  });

  test("provides every status-panel label and counter in English and Chinese", () => {
    expect(createTranslator("en")("statusStateSyncing")).toBe("Syncing…");
    expect(createTranslator("en")("statusCountRecovered", { count: 2 })).toBe("Recovered 2");
    expect(createTranslator("zh-CN")("syncStatusTitle")).toBe("同步状态");
    expect(createTranslator("zh-CN")("statusStateFailed")).toBe("同步失败");
    expect(createTranslator("zh-CN")("statusCountWrittenBack", { count: 3 })).toBe("回写 3");
  });
});
