import type {
  CreateDidaTaskOptions,
  DidaGateway,
  DidaTaskSnapshot,
  UpdateDidaTaskMetadataOptions
} from "../core/types";
import { DidaCliClient } from "./cli";

export class DidaCliGateway implements DidaGateway {
  constructor(private readonly client: DidaCliClient) {}

  listIncompleteTasks(projectIds: string[]): Promise<DidaTaskSnapshot[]> {
    return this.client.listIncompleteTasks(projectIds);
  }

  listCompletedTasks(projectIds: string[], startSecond?: number): Promise<DidaTaskSnapshot[]> {
    return this.client.listCompletedTasks(projectIds, startSecond);
  }

  createTask(projectId: string, title: string, options?: CreateDidaTaskOptions) {
    return this.client.createTask(projectId, title, options);
  }

  getTask(projectId: string, taskId: string) {
    return this.client.getTask(projectId, taskId);
  }

  async updateTaskTitle(projectId: string, taskId: string, title: string): Promise<void> {
    await this.client.updateTaskTitle(projectId, taskId, title);
  }

  async updateTaskMetadata(
    projectId: string,
    taskId: string,
    options: UpdateDidaTaskMetadataOptions
  ): Promise<void> {
    await this.client.updateTaskMetadata(projectId, taskId, options);
  }

  async setTaskParent(projectId: string, taskId: string, parentTaskId: string): Promise<void> {
    await this.client.setTaskParent(projectId, taskId, parentTaskId);
  }

  completeTask(projectId: string, taskId: string) {
    return this.client.completeTask(projectId, taskId);
  }

  deleteTask(projectId: string, taskId: string) {
    return this.client.deleteTask(projectId, taskId);
  }
}
