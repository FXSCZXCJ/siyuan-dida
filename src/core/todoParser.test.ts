import { describe, expect, test } from "vitest";
import {
  markTodoCompleted,
  parseTodoMarkdown,
  parseTodoMetadata,
  renderTodoMetadata,
  replaceTodoTitleMetadata,
  todoMetadataKey
} from "./todoParser";

describe("parseTodoMarkdown", () => {
  test("parses an unchecked dash todo", () => {
    expect(parseTodoMarkdown("- [ ] 整理会议纪要")).toEqual({
      marker: "-",
      checked: false,
      title: "整理会议纪要"
    });
  });

  test("parses a checked star todo case-insensitively", () => {
    expect(parseTodoMarkdown("* [X] 跟进上线")).toEqual({
      marker: "*",
      checked: true,
      title: "跟进上线"
    });
  });

  test("returns null for non todo markdown", () => {
    expect(parseTodoMarkdown("普通段落")).toBeNull();
  });

  test("parses the first line of a multiline todo block", () => {
    expect(parseTodoMarkdown("- [ ] 每日消保工单处理\n\n  - [ ] 上午")).toEqual({
      marker: "-",
      checked: false,
      title: "每日消保工单处理"
    });
  });

  test("parses SiYuan kramdown todos with inline attrs before checkbox", () => {
    expect(parseTodoMarkdown('- {: custom-status="todo" id="20260623224013-tx3inum"}[ ] 思源笔记插件')).toEqual({
      marker: "-",
      checked: false,
      title: "思源笔记插件"
    });
  });
});

describe("markTodoCompleted", () => {
  test("rewrites an unchecked todo as completed", () => {
    expect(markTodoCompleted("- [ ] 整理会议纪要")).toBe("- [x] 整理会议纪要");
  });

  test("rewrites SiYuan kramdown todos with inline attrs before checkbox", () => {
    expect(markTodoCompleted('- {: custom-status="todo" id="20260623224013-tx3inum"}[ ] 思源笔记插件')).toBe(
      '- {: custom-status="todo" id="20260623224013-tx3inum"}[x] 思源笔记插件'
    );
  });

  test("keeps non todo markdown unchanged", () => {
    expect(markTodoCompleted("普通段落")).toBe("普通段落");
  });
});

describe("parseTodoMetadata", () => {
  test("extracts due date, priority, and tags from the visible title", () => {
    const result = parseTodoMetadata("发布版本 @due(2026-11-02 18:30) !p5 @tag(work, 紧急, #release)");

    expect(result.title).toBe("发布版本");
    expect(result.metadata).toMatchObject({
      allDay: false,
      priority: 5,
      tags: ["work", "紧急", "release"]
    });
    expect(result.metadata.dueDate).toMatch(/^2026-11-02T18:30:00[+-]\d{4}$/);
  });

  test("supports all-day due dates", () => {
    const result = parseTodoMetadata("提交报告 @due(2026-11-03)");

    expect(result.title).toBe("提交报告");
    expect(result.metadata.allDay).toBe(true);
    expect(result.metadata.dueDate).toMatch(/^2026-11-03T00:00:00[+-]\d{4}$/);
  });

  test("leaves invalid dates visible and produces no metadata key", () => {
    const result = parseTodoMetadata("错误日期 @due(2026-02-30)");

    expect(result.title).toBe("错误日期 @due(2026-02-30)");
    expect(todoMetadataKey(result.metadata)).toBe("");
  });
});

describe("renderTodoMetadata", () => {
  test("renders metadata markers and replaces the visible todo title", () => {
    const metadata = {
      dueDate: "2026-11-02T00:00:00+0800",
      allDay: true,
      priority: 3 as const,
      tags: ["work"]
    };
    expect(renderTodoMetadata(metadata)).toBe("@due(2026-11-02) !p3 @tag(work)");
    expect(replaceTodoTitleMetadata("- [ ] 发布版本 !p5", "发布版本", metadata)).toBe(
      "- [ ] 发布版本 @due(2026-11-02) !p3 @tag(work)"
    );
  });
});
