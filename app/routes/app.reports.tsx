import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Link, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  buildRemittanceReport,
  type RemittanceReport,
} from "../lib/remittance.server";

export const headers: HeadersFunction = (args) => boundary.headers(args);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

function parseDateParam(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function quarterStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const now = new Date();
  const from = parseDateParam(url.searchParams.get("from"), quarterStart(now));
  const to = parseDateParam(url.searchParams.get("to"), now);

  const report = await buildRemittanceReport(session.shop, from, to);
  return { report };
}

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

const cellStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #eee",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const leftCell: React.CSSProperties = { ...cellStyle, textAlign: "left" };

function reportToCsv(report: RemittanceReport): string {
  const rows = [
    ["Destination", "Orders", "EHF charged", "EHF owed", "Difference", "Mismatched orders"],
    ...report.rows.map((r) => [
      r.label,
      String(r.orders),
      (r.chargedCents / 100).toFixed(2),
      (r.expectedCents / 100).toFixed(2),
      (r.deltaCents / 100).toFixed(2),
      String(r.mismatches),
    ]),
    [
      "TOTAL",
      String(report.totals.orders),
      (report.totals.chargedCents / 100).toFixed(2),
      (report.totals.expectedCents / 100).toFixed(2),
      ((report.totals.chargedCents - report.totals.expectedCents) / 100).toFixed(2),
      "",
    ],
  ];
  return rows
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function ReportsRoute() {
  const { report } = useLoaderData() as { report: RemittanceReport };
  const location = useLocation();

  const downloadCsv = () => {
    const blob = new Blob([reportToCsv(report)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ehf-remittance-${shortDate(report.from)}-to-${shortDate(report.to)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ marginTop: 0 }}>EHF remittance report</h2>
        <Link to={`../${location.search}`} relative="path" style={{ fontSize: 14 }}>
          ← Back to app home
        </Link>
      </div>

      <p style={{ color: "#555", maxWidth: 720 }}>
        Every paid order is recorded with its <strong>shipping destination</strong> and
        the eco fees that were charged, then compared against what the destination
        province&apos;s schedule says is owed. Use this at reporting time — remittance
        follows where the product ships, not where your store is.
      </p>

      <p style={{ fontSize: 13, color: "#777" }}>
        Period: {shortDate(report.from)} → {shortDate(report.to)} (defaults to the
        current quarter; add <code>?from=YYYY-MM-DD&amp;to=YYYY-MM-DD</code> to the URL
        for a custom range)
      </p>

      {report.totals.orders === 0 ? (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #ddd",
            background: "#fafafa",
            borderRadius: 8,
          }}
        >
          No paid orders recorded in this period yet. Orders are captured from the
          moment this feature was installed — history before that isn&apos;t included.
        </div>
      ) : (
        <>
          <table style={{ borderCollapse: "collapse", marginTop: 8, width: "100%" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={leftCell}>Destination</th>
                <th style={cellStyle}>Orders</th>
                <th style={cellStyle}>EHF charged</th>
                <th style={cellStyle}>EHF owed</th>
                <th style={cellStyle}>Difference</th>
                <th style={cellStyle}>Mismatched</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.province}>
                  <td style={leftCell}>{row.label}</td>
                  <td style={cellStyle}>{row.orders}</td>
                  <td style={cellStyle}>{money(row.chargedCents)}</td>
                  <td style={cellStyle}>{money(row.expectedCents)}</td>
                  <td
                    style={{
                      ...cellStyle,
                      color: row.deltaCents === 0 ? "#111" : row.deltaCents > 0 ? "#996b00" : "#b42318",
                    }}
                  >
                    {money(row.deltaCents)}
                  </td>
                  <td style={cellStyle}>{row.mismatches || "—"}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td style={leftCell}>Total</td>
                <td style={cellStyle}>{report.totals.orders}</td>
                <td style={cellStyle}>{money(report.totals.chargedCents)}</td>
                <td style={cellStyle}>{money(report.totals.expectedCents)}</td>
                <td style={cellStyle}>
                  {money(report.totals.chargedCents - report.totals.expectedCents)}
                </td>
                <td style={cellStyle} />
              </tr>
            </tbody>
          </table>

          <button
            onClick={downloadCsv}
            style={{
              marginTop: 16,
              padding: "8px 14px",
              background: "#111",
              color: "#fff",
              borderRadius: 8,
              border: "none",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Download CSV
          </button>

          {report.mismatches.length > 0 && (
            <>
              <h3 style={{ marginTop: 28 }}>Orders where charged ≠ owed</h3>
              <p style={{ fontSize: 13, color: "#777", maxWidth: 720 }}>
                Usually caused by a customer in another province (charged your store
                province&apos;s rate) or an untagged product. The report above already
                shows what you owe — this list is your audit trail.
              </p>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th style={leftCell}>Order</th>
                    <th style={leftCell}>Date</th>
                    <th style={leftCell}>Destination</th>
                    <th style={cellStyle}>Charged</th>
                    <th style={cellStyle}>Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {report.mismatches.map((m, i) => (
                    <tr key={i}>
                      <td style={leftCell}>{m.orderName ?? "—"}</td>
                      <td style={leftCell}>{shortDate(m.processedAt)}</td>
                      <td style={leftCell}>{m.destination}</td>
                      <td style={cellStyle}>{money(m.chargedCents)}</td>
                      <td style={cellStyle}>{money(m.expectedCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {report.unknownDestinationOrders > 0 && (
            <p style={{ fontSize: 13, color: "#996b00", marginTop: 16 }}>
              {report.unknownDestinationOrders} order(s) had no shipping or billing
              address (e.g. some POS sales) and are counted under
              &quot;Unrecognized&quot;. POS orders belong to your store&apos;s home
              province.
            </p>
          )}
        </>
      )}
    </div>
  );
}
