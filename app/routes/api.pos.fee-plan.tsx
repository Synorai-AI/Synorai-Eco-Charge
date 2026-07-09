import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { authenticate, unauthenticated } from "../shopify.server";
import {
  PROVINCE_CONFIG,
  normalizeProvinceCode,
} from "../lib/eco-fees";
import {
  buildExistingFeeState,
  buildRequiredFeeState,
  diffFeeStates,
  isSynoraiFeeLine,
  type CartLineLike,
  type MerchandiseLineInput,
} from "../lib/standard-fee-reconciliation";
import type { StandardFeeVariantMap } from "../lib/standard-fee-product.server";

const METAFIELD_NAMESPACE = "synorai_ecocharge";

type PosCartLinePayload = {
  uuid?: string;
  productId?: number | string | null;
  variantId?: number | string | null;
  quantity?: number;
};

type PosSessionAuth = {
  sessionToken: { dest: string };
  cors: (response: Response) => Response;
};

/**
 * POS UI extensions authenticate with App Bridge session tokens, the same JWT
 * format checkout extensions use. The react-router package has no dedicated
 * `authenticate.public.pos` helper yet, so prefer it when it exists and fall
 * back to the checkout validator (signature + audience checks are identical).
 */
async function authenticatePosRequest(request: Request): Promise<PosSessionAuth> {
  const publicAuth = authenticate.public as unknown as Record<
    string,
    ((req: Request) => Promise<PosSessionAuth>) | undefined
  >;

  const validator = publicAuth.pos ?? publicAuth.checkout;
  if (!validator) {
    throw new Error("No public session token validator available.");
  }

  return validator(request);
}

function toNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const numeric = Number(value.split("/").pop());
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function shopDomainFromDest(dest: string): string {
  return dest.replace(/^https?:\/\//, "").split("/")[0];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Preflight / accidental GETs. authenticatePosRequest handles OPTIONS CORS.
  const { cors } = await authenticatePosRequest(request);
  return cors(jsonResponse({ ok: false, error: "Use POST." }, 405));
}

export async function action({ request }: ActionFunctionArgs) {
  const { sessionToken, cors } = await authenticatePosRequest(request);
  const shopDomain = shopDomainFromDest(sessionToken.dest);

  let payload: { lines?: PosCartLinePayload[] };
  try {
    payload = await request.json();
  } catch {
    return cors(jsonResponse({ ok: false, error: "Invalid JSON body." }, 400));
  }

  const rawLines = Array.isArray(payload.lines) ? payload.lines : [];

  const { admin } = await unauthenticated.admin(shopDomain);

  const contextRes = await admin.graphql(
    `#graphql
      query PosFeePlanContext {
        shop {
          jurisdiction: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "jurisdiction") {
            value
          }
          feeProductId: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "standard_fee_product_id") {
            value
          }
          variantMap: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "standard_fee_variant_map") {
            value
          }
        }
      }
    `,
  );
  const contextJson = await contextRes.json();
  const shopNode = contextJson?.data?.shop;

  const province = normalizeProvinceCode(shopNode?.jurisdiction?.value ?? null);
  const feeProductId: string | null = shopNode?.feeProductId?.value ?? null;

  let variantMap: StandardFeeVariantMap | null = null;
  try {
    variantMap = shopNode?.variantMap?.value
      ? JSON.parse(shopNode.variantMap.value)
      : null;
  } catch {
    variantMap = null;
  }

  if (!province || !variantMap) {
    return cors(
      jsonResponse({
        ok: false,
        error:
          "EcoCharge is not fully set up. Open the app in Shopify admin and complete Standard setup first.",
      }),
    );
  }

  const cartLines: CartLineLike[] = rawLines
    .map((line) => ({
      key: typeof line.uuid === "string" ? line.uuid : undefined,
      quantity:
        typeof line.quantity === "number" && line.quantity > 0
          ? line.quantity
          : 0,
      product_id: toNumericId(line.productId),
      variant_id: toNumericId(line.variantId),
    }))
    .filter((line) => line.quantity > 0);

  const merchandiseLines = cartLines.filter(
    (line) => !isSynoraiFeeLine(line, feeProductId, variantMap!),
  );

  const productIds = Array.from(
    new Set(
      merchandiseLines
        .map((line) => line.product_id)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  );

  const tagsByProductId = new Map<number, string[]>();

  if (productIds.length > 0) {
    const tagsRes = await admin.graphql(
      `#graphql
        query PosProductTags($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              tags
            }
          }
        }
      `,
      {
        variables: {
          ids: productIds.map((id) => `gid://shopify/Product/${id}`),
        },
      },
    );
    const tagsJson = await tagsRes.json();
    const nodes: Array<{ id?: string; tags?: string[] } | null> =
      tagsJson?.data?.nodes ?? [];

    for (const node of nodes) {
      const numericId = toNumericId(node?.id ?? null);
      if (numericId && Array.isArray(node?.tags)) {
        tagsByProductId.set(numericId, node!.tags!);
      }
    }
  }

  const merchandiseInputs: MerchandiseLineInput[] = merchandiseLines.map(
    (line) => ({
      key: line.key ?? "",
      quantity: line.quantity,
      title: "",
      tags: line.product_id ? (tagsByProductId.get(line.product_id) ?? []) : [],
    }),
  );

  const required = buildRequiredFeeState(
    merchandiseInputs,
    province,
    variantMap,
    PROVINCE_CONFIG[province].feeByCategory,
  );
  const existing = buildExistingFeeState(cartLines, feeProductId, variantMap);
  const diff = diffFeeStates(required, existing);

  return cors(
    jsonResponse({
      ok: true,
      province,
      toAdd: diff.toAdd.map((line) => ({
        variantId: toNumericId(line.variantId),
        quantity: line.quantity,
        title: line.title,
      })),
      toUpdate: diff.toUpdate.map((line) => ({
        uuid: line.key,
        variantId: toNumericId(line.variantId),
        quantity: line.quantity,
        title: line.title,
      })),
      toRemove: diff.toRemove.map((line) => ({
        uuid: line.key,
        title: line.title,
      })),
    }),
  );
}
