import { recordPaidOrder } from "./remittance.server";

/**
 * Re-scan past orders and rebuild their remittance records.
 *
 * The orders/paid webhook fires once per order, so a record captures whatever
 * the code knew at that moment. When a bug is fixed or a product is retagged,
 * existing records stay wrong forever unless something re-derives them —
 * which is what this does. Shopify still holds the original order, so the
 * data isn't lost, only our copy of it was incomplete.
 *
 * Safe to run repeatedly: records upsert on `${shop}:${orderId}`, so a re-scan
 * overwrites in place and never duplicates.
 */

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<any> }>;
};

/**
 * Capped per run so a re-scan can't outlive the request. A shop with more
 * orders than this runs it again — the result reports what's left.
 */
const MAX_ORDERS_PER_RUN = 250;
const PAGE_SIZE = 50;

const ORDERS_QUERY = `#graphql
  query ResyncOrders($query: String!, $cursor: String) {
    orders(first: ${PAGE_SIZE}, after: $cursor, query: $query, sortKey: PROCESSED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        processedAt
        sourceName
        shippingAddress { provinceCode countryCode }
        billingAddress { provinceCode countryCode }
        lineItems(first: 100) {
          nodes {
            quantity
            title
            variantTitle
            originalUnitPriceSet { shopMoney { amount } }
            product { id }
          }
        }
      }
    }
  }
`;

function numericId(gid: unknown): number | null {
  const tail = String(gid ?? "").split("/").pop();
  const n = Number(tail);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ResyncResult = {
  processed: number;
  failed: number;
  hasMore: boolean;
  from: string;
  to: string;
};

export async function resyncOrders(params: {
  shop: string;
  admin: AdminGraphqlClient;
  from: Date;
  to: Date;
}): Promise<ResyncResult> {
  const { shop, admin, from, to } = params;

  // Shopify search syntax: space-separated terms are ANDed.
  const query = `processed_at:>=${isoDay(from)} processed_at:<=${isoDay(to)} financial_status:paid`;

  let cursor: string | null = null;
  let processed = 0;
  let failed = 0;
  let hasMore = false;

  while (processed + failed < MAX_ORDERS_PER_RUN) {
    const res = await admin.graphql(ORDERS_QUERY, {
      variables: { query, cursor },
    });
    const json = await res.json();

    if (json?.errors) {
      console.error("[resync] orders query failed", json.errors);
      throw new Error("Could not read orders from Shopify.");
    }

    const connection = json?.data?.orders;
    const nodes: any[] = connection?.nodes ?? [];

    for (const order of nodes) {
      const id = numericId(order?.id);
      if (id === null) continue;

      try {
        await recordPaidOrder({
          shop,
          admin,
          payload: {
            id,
            name: order?.name ?? undefined,
            processed_at: order?.processedAt ?? undefined,
            source_name: order?.sourceName ?? null,
            // Deliberately not sent: the Order type's retail-location field
            // name varies by API version, and getting it wrong fails the whole
            // query. Without it, recordPaidOrder falls back to the shop's
            // jurisdiction — correct for a single-location shop. Live webhooks
            // are unaffected; they carry location_id in the payload.
            location_id: null,
            shipping_address: order?.shippingAddress
              ? {
                  province_code: order.shippingAddress.provinceCode ?? null,
                  country_code: order.shippingAddress.countryCode ?? null,
                }
              : null,
            billing_address: order?.billingAddress
              ? {
                  province_code: order.billingAddress.provinceCode ?? null,
                  country_code: order.billingAddress.countryCode ?? null,
                }
              : null,
            line_items: (order?.lineItems?.nodes ?? []).map((li: any) => ({
              product_id: numericId(li?.product?.id),
              title: li?.title ?? null,
              variant_title: li?.variantTitle ?? null,
              quantity: typeof li?.quantity === "number" ? li.quantity : 0,
              price: li?.originalUnitPriceSet?.shopMoney?.amount ?? 0,
            })),
          },
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        console.error(`[resync] order ${id} failed to reprocess`, error);
      }
    }

    if (!connection?.pageInfo?.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;

    if (processed + failed >= MAX_ORDERS_PER_RUN) {
      hasMore = true;
      break;
    }
  }

  return { processed, failed, hasMore, from: from.toISOString(), to: to.toISOString() };
}
