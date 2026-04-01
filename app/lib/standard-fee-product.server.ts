import {
  ALLOWED_PROVINCES,
  CATEGORY_LABEL_MAP,
  PROVINCE_CONFIG,
  formatCartFeeLineTitle,
  type NormalizedCategory,
  type ProvinceCode,
} from "./eco-fees";

const STANDARD_FEE_PRODUCT_TITLE = "Environmental Fee";
const STANDARD_FEE_PRODUCT_VENDOR = "Synorai";
const STANDARD_FEE_PRODUCT_TYPE = "Synorai Eco Fee";
const STANDARD_FEE_PRODUCT_TAG = "synorai-eco-fee";

export type StandardFeeProductResult =
  | {
      ok: true;
      productId: string;
      created: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export type StandardFeeVariantEnsureResult =
  | {
      ok: true;
      createdCount: number;
      totalRequired: number;
    }
  | {
      ok: false;
      error: string;
    };

export type StandardFeeVariantNormalizationResult =
  | {
      ok: true;
      updatedCount: number;
      totalChecked: number;
    }
  | {
      ok: false;
      error: string;
    };

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{
    json: () => Promise<any>;
  }>;
};

type ProductVariantNode = {
  id: string;
  title?: string;
  price?: string;
  taxable?: boolean;
  inventoryItem?: {
    id: string;
    tracked?: boolean;
  } | null;
};

type FoundStandardFeeProduct = {
  productId: string | null;
  title: string | null;
};

type RequiredVariant = {
  province: ProvinceCode;
  category: NormalizedCategory;
  title: string;
  price: string;
};

export type StandardFeeVariantMapEntry = {
  variantId: string;
  price: string;
  title: string;
};

export type StandardFeeVariantMap = Partial<
  Record<
    ProvinceCode,
    Partial<Record<NormalizedCategory, StandardFeeVariantMapEntry>>
  >
>;

function formatVariantTitle(
  province: ProvinceCode,
  category: NormalizedCategory,
): string {
  return formatCartFeeLineTitle(province, category);
}

function formatMoneyString(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(2) : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric.toFixed(2);
}

function getRequiredFeeVariants(): RequiredVariant[] {
  const variants: RequiredVariant[] = [];

  for (const province of ALLOWED_PROVINCES) {
    const config = PROVINCE_CONFIG[province];

    for (const [category, fee] of Object.entries(
      config.feeByCategory,
    ) as Array<[NormalizedCategory, number]>) {
      if (typeof fee !== "number" || fee <= 0) continue;

      variants.push({
        province,
        category,
        title: formatVariantTitle(province, category),
        price: fee.toFixed(2),
      });
    }
  }

  return variants;
}

function getRequiredVariantByTitle(
  title: string | undefined,
): RequiredVariant | null {
  const trimmed = typeof title === "string" ? title.trim() : "";
  if (!trimmed) return null;

  return (
    getRequiredFeeVariants().find((variant) => variant.title === trimmed) ?? null
  );
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    const plain: Record<string, unknown> = {};

    for (const key of Object.getOwnPropertyNames(error)) {
      plain[key] = (error as any)[key];
    }

    try {
      return JSON.stringify(plain, null, 2);
    } catch {
      return `${error.name}: ${error.message}`;
    }
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function logStandardFeeError(context: string, error: unknown) {
  console.error(`[standard-fee-product] ${context}`);
  console.error(serializeError(error));
}

function getReadableErrorMessage(
  fallback: string,
  error: unknown,
): string {
  if (error instanceof Error && error.message) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}

async function syncStandardFeeProductIdentity(
  admin: AdminGraphqlClient,
  productId: string,
  currentTitle: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (currentTitle === STANDARD_FEE_PRODUCT_TITLE) {
    return { ok: true };
  }

  try {
    const mutation = `#graphql
      mutation UpdateStandardFeeProductIdentity($input: ProductUpdateInput!) {
        productUpdate(product: $input) {
          product {
            id
            title
            productType
            vendor
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: productId,
        title: STANDARD_FEE_PRODUCT_TITLE,
        productType: STANDARD_FEE_PRODUCT_TYPE,
        vendor: STANDARD_FEE_PRODUCT_VENDOR,
        tags: [STANDARD_FEE_PRODUCT_TAG],
      },
    };

    const res = await admin.graphql(mutation, { variables });
    const json = await res.json();

    const userErrors = json?.data?.productUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return {
        ok: false,
        error: userErrors.map((e: any) => e.message).join(", "),
      };
    }

    return { ok: true };
  } catch (error) {
    logStandardFeeError("syncStandardFeeProductIdentity failed", error);
    return {
      ok: false,
      error: getReadableErrorMessage(
        "Updating standard fee product identity failed.",
        error,
      ),
    };
  }
}

export async function findStandardFeeProduct(
  admin: AdminGraphqlClient,
): Promise<FoundStandardFeeProduct> {
  try {
    const query = `#graphql
      query FindStandardFeeProduct($search: String!) {
        products(first: 10, query: $search) {
          nodes {
            id
            title
            vendor
            productType
            tags
          }
        }
      }
    `;

    const search = [
      `vendor:${STANDARD_FEE_PRODUCT_VENDOR}`,
      `tag:${STANDARD_FEE_PRODUCT_TAG}`,
    ].join(" ");

    const res = await admin.graphql(query, {
      variables: { search },
    });
    const json = await res.json();

    const nodes: Array<{
      id: string;
      title?: string;
      vendor?: string;
      productType?: string;
      tags?: string[];
    }> = json?.data?.products?.nodes ?? [];

    const exact = nodes.find((node) => {
      const tags = Array.isArray(node.tags) ? node.tags : [];
      return (
        node.vendor === STANDARD_FEE_PRODUCT_VENDOR &&
        tags.includes(STANDARD_FEE_PRODUCT_TAG)
      );
    });

    return {
      productId: exact?.id ?? null,
      title: exact?.title ?? null,
    };
  } catch (error) {
    logStandardFeeError("findStandardFeeProduct failed", error);
    return { productId: null, title: null };
  }
}

export async function createStandardFeeProduct(
  admin: AdminGraphqlClient,
): Promise<StandardFeeProductResult> {
  try {
    const existing = await findStandardFeeProduct(admin);
    if (existing.productId) {
      const synced = await syncStandardFeeProductIdentity(
        admin,
        existing.productId,
        existing.title,
      );

      if (!synced.ok) {
        return {
          ok: false,
          error: synced.error,
        };
      }

      return {
        ok: true,
        productId: existing.productId,
        created: false,
      };
    }

    const mutation = `#graphql
      mutation CreateStandardFeeProduct($input: ProductCreateInput!) {
        productCreate(product: $input) {
          product {
            id
            title
            vendor
            productType
            tags
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        title: STANDARD_FEE_PRODUCT_TITLE,
        vendor: STANDARD_FEE_PRODUCT_VENDOR,
        productType: STANDARD_FEE_PRODUCT_TYPE,
        tags: [STANDARD_FEE_PRODUCT_TAG],
        status: "ACTIVE",
      },
    };

    const res = await admin.graphql(mutation, { variables });
    const json = await res.json();

    const userErrors = json?.data?.productCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return {
        ok: false,
        error: userErrors.map((e: any) => e.message).join(", "),
      };
    }

    const productId = json?.data?.productCreate?.product?.id ?? null;
    if (!productId) {
      return {
        ok: false,
        error: "Product creation returned no product ID.",
      };
    }

    return {
      ok: true,
      productId,
      created: true,
    };
  } catch (error) {
    logStandardFeeError("createStandardFeeProduct failed", error);
    return {
      ok: false,
      error: getReadableErrorMessage(
        "Standard fee product creation failed.",
        error,
      ),
    };
  }
}

export async function saveStandardFeeProductId(
  admin: AdminGraphqlClient,
  shopId: string,
  productId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const mutation = `#graphql
      mutation SaveStandardFeeProductId($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      metafields: [
        {
          ownerId: shopId,
          namespace: "synorai_ecocharge",
          key: "standard_fee_product_id",
          type: "single_line_text_field",
          value: productId,
        },
      ],
    };

    const res = await admin.graphql(mutation, { variables });
    const json = await res.json();

    const userErrors = json?.data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length > 0) {
      return {
        ok: false,
        error: userErrors.map((e: any) => e.message).join(", "),
      };
    }

    return { ok: true };
  } catch (error) {
    logStandardFeeError("saveStandardFeeProductId failed", error);
    return {
      ok: false,
      error: getReadableErrorMessage(
        "Saving standard fee product ID failed.",
        error,
      ),
    };
  }
}

async function getExistingProductVariants(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<ProductVariantNode[]> {
  try {
    const query = `#graphql
      query GetStandardFeeProductVariants($id: ID!) {
        product(id: $id) {
          id
          variants(first: 250) {
            nodes {
              id
              title
              price
              taxable
              inventoryItem {
                id
                tracked
              }
            }
          }
        }
      }
    `;

    const res = await admin.graphql(query, {
      variables: { id: productId },
    });
    const json = await res.json();

    const nodes: ProductVariantNode[] =
      json?.data?.product?.variants?.nodes ?? [];

    return nodes;
  } catch (error) {
    logStandardFeeError("getExistingProductVariants failed", error);
    throw error;
  }
}

export async function normalizeStandardFeeProductVariants(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<StandardFeeVariantNormalizationResult> {
  try {
    const existingVariants = await getExistingProductVariants(admin, productId);

    const variantsNeedingUpdate = existingVariants.filter((variant) => {
      const requiredVariant = getRequiredVariantByTitle(variant.title);
      const expectedPrice = requiredVariant?.price ?? null;
      const currentPrice = formatMoneyString(variant.price);
      const hasPriceMismatch =
        expectedPrice !== null && currentPrice !== expectedPrice;

      return (
        variant.taxable !== false ||
        variant.inventoryItem?.tracked !== false ||
        hasPriceMismatch
      );
    });

    if (variantsNeedingUpdate.length === 0) {
      return {
        ok: true,
        updatedCount: 0,
        totalChecked: existingVariants.length,
      };
    }

    const mutation = `#graphql
      mutation UpdateStandardFeeVariants(
        $productId: ID!
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            title
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      productId,
      variants: variantsNeedingUpdate.map((variant) => {
        const requiredVariant = getRequiredVariantByTitle(variant.title);

        return {
          id: variant.id,
          ...(requiredVariant ? { price: requiredVariant.price } : {}),
          taxable: false,
          inventoryItem: {
            tracked: false,
          },
        };
      }),
    };

    const res = await admin.graphql(mutation, { variables });
    const json = await res.json();

    const userErrors = json?.data?.productVariantsBulkUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return {
        ok: false,
        error: userErrors.map((e: any) => e.message).join(", "),
      };
    }

    return {
      ok: true,
      updatedCount: variantsNeedingUpdate.length,
      totalChecked: existingVariants.length,
    };
  } catch (error) {
    logStandardFeeError("normalizeStandardFeeProductVariants failed", error);
    return {
      ok: false,
      error: getReadableErrorMessage(
        "Standard fee variant normalization failed.",
        error,
      ),
    };
  }
}

export async function ensureStandardFeeProductVariants(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<StandardFeeVariantEnsureResult> {
  try {
    const requiredVariants = getRequiredFeeVariants();
    const existingVariants = await getExistingProductVariants(admin, productId);

    const existingTitles = new Set(
      existingVariants
        .map((variant) => variant.title?.trim())
        .filter((title): title is string => Boolean(title)),
    );

    const missingVariants = requiredVariants.filter(
      (variant) => !existingTitles.has(variant.title),
    );

    if (missingVariants.length === 0) {
      return {
        ok: true,
        createdCount: 0,
        totalRequired: requiredVariants.length,
      };
    }

    const mutation = `#graphql
      mutation CreateStandardFeeVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants {
            id
            title
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      productId,
      variants: missingVariants.map((variant) => ({
        price: variant.price,
        optionValues: [
          {
            name: variant.title,
            optionName: "Title",
          },
        ],
        taxable: false,
      })),
    };

    const res = await admin.graphql(mutation, { variables });
    const json = await res.json();

    const userErrors = json?.data?.productVariantsBulkCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return {
        ok: false,
        error: userErrors.map((e: any) => e.message).join(", "),
      };
    }

    return {
      ok: true,
      createdCount: missingVariants.length,
      totalRequired: requiredVariants.length,
    };
  } catch (error) {
    logStandardFeeError("ensureStandardFeeProductVariants failed", error);
    return {
      ok: false,
      error: getReadableErrorMessage(
        "Ensuring standard fee variants failed.",
        error,
      ),
    };
  }
}

export function getStandardFeeProductConstants() {
  return {
    title: STANDARD_FEE_PRODUCT_TITLE,
    vendor: STANDARD_FEE_PRODUCT_VENDOR,
    productType: STANDARD_FEE_PRODUCT_TYPE,
    tag: STANDARD_FEE_PRODUCT_TAG,
  };
}

function parseVariantTitle(
  title: string,
): { province: ProvinceCode; category: NormalizedCategory } | null {
  const trimmed = title.trim();

  for (const province of ALLOWED_PROVINCES) {
    for (const category of Object.keys(
      CATEGORY_LABEL_MAP,
    ) as NormalizedCategory[]) {
      const expectedTitle = formatVariantTitle(province, category);
      if (trimmed === expectedTitle) {
        return {
          province,
          category,
        };
      }
    }
  }

  return null;
}

export async function getStandardFeeVariantMap(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<
  | { ok: true; variantMap: StandardFeeVariantMap }
  | { ok: false; error: string }
> {
  try {
    const existingVariants = await getExistingProductVariants(admin, productId);

    const variantMap: StandardFeeVariantMap = {};

    for (const variant of existingVariants) {
      if (!variant.id || !variant.title) continue;

      const parsed = parseVariantTitle(variant.title);
      if (!parsed) continue;

      if (!variantMap[parsed.province]) {
        variantMap[parsed.province] = {};
      }

      const fallbackPrice =
        PROVINCE_CONFIG[parsed.province]?.feeByCategory?.[parsed.category] ?? 0;

      variantMap[parsed.province]![parsed.category] = {
        variantId: variant.id,
        price: variant.price ?? fallbackPrice.toFixed(2),
        title: variant.title,
      };
    }

    return {
      ok: true,
      variantMap,
    };
  } catch (error) {
    logStandardFeeError("getStandardFeeVariantMap failed", error);
    return {
      ok: false,
      error: getReadableErrorMessage(
        "Building standard fee variant map failed.",
        error,
      ),
    };
  }
}

export async function saveStandardFeeVariantMap(
  admin: AdminGraphqlClient,
  shopId: string,
  variantMap: StandardFeeVariantMap,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const mutation = `#graphql
      mutation SaveStandardFeeVariantMap($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      metafields: [
        {
          ownerId: shopId,
          namespace: "synorai_ecocharge",
          key: "standard_fee_variant_map",
          type: "json",
          value: JSON.stringify(variantMap),
        },
      ],
    };

    const res = await admin.graphql(mutation, { variables });
    const json = await res.json();

    const userErrors = json?.data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length > 0) {
      return {
        ok: false,
        error: userErrors.map((e: any) => e.message).join(", "),
      };
    }

    return { ok: true };
  } catch (error) {
    logStandardFeeError("saveStandardFeeVariantMap failed", error);
    return {
      ok: false,
      error: getReadableErrorMessage(
        "Saving standard fee variant map failed.",
        error,
      ),
    };
  }
}

export function getStandardFeeVariantPreview() {
  return getRequiredFeeVariants().map((variant) => ({
    province: variant.province,
    category: variant.category,
    categoryLabel: CATEGORY_LABEL_MAP[variant.category],
    title: variant.title,
    price: variant.price,
  }));
}