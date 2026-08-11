import type { NewTaskDate, SyncRange, SyncResult } from "../core/types";

export interface PluginSettings {
  cliCommand: string;
  resolvedCliPath: string;
  resolvedCliPaths: Record<string, string>;
  autoSync: boolean;
  newTaskDate: NewTaskDate;
  syncIntervalSeconds: number;
  syncOnStartup: boolean;
  maxTasksPerRun: number;
  ranges: SyncRange[];
  logs: SyncResult[];
}

export type StoredSyncRange = Omit<SyncRange, "cursorOffset">;

export interface StoredPluginSettings {
  cliCommand: string;
  autoSync: boolean;
  newTaskDate: NewTaskDate;
  syncIntervalSeconds: number;
  syncOnStartup: boolean;
  maxTasksPerRun: number;
  ranges: StoredSyncRange[];
}

export interface PluginRuntimeState {
  resolvedCliPath: string;
  resolvedCliPaths: Record<string, string>;
  rangeCursorOffsets: Record<string, number>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  cliCommand: "dida",
  resolvedCliPath: "",
  resolvedCliPaths: {},
  autoSync: false,
  newTaskDate: "today",
  syncIntervalSeconds: 15,
  syncOnStartup: false,
  maxTasksPerRun: 200,
  ranges: [],
  logs: []
};

export function normalizeSettings(value: Partial<PluginSettings> | null | undefined): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    newTaskDate: value?.newTaskDate === "none" ? "none" : "today",
    resolvedCliPaths: value?.resolvedCliPaths ?? {},
    ranges: value?.ranges ?? [],
    logs: value?.logs ?? []
  };
}

export function settingsForSave(current: PluginSettings, updates: Partial<PluginSettings>): PluginSettings {
  const next = normalizeSettings({
    ...current,
    ...updates
  });
  if (next.cliCommand !== current.cliCommand) {
    next.resolvedCliPath = "";
    next.resolvedCliPaths = {};
  }
  return next;
}

export function splitSettingsForStorage(settings: PluginSettings): {
  configuration: StoredPluginSettings;
  runtime: PluginRuntimeState;
} {
  return {
    configuration: {
      cliCommand: settings.cliCommand,
      autoSync: settings.autoSync,
      newTaskDate: settings.newTaskDate,
      syncIntervalSeconds: settings.syncIntervalSeconds,
      syncOnStartup: settings.syncOnStartup,
      maxTasksPerRun: settings.maxTasksPerRun,
      ranges: settings.ranges.map(({ cursorOffset: _cursorOffset, ...range }) => range)
    },
    runtime: {
      resolvedCliPath: settings.resolvedCliPath,
      resolvedCliPaths: { ...settings.resolvedCliPaths },
      rangeCursorOffsets: Object.fromEntries(
        settings.ranges
          .filter((range) => typeof range.cursorOffset === "number")
          .map((range) => [range.id, range.cursorOffset as number])
      )
    }
  };
}

export function mergeStoredSettings(
  configuration: Partial<StoredPluginSettings> | null | undefined,
  runtime: Partial<PluginRuntimeState> | null | undefined,
  logs: SyncResult[] = []
): PluginSettings {
  const ranges = (configuration?.ranges ?? []).map((range) => ({
    ...range,
    cursorOffset: runtime?.rangeCursorOffsets?.[range.id] ?? 0
  }));
  return normalizeSettings({
    ...configuration,
    resolvedCliPath: runtime?.resolvedCliPath ?? "",
    resolvedCliPaths: runtime?.resolvedCliPaths ?? {},
    ranges,
    logs
  });
}
