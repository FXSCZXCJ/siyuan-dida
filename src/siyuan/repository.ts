import { markTodoCompleted } from "../core/todoParser";
import { isSiYuanBlockId } from "../core/sourceMarker";
import type { SiYuanGateway, SiYuanTodoBlock, SyncRange } from "../core/types";
import { kernelApi } from "./api";

interface SqlBlockRow {
  id: string;
  parent_id?: string;
  markdown: string;
  box: string;
  hpath: string;
}

interface KramdownBlock {
  markdown?: string;
  kramdown?: string;
}

export class SiYuanRepository implements SiYuanGateway {
  async listTodoBlocks(
    range: SyncRange,
    limit: number,
    offset = 0,
    recoveryBlockIds: ReadonlySet<string> = new Set()
  ): Promise<SiYuanTodoBlock[]> {
    const sql = buildTodoBlockSql(range, limit, offset, recoveryBlockIds);
    const rows = (await kernelApi<SqlBlockRow[] | null>("/api/query/sql", { stmt: sql })) ?? [];
    const blocks = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        parentId: row.parent_id,
        markdown: row.markdown,
        box: row.box,
        hpath: row.hpath,
        attrs: await this.getBlockAttrs(row.id)
      }))
    );
    return blocks;
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await kernelApi<unknown>("/api/attr/setBlockAttrs", {
      id: blockId,
      attrs
    });
  }

  async listBoundTodoBlocks(range: SyncRange, limit = 500, offset = 0): Promise<SiYuanTodoBlock[]> {
    const rows = (await kernelApi<SqlBlockRow[] | null>(
      "/api/query/sql",
      { stmt: buildBoundTodoBlockSql(range, limit, offset) }
    )) ?? [];
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      parentId: row.parent_id,
      markdown: row.markdown,
      box: row.box,
      hpath: row.hpath,
      attrs: await this.getBlockAttrs(row.id)
    })));
  }

  async blockExists(blockId: string): Promise<boolean> {
    const rows = (await kernelApi<SqlBlockRow[] | null>(
      "/api/query/sql",
      { stmt: `SELECT id FROM blocks WHERE id = '${escapeSql(blockId)}' LIMIT 1` }
    )) ?? [];
    return rows.length > 0;
  }

  async markBlockCompleted(blockId: string): Promise<void> {
    const block = await kernelApi<KramdownBlock>("/api/block/getBlockKramdown", { id: blockId });
    const markdown = block.kramdown ?? block.markdown;
    if (!markdown) {
      throw new Error("SiYuan getBlockKramdown returned no kramdown content");
    }
    const completedMarkdown = markTodoCompleted(markdown);
    if (completedMarkdown === markdown) {
      throw new Error("Unable to mark SiYuan todo completed: unsupported task markdown");
    }
    await kernelApi<unknown>("/api/block/updateBlock", {
      id: blockId,
      dataType: "markdown",
      data: completedMarkdown
    });
  }

  async updateBlockMarkdown(blockId: string, markdown: string): Promise<void> {
    await kernelApi<unknown>("/api/block/updateBlock", {
      id: blockId,
      dataType: "markdown",
      data: markdown
    });
  }

  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return kernelApi<Record<string, string>>("/api/attr/getBlockAttrs", { id: blockId });
  }
}

export function buildTodoBlockSql(
  range: SyncRange,
  limit: number,
  offset = 0,
  recoveryBlockIds: ReadonlySet<string> = new Set()
): string {
  const hpathClause = range.includeChildren
    ? range.hpathPrefix === "/"
      ? `b.hpath LIKE '/%'`
      : `(b.hpath = '${escapeSql(range.hpathPrefix)}' OR instr(b.hpath, '${escapeSql(range.hpathPrefix)}/') = 1)`
    : `b.hpath = '${escapeSql(range.hpathPrefix)}'`;
  const incompleteClause = `(
        b.markdown LIKE '- [ ] %'
        OR b.markdown LIKE '* [ ] %'
        OR b.markdown LIKE '- {: %}[ ] %'
        OR b.markdown LIKE '* {: %}[ ] %'
      )`;
  const completedClause = `(
        b.markdown LIKE '- [x] %'
        OR b.markdown LIKE '* [x] %'
        OR b.markdown LIKE '- [X] %'
        OR b.markdown LIKE '* [X] %'
        OR b.markdown LIKE '- {: %}[x] %'
        OR b.markdown LIKE '* {: %}[x] %'
        OR b.markdown LIKE '- {: %}[X] %'
        OR b.markdown LIKE '* {: %}[X] %'
      )`;
  const archivedCompletedClause = `b.ial NOT LIKE '%custom-dida-sync-state="completed-synced"%'`;
  const recoveryIds = [...recoveryBlockIds].filter(isSiYuanBlockId);
  const recoverableCompletedClause = recoveryIds.length > 0
    ? `
          OR (
            COALESCE(b.ial, '') NOT LIKE '%custom-dida-task-id%'
            AND b.id IN (${recoveryIds.map((id) => `'${escapeSql(id)}'`).join(", ")})
          )`
    : "";

  return `
    SELECT
      b.id,
      CASE
        WHEN parent.type = 'i' AND parent.subtype = 't' THEN parent.id
        WHEN parent.type = 'l' AND grandparent.type = 'i' AND grandparent.subtype = 't' THEN grandparent.id
        ELSE NULL
      END AS parent_id,
      b.markdown,
      b.box,
      b.hpath
    FROM blocks b
    LEFT JOIN blocks parent ON parent.id = b.parent_id
    LEFT JOIN blocks grandparent ON grandparent.id = parent.parent_id
    WHERE b.box = '${escapeSql(range.notebookId)}'
      AND ${hpathClause}
      AND b.type = 'i'
      AND b.subtype = 't'
      AND (
        ${incompleteClause}
        OR (
          ${completedClause}
          AND (
            (b.ial LIKE '%custom-dida-task-id%' AND ${archivedCompletedClause})${recoverableCompletedClause}
          )
        )
      )
    ORDER BY
      CASE
        WHEN b.markdown LIKE '- [ ] %'
          OR b.markdown LIKE '* [ ] %'
          OR b.markdown LIKE '- {: %}[ ] %'
          OR b.markdown LIKE '* {: %}[ ] %'
        THEN 0
        ELSE 1
      END,
      b.updated DESC
    LIMIT ${Math.max(1, limit)} OFFSET ${Math.max(0, offset)}
  `;
}

export function buildBoundTodoBlockSql(range: SyncRange, limit = 500, offset = 0): string {
  const hpathClause = range.includeChildren
    ? range.hpathPrefix === "/"
      ? `b.hpath LIKE '/%'`
      : `(b.hpath = '${escapeSql(range.hpathPrefix)}' OR instr(b.hpath, '${escapeSql(range.hpathPrefix)}/') = 1)`
    : `b.hpath = '${escapeSql(range.hpathPrefix)}'`;

  return `
    SELECT
      b.id,
      CASE
        WHEN parent.type = 'i' AND parent.subtype = 't' THEN parent.id
        WHEN parent.type = 'l' AND grandparent.type = 'i' AND grandparent.subtype = 't' THEN grandparent.id
        ELSE NULL
      END AS parent_id,
      b.markdown,
      b.box,
      b.hpath
    FROM blocks b
    LEFT JOIN blocks parent ON parent.id = b.parent_id
    LEFT JOIN blocks grandparent ON grandparent.id = parent.parent_id
    WHERE b.box = '${escapeSql(range.notebookId)}'
      AND ${hpathClause}
      AND b.type = 'i'
      AND b.subtype = 't'
      AND b.ial LIKE '%custom-dida-task-id%'
    ORDER BY b.updated DESC
    LIMIT ${Math.max(1, limit)} OFFSET ${Math.max(0, offset)}
  `;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
