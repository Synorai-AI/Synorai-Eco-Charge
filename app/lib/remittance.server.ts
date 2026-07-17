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

/**
 * POS orders carry no shipping address; the sale happens where possession
 * transfers. Prefer the selling location's registered province (multi-
 * location correct), then fall back to the shop's compliance province.
 */
async function resolvePosDestination(
  admin: AdminGraphqlClient,
  locationId: number | string | null | undefined,
): Promise<{ country: string | null; province: string | null }> {
  try {
    if (locationId) {
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
    }

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
  } catch (error) {
    console.error("[remittance] POS destination lookup failed", error);
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

  let destination = normalizeDestination(
    payload.shipping_address ?? payload.billing_address,
  );

  if (!destination.country && !destination.province && admin) {
    const pos = await resolvePosDestination(admin, payload.location_id);
    if (pos.country || pos.province) {
      destination = normalizeDestination({
        country_code: pos.country,
        province_code: pos.province,
      });
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

    const label =
      record.destinationProvince && record.destinationProvince in PROVINCE_CONFIG
        ? PROVINCE_CONFIG[record.destinationProvince as ProvinceCode].label
        : record.destinationCountry && record.destinationCountry !== "CA"
          ? `Outside Canada (${key})`
          : `Unrecognized (${key})`;

    const row = byProvince.get(key) ?? {
      province: key,
      label,
      orders: 0,
      chargedCents: 0,
      expectedCents: 0,
      deltaCents: 0,
      mismatches: 0,
      categories: [] as CategoryReportRow[],
    };

    row.orders += 1;
    row.chargedCents += record.chargedCents;
    row.expectedCents += record.expectedCents ?? 0;
    row.mismatches += record.mismatch ? 1 : 0;
    row.deltaCents = row.chargedCents - row.expectedCents;

    // Remittance forms are filed as units x rate per category — accumulate
    // the per-category lines stored with each order.
    const getCategoryRow = (category: string): CategoryReportRow => {
      let categoryRow = row.categories.find((c) => c.category === category);
      if (!categoryRow) {
        categoryRow = {
          category,
          label:
            CATEGORY_LABEL_MAP[category as NormalizedCategory] ?? category,
          unitsOwed: 0,
          owedCents: 0,
          unitsCharged: 0,
          chargedCents: 0,
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
