# Sync Reliability and Status Design

## Goal

Make task creation recoverable across SiYuan and Dida, reject ambiguous sync ranges, fully localize user-visible logs, and expose a useful sync status summary in the existing settings dialog.

## Scope

This release contains four related improvements:

1. Idempotent recovery for newly created Dida tasks.
2. Validation for overlapping sync ranges and stable unique range IDs.
3. Chinese and English formatting for logs, validation errors, and status summaries.
4. A compact status panel with a manual sync action in plugin settings.

It does not add title write-back from Dida, date or reminder synchronization, task deletion, or automatic migration of existing bindings between Dida lists.

## Idempotent Task Recovery

Every task created by the plugin includes a language-independent source marker in its Dida content:

```text
Source: SiYuan Notes
SiYuan-Block-ID: <block-id>
```

Before creating tasks, the plugin queries the configured Dida lists for incomplete tasks and builds an index from SiYuan block ID to Dida task. An unbound SiYuan todo follows this flow:

1. Look for a matching source marker in the index.
2. If found, restore the SiYuan binding attributes and parent relationship without creating another task.
3. If not found, create the Dida task with the source marker, then write the returned binding to SiYuan.
4. Add a newly created task to the in-memory index immediately so overlapping processing in the same run also remains idempotent.

This recovers both a failed SiYuan attribute write and a lost CLI response, provided the Dida task was created with the source marker.

Safety takes precedence over availability. If the incomplete-task snapshot cannot be loaded, the run continues processing already-bound tasks but does not create unbound tasks. Those items are recorded as failures rather than risking duplicates.

If more than one Dida task has the same source marker, the plugin does not choose one silently. It records an ambiguity failure and leaves the SiYuan block unbound.

## Sync Range Validation

Two configured ranges conflict when they target the same SiYuan notebook and their document scopes overlap. A scope overlaps when:

- both paths are identical; or
- one range includes child documents and its normalized path is an ancestor of the other path.

Path comparison normalizes leading and trailing slashes so equivalent paths cannot bypass validation. Non-overlapping sibling paths remain valid, as do equivalent paths in different notebooks.

New range IDs are generated independently of their visual index. Removing a range and adding another therefore cannot reuse an existing ID and corrupt its persisted cursor.

When an existing range's target Dida list changes, the settings panel displays a clear warning that existing bindings remain in their original lists and only new tasks use the new target. The plugin does not move existing Dida tasks automatically.

## Internationalization

The existing translator becomes the single source for all user-visible text introduced or touched by this work. Log formatting and summary formatting accept a translator instead of embedding Chinese strings. Range validation errors are expressed as typed validation errors that the settings panel translates.

The source marker itself remains language-independent so changing SiYuan's interface language cannot break recovery. The human-readable first content line remains localized.

## Settings Status Panel

The existing settings dialog gains a compact native-feeling status section near the top. It shows:

- current state: pending, syncing, successful, or failed;
- last finished time;
- the latest scanned, created, updated, completed, written-back, skipped, and failed counts;
- a **Sync now** action.

The panel uses SiYuan theme variables and existing `b3-*` button classes. It does not add a dock or a custom overlay. While a sync is running, the action is disabled and the state updates immediately. Completion or failure refreshes the panel and the existing top-bar tooltip.

The settings panel receives a small status-controller interface from the plugin entry point rather than owning synchronization. This keeps synchronization state and concurrency control in one place.

## Lifecycle and Error Handling

Storage and command registration remain in `onload()`. The top-bar button is moved to `onLayoutReady()` to match SiYuan's layout lifecycle. Startup and settings-mount timers are tracked and cleared in `onunload()` so an unloaded plugin cannot start work or mount UI later.

Per-block synchronization failures remain isolated and are included in the sync result. Snapshot failure is represented separately so bound-task synchronization can proceed while unsafe creation is blocked.

## Testing

Automated tests cover:

- recovery after a Dida task exists but SiYuan binding attributes are absent;
- recovery after a simulated lost create response;
- recovered parent-child relationships;
- blocking new task creation when the Dida snapshot fails;
- duplicate source-marker ambiguity;
- identical, ancestor/descendant, sibling, and cross-notebook range combinations;
- unique range IDs after deletion and insertion;
- Chinese and English logs and summaries;
- status-view state rendering and manual-sync behavior;
- timer and layout lifecycle behavior where practical.

The release is verified with the full unit test suite, TypeScript type checking, production build, package contents inspection, and local SiYuan installation.
