import type { SyncRange } from "../core/types";
import type { Translate } from "../i18n";

export type RangeValidationErrorCode =
  | "missing_notebook"
  | "missing_path"
  | "missing_target"
  | "duplicate_range_id"
  | "overlapping_ranges";

export interface RangeValidationErrorDetails {
  rangeIndex: number;
  rangeId: string;
  rangeName: string;
  conflictingRangeIndex?: number;
  conflictingRangeId?: string;
  conflictingRangeName?: string;
}

export class RangeValidationError extends Error {
  readonly code: RangeValidationErrorCode;
  readonly details: RangeValidationErrorDetails;

  constructor(code: RangeValidationErrorCode, details: RangeValidationErrorDetails) {
    super(`Invalid sync range: ${code}`);
    this.name = "RangeValidationError";
    this.code = code;
    this.details = details;
  }
}

export type RangeIdFactory = () => string;

export function createRangeId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return `range-${randomUuid}`;
  }

  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2);
  return `range-${timestamp}-${random}`;
}

export function createEmptyRange(index: number, createId: RangeIdFactory = createRangeId): SyncRange {
  return {
    id: createId(),
    name: `同步范围 ${index}`,
    notebookId: "",
    hpathPrefix: "",
    includeChildren: true,
    targetProjectId: "",
    targetProjectName: "",
    cursorOffset: 0
  };
}

export function prepareRangesForSave(ranges: SyncRange[]): SyncRange[] {
  const normalized = ranges
    .map((range, index) => normalizeRange(range, index + 1))
    .filter((range) => !isEmptyRange(range));

  normalized.forEach((range, index) => validateRequiredFields(range, index + 1));
  validateUniqueIds(normalized);
  validateNonOverlappingRanges(normalized);
  return normalized;
}

export function getRangeValidationMessage(error: unknown, t: Translate): string {
  if (!(error instanceof RangeValidationError)) {
    return error instanceof Error ? error.message : String(error);
  }

  const { rangeIndex, conflictingRangeIndex } = error.details;
  switch (error.code) {
    case "missing_notebook":
      return t("rangeValidationMissingNotebook", { range: rangeIndex });
    case "missing_path":
      return t("rangeValidationMissingPath", { range: rangeIndex });
    case "missing_target":
      return t("rangeValidationMissingTarget", { range: rangeIndex });
    case "duplicate_range_id":
      return t("rangeValidationDuplicateId", {
        firstRange: conflictingRangeIndex ?? rangeIndex,
        secondRange: rangeIndex
      });
    case "overlapping_ranges":
      return t("rangeValidationOverlap", {
        firstRange: conflictingRangeIndex ?? rangeIndex,
        secondRange: rangeIndex
      });
  }
}

export function getTargetProjectWarning(originalTargetProjectId: string, targetProjectId: string, t: Translate): string {
  const original = originalTargetProjectId.trim();
  const current = targetProjectId.trim();
  if (!original || !current || original === current) {
    return "";
  }
  return t("targetProjectChangedWarning");
}

function normalizeRange(range: SyncRange, index: number): SyncRange {
  return {
    id: range.id.trim() || createRangeId(),
    name: range.name.trim() || `同步范围 ${index}`,
    notebookId: range.notebookId.trim(),
    hpathPrefix: normalizeDocumentPath(range.hpathPrefix),
    includeChildren: range.includeChildren,
    targetProjectId: range.targetProjectId.trim(),
    targetProjectName: range.targetProjectName.trim(),
    cursorOffset: normalizeCursorOffset(range.cursorOffset)
  };
}

function normalizeDocumentPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}

function isEmptyRange(range: SyncRange): boolean {
  return !range.notebookId && !range.hpathPrefix && !range.targetProjectId && !range.targetProjectName;
}

function validateRequiredFields(range: SyncRange, index: number): void {
  const details = rangeDetails(range, index);
  if (!range.notebookId) {
    throw new RangeValidationError("missing_notebook", details);
  }
  if (!range.hpathPrefix) {
    throw new RangeValidationError("missing_path", details);
  }
  if (!range.targetProjectId) {
    throw new RangeValidationError("missing_target", details);
  }
}

function validateUniqueIds(ranges: SyncRange[]): void {
  const firstIndexById = new Map<string, number>();
  ranges.forEach((range, index) => {
    const conflictingIndex = firstIndexById.get(range.id);
    if (conflictingIndex !== undefined) {
      throw new RangeValidationError(
        "duplicate_range_id",
        conflictDetails(range, index, ranges[conflictingIndex], conflictingIndex)
      );
    }
    firstIndexById.set(range.id, index);
  });
}

function validateNonOverlappingRanges(ranges: SyncRange[]): void {
  for (let index = 0; index < ranges.length; index += 1) {
    for (let conflictingIndex = 0; conflictingIndex < index; conflictingIndex += 1) {
      const range = ranges[index];
      const conflictingRange = ranges[conflictingIndex];
      if (rangesOverlap(range, conflictingRange)) {
        throw new RangeValidationError(
          "overlapping_ranges",
          conflictDetails(range, index, conflictingRange, conflictingIndex)
        );
      }
    }
  }
}

function rangesOverlap(first: SyncRange, second: SyncRange): boolean {
  if (first.notebookId !== second.notebookId) {
    return false;
  }
  if (first.hpathPrefix === second.hpathPrefix) {
    return true;
  }
  if (first.includeChildren && isAncestorPath(first.hpathPrefix, second.hpathPrefix)) {
    return true;
  }
  return second.includeChildren && isAncestorPath(second.hpathPrefix, first.hpathPrefix);
}

function isAncestorPath(ancestor: string, descendant: string): boolean {
  if (ancestor === "/") {
    return descendant !== "/" && descendant.startsWith("/");
  }
  return descendant.startsWith(`${ancestor}/`);
}

function rangeDetails(range: SyncRange, index: number): RangeValidationErrorDetails {
  return {
    rangeIndex: index,
    rangeId: range.id,
    rangeName: range.name
  };
}

function conflictDetails(
  range: SyncRange,
  index: number,
  conflictingRange: SyncRange,
  conflictingIndex: number
): RangeValidationErrorDetails {
  return {
    ...rangeDetails(range, index + 1),
    conflictingRangeIndex: conflictingIndex + 1,
    conflictingRangeId: conflictingRange.id,
    conflictingRangeName: conflictingRange.name
  };
}

function normalizeCursorOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
