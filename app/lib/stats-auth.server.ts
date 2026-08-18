import { timingSafeEqual } from "node:crypto";
import { createCookie } from "react-router";

/**
 * Access control for /stats.
 *
 * The page renders the full rate-alert subscriber list, which is PII. It used
 * to be gated by `?key=STATS_KEY` in the query string — adequate when the page
 * showed nothing but view counts, and not adequate once real addresses were
 * put behind it. Query strings end up in Render's access logs, browser
 * history, and the Referer header of any outbound request, so the secret was
 * effectively written down in several places that outlive the request.
 *
 * The key now travels in a POST body once, and thereafter in a signed,
 * httpOnly cookie. `?key=` is deliberately no longer accepted — leaving it in
 * as a convenience would leave the leak in place.
 */

const COOKIE_NAME = "synorai_stats";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function statsKey(): string | null {
  const key = process.env.STATS_KEY?.trim();
  return key ? key : null;
}

/**
 * The cookie is signed with STATS_KEY itself, so rotating the key invalidates
 * every existing session for free.
 */
function statsCookie(secret: string) {
  return createCookie(COOKIE_NAME, {
    secrets: [secret],
    path: "/stats",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Constant-time comparison, length-guarded (timingSafeEqual throws on unequal lengths). */
export function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Throws a 404 when STATS_KEY is unset — the route should not exist at all on
 * an install that never configured it. Returns false when the key is set but
 * the caller has no valid cookie, so the caller can render the sign-in form
 * without disclosing anything.
 */
export async function hasStatsSession(request: Request): Promise<boolean> {
  const secret = statsKey();
  if (!secret) throw new Response("Not Found", { status: 404 });

  const parsed = await statsCookie(secret).parse(request.headers.get("Cookie"));
  return parsed?.ok === true;
}

export async function createStatsSessionCookie(): Promise<string> {
  const secret = statsKey();
  if (!secret) throw new Response("Not Found", { status: 404 });

  return statsCookie(secret).serialize({ ok: true, at: Date.now() });
}

export async function destroyStatsSessionCookie(): Promise<string> {
  const secret = statsKey();
  if (!secret) throw new Response("Not Found", { status: 404 });

  return statsCookie(secret).serialize("", { maxAge: 0 });
}

export function verifyStatsKey(provided: string | null): boolean {
  const secret = statsKey();
  if (!secret || !provided) return false;
  return keyMatches(provided, secret);
}

/**
 * Headers for a page that renders PII: never cached, and no Referer sent to
 * anything the page links out to.
 */
export const STATS_SECURITY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;
