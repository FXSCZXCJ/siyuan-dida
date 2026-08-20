import "./index.scss";
import { Dialog, Plugin, showMessage } from "siyuan";
import { SyncEngine } from "./core/syncEngine";
import { resolveDidaCommand, DidaCliClient } from "./dida/cli";
import { DidaCliGateway } from "./dida/gateway";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  prepareLoadedSettings,
  reconcileSettingsForSave,
  type PluginSettings
} from "./settings/defaults";
import { getResolvedCliPathForCurrentDevice, withResolvedCliPathForCurrentDevice } from "./settings/deviceCli";
import { summarizeSyncLog } from "./settings/logFormat";
import { buildSettingsPanel } from "./settings/settingsPanel";
import { WorkspaceStorage } from "./settings/workspaceStorage";
import { getRangeValidationMessage, type RangeValidationError } from "./settings/ranges";
import { SiYuanRepository } from "./siyuan/repository";
import { setSyncTooltip } from "./syncTooltip";
import type { SyncResult } from "./core/types";
import { createTranslator, type Translate } from "./i18n";

const LEGACY_STORAGE_NAME = "settings.json";

export default class SiyuanDidaPlugin extends Plugin {
  private settings!: PluginSettings;
  private syncTimer: number | undefined;
  private syncRunning = false;
  private syncButton!: HTMLElement;
  private t!: Translate;
  private storage!: WorkspaceStorage;
  private rangeConfigurationError: RangeValidationError | undefined;

  async onload() {
    const config = window.siyuan.config;
    if (!config) {
      throw new Error("SiYuan configuration is unavailable");
    }
    this.t = createTranslator(config.lang ?? navigator.language);
    this.storage = new WorkspaceStorage(
      config.system.confDir,
      config.system.workspaceDir
    );
    const loadedSettings = await this.storage.initialize(
      () => this.loadData(LEGACY_STORAGE_NAME),
      () => this.removeData(LEGACY_STORAGE_NAME)
    );
    const prepared = prepareLoadedSettings(loadedSettings);
    this.settings = prepared.settings;
    this.rangeConfigurationError = prepared.error;
    if (prepared.changed) {
      await this.persistSettings(this.settings);
    }
    this.syncButton = this.addTopBar({
      icon: "iconRefresh",
      title: this.t("syncDida"),
      position: "right",
      callback: () => void this.runSync()
    });
    this.updateStatus(
      this.rangeConfigurationError
        ? this.t("configurationInvalidStatus")
        : this.t("syncPending")
    );

    this.addCommand({
      langKey: "sync-dida-now",
      hotkey: "",
      callback: () => void this.runSync()
    });

    this.resetTimer();
    if (!this.rangeConfigurationError && this.settings.syncOnStartup) {
      setTimeout(() => void this.runSync(), 1000);
    }
  }

  onunload() {
    if (this.syncTimer !== undefined) {
      window.clearInterval(this.syncTimer);
    }
  }

  openSetting() {
    const mountId = `dida-sync-settings-${Date.now()}`;
    new Dialog({
      title: this.t("settingsTitle"),
      content: `<div id="${mountId}"></div>`,
      width: "760px"
    });

    setTimeout(() => {
      const mount = document.getElementById(mountId);
      if (!mount) {
        return;
      }
      mount.appendChild(
        buildSettingsPanel({
          settings: this.settings,
          t: this.t,
          onSave: async (settings) => {
            const previousSettings = this.settings;
            const reconciled = reconcileSettingsForSave(previousSettings, normalizeSettings(settings));
            const prepared = prepareLoadedSettings(reconciled);
            await this.persistSettings(prepared.settings, previousSettings);
            this.settings = prepared.settings;
            this.rangeConfigurationError = prepared.error;
            this.resetTimer();
            this.updateStatus(
              this.rangeConfigurationError
                ? this.t("configurationInvalidStatus")
                : this.t("syncPending")
            );
            return this.settings;
          },
          onClearLogs: async () => {
            await this.storage.clearLogs();
            this.settings.logs = [];
          }
        })
      );
    }, 0);
  }

  private async persistSettings(settings: PluginSettings, previousSettings?: PluginSettings) {
    let configurationSaved = false;
    try {
      await this.storage.saveConfiguration(settings);
      configurationSaved = true;
      await this.storage.saveRuntime(settings);
    } catch (error) {
      if (configurationSaved && previousSettings) {
        try {
          await this.storage.saveConfiguration(previousSettings);
        } catch (rollbackError) {
          throw new SettingsPersistenceRollbackError(error, rollbackError);
        }
      }
      throw error;
    }
  }

  private resetTimer() {
    if (this.syncTimer !== undefined) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }

    if (this.rangeConfigurationError || !this.settings.autoSync) {
      return;
    }

    const intervalMs = Math.max(5, this.settings.syncIntervalSeconds) * 1000;
    this.syncTimer = window.setInterval(() => void this.runSync({ silentSkip: true }), intervalMs);
  }

  private async runSync(options: { silentSkip?: boolean } = {}) {
    if (this.rangeConfigurationError) {
      this.updateStatus(this.t("configurationInvalidStatus"));
      if (!options.silentSkip) {
        showMessage(
          this.t("configurationInvalidSyncBlocked", {
            message: getRangeValidationMessage(this.rangeConfigurationError, this.t)
          }),
          7000,
          "error"
        );
      }
      return;
    }

    if (this.syncRunning) {
      if (!options.silentSkip) {
        showMessage(this.t("syncInProgress"));
      }
      return;
    }

    if (this.settings.ranges.length === 0) {
      showMessage(this.t("configureRanges"), 5000, "info");
      return;
    }

    this.syncRunning = true;
    try {
      const resolved = await resolveDidaCommand(getResolvedCliPathForCurrentDevice(this.settings) || this.settings.cliCommand || "dida");
      this.settings = withResolvedCliPathForCurrentDevice(this.settings, resolved.command);
      const didaGateway = new DidaCliGateway(new DidaCliClient(resolved.command));
      const engine = new SyncEngine(new SiYuanRepository(), didaGateway, this.t);
      const result = await engine.sync({
        maxTasksPerRun: this.settings.maxTasksPerRun || DEFAULT_SETTINGS.maxTasksPerRun,
        newTaskDate: this.settings.newTaskDate,
        ranges: this.settings.ranges
      });
      this.settings.ranges = this.settings.ranges.map((range) => ({
        ...range,
        cursorOffset: result.rangeCursorOffsets[range.id] ?? range.cursorOffset ?? 0
      }));
      this.settings.logs = await this.storage.recordSync(this.settings, result);
      this.updateStatus(result.failed > 0 ? this.t("statusFailed", { time: new Date().toLocaleTimeString() }) : this.t("statusSynced", { time: new Date().toLocaleTimeString() }));
      if (!options.silentSkip) {
        showMessage(this.t("syncComplete", { summary: summarizeSyncLog(result, this.t) }));
      }
    } catch (error) {
      const result = createErrorSyncResult((error as Error).message);
      this.settings.logs = await this.storage.recordSync(this.settings, result);
      this.updateStatus(this.t("statusFailed", { time: new Date().toLocaleTimeString() }));
      if (!options.silentSkip) {
        showMessage(this.t("syncFailed", { message: (error as Error).message }), 7000, "error");
      }
    } finally {
      this.syncRunning = false;
    }
  }

  private updateStatus(text: string) {
    if (this.syncButton) {
      setSyncTooltip(this.syncButton, text);
    }
  }

}

class SettingsPersistenceRollbackError extends Error {
  readonly persistenceError: unknown;
  readonly rollbackError: unknown;

  constructor(persistenceError: unknown, rollbackError: unknown) {
    super(
      `Failed to persist settings (${errorMessage(persistenceError)}) and failed to restore the previous configuration (${errorMessage(rollbackError)})`
    );
    this.name = "SettingsPersistenceRollbackError";
    this.persistenceError = persistenceError;
    this.rollbackError = rollbackError;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createErrorSyncResult(message: string): SyncResult {
  const now = new Date().toISOString();
  return {
    created: 0,
    recovered: 0,
    updated: 0,
    completed: 0,
    writtenBack: 0,
    failed: 1,
    skipped: 0,
    scanned: 0,
    rangeResults: [],
    rangeCursorOffsets: {},
    events: [{ time: now, level: "error", message }],
    failures: [{ message }],
    startedAt: now,
    finishedAt: now
  };
}
