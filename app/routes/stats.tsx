import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { Form, data, redirect, useLoaderData } from "react-router";
import { getPageViewStats, type PageViewStats } from "../lib/pageviews.server";
import {
  getSubscriberStats,
  type SubscriberStats,
} from "../lib/rate-alerts.server";
import {
  createStatsSessionCookie,
  destroyStatsSessionCookie,
  hasStatsSession,
  verifyStatsKey,
  STATS_SECURITY_HEADERS,
} from "../lib/stats-auth.server";

export const meta: MetaFunction = () => [
  { title: "Stats" },
  { name: "robots", content: "noindex,nofollow" },
];

/**
 * Headers for the HTML document response. Setting them via `data(…, { headers })`
 * inside the loader is NOT enough — those apply to the data request, while a
 * document render takes its headers from this export. Verified against the
 * live deploy: without this, /stats came back with no Cache-Control and no
 * Referrer-Policy at all, on a page that renders subscriber email addresses.
 */
export const headers: HeadersFunction = () => STATS_SECURITY_HEADERS;

/**
 * Private stats. The page renders subscriber email addresses, so the key is
 * submitted once by POST and held in a signed httpOnly cookie thereafter —
 * never in the URL, where it would land in access logs, browser history and
 * the Referer header. `?key=` is no longer accepted.
 *
 * When STATS_KEY is unset the route 404s, as before.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const authed = await hasStatsSession(request);

  if (!authed) {
    return data(
      { authed: false as const, stats: null, subscribers: null },
      { headers: STATS_SECURITY_HEADERS },
    );
  }

  const [stats, subscribers] = await Promise.all([
    getPageViewStats(30),
    getSubscriberStats(),
  ]);

  return data(
    { authed: true as const, stats, subscribers },
    { headers: STATS_SECURITY_HEADERS },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();

  if (form.get("intent") === "sign-out") {
    return redirect("/stats", {
      headers: { "Set-Cookie": await destroyStatsSessionCookie() },
    });
  }

  const key = (form.get("key") as string | null)?.trim() ?? null;

  if (!verifyStatsKey(key)) {
    // Deliberately vague, and no timing signal — verifyStatsKey compares in
    // constant time.
    return data(
      { error: "Incorrect key." },
      { status: 401, headers: STATS_SECURITY_HEADERS },
    );
  }

  return redirect("/stats", {
    headers: { "Set-Cookie": await createStatsSessionCookie() },
  });
}

const cell: React.CSSProperties = {
  padding: "6px 12px",
  borderBottom: "1px solid #eee",
  fontSize: 14,
  textAlign: "left",
};
const num: React.CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };

const shell: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "40px 20px 80px",
  fontFamily: "system-ui, sans-serif",
  color: "#14281d",
};

export default function StatsRoute() {
  const loaded = useLoaderData() as
    | { authed: false; stats: null; subscribers: null }
    | { authed: true; stats: PageViewStats; subscribers: SubscriberStats };

  if (!loaded.authed) {
    return (
      <main style={{ ...shell, maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, marginTop: 0 }}>Synorai stats</h1>
        <p style={{ fontSize: 14, color: "#5b7263" }}>
          Enter the stats key. It&apos;s sent once and held in a cookie, so it
          never appears in a URL.
        </p>
        <Form method="post">
          <input
            type="password"
            name="key"
            autoComplete="current-password"
            aria-label="Stats key"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 15,
              borderRadius: 6,
              border: "1px solid #bfe6c9",
              marginBottom: 10,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 20px",
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 6,
              border: "none",
              background: "#166534",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            View stats
          </button>
        </Form>
      </main>
    );
  }

  const { stats, subscribers } = loaded;

  return (
    <main style={shell}>
      {/* Subscribers first — it's the number that decides whether the rates
          page is doing its job, and the addresses are needed to actually send. */}
      <h1 style={{ fontSize: 26, marginTop: 0 }}>
        Rate alert list — {subscribers.active}{" "}
        {subscribers.active === 1 ? "subscriber" : "subscribers"}
      </h1>
      <p style={{ color: "#5b7263", fontSize: 14 }}>
        {subscribers.active} active
        {subscribers.unsubscribed > 0
          ? `, ${subscribers.unsubscribed} unsubscribed`
          : ""}
        . Sends go out by hand, one at a time — copy the addresses below. Every
        message needs the unsubscribe link and the Synorai mailing address.
      </p>

      {subscribers.bySrc.length > 0 && (
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 18 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={cell}>Signup source</th>
              <th style={num}>Subscribers</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.bySrc.map((s) => (
              <tr key={s.src}>
                <td style={cell}>{s.src}</td>
                <td style={num}>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={cell}>Email</th>
            <th style={cell}>Source</th>
            <th style={cell}>Signed up</th>
            <th style={cell}>Status</th>
          </tr>
        </thead>
        <tbody>
          {subscribers.rows.map((r) => (
            <tr key={r.email} style={r.unsubscribed ? { opacity: 0.45 } : undefined}>
              <td style={cell}>{r.email}</td>
              <td style={cell}>{r.src}</td>
              <td style={cell}>{r.signedUp}</td>
              <td style={cell}>
                {r.unsubscribed ? "unsubscribed — do not email" : "active"}
              </td>
            </tr>
          ))}
          {subscribers.rows.length === 0 && (
            <tr>
              <td style={cell} colSpan={4}>
                Nobody has signed up yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h1 style={{ fontSize: 26, marginTop: 40 }}>
        Page views — last {stats.days} days
      </h1>
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

      <Form method="post" style={{ marginTop: 32 }}>
        <input type="hidden" name="intent" value="sign-out" />
        <button
          type="submit"
          style={{
            padding: "8px 16px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid #bbb",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </Form>
    </main>
  );
}
