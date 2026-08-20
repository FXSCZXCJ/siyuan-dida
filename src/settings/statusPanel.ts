import type { SyncResult } from "../core/types";
import type { Translate, TranslationKey } from "../i18n";

export type SyncStatusState = "pending" | "syncing" | "success" | "failed";

export interface SyncStatusSnapshot {
  state: SyncStatusState;
  latestResult?: SyncResult;
  lastFinishedAt?: string;
  message?: string;
}

export interface SyncStatusController {
  getSnapshot(): SyncStatusSnapshot;
  publish(snapshot: SyncStatusSnapshot): void;
  subscribe(subscriber: (snapshot: SyncStatusSnapshot) => void): () => void;
}

export function createSyncStatusController(initial: SyncStatusSnapshot): SyncStatusController {
  let snapshot = initial;
  const subscribers = new Set<(snapshot: SyncStatusSnapshot) => void>();
  return {
    getSnapshot: () => snapshot,
    publish(next) {
      snapshot = next;
      for (const subscriber of [...subscribers]) {
        try {
          subscriber(snapshot);
        } catch {
          // One settings view must not prevent other status consumers from updating.
        }
      }
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      try {
        subscriber(snapshot);
      } catch {
        // Subscriber failures are isolated from plugin lifecycle and sync execution.
      }
      return () => subscribers.delete(subscriber);
    }
  };
}

export interface StatusPanelOptions {
  status: SyncStatusController;
  t: Translate;
  locale?: string;
  onSyncNow(): void | Promise<void>;
}

export interface StatusPanelView {
  element: HTMLElement;
  destroy(): void;
}

const counters: Array<{ key: keyof SyncResult; label: TranslationKey }> = [
  { key: "scanned", label: "statusCountScanned" },
  { key: "created", label: "statusCountCreated" },
  { key: "recovered", label: "statusCountRecovered" },
  { key: "updated", label: "statusCountUpdated" },
  { key: "completed", label: "statusCountCompleted" },
  { key: "writtenBack", label: "statusCountWrittenBack" },
  { key: "skipped", label: "statusCountSkipped" },
  { key: "failed", label: "statusCountFailed" }
];

export function buildStatusPanel(options: StatusPanelOptions): StatusPanelView {
  const root = document.createElement("section");
  root.className = "dida-sync-status dida-sync-section";
  root.setAttribute("aria-label", options.t("syncStatusTitle"));
  root.setAttribute("aria-live", "polite");
  root.setAttribute("role", "status");
  root.innerHTML = `
    <div class="dida-sync-status__header">
      <div>
        <div class="dida-sync-section__title">${options.t("syncStatusTitle")}</div>
        <div class="dida-sync-status__state" data-field="syncStatus"></div>
      </div>
      <button class="b3-button" data-action="syncNow" type="button">${options.t("syncNow")}</button>
    </div>
    <div class="dida-sync-status__meta">
      <span>${options.t("statusLastFinished")}</span>
      <time data-field="lastFinishedAt">—</time>
    </div>
    <div class="dida-sync-status__counters" data-field="statusCounters"></div>
    <div class="dida-sync-status__message" data-field="statusMessage" hidden></div>
  `;

  const state = root.querySelector<HTMLElement>('[data-field="syncStatus"]')!;
  const lastFinishedAt = root.querySelector<HTMLTimeElement>('[data-field="lastFinishedAt"]')!;
  const counterContainer = root.querySelector<HTMLElement>('[data-field="statusCounters"]')!;
  const message = root.querySelector<HTMLElement>('[data-field="statusMessage"]')!;
  const button = root.querySelector<HTMLButtonElement>('[data-action="syncNow"]')!;

  const render = (snapshot: SyncStatusSnapshot) => {
    state.textContent = options.t(statusLabel(snapshot.state));
    state.dataset.state = snapshot.state;
    const syncing = snapshot.state === "syncing";
    button.disabled = syncing;
    if (syncing) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }

    if (snapshot.lastFinishedAt) {
      const date = new Date(snapshot.lastFinishedAt);
      lastFinishedAt.textContent = Number.isNaN(date.getTime())
        ? snapshot.lastFinishedAt
        : date.toLocaleString(options.locale);
      lastFinishedAt.dateTime = snapshot.lastFinishedAt;
    } else {
      lastFinishedAt.textContent = "—";
      lastFinishedAt.removeAttribute("datetime");
    }

    const latestResult = snapshot.latestResult;
    counterContainer.replaceChildren(...counters.map(({ key, label }) => {
      const counter = document.createElement("span");
      counter.className = "dida-sync-status__counter";
      const value = latestResult ? Number(latestResult[key] ?? 0) : 0;
      counter.textContent = options.t(label, { count: value });
      return counter;
    }));

    message.textContent = snapshot.message ?? "";
    message.hidden = !snapshot.message;
  };

  const onClick = () => void options.onSyncNow();
  button.addEventListener("click", onClick);
  const unsubscribe = options.status.subscribe(render);
  let destroyed = false;

  return {
    element: root,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      button.removeEventListener("click", onClick);
    }
  };
}

function statusLabel(state: SyncStatusState): TranslationKey {
  switch (state) {
    case "syncing": return "statusStateSyncing";
    case "success": return "statusStateSuccess";
    case "failed": return "statusStateFailed";
    default: return "statusStatePending";
  }
}
