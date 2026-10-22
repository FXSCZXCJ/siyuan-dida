import { describe, expect, test } from "vitest";
import { createTranslator } from "../i18n";
import { BindingMaintenance, type BindingIssue } from "./bindingMaintenance";
import type { DidaTaskSnapshot, SiYuanTodoBlock, SyncRange } from "./types";

const range: SyncRange = {
  id: "range-1",
  name: "Work",
  notebookId: "box-1",
  hpathPrefix: "/Work",
  includeChildren: true,
  targetProjectId: "project-1",
  targetProjectName: "Work"
};

function block(id: string, attrs: Record<string, string>, markdown = "- [ ] Task"): SiYuanTodoBlock {
  return {
    id,
    markdown,
    box: "box-1",
    hpath: "/Work/Tasks",
    attrs
  };
}

function boundAttrs(taskId: string, projectId = "project-1") {
  return {
    "custom-dida-task-id": taskId,
    "custom-dida-project-id": projectId
  };
}

class FakeSiYuan {
  public attrsWrites: Array<{ blockId: string; attrs: Record<string, string> }> = [];
  public existingBlocks = new Set<string>();

  constructor(public blocks: SiYuanTodoBlock[]) {}

  async listBoundTodoBlocks(): Promise<SiYuanTodoBlock[]> {
    return [...this.blocks];
  }

  async blockExists(blockId: string): Promise<boolean> {
    return this.existingBlocks.has(blockId);
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    this.attrsWrites.push({ blockId, attrs });
  }
}

class FakeDida {
  public tasks = new Map<string, DidaTaskSnapshot & { status?: number }>();
  public completed: Array<{ projectId: string; taskId: string }> = [];
  public deleted: Array<{ projectId: string; taskId: string }> = [];
  public getTaskError: Error | null = null;

  constructor(public incompleteTasks: DidaTaskSnapshot[] = []) {
    for (const task of incompleteTasks) {
      this.tasks.set(`${task.projectId}\u0000${task.id}`, task);
    }
  }

  async listIncompleteTasks(): Promise<DidaTaskSnapshot[]> {
    return [...this.incompleteTasks];
  }

  async getTask(projectId: string, taskId: string) {
    if (this.getTaskError) throw this.getTaskError;
    return this.tasks.get(`${projectId}\u0000${taskId}`) ?? null;
  }

  async completeTask(projectId: string, taskId: string): Promise<void> {
    this.completed.push({ projectId, taskId });
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    this.deleted.push({ projectId, taskId });
  }
}

describe("BindingMaintenance", () => {
  test("finds missing Dida bindings and orphan Dida tasks", async () => {
    const siyuan = new FakeSiYuan([
      block("block-missing", boundAttrs("missing-task")),
      block("block-healthy", boundAttrs("healthy-task"))
    ]);
    const dida = new FakeDida([
      { id: "healthy-task", projectId: "project-1", title: "Healthy", content: "SiYuan-Block-ID: block-healthy" },
      { id: "orphan-task", projectId: "project-1", title: "Orphan", content: "SiYuan-Block-ID: block-deleted" }
    ]);
    siyuan.existingBlocks.add("block-healthy");

    const result = await new BindingMaintenance(
      siyuan,
      dida,
      createTranslator("en")
    ).scan({ maxTasksPerRun: 100, ranges: [range] });

    expect(result.scannedBindings).toBe(2);
    expect(result.scannedRemoteTasks).toBe(2);
    expect(result.issues.map((issue) => issue.kind)).toEqual(["missing_dida_task", "orphan_dida_task"]);
    expect(result.issues.find((issue) => issue.kind === "missing_dida_task")).toMatchObject({
      blockId: "block-missing",
      taskId: "missing-task",
      projectId: "project-1"
    });
    expect(result.issues.find((issue) => issue.kind === "orphan_dida_task")).toMatchObject({
      blockId: "block-deleted",
      taskId: "orphan-task"
    });
  });

  test("reports task lookup warnings without aborting the scan", async () => {
    const siyuan = new FakeSiYuan([block("block-1", boundAttrs("task-1"))]);
    const dida = new FakeDida();
    dida.getTaskError = new Error("network offline");

    const result = await new BindingMaintenance(
      siyuan,
      dida,
      createTranslator("en")
    ).scan({ maxTasksPerRun: 100, ranges: [range] });

    expect(result.issues).toEqual([]);
    expect(result.warnings[0]).toContain("network offline");
  });

  test("resolves issues only through explicit actions", async () => {
    const siyuan = new FakeSiYuan([]);
    const dida = new FakeDida();
    const maintenance = new BindingMaintenance(siyuan, dida, createTranslator("en"));
    const missing: BindingIssue = {
      id: "missing",
      kind: "missing_dida_task",
      blockId: "block-1",
      title: "Missing",
      projectId: "project-1",
      taskId: "task-1"
    };
    const orphan: BindingIssue = {
      id: "orphan",
      kind: "orphan_dida_task",
      blockId: "block-2",
      title: "Orphan",
      projectId: "project-1",
      taskId: "task-2"
    };

    await maintenance.resolve(missing, "clear_binding");
    await maintenance.resolve(orphan, "complete_task");
    await maintenance.resolve(orphan, "delete_task");

    expect(siyuan.attrsWrites[0]).toMatchObject({
      blockId: "block-1",
      attrs: {
        "custom-dida-task-id": "",
        "custom-dida-project-id": ""
      }
    });
    expect(dida.completed).toEqual([{ projectId: "project-1", taskId: "task-2" }]);
    expect(dida.deleted).toEqual([{ projectId: "project-1", taskId: "task-2" }]);
  });
});
