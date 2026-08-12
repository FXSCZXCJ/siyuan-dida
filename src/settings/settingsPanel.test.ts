// @vitest-environment happy-dom

import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTranslator } from "../i18n";
import type { PluginSettings } from "./defaults";
import { getRangeValidationMessage, getTargetProjectWarning, RangeValidationError } from "./ranges";

const panelMocks = vi.hoisted(() => ({
  notebooks: Promise.resolve([] as Array<{ id: string; name: string }>),
  projects: Promise.resolve([] as Array<{ id: string; name: string }>)
}));

vi.mock("../siyuan/api", () => ({
  listNotebooks: () => panelMocks.notebooks
}));

vi.mock("../dida/cli", () => ({
  resolveDidaCommand: async () => ({ command: "dida", version: "test" }),
  DidaCliClient: class {
    listProjects() {
      return panelMocks.projects;
    }
  }
}));

import { buildSettingsPanel } from "./settingsPanel";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function settings(): PluginSettings {
  return {
    cliCommand: "dida",
    resolvedCliPath: "",
    resolvedCliPaths: {},
    autoSync: false,
    newTaskDate: "today",
    syncIntervalSeconds: 15,
    syncOnStartup: false,
    maxTasksPerRun: 200,
    ranges: [
      {
        id: "range-1",
        name: "Work",
        notebookId: "box-1",
        hpathPrefix: "/Work",
        includeChildren: true,
        targetProjectId: "project-1",
        targetProjectName: "Original list",
        cursorOffset: 0
      }
    ],
    logs: []
  };
}

async function flushAsyncRendering() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("buildSettingsPanel range target behavior", () => {
  beforeEach(() => {
    panelMocks.notebooks = new Promise(() => undefined);
    panelMocks.projects = new Promise(() => undefined);
  });

  test("fallback input clears stale target name across an async rerender before save", async () => {
    const notebooks = deferred<Array<{ id: string; name: string }>>();
    panelMocks.notebooks = notebooks.promise;
    const onSave = vi.fn(async (_settings: PluginSettings) => undefined);
    const panel = buildSettingsPanel({
      settings: settings(),
      t: createTranslator("en"),
      onSave,
      onClearLogs: async () => undefined
    });

    const targetInput = panel.querySelector<HTMLInputElement>('[data-field="targetProjectId"]')!;
    targetInput.value = "typed-project";
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));

    notebooks.resolve([{ id: "box-1", name: "Notebook" }]);
    await flushAsyncRendering();
    panel.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flushAsyncRendering();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].ranges[0]).toMatchObject({
      targetProjectId: "typed-project",
      targetProjectName: ""
    });
  });

  test("fallback input shows the warning for a changed target and hides it after reverting", () => {
    const panel = buildSettingsPanel({
      settings: settings(),
      t: createTranslator("en"),
      onSave: async () => undefined,
      onClearLogs: async () => undefined
    });
    const targetInput = panel.querySelector<HTMLInputElement>('[data-field="targetProjectId"]')!;
    const warning = panel.querySelector<HTMLElement>('[data-field="targetProjectWarning"]')!;

    targetInput.value = "project-2";
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain("Existing bindings remain");

    targetInput.value = "project-1";
    targetInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(warning.hidden).toBe(true);
    expect(warning.textContent).toBe("");
  });

  test("loaded target select updates the target name and warning for input and change", async () => {
    panelMocks.projects = Promise.resolve([
      { id: "project-1", name: "Original list" },
      { id: "project-2", name: "Second list" }
    ]);
    const onSave = vi.fn(async (_settings: PluginSettings) => undefined);
    const panel = buildSettingsPanel({
      settings: settings(),
      t: createTranslator("en"),
      onSave,
      onClearLogs: async () => undefined
    });
    await flushAsyncRendering();

    const select = panel.querySelector<HTMLSelectElement>('[data-field="targetProjectId"]')!;
    const warning = panel.querySelector<HTMLElement>('[data-field="targetProjectWarning"]')!;
    expect(select.tagName).toBe("SELECT");

    select.value = "project-2";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    expect(warning.hidden).toBe(false);

    panel.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flushAsyncRendering();
    expect(onSave.mock.calls[0][0].ranges[0]).toMatchObject({
      targetProjectId: "project-2",
      targetProjectName: "Second list"
    });

    select.value = "project-1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(warning.hidden).toBe(true);
  });
});
