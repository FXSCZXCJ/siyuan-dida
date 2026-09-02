import { describe, expect, test } from "vitest";
import { createBackoffController, isRateLimitError } from "./rateLimit";

describe("isRateLimitError", () => {
  test("detects exceed_query_limit from CLI stderr", () => {
    const err = new Error(
      'Command failed: dida task completed ...\nDIDA API 错误 500: {"errorCode":"exceed_query_limit","errorMessage":"Query rate limit exceeded. Maximum 300 requests per 5 minutes."}'
    );
    expect(isRateLimitError(err)).toBe(true);
  });

  test("detects 429 and too many requests", () => {
    expect(isRateLimitError(new Error("HTTP 429"))).toBe(true);
    expect(isRateLimitError(new Error("Too Many Requests"))).toBe(true);
  });

  test("does not match unrelated errors", () => {
    expect(isRateLimitError(new Error("Unable to run dida CLI"))).toBe(false);
    expect(isRateLimitError(new Error("snapshot incomplete"))).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError("")).toBe(false);
  });
});

describe("createBackoffController", () => {
  test("starts idle", () => {
    const c = createBackoffController();
    expect(c.isBackingOff()).toBe(false);
    expect(c.nextAllowedAt()).toBe(0);
  });

  test("grows delay exponentially and caps at maxDelayMs", () => {
    let t = 1_000_000;
    const c = createBackoffController({ baseDelayMs: 1000, maxDelayMs: 4000, factor: 2, now: () => t });

    c.onRateLimit();
    expect(c.nextAllowedAt()).toBe(t + 1000);

    c.onRateLimit();
    expect(c.nextAllowedAt()).toBe(t + 2000);

    c.onRateLimit();
    expect(c.nextAllowedAt()).toBe(t + 4000); // capped

    c.onRateLimit();
    expect(c.nextAllowedAt()).toBe(t + 4000); // stays capped
  });

  test("isBackingOff flips as time passes", () => {
    let t = 0;
    const c = createBackoffController({ baseDelayMs: 1000, now: () => t });
    c.onRateLimit();
    expect(c.isBackingOff()).toBe(true);
    expect(c.currentDelayMs()).toBe(1000);
    t = 500;
    expect(c.isBackingOff()).toBe(true);
    expect(c.currentDelayMs()).toBe(500);
    t = 1000;
    expect(c.isBackingOff()).toBe(false);
    expect(c.currentDelayMs()).toBe(0);
  });

  test("onSuccess resets backoff", () => {
    let t = 0;
    const c = createBackoffController({ baseDelayMs: 1000, now: () => t });
    c.onRateLimit();
    c.onRateLimit();
    expect(c.nextAllowedAt()).toBe(2000);
    c.onSuccess();
    expect(c.isBackingOff()).toBe(false);
    expect(c.nextAllowedAt()).toBe(0);
  });
});
