import { describe, it, expect } from "vitest";

process.env.STATS_KEY = "test-key-abc123";
const mod = await import("../../../app/lib/stats-auth.server.ts");

describe("stats cookie round trip", () => {
  it("accepts the correct key and rejects others", () => {
    expect(mod.verifyStatsKey("test-key-abc123")).toBe(true);
    expect(mod.verifyStatsKey("wrong")).toBe(false);
  });

  it("a cookie it issues is one it accepts back", async () => {
    const setCookie = await mod.createStatsSessionCookie();
    console.log("SET-COOKIE HEADER:", setCookie);
    const value = setCookie.split(";")[0];
    const req = new Request("https://x/stats", { headers: { Cookie: value } });
    const ok = await mod.hasStatsSession(req);
    console.log("hasStatsSession ->", ok);
    expect(ok).toBe(true);
  });
});
