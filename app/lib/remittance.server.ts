import db from "../db.server";
import {
  computeExpectedFees,
  dollarsToCents,
  normalizeDestination,
  splitOrderLines,
  type OrderLineInput,
} from "./remittance";
import type { NormalizedCategory, ProvinceCode } from "./eco-fees";
import { CATEGORY_LABEL_MAP, PROVINCE_CONFIG } from "./eco-fees";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<any> }>;
};

type OrdersPaidPayload = {
  id: number | string;
  name?: string;
  processed_at?: string;
  created_at?: string;
  location_id?: number | string | null;
  source_name?: string | null;
  shipping_address?: { province_code?: string | null; country_code?: string | null } | null;
  billing_address?: { province_code?: string | null; country_code?: string | null } | null;
  line_items?: Array<{
    product_id?: number | null;
    title?: string | null;
    variant_title?: string | null;
    quantity?: number;
    price?: string | number;
  }>;
};

async function fetchProductTags(
  admin: AdminGraphqlClient,
  productIds: number[],
): Promise<Map<number, string[]>> {
  const tags = new Map<number, string[]>();
  if (productIds.length === 0) return tags;

  const res = await admin.graphql(
    `#graphql
      query RemittanceProductTags($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product { id tags }
        }
      }
    `,
    { variables: { ids: productIds.map((id) => `gid://shopify/Product/${id}`) } },
  );
  const json = await res.json();
  for (const node of json?.data?.nodes ?? []) {
    const numeric = Number(String(node?.id ?? "").split("/").pop());
    if (Number.isFinite(numeric) && Array.isArray(node?.tags)) {
      tags.set(numeric, node.tags);
    }
  }
  return tags;
}

export type OrderChannel = "pos" | "online";

/**
 * Shopify stamps `source_name` on every order: "pos" for Point of Sale,
 * "web" / "shopify_draft_order" / an app handle otherwise. It arrives in the
 * webhook payload, so channel costs us nothing to capture — no API call.
 *
 * Channel is deliberately NOT a substitute for province. A counter sale in
 * Airdrie is still an Alberta filing; channel only says how it was rung up.
 */
export function normalizeChannel(sourceName: string | null | undefined): OrderChannel {
  return String(sourceName ?? "").trim().toLowerCase() === "pos" ? "pos" : "online";
}

/**
 * Best-effort province from the selling location. Returns null for every
 * failure — a missing scope, a throttle, a deleted location — so the caller
 * can always fall through to the shop's own jurisdiction.
 *
 * `location` needs the `read_locations` scope, which this app does not
 * request. That is deliberate: the shop jurisdiction below is correct for a
 * single-location merchant, and a scope is not worth asking every merchant
 * for to serve a case none of them have yet. The query is still attempted
 * because a merchant who HAS granted it (or a future multi-location build)
 * gets the more precise answer for free.
 */
async function provinceFromLocation(
  admin: AdminGraphqlClient,
  locationId: number | string,
  orderId: string,
): Promise<{ country: string | null; province: string | null } | null> {
  try {
    const res = await admin.graphql(
      `#graphql
        query PosLocationProvince($id: ID!) {
          location(id: $id) {
            address { provinceCode countryCode }
          }
        }
      `,
      { variables: { id: `gid://shopify/Location/${locationId}` } },
    );
    const json = await res.json();
    const address = json?.data?.location?.address;
    if (address?.countryCode) {
      return {
        country: String(address.countryCode).toUpperCase(),
        province: address.provinceCode
          ? String(address.provinceCode).toUpperCase()
          : null,
      };
    }
    console.warn(
      `[remittance] order ${orderId}: location ${locationId} returned no country code; falling back to shop jurisdiction`,
      json?.errors ?? "",
    );
  } catch (error) {
    // Expected on any shop that hasn't granted read_locations. Not an error
    // condition — the shop jurisdiction is the designed answer for this app.
    console.info(
      `[remittance] order ${orderId}: location lookup unavailable (${
        error instanceof Error ? error.message : String(error)
      }); falling back to shop jurisdiction`,
    );
  }
  return null;
}

/**
 * POS orders carry no shipping address; the sale happens where possession
 * transfers. Prefer the selling location's registered province (multi-
 * location correct), then fall back to the shop's compliance province.
 *
 * The two lookups are deliberately isolated. They used to share one try
 * block with the fallback downstream of the location query, so a throwing
 * location lookup skipped the fallback entirely and the order was filed as
 * "destination not determined" — with the shop's province sitting right
 * there, known and unused. That is exactly the failure the fallback exists to
 * prevent, so it must not be reachable only on the happy path.
 *
 * Every failure path logs. A silent failure here misfiles a compliance record,
 * which should be findable in the logs rather than discovered at filing time.
 */
export async function resolvePosDestination(
  admin: AdminGraphqlClient,
  locationId: number | string | null | undefined,
  orderId: string,
): Promise<{ country: string | null; province: string | null }> {
  if (locationId) {
    const fromLocation = await provinceFromLocation(admin, locationId, orderId);
    if (fromLocation) return fromLocation;
  } else {
    console.warn(
      `[remittance] order ${orderId}: no location_id on the order; falling back to shop jurisdiction`,
    );
  }

  try {
    const res = await admin.graphql(
      `#graphql
        query PosShopJurisdiction {
          shop {
            metafield(namespace: "synorai_ecocharge", key: "jurisdiction") {
              value
            }
          }
        }
      `,
    );
    const json = await res.json();
    const jurisdiction = json?.data?.shop?.metafield?.value;
    if (typeof jurisdiction === "string" && jurisdiction.trim()) {
      return { country: "CA", province: jurisdiction.trim().toUpperCase() };
    }

    console.warn(
      `[remittance] order ${orderId}: shop jurisdiction metafield is unset or empty — the order cannot be attributed to a province. Set the province in app Settings.`,
      json?.errors ?? "",
    );
  } catch (error) {
    console.error(
      `[remittance] order ${orderId}: shop jurisdiction lookup threw; order will be recorded without a province`,
      error,
    );
  }

  return { country: null, province: null };
}

/**
 * Record one paid order for the remittance report. Idempotent per order —
 * Shopify redelivers webhooks, so we upsert on `${shop}:${orderId}`.
 * Stores no customer PII: destination province/country and fee math only.
 */
export async function recordPaidOrder(params: {
  shop: string;
  payload: OrdersPaidPayload;
  admin: AdminGraphqlClient | undefined;
}): Promise<void> {
  const { shop, payload, admin } = params;

  const orderId = String(payload.id ?? "").trim();
  if (!orderId) return;

  const lines: OrderLineInput[] = (payload.line_items ?? []).map((item) => ({
    productId:
      typeof item.product_id === "number" && item.product_id > 0
        ? item.product_id
        : null,
    title: item.title ?? null,
    variantTitle: item.variant_title ?? null,
    quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 0,
    unitPriceCents: dollarsToCents(item.price),
  }));

  const { chargedFees, merchandise } = splitOrderLines(lines);
  const chargedCents = chargedFees.reduce((sum, l) => sum + l.totalCents, 0);

  const channel = normalizeChannel(payload.source_name);

  let destination = normalizeDestination(
    payload.shipping_address ?? payload.billing_address,
  );

  /**
   * Fall back whenever we believe this is a Canadian sale but can't say where.
   * The old condition required BOTH country and province to be missing, so a
   * POS order carrying a billing country but no province skipped the fallback
   * entirely and landed in the unattributed pile — while the POS tile had
   * already charged the correct provincial rate. The fee was right and the
   * filing record was wrong, which is the worst way round.
   */
  const needsProvinceFallback =
    !destination.province &&
    (destination.country === null || destination.country === "CA");

  if (needsProvinceFallback) {
    if (admin) {
      const resolved = await resolvePosDestination(
        admin,
        payload.location_id,
        orderId,
      );
      if (resolved.country || resolved.province) {
        destination = normalizeDestination({
          country_code: resolved.country,
          province_code: resolved.province,
        });
      }
    } else {
      console.warn(
        `[remittance] order ${orderId}: no admin API client on this webhook, so the province could not be resolved. Recorded as unattributed.`,
      );
    }
  }

  let expectedCents: number | null = null;
  let expectedLines: unknown[] = [];

  if (destination.country && destination.country !== "CA") {
    // Exports: no Canadian EHF owed.
    expectedCents = 0;
  } else if (destination.province) {
    const productIds = Array.from(
      new Set(
        merchandise
          .map((l) => l.productId)
          .filter((id): id is number => typeof id === "number"),
      ),
    );

    try {
      const tagsByProduct = admin
        ? await fetchProductTags(admin, productIds)
        : new Map<number, string[]>();

      // Only trust the expected total when we could resolve tags for every
      // product on the order (deleted products lose their tags).
      const tagsResolved = productIds.every((id) => tagsByProduct.has(id));

      if (tagsResolved || productIds.length === 0) {
        const expected = computeExpectedFees(
          merchandise.map((l) => ({
            quantity: l.quantity,
            tags: l.productId ? (tagsByProduct.get(l.productId) ?? []) : [],
          })),
          destination.province,
        );
        expectedCents = expected.totalCents;
        expectedLines = expected.lines;
      }
    } catch (error) {
      console.error("[remittance] product tag lookup failed", error);
    }
  }

  const mismatch = expectedCents !== null && expectedCents !== chargedCents;

  await db.ehfOrderRecord.upsert({
    where: { id: `${shop}:${orderId}` },
    create: {
      id: `${shop}:${orderId}`,
      shop,
      orderId,
      orderName: payload.name ?? null,
      processedAt: new Date(payload.processed_at ?? payload.created_at ?? Date.now()),
      destinationCountry: destination.country,
      destinationProvince: destination.province ?? destination.rawProvince,
      chargedCents,
      expectedCents,
      chargedLinesJson: JSON.stringify(chargedFees),
      expectedLinesJson: JSON.stringify(expectedLines),
      mismatch,
      channel,
    },
    update: {
      orderName: payload.name ?? null,
      processedAt: new Date(payload.processed_at ?? payload.created_at ?? Date.now()),
      destinationCountry: destination.country,
      destinationProvince: destination.province ?? destination.rawProvince,
      chargedCents,
      expectedCents,
      chargedLinesJson: JSON.stringify(chargedFees),
      expectedLinesJson: JSON.stringify(expectedLines),
      mismatch,
      channel,
    },
  });
}

export type CategoryReportRow = {
  category: string;
  label: string;
  unitsOwed: number;
  owedCents: number;
  unitsCharged: number;
  chargedCents: number;
  /**
   * Scheduled per-unit rate for this category in this province, straight from
   * PROVINCE_CONFIG. Null where the province runs no schedule. Filings are
   * units x rate per category, so the rate belongs on the report — nobody
   * should have to divide two columns to recover it.
   */
  ratePerUnitCents: number | null;
};

export type ProvinceReportRow = {
  province: string;
  label: string;
  orders: number;
  chargedCents: number;
  expectedCents: number;
  deltaCents: number;
  mismatches: number;
  categories: CategoryReportRow[];
  /**
   * Orders where the amount owed could NOT be computed. Tracked separately
   * because "we couldn't work it out" must never render as "$0.00 owed" on a
   * compliance report.
   *
   * Two distinct causes, and the report must not guess between them: either
   * the destination province is unknown (nothing to price against), or the
   * province is known but a product's tags were unresolvable (usually a
   * deleted product). Use `provinceKnown` to tell the reader which.
   */
  undeterminedOrders: number;
  /**
   * Whether this row has a real province. False for the "province not
   * determined" buckets, where an unpriced order is explained by the missing
   * province and not by anything to do with product tags.
   */
  provinceKnown: boolean;
  /** True when the destination runs no regulated EHF schedule at all. */
  noProgram: boolean;
  /**
   * How the orders in this row were rung up. Context only — the filing is by
   * province, so an in-store Alberta sale belongs in the Alberta row exactly
   * like an online one. This just answers "how many of these were at the till".
   */
  posOrders: number;
  onlineOrders: number;
  /** Orders recorded before channel capture existed. */
  unknownChannelOrders: number;
};

/**
 * Real Canadian jurisdictions that run no regulated electronics EHF schedule.
 * Ontario ended its program in 2021 under individual producer responsibility;
 * the territories have none this app can price. Orders shipped here owe $0
 * legitimately — a different statement from "we don't recognise this".
 */
const NO_PROGRAM_PROVINCES = new Set(["ON", "YT", "NT", "NU"]);

const PROVINCE_DISPLAY_NAME: Record<string, string> = {
  ON: "Ontario",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};

export type MismatchRow = {
  orderName: string | null;
  processedAt: string;
  destination: string;
  chargedCents: number;
  expectedCents: number | null;
};

export type RemittanceReport = {
  from: string;
  to: string;
  rows: ProvinceReportRow[];
  totals: { orders: number; chargedCents: number; expectedCents: number };
  mismatches: MismatchRow[];
  unknownDestinationOrders: number;
};

export async function buildRemittanceReport(
  shop: string,
  from: Date,
  to: Date,
): Promise<RemittanceReport> {
  const records = await db.ehfOrderRecord.findMany({
    where: { shop, processedAt: { gte: from, lte: to } },
    orderBy: { processedAt: "desc" },
  });

  const byProvince = new Map<string, ProvinceReportRow>();
  let unknownDestinationOrders = 0;

  for (const record of records) {
    const key = record.destinationProvince ?? record.destinationCountry ?? "unknown";
    if (!record.destinationProvince && !record.destinationCountry) {
      unknownDestinationOrders += 1;
    }

    const province = record.destinationProvince;
    const noProgram = province !== null && NO_PROGRAM_PROVINCES.has(province);

    // Every destination lands in exactly one of these buckets. "Unrecognized"
    // used to swallow three unrelated cases, leaving an accountant unable to
    // tell "Ontario owes nothing" from "we don't know where this shipped".
    const label =
      province && province in PROVINCE_CONFIG
        ? PROVINCE_CONFIG[province as ProvinceCode].label
        : noProgram
          ? `${PROVINCE_DISPLAY_NAME[province!] ?? province} — no regulated EHF program`
          : record.destinationCountry && record.destinationCountry !== "CA"
            ? `Outside Canada (${key})`
            : province
              ? `${province} — not a recognized province code`
              : record.destinationCountry === "CA"
                ? "Canada — province not determined"
                : "Destination not determined";

    const row = byProvince.get(key) ?? {
      province: key,
      label,
      orders: 0,
      chargedCents: 0,
      expectedCents: 0,
      deltaCents: 0,
      mismatches: 0,
      categories: [] as CategoryReportRow[],
      undeterminedOrders: 0,
      provinceKnown: province !== null,
      noProgram,
      posOrders: 0,
      onlineOrders: 0,
      unknownChannelOrders: 0,
    };

    row.orders += 1;
    row.chargedCents += record.chargedCents;
    row.expectedCents += record.expectedCents ?? 0;
    if (record.expectedCents === null) row.undeterminedOrders += 1;
    if (record.channel === "pos") row.posOrders += 1;
    else if (record.channel === "online") row.onlineOrders += 1;
    else row.unknownChannelOrders += 1;
    row.mismatches += record.mismatch ? 1 : 0;
    row.deltaCents = row.chargedCents - row.expectedCents;

    // Remittance forms are filed as units x rate per category — accumulate
    // the per-category lines stored with each order.
    const getCategoryRow = (category: string): CategoryReportRow => {
      let categoryRow = row.categories.find((c) => c.category === category);
      if (!categoryRow) {
        const scheduled =
          province && province in PROVINCE_CONFIG
            ? PROVINCE_CONFIG[province as ProvinceCode].feeByCategory[
                category as NormalizedCategory
              ]
            : undefined;

        categoryRow = {
          category,
          label:
            CATEGORY_LABEL_MAP[category as NormalizedCategory] ?? category,
          unitsOwed: 0,
          owedCents: 0,
          unitsCharged: 0,
          chargedCents: 0,
          ratePerUnitCents:
            typeof scheduled === "number" ? Math.round(scheduled * 100) : null,
        };
        row.categories.push(categoryRow);
      }
      return categoryRow;
    };

    try {
      for (const line of JSON.parse(record.expectedLinesJson) as Array<{
        category?: string;
        quantity?: number;
        totalCents?: number;
      }>) {
        if (!line?.category) continue;
        const categoryRow = getCategoryRow(line.category);
        categoryRow.unitsOwed += line.quantity ?? 0;
        categoryRow.owedCents += line.totalCents ?? 0;
      }
      for (const line of JSON.parse(record.chargedLinesJson) as Array<{
        category?: string;
        quantity?: number;
        totalCents?: number;
      }>) {
        if (!line?.category) continue;
        const categoryRow = getCategoryRow(line.category);
        categoryRow.unitsCharged += line.quantity ?? 0;
        categoryRow.chargedCents += line.totalCents ?? 0;
      }
    } catch {
      // Malformed stored JSON: keep province totals, skip category detail.
    }

    byProvince.set(key, row);
  }

  const rows = Array.from(byProvince.values()).sort((a, b) =>
    a.province.localeCompare(b.province),
  );
  for (const row of rows) {
    row.categories.sort((a, b) => a.label.localeCompare(b.label));
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
    totals: {
      orders: records.length,
      chargedCents: rows.reduce((s, r) => s + r.chargedCents, 0),
      expectedCents: rows.reduce((s, r) => s + r.expectedCents, 0),
    },
    mismatches: records
      .filter((r: (typeof records)[number]) => r.mismatch)
      .slice(0, 50)
      .map((r: (typeof records)[number]) => ({
        orderName: r.orderName,
        processedAt: r.processedAt.toISOString(),
        destination: r.destinationProvince ?? r.destinationCountry ?? "unknown",
        chargedCents: r.chargedCents,
        expectedCents: r.expectedCents,
      })),
    unknownDestinationOrders,
  };
}

export async function deleteShopRemittanceRecords(shop: string): Promise<void> {
  await db.ehfOrderRecord.deleteMany({ where: { shop } });
}
