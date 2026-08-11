# Workspace Storage Migration Design

## Problem

The plugin currently stores stable settings, device-specific command discovery, pagination cursors, and the last 20 full sync results in `/data/storage/petal/siyuan-dida/settings.json`. Automatic sync rewrites that file after every run, so SiYuan continuously records plugin runtime churn in data history.

## Storage layout

Move all plugin-owned mutable data outside the workspace `data/` directory:

- Stable configuration: `<workspace>/conf/siyuan-dida/settings.json`
- Runtime state: `<workspace>/temp/siyuan-dida/state.json`
- Sync log: `<workspace>/temp/siyuan-dida/sync.log`

The configuration file contains only user-controlled settings such as the CLI command, automatic-sync options, task defaults, limits, and configured ranges. Device-resolved CLI paths and range cursor offsets are runtime state. Full sync results are stored as newline-delimited JSON in the log file.

## Lifecycle and data flow

On startup, the plugin creates a workspace storage service from SiYuan's `confDir` and `workspaceDir`. If the new configuration does not yet exist, it imports the legacy `settings.json`, splits its values into configuration, runtime state, and log records, writes the new files atomically, and removes the legacy plugin data file only after migration succeeds.

Normal syncs update the in-memory settings, append one result to the log, and save runtime state. They never call `Plugin.saveData()`. Manual setting changes write only the configuration file. The settings panel reads the most recent log records through the storage service and can clear the log without touching SiYuan data.

## Log retention

Keep the current product behaviour of displaying at most 20 recent sync runs. Store one compact JSON object per line and rewrite the log atomically after each run with only the newest 20 records. This bounds both disk usage and task-title exposure while keeping the existing copy and clear actions useful across restarts.

## Error handling

Use atomic temporary-file replacement for JSON configuration, runtime state, and log rewrites. If legacy migration fails before the new files are complete, retain the old file and surface the startup error. A malformed new file falls back to normalized defaults for configuration and empty runtime/log data without deleting the source file, preserving evidence for diagnosis.

## Compatibility

This remains desktop-only. The plugin already imports Node.js APIs to execute Dida CLI, and its manifest supports only desktop frontends and desktop backends, so direct access to SiYuan's workspace paths does not widen platform assumptions.

## Testing

Pure storage helpers receive explicit directories and are tested against temporary directories. Tests cover path layout, configuration/runtime separation, bounded log persistence, clearing logs, legacy migration, and removal of the legacy file only after successful migration. Existing plugin tests continue to cover normalization and sync behaviour.
