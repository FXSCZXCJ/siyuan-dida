import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SyncResult } from "../core/types";
import { DEFAULT_SETTINGS, normalizeSettings } from "./defaults";
import { WorkspaceStorage } from "./workspaceStorage";

const temporaryDirectories: string[] = [];

function createStorage() {
  const workspaceDir = mkdtempSync(join(tmpdir(), "siyuan-dida-workspace-"));
  temporaryDirectories.push(workspaceDir);
  return {
    workspaceDir,
    storage: new WorkspaceStorage(join(workspaceDir, "conf"), workspaceDir)
  };
}

function result(index: number): SyncResult {
  const time = new Date(Date.UTC(2026, 7, 11, 0, index)).toISOString();
  return {
    created: index,
    updated: 0,
    completed: 0,
    writtenBack: 0,
    failed: 0,
    skipped: 0,
    scanned: 0,
    rangeResults: [],
    rangeCursorOffsets: {},
    events: [],
    failures: [],
    startedAt: time,
    finishedAt: time
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("WorkspaceStorage", () => {
  test("uses workspace conf for settings and workspace temp for runtime data", () => {
    const { workspaceDir, storage } = createStorage();

    expect(storage.paths).toEqual({
      configuration: join(workspaceDir, "conf", "siyuan-dida", "settings.json"),
      runtime: join(workspaceDir, "temp", "siyuan-dida", "state.json"),
      log: join(workspaceDir, "temp", "siyuan-dida", "sync.log")
    });
  });

  test("persists separated configuration and runtime state", async () => {
    const { storage } = createStorage();
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      cliCommand: "/custom/dida",
      resolvedCliPath: "/resolved/dida",
      resolvedCliPaths: { "darwin:desk": "/resolved/dida" },
      ranges: [
        {
          id: "range-1",
          name: "Work",
          notebookId: "box-1",
          hpathPrefix: "/Work",
          includeChildren: true,
          targetProjectId: "project-1",
          targetProjectName: "Dida Work",
          cursorOffset: 9
        }
      ],
      logs: [result(1)]
    });

    await storage.saveConfiguration(settings);
    await storage.saveRuntime(settings);

    const configuration = JSON.parse(readFileSync(storage.paths.configuration, "utf8"));
    const runtime = JSON.parse(readFileSync(storage.paths.runtime, "utf8"));
    expect(configuration.cliCommand).toBe("/custom/dida");
    expect(configuration).not.toHaveProperty("logs");
    expect(configuration).not.toHaveProperty("resolvedCliPaths");
    expect(configuration.ranges[0]).not.toHaveProperty("cursorOffset");
    expect(runtime).toEqual({
      resolvedCliPath: "/resolved/dida",
      resolvedCliPaths: { "darwin:desk": "/resolved/dida" },
      rangeCursorOffsets: { "range-1": 9 }
    });
  });

  test("keeps only the newest 20 sync results in NDJSON", async () => {
    const { storage } = createStorage();

    for (let index = 0; index < 23; index += 1) {
      await storage.appendLog(result(index));
    }

    const logs = await storage.loadLogs();
    expect(logs).toHaveLength(20);
    expect(logs[0].created).toBe(22);
    expect(logs[19].created).toBe(3);
    expect(readFileSync(storage.paths.log, "utf8").trim().split("\n")).toHaveLength(20);
  });

  test("clears persisted logs", async () => {
    const { storage } = createStorage();
    await storage.appendLog(result(1));

    await storage.clearLogs();

    expect(await storage.loadLogs()).toEqual([]);
    expect(readFileSync(storage.paths.log, "utf8")).toBe("");
  });

  test("migrates legacy settings before removing the legacy file", async () => {
    const { storage } = createStorage();
    const legacy = normalizeSettings({
      ...DEFAULT_SETTINGS,
      cliCommand: "/legacy/dida",
      resolvedCliPaths: { "darwin:desk": "/legacy/dida" },
      ranges: [
        {
          id: "range-1",
          name: "Work",
          notebookId: "box-1",
          hpathPrefix: "/Work",
          includeChildren: true,
          targetProjectId: "project-1",
          targetProjectName: "Dida Work",
          cursorOffset: 15
        }
      ],
      logs: [result(2)]
    });
    const removal = vi.fn(async () => {
      expect(readFileSync(storage.paths.configuration, "utf8")).toContain("/legacy/dida");
      expect(readFileSync(storage.paths.runtime, "utf8")).toContain('"range-1": 15');
      expect(readFileSync(storage.paths.log, "utf8")).toContain('"created":2');
    });

    const loaded = await storage.initialize(async () => legacy, removal);

    expect(loaded.cliCommand).toBe("/legacy/dida");
    expect(loaded.ranges[0].cursorOffset).toBe(15);
    expect(loaded.logs).toEqual([result(2)]);
    expect(removal).toHaveBeenCalledOnce();
  });

  test("does not remove legacy data when migration persistence fails", async () => {
    const { storage, workspaceDir } = createStorage();
    writeFileSync(join(workspaceDir, "conf"), "not-a-directory");
    const removal = vi.fn(async () => undefined);

    await expect(storage.initialize(async () => DEFAULT_SETTINGS, removal)).rejects.toThrow();

    expect(removal).not.toHaveBeenCalled();
  });
});
