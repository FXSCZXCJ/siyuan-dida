import { describe, expect, test } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeStoredSettings,
  normalizeSettings,
  settingsForSave,
  splitSettingsForStorage
} from "./defaults";

describe("settingsForSave", () => {
  test("defaults legacy settings to creating new tasks with today's date", () => {
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      newTaskDate: undefined
    });

    expect(settings.newTaskDate).toBe("today");
  });

  test("keeps a resolved CLI path when the configured command is unchanged", () => {
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      cliCommand: "dida",
      resolvedCliPath: "/opt/homebrew/bin/dida",
      resolvedCliPaths: {
        "darwin:desk-1": "/opt/homebrew/bin/dida"
      }
    });

    expect(settingsForSave(current, { cliCommand: "dida" }).resolvedCliPath).toBe("/opt/homebrew/bin/dida");
    expect(settingsForSave(current, { cliCommand: "dida" }).resolvedCliPaths).toEqual({
      "darwin:desk-1": "/opt/homebrew/bin/dida"
    });
  });

  test("clears resolved CLI path caches when the configured command changes", () => {
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      cliCommand: "dida",
      resolvedCliPath: "/opt/homebrew/bin/dida",
      resolvedCliPaths: {
        "darwin:desk-1": "/opt/homebrew/bin/dida",
        "win32:desk-2": "C:\\Users\\me\\AppData\\Roaming\\npm\\dida.cmd"
      }
    });

    const next = settingsForSave(current, { cliCommand: "/custom/bin/dida" });

    expect(next.resolvedCliPath).toBe("");
    expect(next.resolvedCliPaths).toEqual({});
  });
});

describe("workspace storage shapes", () => {
  test("separates stable configuration from device paths, cursors, and logs", () => {
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      resolvedCliPath: "/opt/homebrew/bin/dida",
      resolvedCliPaths: { "darwin:desk-1": "/opt/homebrew/bin/dida" },
      ranges: [
        {
          id: "range-1",
          name: "Work",
          notebookId: "box-1",
          hpathPrefix: "/Work",
          includeChildren: true,
          targetProjectId: "project-1",
          targetProjectName: "Dida Work",
          cursorOffset: 42
        }
      ],
      logs: [{ startedAt: "2026-08-11T00:00:00.000Z" } as never]
    });

    const stored = splitSettingsForStorage(settings);

    expect(stored.configuration).not.toHaveProperty("resolvedCliPath");
    expect(stored.configuration).not.toHaveProperty("resolvedCliPaths");
    expect(stored.configuration).not.toHaveProperty("logs");
    expect(stored.configuration.ranges[0]).not.toHaveProperty("cursorOffset");
    expect(stored.runtime).toEqual({
      resolvedCliPath: "/opt/homebrew/bin/dida",
      resolvedCliPaths: { "darwin:desk-1": "/opt/homebrew/bin/dida" },
      rangeCursorOffsets: { "range-1": 42 }
    });
  });

  test("merges persisted configuration, runtime state, and logs", () => {
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      cliCommand: "/custom/dida",
      ranges: [
        {
          id: "range-1",
          name: "Work",
          notebookId: "box-1",
          hpathPrefix: "/Work",
          includeChildren: true,
          targetProjectId: "project-1",
          targetProjectName: "Dida Work",
          cursorOffset: 7
        }
      ],
      logs: [{ startedAt: "2026-08-11T00:00:00.000Z" } as never]
    });
    const stored = splitSettingsForStorage(current);

    const merged = mergeStoredSettings(stored.configuration, stored.runtime, current.logs);

    expect(merged.cliCommand).toBe("/custom/dida");
    expect(merged.ranges[0].cursorOffset).toBe(7);
    expect(merged.logs).toEqual(current.logs);
  });
});
