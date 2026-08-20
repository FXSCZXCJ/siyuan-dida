import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("settings warning style", () => {
  test("uses SiYuan theme-aware warning colors", () => {
    const stylesheet = readFileSync(new URL("./index.scss", import.meta.url), "utf8");

    expect(stylesheet).toContain(".dida-sync-range-warning");
    expect(stylesheet).toContain("var(--b3-card-warning-color)");
    expect(stylesheet).toContain("var(--b3-card-warning-background)");
  });
});
