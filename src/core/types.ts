export interface SyncRange {
  id: string;
  name: string;
  notebookId: string;
  hpathPrefix: string;
  includeChildren: boolean;
  targetProjectId: string;
  targetProjectName: string;
  cursorOffset?: number;
}

export interface SyncSettings {
  maxTasksPerRun: number;
  newTaskDate?: NewTaskDate;
  ranges: SyncRange[];
  /** When true, all write operations are skipped and counters describe planned work. */
  dryRun?: boolean;
  /**
   * Epoch-second lower bound for the completed-tasks pull. When present, the
   * engine runs an incremental snapshot from this watermark instead of a full
   * baseline. Absent/0 means full baseline.
   */
  completedWatermarkSecond?: number;
}

export type NewTaskDate = "today" | "none";

export interface SiYuanTodoBlock {
  id: string;
  parentId?: string;
  markdown: string;
  box: string;
  hpath: string;
  attrs: Record<string, string>;
}

export interface SyncResult {
  created: number;
  /** Optional so sync logs persisted before recovery support remain readable. */
  recovered?: number;
  updated: number;
  completed: number;
  writtenBack: number;
  failed: number;
  skipped: number;
  scanned: number;
  rangeResults: SyncRangeResult[];
  rangeCursorOffsets: Record<string, number>;
  events: SyncEvent[];
  failures: Array<{ blockId?: string; message: string }>;
  startedAt: string;
  finishedAt: string;
  /**
   * Next completed-tasks watermark (epoch seconds) after this run, for
   * incremental snapshots. Present when the completed pull succeeded.
   */
  completedWatermarkSecond?: number;
  /** True when this result came from a read-only preview. */
  dryRun?: boolean;
}

export interface SyncRangeResult {
  rangeId: string;
  rangeName: string;
  notebookId: string;
  hpathPrefix: string;
  scanned: number;
  created: number;
  /** Optional so sync logs persisted before recovery support remain readable. */
  recovered?: number;
  updated: number;
  completed: number;
  writtenBack: number;
  failed: number;
  skipped: number;
  cursorOffset: number;
  nextCursorOffset: number;
  hasMore: boolean;
}

export interface SyncEvent {
  time: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  blockId?: string;
  rangeId?: string;
}

export interface SiYuanGateway {
  listTodoBlocks(
    range: SyncRange,
    limit: number,
    offset?: number,
    recoveryBlockIds?: ReadonlySet<string>
  ): Promise<SiYuanTodoBlock[]>;
  getBlockAttrs(blockId: string): Promise<Record<string, string>>;
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
  markBlockCompleted(blockId: string): Promise<void>;
}

export interface CreateDidaTaskOptions {
  content?: string;
  allDay?: boolean;
  startDate?: string;
}

export interface DidaTaskSnapshot {
  id: string;
  projectId: string;
  title?: string;
  content?: string;
}

export interface DidaGateway {
  listIncompleteTasks(projectIds: string[]): Promise<DidaTaskSnapshot[]>;
  listCompletedTasks(projectIds: string[], startSecond?: number): Promise<DidaTaskSnapshot[]>;
  createTask(projectId: string, title: string, options?: CreateDidaTaskOptions): Promise<{ id: string; projectId: string }>;
  getTask(projectId: string, taskId: string): Promise<DidaTaskSnapshot & { status?: number } | null>;
  updateTaskTitle(projectId: string, taskId: string, title: string): Promise<void>;
  setTaskParent(projectId: string, taskId: string, parentTaskId: string): Promise<void>;
  completeTask(projectId: string, taskId: string): Promise<void>;
  deleteTask(projectId: string, taskId: string): Promise<void>;
}
