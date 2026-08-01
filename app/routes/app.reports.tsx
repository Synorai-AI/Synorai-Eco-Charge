import React from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import {
  Link,
  useFetcher,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  buildRemittanceReport,
  type RemittanceReport,
} from "../lib/remittance.server";
import { resyncOrders } from "../lib/remittance-resync.server";

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

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);

  const form = await request.formData();
  const now = new Date();
  const from = parseDateParam(form.get("from") as string | null, quarterStart(now));
  const to = parseDateParam(form.get("to") as string | null, now);

  try {
    const result = await resyncOrders({ shop: session.shop, admin, from, to });
    return {
      ok: true as const,
      message:
        `Re-scanned ${result.processed} order${result.processed === 1 ? "" : "s"}` +
        (result.failed > 0 ? `, ${result.failed} could not be reprocessed` : "") +
        (result.hasMore
          ? ". There are more orders in this range than one run covers — run it again to continue."
          : "."),
    };
  } catch (error) {
    console.error("[resync] failed", error);
    return {
      ok: false as const,
      message:
        "Re-scan failed. Check that the app still has the read_orders permission, then try again.",
    };
  }
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

/**
 * Separate Category / Units / Rate columns so a bookkeeper can read
 * units x rate per category straight off the sheet — that's the shape the
 * programs want the filing in.
 */
function reportToCsv(report: RemittanceReport): string {
  const rows = [
    [
      "Destination",
      "Category",
      "Units",
      "Rate per unit",
      "EHF charged",
      "EHF owed",
      "Difference",
      "Mismatched orders",
    ],
    ...report.rows.flatMap((r) => [
      [
        r.label,
        `— all categories — (${r.posOrders} in-store, ${r.onlineOrders} online${r.unknownChannelOrders > 0 ? `, ${r.unknownChannelOrders} untracked` : ""})`,
        `${r.orders} order(s)`,
        "",
        (r.chargedCents / 100).toFixed(2),
        (r.expectedCents / 100).toFixed(2),
        (r.deltaCents / 100).toFixed(2),
        String(r.mismatches),
      ],
      ...r.categories.map((c) => [
        r.label,
        c.label,
        String(c.unitsOwed || c.unitsCharged),
        c.ratePerUnitCents === null ? "" : (c.ratePerUnitCents / 100).toFixed(2),
        (c.chargedCents / 100).toFixed(2),
        (c.owedCents / 100).toFixed(2),
        ((c.chargedCents - c.owedCents) / 100).toFixed(2),
        "",
      ]),
      ...(r.undeterminedOrders > 0
        ? [
            [
              r.label,
              `!! ${r.undeterminedOrders} order(s) — amount owed could NOT be determined, figures above exclude them`,
              "",
              "",
              "",
              "",
              "",
              "",
            ],
          ]
        : []),
    ]),
    [
      "TOTAL",
      "",
      String(report.totals.orders),
      "",
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

  // Expanded by default: the itemisation is the whole point of the report, and
  // someone reading figures out to their bookkeeper shouldn't have to click
  // nine times first. Collapsing is for tidying up, not for hiding detail.
  const resync = useFetcher<typeof action>();
  const resyncing = resync.state !== "idle";

  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const toggle = (province: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(province)) next.delete(province);
      else next.add(province);
      return next;
    });

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
                <React.Fragment key={row.province}>
                  <tr style={{ fontWeight: 600 }}>
                    <td style={leftCell}>
                      {row.categories.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggle(row.province)}
                          aria-expanded={!collapsed.has(row.province)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            font: "inherit",
                            color: "inherit",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              display: "inline-block",
                              transform: collapsed.has(row.province)
                                ? "rotate(-90deg)"
                                : "none",
                            }}
                          >
                            ▾
                          </span>
                          {row.label}
                        </button>
                      ) : (
                        <span style={{ paddingLeft: 20, display: "inline-block" }}>
                          {row.label}
                        </span>
                      )}
                    </td>
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
                  {!collapsed.has(row.province) && (
                    <tr style={{ fontSize: 12, color: "#777" }}>
                      <td style={{ ...leftCell, paddingLeft: 40 }} colSpan={6}>
                        {[
                          row.posOrders > 0 ? `${row.posOrders} in-store (POS)` : null,
                          row.onlineOrders > 0 ? `${row.onlineOrders} online` : null,
                          row.unknownChannelOrders > 0
                            ? `${row.unknownChannelOrders} recorded before channel tracking`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                  )}

                  {!collapsed.has(row.province) &&
                    row.categories.map((c) => {
                      const units = c.unitsOwed || c.unitsCharged;
                      return (
                        <tr
                          key={`${row.province}-${c.category}`}
                          style={{ fontSize: 13, color: "#444" }}
                        >
                          <td style={{ ...leftCell, paddingLeft: 40 }}>
                            <strong style={{ fontWeight: 600 }}>{c.label}</strong>
                            {" — "}
                            {units} unit{units === 1 ? "" : "s"}
                            {c.ratePerUnitCents !== null && (
                              <>
                                {" × "}
                                {money(c.ratePerUnitCents)}
                                {" = "}
                                <strong style={{ fontWeight: 600 }}>
                                  {money(units * c.ratePerUnitCents)}
                                </strong>
                              </>
                            )}
                          </td>
                          <td style={cellStyle} />
                          <td style={cellStyle}>{money(c.chargedCents)}</td>
                          <td style={cellStyle}>{money(c.owedCents)}</td>
                          <td style={cellStyle}>
                            {c.chargedCents === c.owedCents
                              ? "—"
                              : money(c.chargedCents - c.owedCents)}
                          </td>
                          <td style={cellStyle} />
                        </tr>
                      );
                    })}

                  {!collapsed.has(row.province) &&
                    row.categories.length === 0 &&
                    !row.noProgram && (
                      <tr style={{ fontSize: 13, color: "#777" }}>
                        <td style={{ ...leftCell, paddingLeft: 40 }} colSpan={6}>
                          No eco-fee-eligible items in these orders — nothing to
                          itemise. If that looks wrong, the products are probably
                          missing their <code>eco-category-*</code> tags.
                        </td>
                      </tr>
                    )}

                  {row.undeterminedOrders > 0 && (
                    <tr style={{ fontSize: 13, color: "#b42318" }}>
                      <td style={{ ...leftCell, paddingLeft: 40 }} colSpan={6}>
                        {row.undeterminedOrders} order
                        {row.undeterminedOrders === 1 ? "" : "s"} could not be
                        priced (product tags unavailable, usually a deleted
                        product) — the EHF owed figure above{" "}
                        <strong>excludes</strong>{" "}
                        {row.undeterminedOrders === 1 ? "it" : "them"}. Don&apos;t
                        treat this row as complete.
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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

          {/* Re-scan. Records capture whatever the code knew when the webhook
              fired, so a fix or a retag leaves old rows stale. Shopify still
              holds the original orders, so they can be re-derived. */}
          <section
            style={{
              marginTop: 28,
              padding: "18px 20px",
              border: "1px solid #ddd",
              borderRadius: 8,
              background: "#fafafa",
              maxWidth: 720,
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>
              Re-scan orders in this period
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#555" }}>
              Rebuilds the records above from Shopify&apos;s copy of each order.
              Use it after retagging products or after an app update, to correct
              rows that were recorded before the change. Safe to run more than
              once — it overwrites in place rather than duplicating.
            </p>

            <resync.Form method="post">
              <input type="hidden" name="from" value={shortDate(report.from)} />
              <input type="hidden" name="to" value={shortDate(report.to)} />
              <button
                type="submit"
                disabled={resyncing}
                style={{
                  padding: "9px 18px",
                  borderRadius: 6,
                  border: "1px solid #999",
                  background: resyncing ? "#eee" : "#fff",
                  fontSize: 14,
                  cursor: resyncing ? "default" : "pointer",
                }}
              >
                {resyncing
                  ? "Re-scanning…"
                  : `Re-scan ${shortDate(report.from)} → ${shortDate(report.to)}`}
              </button>
            </resync.Form>

            {resync.data && (
              <p
                role="status"
                style={{
                  margin: "12px 0 0",
                  fontSize: 14,
                  fontWeight: 600,
                  color: resync.data.ok ? "#166534" : "#b42318",
                }}
              >
                {resync.data.message}
                {resync.data.ok ? " Reload the page to see the updated figures." : ""}
              </p>
            )}

            <p style={{ margin: "12px 0 0", fontSize: 12, color: "#777" }}>
              Expected fees are recalculated against <strong>today&apos;s</strong>{" "}
              rate schedule. If a province changed its rates inside this period,
              re-scanning older orders will compare them to the new rate and show
              differences that aren&apos;t really errors — keep the range inside a
              single rate period when that matters.
            </p>
          </section>

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
              {report.unknownDestinationOrders} order(s) could not be attributed
              to a province (no shipping or billing address, and no POS location
              information). New POS sales are attributed automatically to the
              selling location&apos;s province.
            </p>
          )}
        </>
      )}
    </div>
  );
}
