# Workspace Storage Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop the plugin from writing runtime logs and state under SiYuan's `data/` directory by migrating them to workspace `conf/` and `temp/` storage.

**Architecture:** Add a Node-backed workspace storage service with explicit configuration, runtime-state, and NDJSON log files. Wire the plugin lifecycle and settings panel to that service, then migrate and remove the legacy `Plugin.saveData()` file after the new storage is safely written.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Vitest, Vite, SiYuan Plugin API

---

### Task 1: Define separated persisted shapes

**Files:**
- Modify: `src/settings/defaults.ts`
- Test: `src/settings/defaults.test.ts`

1. Write failing tests showing that stable configuration excludes logs, resolved CLI paths, and cursor offsets, while runtime state contains only device paths and cursors.
2. Run `npm test -- src/settings/defaults.test.ts` and confirm the missing helpers cause the expected failure.
3. Add narrow configuration/runtime interfaces plus split and merge helpers.
4. Rerun the focused test and confirm it passes.

### Task 2: Implement workspace file storage

**Files:**
- Create: `src/settings/workspaceStorage.ts`
- Test: `src/settings/workspaceStorage.test.ts`

1. Write failing tests for the `conf/siyuan-dida/settings.json`, `temp/siyuan-dida/state.json`, and `temp/siyuan-dida/sync.log` layout.
2. Add failing tests for atomic configuration and state persistence, 20-record NDJSON log retention, and log clearing.
3. Run the focused tests and confirm they fail because the service is missing.
4. Implement the smallest filesystem-backed service that satisfies the tests.
5. Rerun the focused tests and confirm they pass.

### Task 3: Migrate legacy plugin data

**Files:**
- Modify: `src/settings/workspaceStorage.ts`
- Modify: `src/settings/workspaceStorage.test.ts`

1. Write failing tests that import legacy settings only when new configuration is absent, split legacy values into the new files, and call legacy removal only after successful persistence.
2. Run the focused test and verify the expected failure.
3. Implement the migration callback API and atomic write order.
4. Rerun the focused test and verify it passes.

### Task 4: Wire plugin lifecycle and settings UI

**Files:**
- Modify: `src/index.ts`
- Modify: `src/settings/settingsPanel.ts`
- Modify: `src/env.d.ts`

1. Replace startup `loadData` with workspace storage initialization using SiYuan's `confDir` and `workspaceDir`.
2. Migrate the legacy file, then call `removeData("settings.json")` only after successful import.
3. Replace every automatic `saveData` call with configuration, runtime-state, or log persistence as appropriate.
4. Keep the settings panel's copy and clear actions connected to persistent recent logs.
5. Run focused tests and `npm run typecheck`.

### Task 5: Document and version the change

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `package.json`
- Modify: `plugin.json`

1. Document the new storage locations and migration behaviour.
2. Bump both manifests from `1.1.11` to `1.1.12`.
3. Confirm the two versions match.

### Task 6: Verify, install, and publish

**Files:**
- Verify: `dist/`
- Create: `package.zip`

1. Run `npm test`.
2. Run `npm run typecheck`.
3. Run `npm run build` and verify required package files.
4. Run `npm run package` and inspect `package.zip`.
5. Replace `/Users/lance/Documents/Siyuan/data/plugins/siyuan-dida` with the fresh `dist/` contents.
6. Inspect the final diff for secrets and unrelated files.
7. Commit the scoped change, push to `origin`, tag `v1.1.12`, and create a GitHub Release with `package.zip`.
