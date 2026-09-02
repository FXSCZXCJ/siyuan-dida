/**
 * Rate-limit detection and exponential backoff for the Dida API.
 *
 * The Dida backend enforces per-account request quotas (e.g. 100/min,
 * 300/5min). The local `dida` CLI surfaces quota exhaustion as an error whose
 * message contains `exceed_query_limit` / "Query rate limit exceeded" / "429".
 * When that happens we must stop hammering the API: back off exponentially and
 * let the scheduler skip auto-sync ticks until the backoff window expires.
 */

export interface BackoffControllerOptions {
  /** Base delay in ms for the first rate-limit hit. */
  baseDelayMs?: number;
  /** Upper bound for the backoff delay in ms. */
  maxDelayMs?: number;
  /** Multiplicative growth factor per consecutive hit. */
  factor?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface BackoffController {
  /** Record a rate-limit hit and advance the backoff. */
  onRateLimit(): void;
  /** Record a success, clearing any active backoff. */
  onSuccess(): void;
  /** Epoch ms before which auto-sync ticks should be skipped. 0 = not backing off. */
  nextAllowedAt(): number;
  /** Current backoff delay in ms (0 when idle). */
  currentDelayMs(): number;
  /** Whether the controller is currently inside a backoff window. */
  isBackingOff(): boolean;
}

const DEFAULT_BASE_DELAY_MS = 15_000;
const DEFAULT_MAX_DELAY_MS = 300_000;
const DEFAULT_FACTOR = 2;

const RATE_LIMIT_PATTERNS = [
  /exceed_query_limit/i,
  /rate limit exceeded/i,
  /too many requests/i,
  /\b429\b/
];

export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
}

export function createBackoffController(options: BackoffControllerOptions = {}): BackoffController {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const factor = options.factor ?? DEFAULT_FACTOR;
  const now = options.now ?? Date.now;

  let consecutiveHits = 0;
  let allowedAt = 0;

  return {
    onRateLimit() {
      consecutiveHits += 1;
      const exponent = Math.max(0, consecutiveHits - 1);
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, exponent));
      allowedAt = now() + delay;
    },
    onSuccess() {
      consecutiveHits = 0;
      allowedAt = 0;
    },
    nextAllowedAt() {
      return allowedAt;
    },
    currentDelayMs() {
      if (allowedAt === 0) return 0;
      return Math.max(0, allowedAt - now());
    },
    isBackingOff() {
      return allowedAt > now();
    }
  };
}
