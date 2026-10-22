import { describe, expect, test } from "vitest";
import { localAllDayStart, localDateTime } from "./date";

describe("localAllDayStart", () => {
  test("formats local midnight with a numeric timezone offset", () => {
    expect(localAllDayStart(new Date(2026, 6, 2, 16, 30))).toMatch(/^2026-07-02T00:00:00[+-]\d{4}$/);
  });
});

describe("localDateTime", () => {
  test("formats the local date and time with a numeric timezone offset", () => {
    expect(localDateTime(new Date(2026, 10, 2, 18, 30))).toMatch(/^2026-11-02T18:30:00[+-]\d{4}$/);
  });
});
