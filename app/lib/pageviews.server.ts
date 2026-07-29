import db from "../db.server";

/**
 * Privacy-preserving page view counting for the public pages.
 * Stores daily tallies only: date + path + src tag. No IPs, no cookies,
 * no user agents persisted. `?src=` lets outreach channels be told apart
 * (e.g. /rates?src=vendor vs /rates?src=email vs /rates?src=fb).
 */

const BOT_RE =
  /bot|crawler|spider|render|pingdom|uptime|monitor|preview|facebookexternalhit|curl|wget|python|headless|lighthouse/i;

export function isProbablyBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_RE.test(userAgent);
}

function sanitizeSrc(raw: string | null): string {
  if (!raw) return "direct";
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
  return cleaned || "direct";
}

export async function recordPageView(
  request: Request,
  path: string,
): Promise<void> {
  try {
    if (isProbablyBot(request.headers.get("user-agent"))) return;

    const src = sanitizeSrc(new URL(request.url).searchParams.get("src"));
    const date = new Date().toISOString().slice(0, 10); // UTC day bucket
    const id = `${date}:${path}:${src}`;

    await db.pageViewDaily.upsert({
      where: { id },
      create: { id, date, path, src, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (error) {
    // Counting must never break a public page.
    console.error("[pageviews] failed to record view", error);
  }
}

export type PageViewRow = {
  date: string;
  path: string;
  src: string;
  count: number;
};

export type PageViewStats = {
  days: number;
  rows: PageViewRow[];
  totalsBySrc: Array<{ path: string; src: string; count: number }>;
  grandTotal: number;
};

export async function getPageViewStats(days = 30): Promise<PageViewStats> {
  const since = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);

  const records = await db.pageViewDaily.findMany({
    where: { date: { gte: since } },
    orderBy: [{ date: "desc" }, { path: "asc" }, { src: "asc" }],
  });

  const totals = new Map<string, { path: string; src: string; count: number }>();
  let grandTotal = 0;

  for (const r of records) {
    grandTotal += r.count;
    const key = `${r.path}|${r.src}`;
    const t = totals.get(key) ?? { path: r.path, src: r.src, count: 0 };
    t.count += r.count;
    totals.set(key, t);
  }

  return {
    days,
    rows: records.map((r: (typeof records)[number]) => ({
      date: r.date,
      path: r.path,
      src: r.src,
      count: r.count,
    })),
    totalsBySrc: Array.from(totals.values()).sort((a, b) => b.count - a.count),
    grandTotal,
  };
}
