import { describe, it, expect } from "vitest";

process.env.STATS_KEY = "test-key-abc123";
const mod = await import("../../../app/lib/stats-auth.server.ts");

describe("stats cookie round trip", () => {
  it("accepts the correct key and rejects others", () => {
    expect(mod.verifyStatsKey("test-key-abc123")).toBe(true);
    expect(mod.verifyStatsKey("wrong")).toBe(false);
  });

  it("a cookie it issues is one it accepts back", async () => {
    const [setCookie] = await mod.createStatsSessionCookies();
    const value = setCookie.split(";")[0];
    const req = new Request("https://x/stats", { headers: { Cookie: value } });
    const ok = await mod.hasStatsSession(req);
    expect(ok).toBe(true);
  });
});

describe("legacy cookie path is expired", () => {
  it("sign-out expires BOTH the current path and the legacy /stats path", async () => {
    const cookies = await mod.destroyStatsSessionCookies();
    expect(cookies).toHaveLength(2);
    expect(cookies.some((c) => /Path=\/;/.test(c) || /Path=\/$/.test(c))).toBe(true);
    const legacy = cookies.find((c) => c.includes("Path=/stats"));
    expect(legacy).toBeDefined();
    expect(legacy).toMatch(/Max-Age=0/);
  });

  it("sign-in also clears the legacy cookie, so two never coexist", async () => {
    const cookies = await mod.createStatsSessionCookies();
    expect(cookies).toHaveLength(2);
    const legacy = cookies.find((c) => c.includes("Path=/stats"));
    expect(legacy).toMatch(/Max-Age=0/);
  });
});
