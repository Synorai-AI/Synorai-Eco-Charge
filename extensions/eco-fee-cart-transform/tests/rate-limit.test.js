import { describe, it, expect, beforeEach } from "vitest";
import {
  clientIp,
  rateLimit,
  __resetRateLimits,
} from "../../../app/lib/rate-limit.server.ts";

function req(headers = {}) {
  return new Request("https://synorai.ai/rates", { headers });
}

describe("rate limiting on public endpoints", () => {
  beforeEach(() => __resetRateLimits());

  it("allows up to the limit and blocks the request after it", () => {
    const opts = { key: "signup:1.2.3.4", limit: 3, windowSeconds: 3600 };

    expect(rateLimit(opts).allowed).toBe(true);
    expect(rateLimit(opts).allowed).toBe(true);
    expect(rateLimit(opts).allowed).toBe(true);

    const blocked = rateLimit(opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate allowances per key, so one caller cannot lock out another", () => {
    const a = { key: "signup:1.1.1.1", limit: 1, windowSeconds: 3600 };
    const b = { key: "signup:2.2.2.2", limit: 1, windowSeconds: 3600 };

    expect(rateLimit(a).allowed).toBe(true);
    expect(rateLimit(a).allowed).toBe(false);
    expect(rateLimit(b).allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", async () => {
    const opts = { key: "signup:3.3.3.3", limit: 1, windowSeconds: 0 };

    expect(rateLimit(opts).allowed).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(rateLimit(opts).allowed).toBe(true);
  });

  it("takes the client address from the front of x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to one shared bucket when no address header is present", () => {
    // Failing this direction is deliberate: unknown callers share a single
    // allowance rather than each being handed a fresh one.
    expect(clientIp(req())).toBe("unknown");
  });
});
