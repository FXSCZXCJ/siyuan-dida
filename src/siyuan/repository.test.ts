import { afterEach, describe, expect, test, vi } from "vitest";
import { SiYuanRepository, buildTodoBlockSql } from "./repository";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildTodoBlockSql", () => {
  test("prioritizes incomplete todos and excludes unbound completed history", () => {
    const sql = buildTodoBlockSql(
      {
        id: "range-1",
        name: "工作日志",
        notebookId: "box-1",
        hpathPrefix: "/log-工作日志",
        includeChildren: true,
        targetProjectId: "project-1",
        targetProjectName: "工作"
      },
      200,
      400
    );

    expect(sql).toContain("b.subtype = 't'");
    expect(sql).toContain("b.ial LIKE '%custom-dida-task-id%'");
    expect(sql).toContain("b.ial NOT LIKE '%custom-dida-sync-state=\"completed-synced\"%'");
    expect(sql).toContain("LEFT JOIN blocks parent ON parent.id = b.parent_id");
    expect(sql).toContain("LEFT JOIN blocks grandparent ON grandparent.id = parent.parent_id");
    expect(sql).toContain("WHEN parent.type = 'l' AND grandparent.type = 'i'");
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("CASE");
    expect(sql).toContain("WHEN b.markdown LIKE '- [ ] %'");
    expect(sql).toContain("b.markdown LIKE '- {: %}[ ] %'");
    expect(sql).toContain("b.markdown LIKE '- {: %}[x] %'");
    expect(sql).toContain("b.markdown LIKE '- {: %}[X] %'");
    expect(sql).toContain("LIMIT 200 OFFSET 400");
    expect(sql).not.toContain("b.id IN (");
  });

  test("includes only explicitly recoverable unbound completed todo IDs", () => {
    const validRecoveryId = "20260812220900-abc1234";
    const sql = buildTodoBlockSql(
      {
        id: "range-1",
        name: "工作日志",
        notebookId: "box-1",
        hpathPrefix: "/工作",
        includeChildren: true,
        targetProjectId: "project-1",
        targetProjectName: "工作"
      },
      200,
      0,
      new Set([
        validRecoveryId,
        "recover-block",
        "quote'block",
        "20260812220900-TOOLONG"
      ])
    );

    expect(sql).toContain("COALESCE(b.ial, '') NOT LIKE '%custom-dida-task-id%'");
    expect(sql).toContain(`b.id IN ('${validRecoveryId}')`);
    expect(sql).not.toContain("recover-block");
    expect(sql).not.toContain("quote''block");
    expect(sql).not.toContain("TOOLONG");
  });

  test("matches only the selected document and its descendants when children are included", () => {
    const sql = buildTodoBlockSql(
      {
        id: "range-1",
        name: "工作",
        notebookId: "box-1",
        hpathPrefix: "/工作",
        includeChildren: true,
        targetProjectId: "project-1",
        targetProjectName: "工作"
      },
      200
    );

    expect(sql).toContain("(b.hpath = '/工作' OR instr(b.hpath, '/工作/') = 1)");
    expect(sql).not.toContain("b.hpath LIKE '/工作%'");
    expect(sql).not.toContain("ESCAPE");
  });

  test("matches every document path when the root includes children", () => {
    const sql = buildTodoBlockSql(
      {
        id: "range-root",
        name: "All documents",
        notebookId: "box-1",
        hpathPrefix: "/",
        includeChildren: true,
        targetProjectId: "project-1",
        targetProjectName: "Inbox"
      },
      200
    );

    expect(sql).toContain("b.hpath LIKE '/%'");
    expect(sql).not.toContain("instr(b.hpath, '//')");
  });

  test("matches literal wildcard characters in child path prefixes", () => {
    const sql = buildTodoBlockSql(
      {
        id: "range-1",
        name: "版本_100%",
        notebookId: "box-1",
        hpathPrefix: "/版本_100%",
        includeChildren: true,
        targetProjectId: "project-1",
        targetProjectName: "工作"
      },
      200
    );

    expect(sql).toContain("(b.hpath = '/版本_100%' OR instr(b.hpath, '/版本_100%/') = 1)");
    expect(sql).not.toContain("LIKE '/版本");
  });
});

describe("SiYuanRepository", () => {
  test("passes recovery block IDs into the todo SQL query", async () => {
    let stmt = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_path, init) => {
      stmt = (JSON.parse(String(init?.body)) as { stmt: string }).stmt;
      return new Response(JSON.stringify({ code: 0, data: null }), { status: 200 });
    });

    await new SiYuanRepository().listTodoBlocks(
      {
        id: "range-1",
        name: "工作",
        notebookId: "box-1",
        hpathPrefix: "/工作",
        includeChildren: true,
        targetProjectId: "project-1",
        targetProjectName: "工作"
      },
      200,
      0,
      new Set(["20260812220901-xyz7890"])
    );

    expect(stmt).toContain("b.id IN ('20260812220901-xyz7890')");
  });

  test("treats a null SQL query result as an empty todo list", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ code: 0, data: null }), { status: 200 });
    });

    await expect(
      new SiYuanRepository().listTodoBlocks(
        {
          id: "range-1",
          name: "工作",
          notebookId: "box-1",
          hpathPrefix: "/工作",
          includeChildren: true,
          targetProjectId: "project-1",
          targetProjectName: "工作"
        },
        200
      )
    ).resolves.toEqual([]);
  });

  test("marks a block completed when getBlockKramdown returns kramdown", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (path, init) => {
      calls.push({
        path: String(path),
        body: JSON.parse(String(init?.body))
      });
      const data = calls.length === 1 ? { kramdown: "- [ ] 完成测试" } : null;
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 });
    });

    await new SiYuanRepository().markBlockCompleted("20260623224013-tx3inum");

    expect(calls).toEqual([
      {
        path: "/api/block/getBlockKramdown",
        body: { id: "20260623224013-tx3inum" }
      },
      {
        path: "/api/block/updateBlock",
        body: {
          id: "20260623224013-tx3inum",
          dataType: "markdown",
          data: "- [x] 完成测试"
        }
      }
    ]);
  });

  test("marks SiYuan kramdown list tasks with inline attrs completed", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (path, init) => {
      calls.push({
        path: String(path),
        body: JSON.parse(String(init?.body))
      });
      const data =
        calls.length === 1
          ? { kramdown: '- {: custom-status="todo" id="20260623224013-tx3inum"}[ ] 思源笔记插件\n  {: id="child"}' }
          : null;
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 });
    });

    await new SiYuanRepository().markBlockCompleted("20260623224013-tx3inum");

    expect(calls[1]).toEqual({
      path: "/api/block/updateBlock",
      body: {
        id: "20260623224013-tx3inum",
        dataType: "markdown",
        data: '- {: custom-status="todo" id="20260623224013-tx3inum"}[x] 思源笔记插件\n  {: id="child"}'
      }
    });
  });

  test("fails completion when kramdown cannot be rewritten", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ code: 0, data: { kramdown: "普通段落" } }), { status: 200 });
    });

    await expect(new SiYuanRepository().markBlockCompleted("20260623224013-tx3inum")).rejects.toThrow("Unable to mark SiYuan todo completed");
  });
});
