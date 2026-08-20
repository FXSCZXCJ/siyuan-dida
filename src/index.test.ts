// @vitest-environment happy-dom

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PluginSettings } from "./settings/defaults";
import type { SettingsPanelOptions } from "./settings/settingsPanel";

const pluginMocks = vi.hoisted(() => ({
  loadedSettings: undefined as PluginSettings | undefined,
  commandCallback: undefined as (() => void) | undefined,
  panelOnSave: undefined as SettingsPanelOptions["onSave"] | undefined,
  topBarButton: undefined as HTMLElement | undefined,
  showMessage: vi.fn(),
  saveConfiguration: vi.fn(async (_settings: PluginSettings) => undefined),
  saveRuntime: vi.fn(async (_settings: PluginSettings) => undefined),
  engineSync: vi.fn(async () => undefined)
}));

vi.mock("siyuan", () => ({
  Dialog: class {
    constructor(options: { content: string }) {
      const content = document.createElement("div");
      content.innerHTML = options.content;
      document.body.append(content);
    }
  },
  Plugin: class {
    addTopBar(options: { callback(): void }) {
      pluginMocks.topBarButton = document.createElement("button");
      pluginMocks.topBarButton.addEventListener("click", options.callback);
      return pluginMocks.topBarButton;
    }

    addCommand(options: { callback(): void }) {
      pluginMocks.commandCallback = options.callback;
    }
  },
  showMessage: pluginMocks.showMessage
}));

vi.mock("./settings/settingsPanel", () => ({
  buildSettingsPanel: (options: SettingsPanelOptions) => {
    pluginMocks.panelOnSave = options.onSave;
    return document.createElement("div");
  }
}));

vi.mock("./settings/workspaceStorage", () => ({
  WorkspaceStorage: class {
    initialize = async () => pluginMocks.loadedSettings!;
    saveConfiguration = pluginMocks.saveConfiguration;
    saveRuntime = pluginMocks.saveRuntime;
    recordSync = vi.fn(async () => []);
    clearLogs = vi.fn(async () => undefined);
  }
}));

vi.mock("./core/syncEngine", () => ({
  SyncEngine: class {
    sync = pluginMocks.engineSync;
  }
}));

vi.mock("./dida/cli", () => ({
  resolveDidaCommand: vi.fn(async () => ({ command: "dida", version: "test" })),
  DidaCliClient: class {}
}));

import SiyuanDidaPlugin from "./index";

function loadedSettings(kind: "duplicate" | "overlap"): PluginSettings {
  const first = {
    id: "range-1",
    name: "Work",
    notebookId: "box-1",
    hpathPrefix: "/Work",
    includeChildren: true,
    targetProjectId: "project-1",
    targetProjectName: "Work",
    cursorOffset: 3
  };
  return {
    cliCommand: "dida",
    resolvedCliPath: "",
    resolvedCliPaths: {},
    autoSync: true,
    newTaskDate: "today",
    syncIntervalSeconds: 15,
    syncOnStartup: true,
    maxTasksPerRun: 200,
    ranges: [
      first,
      {
        ...first,
        id: kind === "duplicate" ? "range-1" : "range-2",
        hpathPrefix: kind === "duplicate" ? "/Personal" : "/Work/Weekly",
        targetProjectId: "project-2"
      }
    ],
    logs: []
  };
}

function loadedSettingsWithMissingField(
  field: "notebookId" | "hpathPrefix" | "targetProjectId"
): PluginSettings {
  const settings = loadedSettings("overlap");
  const range = { ...settings.ranges[0], [field]: "" };
  return {
    ...settings,
    ranges: [range]
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function openSettings(plugin: SiyuanDidaPlugin) {
  plugin.openSetting();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  expect(pluginMocks.panelOnSave).toBeTypeOf("function");
}

describe("loaded sync-range safety gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pluginMocks.commandCallback = undefined;
    pluginMocks.panelOnSave = undefined;
    pluginMocks.topBarButton = undefined;
    document.body.replaceChildren();
    Object.defineProperty(window, "siyuan", {
      configurable: true,
      value: {
        config: {
          lang: "en",
          system: { confDir: "/conf", workspaceDir: "/workspace" }
        }
      }
    });
  });

  test.each(["duplicate", "overlap"] as const)(
    "blocks timers and manual engine entry for loaded %s ranges",
    async (kind) => {
      pluginMocks.loadedSettings = loadedSettings(kind);
      const intervalSpy = vi.spyOn(window, "setInterval");
      const timeoutSpy = vi.spyOn(window, "setTimeout");
      const plugin = new SiyuanDidaPlugin({} as never);

      await plugin.onload();

      expect(intervalSpy).not.toHaveBeenCalled();
      expect(timeoutSpy).not.toHaveBeenCalled();
      expect(pluginMocks.topBarButton?.getAttribute("aria-label")).toBe("Dida: configuration invalid");
      expect(pluginMocks.saveConfiguration).toHaveBeenCalledOnce();
      expect(pluginMocks.saveConfiguration.mock.calls[0][0]).toMatchObject({
        autoSync: false,
        syncOnStartup: false
      });

      pluginMocks.commandCallback?.();
      await flushPromises();

      expect(pluginMocks.engineSync).not.toHaveBeenCalled();
      expect(pluginMocks.showMessage).toHaveBeenCalledWith(
        expect.stringContaining("Correct and save them in plugin settings before syncing."),
        7000,
        "error"
      );
    }
  );

  test.each([
    ["notebookId", "Sync range 1 is missing a notebook."],
    ["hpathPrefix", "Sync range 1 is missing a document path."],
    ["targetProjectId", "Sync range 1 is missing a Dida list."]
  ] as const)(
    "retains and blocks a persisted range with missing %s",
    async (field, validationMessage) => {
      pluginMocks.loadedSettings = loadedSettingsWithMissingField(field);
      const intervalSpy = vi.spyOn(window, "setInterval");
      const timeoutSpy = vi.spyOn(window, "setTimeout");
      const plugin = new SiyuanDidaPlugin({} as never);

      await plugin.onload();

      const retainedSettings = (plugin as unknown as { settings: PluginSettings }).settings;
      expect(retainedSettings.ranges).toHaveLength(1);
      expect(retainedSettings.ranges[0][field]).toBe("");
      expect(pluginMocks.saveConfiguration.mock.calls[0][0].ranges).toHaveLength(1);
      expect(pluginMocks.saveConfiguration.mock.calls[0][0].ranges[0][field]).toBe("");
      expect(intervalSpy).not.toHaveBeenCalled();
      expect(timeoutSpy).not.toHaveBeenCalled();

      pluginMocks.commandCallback?.();
      await flushPromises();

      expect(pluginMocks.engineSync).not.toHaveBeenCalled();
      expect(pluginMocks.showMessage).toHaveBeenCalledWith(
        `Saved sync ranges are invalid: ${validationMessage} Correct and save them in plugin settings before syncing.`,
        7000,
        "error"
      );
    }
  );

  test.each(["configuration", "runtime"] as const)(
    "keeps an invalid live safety gate when %s persistence rejects a valid save",
    async (failedWrite) => {
      pluginMocks.loadedSettings = loadedSettingsWithMissingField("notebookId");
      const plugin = new SiyuanDidaPlugin({} as never);
      await plugin.onload();
      await openSettings(plugin);

      const previousSettings = (plugin as unknown as { settings: PluginSettings }).settings;
      const saveError = new Error(`${failedWrite} write failed`);
      if (failedWrite === "configuration") {
        pluginMocks.saveConfiguration.mockRejectedValueOnce(saveError);
      } else {
        pluginMocks.saveRuntime.mockRejectedValueOnce(saveError);
      }
      const intervalSpy = vi.spyOn(window, "setInterval");
      const clearIntervalSpy = vi.spyOn(window, "clearInterval");
      const validCandidate: PluginSettings = {
        ...previousSettings,
        autoSync: true,
        syncOnStartup: true,
        ranges: previousSettings.ranges.map((range) => ({
          ...range,
          notebookId: "box-1"
        }))
      };

      await expect(pluginMocks.panelOnSave!(validCandidate)).rejects.toThrow(saveError.message);

      const liveSettings = (plugin as unknown as { settings: PluginSettings }).settings;
      expect(liveSettings).toBe(previousSettings);
      expect(liveSettings).toMatchObject({ autoSync: false, syncOnStartup: false });
      expect(liveSettings.ranges[0].notebookId).toBe("");
      expect(intervalSpy).not.toHaveBeenCalled();
      expect(clearIntervalSpy).not.toHaveBeenCalled();
      if (failedWrite === "runtime") {
        expect(pluginMocks.saveConfiguration).toHaveBeenLastCalledWith(previousSettings);
      }

      pluginMocks.commandCallback?.();
      await flushPromises();
      pluginMocks.topBarButton?.click();
      await flushPromises();

      expect(pluginMocks.engineSync).not.toHaveBeenCalled();
      expect(pluginMocks.showMessage).toHaveBeenLastCalledWith(
        expect.stringContaining("Correct and save them in plugin settings before syncing."),
        7000,
        "error"
      );
    }
  );

  test("uses the active locale for the sync completion summary", async () => {
    const validSettings = loadedSettings("overlap");
    validSettings.autoSync = false;
    validSettings.syncOnStartup = false;
    validSettings.ranges = validSettings.ranges.slice(0, 1);
    pluginMocks.loadedSettings = validSettings;
    pluginMocks.engineSync.mockResolvedValueOnce({
      created: 2,
      recovered: 1,
      updated: 3,
      completed: 4,
      writtenBack: 5,
      failed: 0,
      skipped: 6,
      scanned: 7,
      rangeResults: [],
      rangeCursorOffsets: { "range-1": 0 },
      events: [],
      failures: [],
      startedAt: "2026-06-27T01:00:00.000Z",
      finishedAt: "2026-06-27T01:00:01.000Z"
    } as never);
    const plugin = new SiyuanDidaPlugin({} as never);
    await plugin.onload();

    pluginMocks.topBarButton?.click();
    await flushPromises();
    await flushPromises();

    expect(pluginMocks.showMessage).toHaveBeenCalledWith(
      "Dida sync complete: scanned 7, created 2, recovered 1, updated 3, completed 4, written back 5, skipped 6, failed 0"
    );
  });
});
