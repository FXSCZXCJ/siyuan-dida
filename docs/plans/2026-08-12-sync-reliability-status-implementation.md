# Sync Reliability and Status Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent duplicate Dida task creation after partial failures, reject ambiguous source ranges, localize all sync reporting, and add a tested live status panel to plugin settings.

**Architecture:** Extend the Dida gateway with an incomplete-task snapshot and embed a stable SiYuan block marker in every created task. The sync engine uses that snapshot as an idempotency index before any creation. Keep validation, formatting, and status rendering in small testable modules, while the plugin entry point remains the single owner of sync execution and status transitions.

**Tech Stack:** TypeScript, Vitest, happy-dom, Vite, SiYuan Plugin API, local Dida CLI.

---

### Task 1: Dida task snapshots and source markers

**Files:**
- Create: `src/core/sourceMarker.ts`
- Create: `src/core/sourceMarker.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/dida/cli.ts`
- Modify: `src/dida/cli.test.ts`
- Modify: `src/dida/gateway.ts`

**Step 1: Write the failing source-marker tests**

Cover building localized content with a language-independent `SiYuan-Block-ID:` line, parsing markers from CRLF and LF content, and ignoring malformed content.

**Step 2: Run the focused test and verify RED**

Run: `npm test -- src/core/sourceMarker.test.ts`

Expected: FAIL because `sourceMarker.ts` does not exist.

**Step 3: Implement the minimal marker helpers**

Export a marker prefix, `buildTaskSourceContent(sourceLabel, blockId)`, and `parseSourceBlockId(content)`.

**Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/core/sourceMarker.test.ts`

Expected: PASS.

**Step 5: Write a failing CLI snapshot test**

Assert that `DidaCliClient.listIncompleteTasks(["project-1", "project-2"])` invokes:

```text
dida task filter --status 0 --projects project-1,project-2 --json
```

and returns task IDs, project IDs, titles, and content.

**Step 6: Run the CLI test and verify RED**

Run: `npm test -- src/dida/cli.test.ts`

Expected: FAIL because `listIncompleteTasks` is missing.

**Step 7: Implement the snapshot gateway**

Add `DidaTaskSnapshot` and `DidaGateway.listIncompleteTasks`. Implement the CLI method and delegate it through `DidaCliGateway`.

**Step 8: Run focused tests and verify GREEN**

Run: `npm test -- src/core/sourceMarker.test.ts src/dida/cli.test.ts`

Expected: PASS.

### Task 2: Idempotent synchronization recovery

**Files:**
- Modify: `src/core/syncEngine.ts`
- Modify: `src/core/syncEngine.test.ts`
- Modify: `src/i18n.ts`

**Step 1: Extend the fake gateway and write failing recovery tests**

Add tests for:

- source marker included in every newly created task;
- an existing marked Dida task restoring SiYuan attributes without creation;
- a create call that side-effects a task and loses its response, followed by successful recovery on the next run;
- recovered parent and child tasks restoring their relationship in parent-first order;
- duplicate marked tasks producing an ambiguity failure;
- snapshot failure blocking unbound creation while allowing a bound title update.

**Step 2: Run the engine test and verify RED**

Run: `npm test -- src/core/syncEngine.test.ts`

Expected: FAIL on the new recovery expectations.

**Step 3: Load the incomplete snapshot once per run**

Build a block-ID index across unique configured Dida project IDs. Track whether new-task creation is safe for the current run. Record localized snapshot errors.

**Step 4: Recover or create unbound tasks**

For an unbound incomplete block:

1. Reject an ambiguous marker match.
2. Recover a unique task binding and parent relationship.
3. Refuse creation if the snapshot is unavailable.
4. Otherwise create with the marker, index the new task immediately, set parent, and persist attributes.

Count recovered tasks separately in `SyncResult.recovered`, including range results and summaries.

**Step 5: Run the engine tests and verify GREEN**

Run: `npm test -- src/core/syncEngine.test.ts`

Expected: PASS.

**Step 6: Run all core and Dida tests**

Run: `npm test -- src/core src/dida`

Expected: PASS.

### Task 3: Safe sync-range configuration

**Files:**
- Modify: `src/settings/ranges.ts`
- Modify: `src/settings/ranges.test.ts`
- Modify: `src/settings/settingsPanel.ts`
- Modify: `src/i18n.ts`

**Step 1: Write failing validation and ID tests**

Cover:

- unique IDs for consecutive draft ranges;
- identical paths in the same notebook;
- ancestor/descendant overlap only when the ancestor includes children;
- valid sibling paths;
- valid identical paths in different notebooks;
- normalization of leading and trailing slashes;
- typed missing-field and overlap errors.

**Step 2: Run the focused test and verify RED**

Run: `npm test -- src/settings/ranges.test.ts`

Expected: FAIL on uniqueness and overlap behavior.

**Step 3: Implement typed range validation**

Introduce `RangeValidationError` with stable codes and details, normalized paths, pairwise overlap detection, and collision-resistant IDs via `crypto.randomUUID()`.

**Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/settings/ranges.test.ts`

Expected: PASS.

**Step 5: Surface localized errors and target-list warnings**

Translate typed validation errors in the settings panel. Track the original target project for each range and show a warning when it changes: existing bindings remain in their original Dida lists and only new tasks use the new target.

**Step 6: Re-run settings tests**

Run: `npm test -- src/settings`

Expected: PASS.

### Task 4: Fully localized logs and status summaries

**Files:**
- Modify: `src/i18n.ts`
- Modify: `src/i18n.test.ts`
- Modify: `src/settings/logFormat.ts`
- Modify: `src/settings/logFormat.test.ts`
- Modify: `src/index.ts`

**Step 1: Write failing English and Chinese formatting tests**

Test empty logs, aggregate summaries, range cursor text, failure lines, and the new recovered count in both locales.

**Step 2: Run focused tests and verify RED**

Run: `npm test -- src/settings/logFormat.test.ts src/i18n.test.ts`

Expected: FAIL because formatting is hard-coded in Chinese.

**Step 3: Route formatting through the translator**

Make `formatSyncLogs` and `summarizeSyncLog` accept `Translate`, defaulting to Simplified Chinese only for backward compatibility. Add all required translation keys and pass the active translator from the plugin and settings panel.

**Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/settings/logFormat.test.ts src/i18n.test.ts`

Expected: PASS.

### Task 5: Live settings status panel and lifecycle cleanup

**Files:**
- Create: `src/settings/statusPanel.ts`
- Create: `src/settings/statusPanel.test.ts`
- Modify: `src/settings/settingsPanel.ts`
- Modify: `src/index.ts`
- Modify: `src/index.scss`
- Modify: `src/i18n.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Add the DOM test environment**

Run: `npm install --save-dev happy-dom`

Expected: `package.json` and `package-lock.json` update intentionally.

**Step 2: Write failing status-panel tests**

Using `// @vitest-environment happy-dom`, verify:

- pending, syncing, success, and failed labels;
- last finished time and latest counters;
- recovered count;
- Sync now invokes the callback;
- the button is disabled while syncing;
- destroying the view unsubscribes from status changes.

**Step 3: Run the focused test and verify RED**

Run: `npm test -- src/settings/statusPanel.test.ts`

Expected: FAIL because the status panel does not exist.

**Step 4: Implement the status view**

Create a small theme-aware DOM component using SiYuan's `b3-button` classes and `--b3-*` variables. Return `{ element, destroy }` so the dialog can release its listener.

**Step 5: Run the focused test and verify GREEN**

Run: `npm test -- src/settings/statusPanel.test.ts`

Expected: PASS.

**Step 6: Integrate status ownership in the plugin**

Keep `SyncStatusSnapshot` in the entry point, publish transitions to subscribers, expose manual sync to the settings panel, refresh status after every result, and preserve the top-bar tooltip.

Move `addTopBar()` to `onLayoutReady()`. Track startup and settings-mount timeout handles, clear them in `onunload()`, unsubscribe the status panel in the dialog's `destroyCallback`, and guard callbacks after unload.

**Step 7: Run status, settings, and type tests**

Run: `npm test -- src/settings && npm run typecheck`

Expected: PASS.

### Task 6: Documentation, version, release verification, install, and publish

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `plugin.json`

**Step 1: Update documentation**

Document source markers, recovery behavior, overlap rejection, target-list change behavior, the status panel, and the safety behavior when Dida snapshots fail.

**Step 2: Bump the patch version**

Change `package.json`, `package-lock.json`, and `plugin.json` from `1.1.12` to `1.1.13`.

**Step 3: Run fresh full verification**

Run:

```sh
npm test
npm run typecheck
npm run build
npm run package
```

Expected: every command exits 0 with no test failures or type errors.

**Step 4: Inspect release contents**

Confirm both `dist/` and `package.zip` contain:

```text
index.js
index.css
plugin.json
README.md
README.zh-CN.md
icon.png
preview.png
```

Confirm manifest/package versions match and inspect `git diff --check` and `git status --short`.

**Step 5: Install the verified build**

Replace `/Users/lance/Documents/Siyuan/data/plugins/siyuan-dida` with the verified `dist/` contents using an explicit temporary backup and atomic rename where practical. Verify installed file names and version `1.1.13`.

**Step 6: Commit and push**

Commit all source, tests, documentation, metadata, and lockfile changes with a scoped message. Merge the verified feature branch into `main`, push `main` to `origin`, and report exact failures if either step fails.
