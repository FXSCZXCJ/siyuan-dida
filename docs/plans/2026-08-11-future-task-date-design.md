# Future Dida Task Date Fix Design

## Problem

When the new-task date setting is `today`, the plugin currently passes a date-only value such as `2026-08-11` to Dida CLI 0.1.10. The CLI requires a complete timestamp in `yyyy-MM-ddTHH:mm:ssZ` form. Dida still creates the task but ignores the invalid `startDate`, leaving the task without a date.

The date-only formatting was introduced by commit `de74f49`, replacing the previously valid local-midnight timestamp with a timezone offset.

## Scope

Fix only Dida tasks created by future sync runs. Do not update or backfill tasks that are already bound to SiYuan blocks.

The `none` setting remains unchanged and continues to create tasks without date arguments.

## Design

Format today's local calendar date as local midnight with the current UTC offset, for example `2026-08-11T00:00:00+0800`. Continue passing `--all-day` so Dida presents the task as an all-day task rather than a timed midnight task.

The sync engine continues to decide whether a task receives a date. The Dida CLI adapter continues to translate the creation options into `--all-day` and `--start-date` arguments. No existing-task update path is added.

This is preferred over a UTC timestamp because converting local midnight to UTC can produce the previous calendar date. It is preferred over adding only `--time-zone` because a time-zone argument does not make a date-only `startDate` valid.

## Error Handling

Keep the existing sync failure behavior. The fix changes only the value passed to the CLI and does not add retries, migrations, or new settings.

## Testing and Release

Add a regression test that requires the local-midnight timestamp and numeric timezone offset. Update the CLI argument test to require that complete value. Preserve coverage for the `none` setting.

Bump `package.json` and `plugin.json` from `1.1.10` to `1.1.11`, then run the repository-required test, typecheck, build, package-content verification, local SiYuan installation, commit, and push workflow.
