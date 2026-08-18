/**
 * Small fixed-window rate limiter for the unauthenticated public endpoints.
 *
 * Deliberately in-memory: this app runs as a single Render instance, and the
 * abuse being prevented is cheap and low-stakes. Two honest limitations that
 * come with that choice —
 *
 *   1. Counters reset on every deploy or restart.
 *   2. With more than one instance, each keeps its own tally, so the effective
 *      limit multiplies by the instance count.
 *
 * If either stops being acceptable, move the counter to Postgres or Redis.
 * This is a speed bump, not a wall, and the same is true of the client IP:
 * `x-forwarded-for` is set by Render's proxy but can be padded by a determined
 * caller, so a motivated attacker can still rotate around it. It stops casual
 * scripted abuse, which is the actual threat here.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Keep the map from growing without bound on a long-lived process. */
function sweep(now: number): void {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Render puts the client address first in `x-forwarded-for`. Falls back to a
 * single shared bucket when there's no header at all, which is the safe
 * direction to fail: unknown callers share one allowance rather than each
 * getting a fresh one.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function rateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): RateLimitResult {
  const { key, limit, windowSeconds } = params;
  const now = Date.now();

  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test seam — lets a suite start from a known state. */
export function __resetRateLimits(): void {
  buckets.clear();
}
