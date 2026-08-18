import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { recordPageView } from "../lib/pageviews.server";
import { subscribeToRateAlerts } from "../lib/rate-alerts.server";
import { clientIp, rateLimit } from "../lib/rate-limit.server";

import {
  ALLOWED_PROVINCES,
  getPublicFeeScheduleEntries,
  type ProvinceCode,
} from "../lib/eco-fees";

const APP_LISTING_URL = "https://apps.shopify.com/synorai-ecocharge";
const RATES_VERIFIED = "June 2026 program schedules";

const PROVINCE_NAMES: Record<ProvinceCode, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
};

// Program administrator per province (for source credibility).
const PROVINCE_PROGRAM: Record<ProvinceCode, string> = {
  AB: "Alberta Recycling Management Authority (ARMA)",
  BC: "Electronic Products Recycling Association (EPRA) BC",
  MB: "EPRA Manitoba",
  NB: "EPRA New Brunswick",
  NL: "EPRA Newfoundland & Labrador",
  NS: "EPRA Nova Scotia",
  PE: "EPRA Prince Edward Island",
  QC: "EPRA Quebec",
  SK: "EPRA Saskatchewan",
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const host = data?.canonicalHost ?? "synorai.ai";
  const title =
    "Canadian EHF Eco Fee Rates 2026 — All 9 Provinces | Synorai EcoCharge";
  const description =
    "Current Environmental Handling Fee (EHF) eco fee rates for electronics in all nine Canadian provinces with a regulated program (AB, BC, MB, NB, NL, NS, PE, QC, SK), verified against official ARMA and EPRA schedules.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: `https://${host}/rates` },
    { tagName: "link", rel: "canonical", href: `https://${host}/rates` },
    { name: "robots", content: "index,follow" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  await recordPageView(request, "/rates");

  const provinces = ALLOWED_PROVINCES.map((code) => ({
    code,
    name: PROVINCE_NAMES[code],
    program: PROVINCE_PROGRAM[code],
    entries: getPublicFeeScheduleEntries(code).map((entry) => ({
      label: entry.label,
      fee: entry.fee,
      note: entry.note ?? null,
    })),
  }));

  return {
    provinces,
    verified: RATES_VERIFIED,
    canonicalHost: process.env.PRIMARY_HOST ?? new URL(request.url).host,
  };
}

const SIGNUP_SUCCESS =
  "You're on the list. We'll email you when a province changes its EHF schedule.";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();

  // Honeypot: a real person never sees this field, so anything in it is a bot.
  // Report success anyway — telling scrapers they were caught just teaches them.
  if ((form.get("company") as string | null)?.trim()) {
    return { ok: true, message: SIGNUP_SUCCESS };
  }

  /**
   * The honeypot only stops naive bots. Without a cap, a script can enroll
   * arbitrary third-party addresses — and because sends go out by hand to
   * whoever appears on this list, a poisoned list would have us emailing
   * people who never consented. That's a CASL problem, not just noise, which
   * is why this is worth a limiter despite the low technical severity.
   */
  const limited = rateLimit({
    key: `signup:${clientIp(request)}`,
    limit: 5,
    windowSeconds: 3600,
  });

  if (!limited.allowed) {
    return data(
      {
        ok: false,
        message: "Too many signups from this connection. Try again in a little while.",
      },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const email = (form.get("email") as string | null) ?? "";
  const src = new URL(request.url).searchParams.get("src");

  return subscribeToRateAlerts(email, src);
}

const wrap: React.CSSProperties = {
  maxWidth: 860,
  margin: "0 auto",
  padding: "40px 20px 80px",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  color: "#14281d",
  lineHeight: 1.6,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  margin: "8px 0 4px",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "2px solid #cfe8d6",
  fontSize: 14,
  color: "#3a6b4d",
};

const td: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eef2ef",
  fontSize: 15,
};

const feeTd: React.CSSProperties = {
  ...td,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

export default function RatesPage() {
  const { provinces, verified } = useLoaderData() as Awaited<
    ReturnType<typeof loader>
  >;
  const signup = useFetcher<typeof action>();
  const signupResult = signup.data;
  const submitting = signup.state !== "idle";

  return (
    <>
      {/* Brand header — same lockup as the main site so shared links look
          like they belong to a company, not a stray page. */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #ecebf5",
          padding: "16px 20px",
        }}
      >
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <a href="/" style={{ display: "inline-block" }}>
            <img
              src="/synorai-logo.png"
              alt="Synorai"
              width={433}
              height={99}
              style={{ width: 168, height: "auto", display: "block" }}
            />
          </a>
        </div>
      </header>

    <main style={wrap}>
      <p style={{ fontSize: 13, color: "#5b53a6", margin: 0, fontWeight: 700, letterSpacing: 1 }}>
        SYNORAI ECOCHARGE
      </p>
      <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: "6px 0 10px" }}>
        Canadian Environmental Handling Fee (EHF) rates for electronics — 2026
      </h1>
      <p style={{ fontSize: 18, color: "#3f5a49", marginTop: 0 }}>
        The eco fee (EHF) a retailer must charge on electronics is set by each
        province, and every province publishes a different schedule. Below are
        the current per-unit rates for all nine provinces that run a regulated
        program, verified against the official {verified}.
      </p>

      <div
        style={{
          background: "#eefaf0",
          border: "1px solid #bfe6c9",
          borderRadius: 10,
          padding: "14px 18px",
          margin: "20px 0 28px",
          fontSize: 15,
        }}
      >
        <strong>What is the EHF?</strong> The Environmental Handling Fee is a
        regulated eco fee applied at the point of sale on new electronics. It
        funds provincial recycling programs. Retailers collect it and remit it
        to the program (ARMA in Alberta, EPRA elsewhere). Rates are per unit and
        vary by product category and province.
      </div>

      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          margin: "0 0 28px",
        }}
        aria-label="Jump to province"
      >
        {provinces.map((p) => (
          <a
            key={p.code}
            href={`#${p.code}`}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #bfe6c9",
              background: "#fff",
              color: "#1f6b3a",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {p.code}
          </a>
        ))}
      </nav>

      {provinces.map((p) => (
        <section key={p.code} id={p.code} style={{ margin: "0 0 34px" }}>
          <h2 style={{ fontSize: 24, margin: "0 0 2px" }}>
            {p.name} EHF rates ({p.code})
          </h2>
          <p style={{ fontSize: 13, color: "#6a7d70", margin: "0 0 8px" }}>
            Program: {p.program}
          </p>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Product category</th>
                <th style={{ ...th, textAlign: "right" }}>Fee per unit</th>
              </tr>
            </thead>
            <tbody>
              {p.entries.map((entry) => (
                <tr key={entry.label}>
                  <td style={td}>
                    {entry.label}
                    {entry.note ? (
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          color: "#6a7d70",
                        }}
                      >
                        {entry.note}
                      </span>
                    ) : null}
                  </td>
                  <td style={feeTd}>${entry.fee.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section style={{ margin: "0 0 34px" }}>
        <h2 style={{ fontSize: 22 }}>Provinces without a regulated EHF</h2>
        <p style={{ fontSize: 15, color: "#3f5a49" }}>
          <strong>Ontario</strong> ended its regulated electronics EHF program
          in 2021 under individual producer responsibility; there is no
          mandated provincial fee schedule. <strong>Yukon</strong> and the{" "}
          <strong>Northwest Territories</strong> run smaller programs, and{" "}
          <strong>Nunavut</strong> has none. Always confirm your obligations
          with the current program administrator for your province.
        </p>
      </section>

      {/* Rate-change alerts. This is the funnel: the schedule stays free, but
          the promise to tell you when it moves is what people hand over an
          address for. Doubles as the demand signal for a paid data feed. */}
      <section
        id="alerts"
        style={{
          background: "#fff",
          border: "2px solid #bfe6c9",
          borderRadius: 14,
          padding: "26px 28px",
          margin: "10px 0 30px",
        }}
      >
        <h2 style={{ fontSize: 22, margin: "0 0 8px" }}>
          Get told when these rates change
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 16, color: "#3f5a49" }}>
          Provinces revise their EHF schedules without much warning — BC raised
          display fees sharply in June 2026 and added a new 65&quot; and over
          tier. We re-verify every schedule against the official ARMA and EPRA
          bulletins. Leave your email and we&apos;ll tell you the day something
          moves. No newsletter, no product pitches — rate changes only.
        </p>

        {signupResult?.ok ? (
          <p
            role="status"
            style={{
              margin: 0,
              padding: "14px 16px",
              background: "#eefaf0",
              border: "1px solid #bfe6c9",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              color: "#166534",
            }}
          >
            {signupResult.message}
          </p>
        ) : (
          <signup.Form method="post" noValidate>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <label htmlFor="email" style={{ position: "absolute", left: -9999 }}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@yourstore.ca"
                disabled={submitting}
                style={{
                  flex: "1 1 260px",
                  minWidth: 0,
                  padding: "12px 14px",
                  fontSize: 16,
                  borderRadius: 999,
                  border: "1px solid #bfe6c9",
                  background: "#fff",
                  color: "#14281d",
                }}
              />
              {/* Honeypot — hidden from people, irresistible to bots. */}
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: -9999,
                  width: 1,
                  height: 1,
                  opacity: 0,
                }}
              />
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: "12px 26px",
                  fontSize: 16,
                  fontWeight: 700,
                  borderRadius: 999,
                  border: "none",
                  background: submitting ? "#9bd3ad" : "#166534",
                  color: "#fff",
                  cursor: submitting ? "default" : "pointer",
                }}
              >
                {submitting ? "Adding…" : "Notify me"}
              </button>
            </div>

            {signupResult && !signupResult.ok ? (
              <p
                role="alert"
                style={{
                  margin: "10px 0 0",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#a3341f",
                }}
              >
                {signupResult.message}
              </p>
            ) : null}

            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6a7d70" }}>
              Sent by Synorai, Airdrie, Alberta. We store your address and
              nothing else, we never sell or share it, and every email carries a
              one-click unsubscribe link.
            </p>
          </signup.Form>
        )}
      </section>

      <aside
        style={{
          background: "linear-gradient(135deg,#0b3d2e,#166534)",
          color: "#fff",
          borderRadius: 14,
          padding: "26px 28px",
          margin: "10px 0 30px",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 22, color: "#fff" }}>
          Tired of tracking nine fee schedules?
        </h2>
        <p style={{ margin: "0 0 16px", color: "#d7f0dd", fontSize: 16 }}>
          Synorai EcoCharge applies the correct EHF automatically — in the cart,
          at checkout, and on Shopify POS — for every province, and gives you a
          per-province remittance report at filing time. Rates stay current when
          programs change, so you never track a fee bulletin again.
        </p>
        <a
          href={APP_LISTING_URL}
          style={{
            display: "inline-block",
            background: "#4ade80",
            color: "#0b3d2e",
            fontWeight: 700,
            padding: "12px 22px",
            borderRadius: 999,
            textDecoration: "none",
            fontSize: 16,
          }}
        >
          View on the Shopify App Store →
        </a>
      </aside>

      <p style={{ fontSize: 13, color: "#6a7d70" }}>
        Rates verified against the official {verified}. This page is provided for
        general reference; retailers remain responsible for confirming their own
        compliance and remittance obligations with the applicable program.
      </p>

      <p style={{ fontSize: 14, marginTop: 26 }}>
        <a href="/" style={{ color: "#7402FA", fontWeight: 600 }}>
          ← More from Synorai
        </a>
      </p>
    </main>
    </>
  );
}
