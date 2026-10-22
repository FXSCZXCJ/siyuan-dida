import type { Translate } from "../i18n";
import { parseSourceBlockId } from "./sourceMarker";
import { parseTodoMarkdown } from "./todoParser";
import type {
  DidaGateway,
  DidaTaskSnapshot,
  SiYuanTodoBlock,
  SyncRange,
  SyncSettings
} from "./types";

const TASK_ID_ATTR = "custom-dida-task-id";
const PROJECT_ID_ATTR = "custom-dida-project-id";
const LAST_SYNC_ATTR = "custom-dida-last-sync";
const LAST_HASH_ATTR = "custom-dida-last-hash";
const SYNC_STATE_ATTR = "custom-dida-sync-state";
const BINDING_PAGE_SIZE = 500;

export type BindingIssueKind = "missing_dida_task" | "orphan_dida_task";
export type BindingIssueAction = "clear_binding" | "complete_task" | "delete_task";

export interface BindingIssue {
  id: string;
  kind: BindingIssueKind;
  blockId?: string;
  hpath?: string;
  title: string;
  projectId: string;
  taskId: string;
}

export interface BindingScanResult {
  issues: BindingIssue[];
  warnings: string[];
  scannedBindings: number;
  scannedRemoteTasks: number;
}

export interface BindingMaintenanceSiYuan {
  listBoundTodoBlocks(range: SyncRange, limit?: number, offset?: number): Promise<SiYuanTodoBlock[]>;
  blockExists(blockId: string): Promise<boolean>;
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
}

export class BindingMaintenance {
  constructor(
    private readonly siyuan: BindingMaintenanceSiYuan,
    private readonly dida: Pick<
      DidaGateway,
      "listIncompleteTasks" | "getTask" | "completeTask" | "deleteTask"
    >,
    private readonly t: Translate
  ) {}

  async scan(settings: SyncSettings): Promise<BindingScanResult> {
    const projectIds = [...new Set(settings.ranges.map((range) => range.targetProjectId).filter(Boolean))];
    const blocks = await this.listBoundBlocks(settings.ranges);
    const incompleteTasks = await this.dida.listIncompleteTasks(projectIds);
    const incompleteKeys = new Set(incompleteTasks.map(remoteTaskKey));
    const issues: BindingIssue[] = [];
    const warnings: string[] = [];

    for (const block of blocks) {
      const parsed = parseTodoMarkdown(block.markdown);
      const taskId = block.attrs[TASK_ID_ATTR];
      const projectId = block.attrs[PROJECT_ID_ATTR];
      if (!parsed || parsed.checked || !taskId || !projectId) {
        continue;
      }
      if (incompleteKeys.has(`${projectId}\u0000${taskId}`)) {
        continue;
      }

      try {
        const task = await this.dida.getTask(projectId, taskId);
        if (task === null) {
          issues.push({
            id: `missing_dida_task:${projectId}:${taskId}:${block.id}`,
            kind: "missing_dida_task",
            blockId: block.id,
            hpath: block.hpath,
            title: parsed.title,
            projectId,
            taskId
          });
        }
      } catch (error) {
        warnings.push(this.t("bindingScanTaskWarning", {
          title: parsed.title,
          message: errorMessage(error)
        }));
      }
    }

    const issueKeys = new Set(issues.map((issue) => `${issue.kind}:${issue.projectId}:${issue.taskId}:${issue.blockId ?? ""}`));
    for (const task of incompleteTasks) {
      const sourceBlockId = parseSourceBlockId(task.content ?? "");
      if (!sourceBlockId || !await this.siyuan.blockExists(sourceBlockId)) {
        if (!sourceBlockId) continue;
        const issue: BindingIssue = {
          id: `orphan_dida_task:${task.projectId}:${task.id}:${sourceBlockId}`,
          kind: "orphan_dida_task",
          blockId: sourceBlockId,
          title: task.title || this.t("bindingIssueUntitled"),
          projectId: task.projectId,
          taskId: task.id
        };
        if (!issueKeys.has(issue.id)) {
          issueKeys.add(issue.id);
          issues.push(issue);
        }
      }
    }

    return {
      issues,
      warnings,
      scannedBindings: blocks.filter((block) => Boolean(block.attrs[TASK_ID_ATTR] && block.attrs[PROJECT_ID_ATTR])).length,
      scannedRemoteTasks: incompleteTasks.length
    };
  }

  async resolve(issue: BindingIssue, action: BindingIssueAction): Promise<void> {
    if (action === "clear_binding") {
      if (!issue.blockId) throw new Error(this.t("bindingIssueMissingBlock"));
      await this.siyuan.setBlockAttrs(issue.blockId, {
        [TASK_ID_ATTR]: "",
        [PROJECT_ID_ATTR]: "",
        [LAST_SYNC_ATTR]: "",
        [LAST_HASH_ATTR]: "",
        [SYNC_STATE_ATTR]: ""
      });
      return;
    }
    if (action === "complete_task") {
      await this.dida.completeTask(issue.projectId, issue.taskId);
      return;
    }
    if (action === "delete_task") {
      await this.dida.deleteTask(issue.projectId, issue.taskId);
    }
  }

  private async listBoundBlocks(ranges: SyncRange[]): Promise<SiYuanTodoBlock[]> {
    const blocks = new Map<string, SiYuanTodoBlock>();
    for (const range of ranges) {
      let offset = 0;
      while (true) {
        const page = await this.siyuan.listBoundTodoBlocks(range, BINDING_PAGE_SIZE, offset);
        for (const block of page) blocks.set(block.id, block);
        if (page.length < BINDING_PAGE_SIZE) break;
        offset += page.length;
      }
    }
    return [...blocks.values()];
  }
}

function remoteTaskKey(task: Pick<DidaTaskSnapshot, "projectId" | "id">): string {
  return `${task.projectId}\u0000${task.id}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
