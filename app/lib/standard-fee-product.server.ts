import {
  ALLOWED_PROVINCES,
  CATEGORY_LABEL_MAP,
  PROVINCE_CONFIG,
  type NormalizedCategory,
  type ProvinceCode,
} from "./eco-fees";

const STANDARD_FEE_PRODUCT_TITLE = "Synorai Environmental Handling Fee";
const STANDARD_FEE_PRODUCT_VENDOR = "Synorai";
const STANDARD_FEE_PRODUCT_TYPE = "Synorai Eco Fee";
const STANDARD_FEE_PRODUCT_TAG = "synorai-eco-fee";
const ONLINE_STORE_PUBLICATION_NAMES = new Set([
  "online store",
  "online store channel",
]);

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

export type StandardFeeProductNormalizationResult =
  | {
      ok: true;
      publishedToOnlineStore: boolean;
      changed: boolean;
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
  requiresShipping?: boolean;
  inventoryItem?: {
    id: string;
    tracked?: boolean;
  } | null;
};

type PublicationNode = {
  id: string;
  name?: string;
};

type ProductPublicationNode = {
  publication?: {
    id: string;
  } | null;
  isPublished: boolean;
};

type StandardFeeProductNode = {
  id: string;
  title?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: string;
  resourcePublications?: {
    nodes?: ProductPublicationNode[];
  } | null;
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
  fee: number,
): string {
  return `${province} | ${category} | ${fee.toFixed(2)}`;
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
        title: formatVariantTitle(province, category, fee),
        price: fee.toFixed(2),
      });
    }
  }

  return variants;
}

async function getSalesChannelPublications(
  admin: AdminGraphqlClient,
): Promise<
  | { ok: true; publications: PublicationNode[] }
  | { ok: false; error: string }
> {
  const query = `#graphql
    query GetSalesChannelPublications {
      publications(first: 50) {
        nodes {
          id
          name
        }
      }
    }
  `;

  const res = await admin.graphql(query);
  const json = await res.json();

  const publications: PublicationNode[] =
    json?.data?.publications?.nodes ?? [];

  return {
    ok: true,
    publications,
  };
}

async function getStandardFeeProductDetails(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<StandardFeeProductNode | null> {
  const query = `#graphql
    query GetStandardFeeProductDetails($id: ID!) {
      product(id: $id) {
        id
        title
        vendor
        productType
        tags
        status
        resourcePublications(first: 50) {
          nodes {
            isPublished
            publication {
              id
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

  return json?.data?.product ?? null;
}

function findOnlineStorePublicationId(
  publications: PublicationNode[],
): string | null {
  const match = publications.find((publication) => {
    const normalized = (publication.name ?? "").trim().toLowerCase();
    return ONLINE_STORE_PUBLICATION_NAMES.has(normalized);
  });

  return match?.id ?? null;
}

function isPublishedToPublication(
  product: StandardFeeProductNode | null,
  publicationId: string,
): boolean {
  const nodes = product?.resourcePublications?.nodes ?? [];
  return nodes.some(
    (node) =>
      node?.isPublished === true &&
      node?.publication?.id === publicationId,
  );
}

export async function findStandardFeeProduct(
  admin: AdminGraphqlClient,
): Promise<{ productId: string | null }> {
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
    `title:"${STANDARD_FEE_PRODUCT_TITLE}"`,
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
      node.title === STANDARD_FEE_PRODUCT_TITLE &&
      node.vendor === STANDARD_FEE_PRODUCT_VENDOR &&
      node.productType === STANDARD_FEE_PRODUCT_TYPE &&
      tags.includes(STANDARD_FEE_PRODUCT_TAG)
    );
  });

  return {
    productId: exact?.id ?? null,
  };
}

export async function createStandardFeeProduct(
  admin: AdminGraphqlClient,
): Promise<StandardFeeProductResult> {
  const existing = await findStandardFeeProduct(admin);
  if (existing.productId) {
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
}

export async function saveStandardFeeProductId(
  admin: AdminGraphqlClient,
  shopId: string,
  productId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
}

async function getExistingProductVariants(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<ProductVariantNode[]> {
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
            requiresShipping
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
}

export async function normalizeStandardFeeProduct(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<StandardFeeProductNormalizationResult> {
  const publicationsResult = await getSalesChannelPublications(admin);
  if (!publicationsResult.ok) {
    return publicationsResult;
  }

  const onlineStorePublicationId = findOnlineStorePublicationId(
    publicationsResult.publications,
  );

  if (!onlineStorePublicationId) {
    return {
      ok: false,
      error:
        "Unable to find the Online Store publication for Standard fee product setup.",
    };
  }

  const product = await getStandardFeeProductDetails(admin, productId);
  if (!product?.id) {
    return {
      ok: false,
      error: "Unable to load Standard fee product details for normalization.",
    };
  }

  const alreadyPublished = isPublishedToPublication(
    product,
    onlineStorePublicationId,
  );

  if (alreadyPublished) {
    return {
      ok: true,
      publishedToOnlineStore: true,
      changed: false,
    };
  }

  const mutation = `#graphql
    mutation PublishStandardFeeProduct($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          availablePublicationsCount {
            count
          }
        }
        shop {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: productId,
    input: [
      {
        publicationId: onlineStorePublicationId,
      },
    ],
  };

  const res = await admin.graphql(mutation, { variables });
  const json = await res.json();

  const userErrors = json?.data?.publishablePublish?.userErrors ?? [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      error: userErrors.map((e: any) => e.message).join(", "),
    };
  }

  return {
    ok: true,
    publishedToOnlineStore: true,
    changed: true,
  };
}

export async function normalizeStandardFeeProductVariants(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<StandardFeeVariantNormalizationResult> {
  const existingVariants = await getExistingProductVariants(admin, productId);

  const variantsNeedingUpdate = existingVariants.filter((variant) => {
    return (
      variant.taxable !== false ||
      variant.requiresShipping !== false ||
      variant.inventoryItem?.tracked !== false
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
    variants: variantsNeedingUpdate.map((variant) => ({
      id: variant.id,
      taxable: false,
      requiresShipping: false,
      inventoryItem: {
        tracked: false,
      },
    })),
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
}

export async function ensureStandardFeeProductVariants(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<StandardFeeVariantEnsureResult> {
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
): { province: ProvinceCode; category: NormalizedCategory; price: string } | null {
  const parts = title.split("|").map((part) => part.trim());
  if (parts.length !== 3) return null;

  const [provinceRaw, categoryRaw, priceRaw] = parts;

  if (!(ALLOWED_PROVINCES as readonly string[]).includes(provinceRaw)) {
    return null;
  }

  const province = provinceRaw as ProvinceCode;

  const validCategories = new Set<NormalizedCategory>([
    "computers",
    "laptops",
    "printers",
    "peripherals",
    "av",
    "cellphones",
    "display-small",
    "display-large",
    "display-xlarge",
    "all-in-one",
    "small-appliances",
    "tools",
  ]);

  if (!validCategories.has(categoryRaw as NormalizedCategory)) {
    return null;
  }

  const category = categoryRaw as NormalizedCategory;

  if (!priceRaw || Number.isNaN(Number(priceRaw))) {
    return null;
  }

  return {
    province,
    category,
    price: Number(priceRaw).toFixed(2),
  };
}

export async function getStandardFeeVariantMap(
  admin: AdminGraphqlClient,
  productId: string,
): Promise<
  | { ok: true; variantMap: StandardFeeVariantMap }
  | { ok: false; error: string }
> {
  const existingVariants = await getExistingProductVariants(admin, productId);

  const variantMap: StandardFeeVariantMap = {};

  for (const variant of existingVariants) {
    if (!variant.id || !variant.title) continue;

    const parsed = parseVariantTitle(variant.title);
    if (!parsed) continue;

    if (!variantMap[parsed.province]) {
      variantMap[parsed.province] = {};
    }

    variantMap[parsed.province]![parsed.category] = {
      variantId: variant.id,
      price: variant.price ?? parsed.price,
      title: variant.title,
    };
  }

  return {
    ok: true,
    variantMap,
  };
}

export async function saveStandardFeeVariantMap(
  admin: AdminGraphqlClient,
  shopId: string,
  variantMap: StandardFeeVariantMap,
): Promise<{ ok: true } | { ok: false; error: string }> {
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