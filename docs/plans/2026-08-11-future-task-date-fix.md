# Future Dida Task Date Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure future Dida tasks created with the `today` setting receive today's local all-day date.

**Architecture:** Restore the date formatter's complete local-midnight timestamp with a numeric UTC offset, matching Dida CLI 0.1.10's required `yyyy-MM-ddTHH:mm:ssZ` input. Keep the sync decision and CLI argument mapping unchanged, so existing bound tasks are never updated and the `none` setting still omits date arguments.

**Tech Stack:** TypeScript, Vitest, Vite, SiYuan Plugin API, Dida CLI 0.1.10

---

### Task 1: Reproduce and fix the invalid start-date format

**Files:**
- Modify: `src/core/date.test.ts`
- Modify: `src/dida/cli.test.ts`
- Modify: `src/core/date.ts`

**Step 1: Write the failing regression test**

Change the formatter assertion in `src/core/date.test.ts` to require a complete local-midnight timestamp:

```ts
test("formats local midnight with a numeric timezone offset", () => {
  expect(localAllDayStart(new Date(2026, 6, 2, 16, 30))).toMatch(/^2026-07-02T00:00:00[+-]\d{4}$/);
});
```

Update the date sample in `src/dida/cli.test.ts` so the CLI contract test passes and expects `2026-07-02T00:00:00+0800` rather than a date-only string.

**Step 2: Run the focused tests and verify the regression test fails**

Run: `npm test -- src/core/date.test.ts src/dida/cli.test.ts`

Expected: `src/core/date.test.ts` fails because the current result is `2026-07-02`; the CLI adapter test passes because it forwards the supplied value unchanged.

**Step 3: Implement the minimal formatter fix**

Restore the UTC-offset calculation in `src/core/date.ts`:

```ts
export function localAllDayStart(date = new Date()): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad2(Math.floor(absoluteOffset / 60));
  const offsetRemainder = pad2(absoluteOffset % 60);

  return `${year}-${month}-${day}T00:00:00${sign}${offsetHours}${offsetRemainder}`;
}
```

Keep the existing `pad2` helper unchanged.

**Step 4: Run the focused tests and verify they pass**

Run: `npm test -- src/core/date.test.ts src/dida/cli.test.ts`

Expected: both test files pass with no errors or warnings.

**Step 5: Commit the regression fix**

```bash
git add src/core/date.ts src/core/date.test.ts src/dida/cli.test.ts
git commit -m "fix: preserve date on new Dida tasks"
```

### Task 2: Bump synchronized plugin versions

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `plugin.json`

**Step 1: Update the npm package version**

Use `apply_patch` to change the root `version` in `package.json`, the root `version` in `package-lock.json`, and `package-lock.json`'s `packages[""]` version from `1.1.10` to `1.1.11`.

Expected: `package.json` and both package entries in `package-lock.json` report `1.1.11`.

**Step 2: Update the SiYuan manifest version**

Change `plugin.json` from:

```json
"version": "1.1.10"
```

to:

```json
"version": "1.1.11"
```

**Step 3: Verify synchronized metadata**

Run:

```bash
node -e "const p=require('./package.json'); const l=require('./package-lock.json'); const m=require('./plugin.json'); if (p.version !== '1.1.11' || l.version !== '1.1.11' || l.packages[''].version !== '1.1.11' || m.version !== '1.1.11') process.exit(1)"
```

Expected: exit code 0 with no output.

**Step 4: Commit the version bump**

```bash
git add package.json package-lock.json plugin.json
git commit -m "chore: bump version to 1.1.11"
```

### Task 3: Verify, build, and install the plugin

**Files:**
- Verify: `dist/index.js`
- Verify: `dist/index.css`
- Verify: `dist/plugin.json`
- Verify: `dist/README.md`
- Verify: `dist/README.zh-CN.md`
- Verify: `dist/icon.png`
- Verify: `dist/preview.png`
- Replace installed package: `/Users/lance/Documents/Siyuan/data/plugins/siyuan-dida`

**Step 1: Run the complete test suite**

Run: `npm test`

Expected: all Vitest test files and tests pass.

**Step 2: Run TypeScript checking**

Run: `npm run typecheck`

Expected: exit code 0 with no diagnostics.

**Step 3: Build the production plugin**

Run: `npm run build`

Expected: Vite completes successfully and creates `dist/`.

**Step 4: Verify required package files**

Run:

```bash
for file in index.js index.css plugin.json README.md README.zh-CN.md icon.png preview.png; do test -f "dist/$file" || exit 1; done
```

Expected: exit code 0, and `dist/plugin.json` reports version `1.1.11`.

**Step 5: Replace the locally installed plugin**

Resolve and verify the exact target first, then replace its contents with the current build:

```bash
test "/Users/lance/Documents/Siyuan/data/plugins/siyuan-dida" = "/Users/lance/Documents/Siyuan/data/plugins/siyuan-dida"
mkdir -p /Users/lance/Documents/Siyuan/data/plugins/siyuan-dida
rsync -a --delete dist/ /Users/lance/Documents/Siyuan/data/plugins/siyuan-dida/
```

Expected: the installed directory contains the same required package files and `plugin.json` version `1.1.11`.

### Task 4: Final repository verification and publication

**Files:**
- Verify: all tracked changes and commits

**Step 1: Verify branch history and cleanliness**

Run:

```bash
git status --short
git log -4 --oneline
```

Expected: no uncommitted files and commits for the design, implementation plan, fix, and version bump are present.

**Step 2: Push the completed change**

Run: `git push origin main`

Expected: the configured `origin` accepts the new commits for `main`.
