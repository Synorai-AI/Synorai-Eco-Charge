import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getPageViewStats, type PageViewStats } from "../lib/pageviews.server";

export const meta: MetaFunction = () => [
  { title: "Stats" },
  { name: "robots", content: "noindex,nofollow" },
];

/**
 * Private traffic stats, gated by ?key= matching the STATS_KEY env var.
 * If STATS_KEY isn't configured, the route simply doesn't exist (404).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const expected = process.env.STATS_KEY;
  const provided = new URL(request.url).searchParams.get("key");

  if (!expected || provided !== expected) {
    throw new Response("Not Found", { status: 404 });
  }

  const stats = await getPageViewStats(30);
  return { stats };
}

const cell: React.CSSProperties = {
  padding: "6px 12px",
  borderBottom: "1px solid #eee",
  fontSize: 14,
  textAlign: "left",
};
const num: React.CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export default function StatsRoute() {
  const { stats } = useLoaderData() as { stats: PageViewStats };

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 20px 80px",
        fontFamily: "system-ui, sans-serif",
        color: "#14281d",
      }}
    >
      <h1 style={{ fontSize: 26 }}>Page views — last {stats.days} days</h1>
      <p style={{ color: "#5b7263", fontSize: 14 }}>
        Human traffic only (obvious bots and crawlers excluded). Daily tallies,
        UTC days. Tag links with <code>?src=name</code> to tell channels apart.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>
        Totals by page and source · {stats.grandTotal} total views
      </h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={cell}>Page</th>
            <th style={cell}>Source</th>
            <th style={num}>Views</th>
          </tr>
        </thead>
        <tbody>
          {stats.totalsBySrc.map((t) => (
            <tr key={`${t.path}|${t.src}`}>
              <td style={cell}>{t.path}</td>
              <td style={cell}>{t.src}</td>
              <td style={num}>{t.count}</td>
            </tr>
          ))}
          {stats.totalsBySrc.length === 0 && (
            <tr>
              <td style={cell} colSpan={3}>
                No views recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Daily detail</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={cell}>Date (UTC)</th>
            <th style={cell}>Page</th>
            <th style={cell}>Source</th>
            <th style={num}>Views</th>
          </tr>
        </thead>
        <tbody>
          {stats.rows.map((r) => (
            <tr key={`${r.date}|${r.path}|${r.src}`}>
              <td style={cell}>{r.date}</td>
              <td style={cell}>{r.path}</td>
              <td style={cell}>{r.src}</td>
              <td style={num}>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
