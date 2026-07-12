import db from "../db.server";
import {
  computeExpectedFees,
  dollarsToCents,
  normalizeDestination,
  splitOrderLines,
  type OrderLineInput,
} from "./remittance";
import type { ProvinceCode } from "./eco-fees";
import { PROVINCE_CONFIG } from "./eco-fees";

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

  const destination = normalizeDestination(
    payload.shipping_address ?? payload.billing_address,
  );

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

export type ProvinceReportRow = {
  province: string;
  label: string;
  orders: number;
  chargedCents: number;
  expectedCents: number;
  deltaCents: number;
  mismatches: number;
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
    };

    row.orders += 1;
    row.chargedCents += record.chargedCents;
    row.expectedCents += record.expectedCents ?? 0;
    row.mismatches += record.mismatch ? 1 : 0;
    row.deltaCents = row.chargedCents - row.expectedCents;
    byProvince.set(key, row);
  }

  const rows = Array.from(byProvince.values()).sort((a, b) =>
    a.province.localeCompare(b.province),
  );

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
