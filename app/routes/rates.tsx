import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

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

export const meta: MetaFunction = () => {
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
    { name: "robots", content: "index,follow" },
  ];
};

export async function loader() {
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

  return { provinces, verified: RATES_VERIFIED };
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

  return (
    <main style={wrap}>
      <p style={{ fontSize: 13, color: "#3a6b4d", margin: 0, fontWeight: 600 }}>
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
          Synorai EcoCharge charges the correct EHF automatically — in the cart,
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
    </main>
  );
}
