import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";

import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Select,
  Button,
  Banner,
  Badge,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { ALLOWED_PROVINCES, type ProvinceCode } from "../lib/eco-fees";
import {
  createStandardFeeProduct,
  ensureStandardFeeProductVariants,
  getStandardFeeProductDiagnostics,
  getStandardFeeVariantMap,
  normalizeStandardFeeProductVariants,
  saveStandardFeeProductId,
  saveStandardFeeVariantMap,
} from "../lib/standard-fee-product.server";

const METAFIELD_NAMESPACE = "synorai_ecocharge";
const METAFIELD_KEY = "jurisdiction";
const DEV_MODE_OVERRIDE_KEY = "dev_mode_override";
const EFFECTIVE_MODE_KEY = "effective_mode";

type Province = ProvinceCode;

const PROVINCE_OPTIONS = [
  { label: "Alberta (AB)", value: "AB" },
  { label: "British Columbia (BC)", value: "BC" },
  { label: "Saskatchewan (SK)", value: "SK" },
];

type StoreCapability = "development" | "plus" | "standard";
type ActiveMode = "standard_fee_product" | "pro_cart_transform";
type DevModeOverride = "" | "standard_fee_product" | "pro_cart_transform";
type BillingPlanTier = "none" | "standard" | "pro";

const DEV_MODE_OPTIONS = [
  { label: "Automatic (recommended)", value: "" },
  { label: "Force Pro Cart Transform Mode", value: "pro_cart_transform" },
  { label: "Force Standard Fee Product Mode", value: "standard_fee_product" },
];

type StandardPricingDiagnostics = {
  status: "not_available" | "ok" | "warning" | "error";
  productHandle: string | null;
  checkedVariantCount: number;
  normalizedVariantCount: number;
  unnormalizedVariantCount: number;
  sampleUnnormalizedTitle: string | null;
  message: string | null;
};

type LoaderData = {
  shopDomain: string;
  currentProvince: Province | null;

    storeCapability: StoreCapability;
  isDevelopmentStore: boolean;
  isPlusStore: boolean;
  hasActivePayment: boolean;
  activeSubscriptionName: string | null;
  billingPlanTier: BillingPlanTier;

  devModeOverride: DevModeOverride;
  activeMode: ActiveMode;
  savedEffectiveMode: ActiveMode | null;

  functionId: string | null;
  cartTransformId: string | null;
  isTransformActive: boolean;

  standardFeeProductId: string | null;
  standardVariantMapExists: boolean;
  isStandardSetupComplete: boolean;
  standardPricingDiagnostics: StandardPricingDiagnostics;
};

type ActionData =
  | { ok: true; kind: "province"; province: Province }
  | {
      ok: true;
      kind: "dev_mode_override";
      value: DevModeOverride;
      effectiveMode: ActiveMode;
    }
  | { ok: true; kind: "transform"; cartTransformId: string; repaired: boolean }
  | { ok: true; kind: "standard_setup"; feeProductId: string; repaired: boolean }
  | { ok: false; error: string };

function isProvince(value: string): value is Province {
  return (ALLOWED_PROVINCES as readonly string[]).includes(value);
}

function isActiveMode(value: string): value is ActiveMode {
  return value === "standard_fee_product" || value === "pro_cart_transform";
}

function isDevModeOverride(value: string): value is DevModeOverride {
  return value === "" || isActiveMode(value);
}

function normalizePlanName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function detectBillingPlanTier(subscriptionName: string | null): BillingPlanTier {
  const name = normalizePlanName(subscriptionName);

  if (!name) return "none";
  if (name.includes("pro")) return "pro";
  if (name.includes("standard") || name.includes("basic")) return "standard";

  return "none";
}

function getBillingPlanLabel(tier: BillingPlanTier): string {
  switch (tier) {
    case "pro":
      return "Pro";
    case "standard":
      return "Standard";
    case "none":
    default:
      return "None";
  }
}

async function getBillingState(admin: any): Promise<{
  hasActivePayment: boolean;
  activeSubscriptionName: string | null;
  billingPlanTier: BillingPlanTier;
}> {
  const query = `#graphql
    query GetBillingState {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
        }
      }
    }
  `;

  const res = await admin.graphql(query);
  const json = await res.json();

  const subscriptions: Array<{
    id?: string | null;
    name?: string | null;
    status?: string | null;
    test?: boolean | null;
  }> = json?.data?.currentAppInstallation?.activeSubscriptions ?? [];

  const activeSubscription =
    subscriptions.find(
      (sub) => String(sub?.status || "").toUpperCase() === "ACTIVE",
    ) ?? null;

  const activeSubscriptionName =
    typeof activeSubscription?.name === "string" &&
    activeSubscription.name.trim().length > 0
      ? activeSubscription.name.trim()
      : null;

  return {
    hasActivePayment: Boolean(activeSubscription),
    activeSubscriptionName,
    billingPlanTier: detectBillingPlanTier(activeSubscriptionName),
  };
}

function detectStoreCapability(plan: {
  partnerDevelopment?: boolean | null;
  publicDisplayName?: string | null;
}): StoreCapability {
  if (plan?.partnerDevelopment) return "development";

  const displayName = normalizePlanName(plan?.publicDisplayName);
  if (displayName.includes("plus")) return "plus";

  return "standard";
}

function getCapabilityLabel(capability: StoreCapability): string {
  switch (capability) {
    case "development":
      return "Development store";
    case "plus":
      return "Shopify Plus";
    case "standard":
    default:
      return "Standard Shopify store";
  }
}

function getModeLabel(mode: ActiveMode): string {
  return mode === "pro_cart_transform"
    ? "Pro Cart Transform Mode"
    : "Standard Fee Product Mode";
}

function resolveActiveMode(params: {
  isDevelopmentStore: boolean;
  isPlusStore: boolean;
  devModeOverride: DevModeOverride;
  hasActivePayment: boolean;
  billingPlanTier: BillingPlanTier;
}): ActiveMode {
  const canUseProCartTransform =
    params.hasActivePayment &&
    params.billingPlanTier === "pro" &&
    params.isPlusStore;

  if (params.isDevelopmentStore && params.hasActivePayment && params.devModeOverride) {
    if (
      params.devModeOverride === "pro_cart_transform" &&
      canUseProCartTransform
    ) {
      return "pro_cart_transform";
    }

    if (params.devModeOverride === "standard_fee_product") {
      return "standard_fee_product";
    }
  }

  return canUseProCartTransform
    ? "pro_cart_transform"
    : "standard_fee_product";
}
async function getFunctionId(admin: any): Promise<string | null> {
  const query = `#graphql
    query GetFunctions {
      shopifyFunctions(first: 50) {
        nodes {
          id
          title
          apiType
        }
      }
    }
  `;

  const res = await admin.graphql(query);
  const json = await res.json();

  const nodes: Array<{ id: string; title: string; apiType: string }> =
    json?.data?.shopifyFunctions?.nodes ?? [];

  const match = nodes.find(
    (n) =>
      n.apiType === "cart_transform" &&
      (n.title === "eco-fee-cart-transform" ||
        n.title === "eco-fee-cart-transform (production)" ||
        n.title.includes("eco-fee-cart-transform")),
  );

  return match?.id ?? null;
}

async function getCartTransformForFunction(
  admin: any,
  functionId: string,
): Promise<{ cartTransformId: string | null }> {
  const query = `#graphql
    query GetCartTransforms {
      cartTransforms(first: 25) {
        nodes {
          id
          functionId
          blockOnFailure
        }
      }
    }
  `;

  const res = await admin.graphql(query);
  const json = await res.json();

  const nodes: Array<{ id: string; functionId: string }> =
    json?.data?.cartTransforms?.nodes ?? [];

  const match = nodes.find((n) => n.functionId === functionId);
  return { cartTransformId: match?.id ?? null };
}

async function deleteCartTransform(
  admin: any,
  cartTransformId: string,
): Promise<{ ok: boolean; error?: string }> {
  const mutation = `#graphql
    mutation DeleteCartTransform($id: ID!) {
      cartTransformDelete(id: $id) {
        deletedId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const res = await admin.graphql(mutation, {
    variables: { id: cartTransformId },
  });
  const json = await res.json();

  const errs = json?.data?.cartTransformDelete?.userErrors ?? [];
  if (errs.length > 0) {
    return {
      ok: false,
      error: errs.map((e: any) => e.message).join(", "),
    };
  }

  return { ok: true };
}

async function createCartTransform(
  admin: any,
  functionId: string,
): Promise<{ cartTransformId: string | null; error?: string }> {
  const mutation = `#graphql
    mutation CreateCartTransform($functionId: String!) {
      cartTransformCreate(functionId: $functionId) {
        cartTransform {
          id
          functionId
          blockOnFailure
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const res = await admin.graphql(mutation, { variables: { functionId } });
  const json = await res.json();

  const errs = json?.data?.cartTransformCreate?.userErrors ?? [];
  if (errs.length > 0) {
    return {
      cartTransformId: null,
      error: errs.map((e: any) => e.message).join(", "),
    };
  }

  const id = json?.data?.cartTransformCreate?.cartTransform?.id ?? null;
  if (!id) {
    return {
      cartTransformId: null,
      error: "Cart Transform creation returned no ID.",
    };
  }

  return { cartTransformId: id };
}

async function getStoreContext(admin: any): Promise<{
  shopId: string | null;
  currentProvince: Province | null;
  storeCapability: StoreCapability;
  isDevelopmentStore: boolean;
  isPlusStore: boolean;
  devModeOverride: DevModeOverride;
  savedEffectiveMode: ActiveMode | null;
}> {
  const query = `#graphql
    query GetStoreContext {
      shop {
        id
        plan {
          partnerDevelopment
          publicDisplayName
        }
        province: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
          value
        }
        devModeOverride: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${DEV_MODE_OVERRIDE_KEY}") {
          value
        }
        effectiveMode: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${EFFECTIVE_MODE_KEY}") {
          value
        }
      }
    }
  `;

  const res = await admin.graphql(query);
  const json = await res.json();

  const shop = json?.data?.shop;
  const rawProvince = shop?.province?.value;
  const rawOverride =
    typeof shop?.devModeOverride?.value === "string"
      ? shop.devModeOverride.value.trim()
      : "";
  const rawEffectiveMode =
    typeof shop?.effectiveMode?.value === "string"
      ? shop.effectiveMode.value.trim()
      : "";

  const currentProvince =
    typeof rawProvince === "string" && isProvince(rawProvince)
      ? rawProvince
      : null;

  const capability = detectStoreCapability(shop?.plan);
  const isDevelopmentStore = capability === "development";
  const isPlusStore = capability === "plus";

  const devModeOverride: DevModeOverride = isDevModeOverride(rawOverride)
    ? rawOverride
    : "";

  const savedEffectiveMode: ActiveMode | null = isActiveMode(rawEffectiveMode)
    ? rawEffectiveMode
    : null;

  return {
    shopId: shop?.id ?? null,
    currentProvince,
    storeCapability: capability,
    isDevelopmentStore,
    isPlusStore,
    devModeOverride,
    savedEffectiveMode,
  };
}

async function getStandardSetupState(admin: any): Promise<{
  standardFeeProductId: string | null;
  standardVariantMapExists: boolean;
  isStandardSetupComplete: boolean;
}> {
  const query = `#graphql
    query GetStandardSetupState {
      shop {
        feeProductId: metafield(
          namespace: "${METAFIELD_NAMESPACE}"
          key: "standard_fee_product_id"
        ) {
          value
        }
        feeVariantMap: metafield(
          namespace: "${METAFIELD_NAMESPACE}"
          key: "standard_fee_variant_map"
        ) {
          value
        }
      }
    }
  `;

  const res = await admin.graphql(query);
  const json = await res.json();

  const rawProductId = json?.data?.shop?.feeProductId?.value;
  const rawVariantMap = json?.data?.shop?.feeVariantMap?.value;

  const standardFeeProductId =
    typeof rawProductId === "string" && rawProductId.trim().length > 0
      ? rawProductId.trim()
      : null;

  const standardVariantMapExists =
    typeof rawVariantMap === "string" && rawVariantMap.trim().length > 0;

  return {
    standardFeeProductId,
    standardVariantMapExists,
    isStandardSetupComplete: Boolean(
      standardFeeProductId && standardVariantMapExists,
    ),
  };
}

async function getStandardPricingDiagnostics(
  admin: any,
  shopDomain: string,
  standardFeeProductId: string | null,
): Promise<StandardPricingDiagnostics> {
  if (!standardFeeProductId) {
    return {
      status: "not_available",
      productHandle: null,
      checkedVariantCount: 0,
      normalizedVariantCount: 0,
      unnormalizedVariantCount: 0,
      sampleUnnormalizedTitle: null,
      message: null,
    };
  }

  const diagnostics = await getStandardFeeProductDiagnostics(
    admin,
    standardFeeProductId,
  );

  if (!diagnostics.ok) {
    console.error("[standard-pricing-diagnostics] admin diagnostics failed", {
      shopDomain,
      standardFeeProductId,
      error: diagnostics.error,
    });

    return {
      status: "error",
      productHandle: null,
      checkedVariantCount: 0,
      normalizedVariantCount: 0,
      unnormalizedVariantCount: 0,
      sampleUnnormalizedTitle: null,
      message: diagnostics.error,
    };
  }

  const variants = Array.isArray(diagnostics.variants) ? diagnostics.variants : [];

  let normalizedVariantCount = 0;
  let unnormalizedVariantCount = 0;
  let sampleUnnormalizedTitle: string | null = null;

  for (const variant of variants) {
    const rawPrice =
      typeof variant?.price === "string" || typeof variant?.price === "number"
        ? String(variant.price).trim()
        : "";

    const numeric = Number(rawPrice);
    const normalized =
      rawPrice.length > 0 && Number.isFinite(numeric)
        ? numeric.toFixed(2)
        : null;

    if (normalized && rawPrice === normalized) {
      normalizedVariantCount += 1;
    } else {
      unnormalizedVariantCount += 1;

      if (!sampleUnnormalizedTitle) {
        sampleUnnormalizedTitle =
          typeof variant?.title === "string" && variant.title.trim().length > 0
            ? variant.title.trim()
            : "Untitled variant";
      }
    }
  }

  console.log("[standard-pricing-diagnostics] admin-only diagnostics finished", {
    shopDomain,
    productHandle: diagnostics.handle,
    checkedVariantCount: variants.length,
    normalizedVariantCount,
    unnormalizedVariantCount,
    sampleUnnormalizedTitle,
  });

  if (unnormalizedVariantCount > 0) {
    return {
      status: "warning",
      productHandle: diagnostics.handle,
      checkedVariantCount: variants.length,
      normalizedVariantCount,
      unnormalizedVariantCount,
      sampleUnnormalizedTitle,
      message:
        "One or more Environmental Fee variants do not appear normalized to two decimal places in Shopify admin.",
    };
  }

  return {
    status: "ok",
    productHandle: diagnostics.handle,
    checkedVariantCount: variants.length,
    normalizedVariantCount,
    unnormalizedVariantCount: 0,
    sampleUnnormalizedTitle: null,
    message: null,
  };
}

async function saveShopMetafield(params: {
  admin: any;
  shopId: string;
  key: string;
  value: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const mutation = `#graphql
    mutation SaveShopMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { namespace key value }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: params.shopId,
        namespace: METAFIELD_NAMESPACE,
        key: params.key,
        type: "single_line_text_field",
        value: params.value,
      },
    ],
  };

  const res = await params.admin.graphql(mutation, { variables });
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

async function saveEffectiveMode(params: {
  admin: any;
  shopId: string;
  effectiveMode: ActiveMode;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return saveShopMetafield({
    admin: params.admin,
    shopId: params.shopId,
    key: EFFECTIVE_MODE_KEY,
    value: params.effectiveMode,
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const storeContext = await getStoreContext(admin);
  const billingState = await getBillingState(admin);

  const activeMode = resolveActiveMode({
    isDevelopmentStore: storeContext.isDevelopmentStore,
    isPlusStore: storeContext.isPlusStore,
    devModeOverride: storeContext.devModeOverride,
    hasActivePayment: billingState.hasActivePayment,
    billingPlanTier: billingState.billingPlanTier,
  });

  let persistedEffectiveMode = storeContext.savedEffectiveMode;

  if (storeContext.shopId && storeContext.savedEffectiveMode !== activeMode) {
    const saved = await saveEffectiveMode({
      admin,
      shopId: storeContext.shopId,
      effectiveMode: activeMode,
    });

    if (saved.ok) {
      persistedEffectiveMode = activeMode;
    }
  }

  const functionId = await getFunctionId(admin);
  let cartTransformId: string | null = null;

  if (functionId) {
    const found = await getCartTransformForFunction(admin, functionId);
    cartTransformId = found.cartTransformId;
  }

  const standardSetup = await getStandardSetupState(admin);
  const standardPricingDiagnostics = await getStandardPricingDiagnostics(
    admin,
    session.shop,
    standardSetup.standardFeeProductId,
  );

  const data: LoaderData = {
    shopDomain: session.shop,
    currentProvince: storeContext.currentProvince,

    storeCapability: storeContext.storeCapability,
    isDevelopmentStore: storeContext.isDevelopmentStore,
    isPlusStore: storeContext.isPlusStore,
    hasActivePayment: billingState.hasActivePayment,
    activeSubscriptionName: billingState.activeSubscriptionName,
    billingPlanTier: billingState.billingPlanTier,

    devModeOverride: storeContext.devModeOverride,
    activeMode,
    savedEffectiveMode: persistedEffectiveMode,

    functionId,
    cartTransformId,
    isTransformActive: Boolean(cartTransformId),

    standardFeeProductId: standardSetup.standardFeeProductId,
    standardVariantMapExists: standardSetup.standardVariantMapExists,
    isStandardSetupComplete: standardSetup.isStandardSetupComplete,
    standardPricingDiagnostics,
  };

  return Response.json(data);
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "").trim();

  if (intent === "activateTransform" || intent === "repairTransform") {
    const functionId = await getFunctionId(admin);
    if (!functionId) {
      return Response.json({
        ok: false,
        error: "Unable to find cart_transform function for this app.",
      });
    }

    const existing = await getCartTransformForFunction(admin, functionId);

    if (intent === "activateTransform" && existing.cartTransformId) {
      return Response.json({
        ok: true,
        kind: "transform",
        cartTransformId: existing.cartTransformId,
        repaired: false,
      });
    }

    if (intent === "repairTransform" && existing.cartTransformId) {
      const deleted = await deleteCartTransform(admin, existing.cartTransformId);
      if (!deleted.ok) {
        return Response.json({
          ok: false,
          error: deleted.error ?? "Failed to delete existing Cart Transform.",
        });
      }
    }

    const created = await createCartTransform(admin, functionId);
    if (!created.cartTransformId) {
      return Response.json({
        ok: false,
        error: created.error ?? "Failed to create Cart Transform.",
      });
    }

    return Response.json({
      ok: true,
      kind: "transform",
      cartTransformId: created.cartTransformId,
      repaired: intent === "repairTransform",
    });
  }

  if (
    intent === "setupStandardFeeProduct" ||
    intent === "repairStandardFeeProduct"
  ) {
    const storeContext = await getStoreContext(admin);
    const shopId = storeContext.shopId;

    if (!shopId) {
      return Response.json({
        ok: false,
        error: "Unable to resolve Shop ID for Standard fee product setup.",
      });
    }

    const result = await createStandardFeeProduct(admin);

    if (!result.ok) {
      return Response.json({
        ok: false,
        error: result.error,
      });
    }

    const ensured = await ensureStandardFeeProductVariants(admin, result.productId);
    if (!ensured.ok) {
      return Response.json({
        ok: false,
        error: ensured.error,
      });
    }

    const normalized = await normalizeStandardFeeProductVariants(
      admin,
      result.productId,
    );
    if (!normalized.ok) {
      return Response.json({
        ok: false,
        error: normalized.error,
      });
    }

    const variantMapResult = await getStandardFeeVariantMap(
      admin,
      result.productId,
    );
    if (!variantMapResult.ok) {
      return Response.json({
        ok: false,
        error: variantMapResult.error,
      });
    }

    const savedProductId = await saveStandardFeeProductId(
      admin,
      shopId,
      result.productId,
    );
    if (!savedProductId.ok) {
      return Response.json({
        ok: false,
        error: savedProductId.error,
      });
    }

    const savedVariantMap = await saveStandardFeeVariantMap(
      admin,
      shopId,
      variantMapResult.variantMap,
    );
    if (!savedVariantMap.ok) {
      return Response.json({
        ok: false,
        error: savedVariantMap.error,
      });
    }

    return Response.json({
      ok: true,
      kind: "standard_setup",
      feeProductId: result.productId,
      repaired: intent === "repairStandardFeeProduct",
    });
  }

  if (intent === "saveDevModeOverride") {
    const storeContext = await getStoreContext(admin);
    const shopId = storeContext.shopId;

    if (!shopId) {
      return Response.json({
        ok: false,
        error: "Unable to resolve Shop ID for dev mode override.",
      });
    }

    if (!storeContext.isDevelopmentStore) {
      return Response.json({
        ok: false,
        error: "Dev mode override is only available on development stores.",
      });
    }

    const rawValue =
      typeof formData.get("devModeOverride") === "string"
        ? String(formData.get("devModeOverride")).trim()
        : "";

    if (!isDevModeOverride(rawValue)) {
      return Response.json({
        ok: false,
        error: "Invalid development mode override selected.",
      });
    }

    const savedOverride = await saveShopMetafield({
      admin,
      shopId,
      key: DEV_MODE_OVERRIDE_KEY,
      value: rawValue,
    });

    if (!savedOverride.ok) {
      return Response.json({
        ok: false,
        error: savedOverride.error,
      });
    }

    const billingState = await getBillingState(admin);

    const effectiveMode = resolveActiveMode({
      isDevelopmentStore: storeContext.isDevelopmentStore,
      isPlusStore: storeContext.isPlusStore,
      devModeOverride: rawValue,
      hasActivePayment: billingState.hasActivePayment,
      billingPlanTier: billingState.billingPlanTier,
    });

    const savedEffectiveMode = await saveEffectiveMode({
      admin,
      shopId,
      effectiveMode,
    });

    if (!savedEffectiveMode.ok) {
      return Response.json({
        ok: false,
        error: savedEffectiveMode.error,
      });
    }

    return Response.json({
      ok: true,
      kind: "dev_mode_override",
      value: rawValue,
      effectiveMode,
    });
  }

  if (intent === "saveProvince") {
    const provinceRaw = formData.get("province");
    const province = typeof provinceRaw === "string" ? provinceRaw.trim() : "";

    if (!province || !isProvince(province)) {
      return Response.json({ ok: false, error: "Invalid province selected." });
    }

    const storeContext = await getStoreContext(admin);
    const shopId = storeContext.shopId;

    if (!shopId) {
      return Response.json({
        ok: false,
        error: "Unable to resolve Shop ID for metafield owner.",
      });
    }

    const saved = await saveShopMetafield({
      admin,
      shopId,
      key: METAFIELD_KEY,
      value: province,
    });

    if (!saved.ok) {
      return Response.json({
        ok: false,
        error: saved.error,
      });
    }

    return Response.json({ ok: true, kind: "province", province });
  }

  return Response.json({ ok: false, error: "Unknown action." });
}

export default function SettingsRoute() {
  const loaderData = useLoaderData() as LoaderData;

  const modeFetcher = useFetcher<ActionData>();
  const saveFetcher = useFetcher<ActionData>();
  const overrideFetcher = useFetcher<ActionData>();

  const initialProvince = useMemo<Province>(() => {
    return loaderData.currentProvince ?? "AB";
  }, [loaderData.currentProvince]);

  const [province, setProvince] = useState<Province>(initialProvince);
  const [devModeOverride, setDevModeOverride] = useState<DevModeOverride>(
    loaderData.devModeOverride,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isModeActionLoading = modeFetcher.state !== "idle";
  const isSavingProvince = saveFetcher.state !== "idle";
  const isSavingOverride = overrideFetcher.state !== "idle";

  useEffect(() => {
    setProvince(initialProvince);
    setDevModeOverride(loaderData.devModeOverride);
    setSuccessMessage(null);
    setErrorMessage(null);
  }, [initialProvince, loaderData.shopDomain, loaderData.devModeOverride]);

  useEffect(() => {
    if (modeFetcher.state !== "idle" || !modeFetcher.data) return;

    if (modeFetcher.data.ok) {
      setErrorMessage(null);

      if (modeFetcher.data.kind === "transform") {
        setSuccessMessage(
          modeFetcher.data.repaired
            ? "EcoCharge Cart Transform was repaired successfully."
            : "EcoCharge Cart Transform is active.",
        );
      } else if (modeFetcher.data.kind === "standard_setup") {
        setSuccessMessage(
          modeFetcher.data.repaired
            ? "Standard fee product setup was repaired successfully."
            : "Standard fee product setup completed successfully.",
        );
      }
    } else {
      setSuccessMessage(null);
      setErrorMessage(modeFetcher.data.error);
    }
  }, [modeFetcher.state, modeFetcher.data]);

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;

    if (saveFetcher.data.ok) {
      setErrorMessage(null);
      setSuccessMessage("Province compliance was updated successfully.");
    } else {
      setSuccessMessage(null);
      setErrorMessage(saveFetcher.data.error);
    }
  }, [saveFetcher.state, saveFetcher.data]);

  useEffect(() => {
    if (overrideFetcher.state !== "idle" || !overrideFetcher.data) return;

    if (overrideFetcher.data.ok) {
      setErrorMessage(null);
      setSuccessMessage("Development mode override was updated successfully.");
    } else {
      setSuccessMessage(null);
      setErrorMessage(overrideFetcher.data.error);
    }
  }, [overrideFetcher.state, overrideFetcher.data]);

  const handleModeIntent = (
    intent:
      | "activateTransform"
      | "repairTransform"
      | "setupStandardFeeProduct"
      | "repairStandardFeeProduct",
  ) => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const fd = new FormData();
    fd.set("intent", intent);

    modeFetcher.submit(fd, { method: "post" });
  };

  const handleSaveProvince = () => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const fd = new FormData();
    fd.set("intent", "saveProvince");
    fd.set("province", province);

    saveFetcher.submit(fd, { method: "post" });
  };

  const handleSaveDevModeOverride = () => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const fd = new FormData();
    fd.set("intent", "saveDevModeOverride");
    fd.set("devModeOverride", devModeOverride);

    overrideFetcher.submit(fd, { method: "post" });
  };

  const statusActive =
    loaderData.activeMode === "pro_cart_transform"
      ? loaderData.isTransformActive
      : loaderData.isStandardSetupComplete;

  const diagnostics = loaderData.standardPricingDiagnostics;

  return (
    <Page title="EcoCharge Settings">
      <BlockStack gap="400">
        {successMessage && (
          <Banner title="Success" tone="success">
            <p>{successMessage}</p>
          </Banner>
        )}

        {errorMessage && (
          <Banner title="Action failed" tone="critical">
            <p>{errorMessage}</p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                EcoCharge Status
              </Text>
              <Badge tone={statusActive ? "success" : "warning"}>
                {statusActive ? "Active" : "Needs setup"}
              </Badge>
            </InlineStack>

            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                <strong>Mode:</strong> {getModeLabel(loaderData.activeMode)}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Saved effective mode:</strong>{" "}
                {loaderData.savedEffectiveMode
                  ? getModeLabel(loaderData.savedEffectiveMode)
                  : "Not saved yet"}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Store capability:</strong>{" "}
                {getCapabilityLabel(loaderData.storeCapability)}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Billing:</strong>{" "}
                {loaderData.hasActivePayment ? "Active" : "Inactive"}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Plan tier:</strong>{" "}
                {getBillingPlanLabel(loaderData.billingPlanTier)}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Active subscription:</strong>{" "}
                {loaderData.activeSubscriptionName ?? "None"}
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Store Summary
            </Text>

            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                <strong>Current shop:</strong> {loaderData.shopDomain}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Development store:</strong>{" "}
                {loaderData.isDevelopmentStore ? "Yes" : "No"}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Shopify Plus:</strong>{" "}
                {loaderData.isPlusStore ? "Yes" : "No"}
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

        {loaderData.isDevelopmentStore && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Development Mode Override
              </Text>

              <Text as="p" variant="bodyMd">
                This temporary test control is only available on development stores.
                Leave it on Automatic for normal behavior, or force Standard mode to
                test the non-Plus fee product flow.
              </Text>

              <InlineStack gap="300" align="space-between">
                <div style={{ minWidth: 320 }}>
                  <Select
                    label="Mode override"
                    options={DEV_MODE_OPTIONS}
                    value={devModeOverride}
                    onChange={(value) =>
                      setDevModeOverride(value as DevModeOverride)
                    }
                  />
                </div>

                <Button
                  variant="primary"
                  onClick={handleSaveDevModeOverride}
                  loading={isSavingOverride}
                  disabled={isSavingOverride}
                >
                  Save Override
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {loaderData.activeMode === "standard_fee_product" && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Standard Fee Product Mode
                </Text>
                <Badge
                  tone={loaderData.isStandardSetupComplete ? "success" : "warning"}
                >
                  {loaderData.isStandardSetupComplete
                    ? "Configured"
                    : "Not configured"}
                </Badge>
              </InlineStack>

              {diagnostics.status === "ok" && (
                <Banner title="Standard fee admin diagnostics passed" tone="success">
                  <p>
                    EcoCharge verified the Environmental Fee product in Shopify admin and
                    found the fee variant pricing normalized correctly.
                  </p>
                  <p>
                    Checked {diagnostics.checkedVariantCount} fee variant
                    {diagnostics.checkedVariantCount === 1 ? "" : "s"} in admin.
                  </p>
                  <p>
                    Storefront pricing can still be affected by Shopify Markets or Catalog
                    price adjustments, so review <strong>Markets → Catalogs → Canada</strong>
                    if charged fee amounts ever look incorrect.
                  </p>
                </Banner>
              )}

              {diagnostics.status === "warning" && (
                <Banner
                  title="Standard fee admin diagnostics found a pricing warning"
                  tone="warning"
                >
                  <p>
                    EcoCharge verified the Environmental Fee product in Shopify admin, but
                    one or more fee variants do not appear normalized to two decimal places.
                  </p>
                  {diagnostics.sampleUnnormalizedTitle && (
                    <p>
                      Example variant:{" "}
                      <strong>{diagnostics.sampleUnnormalizedTitle}</strong>
                    </p>
                  )}
                  <p>
                    Checked {diagnostics.checkedVariantCount} fee variant
                    {diagnostics.checkedVariantCount === 1 ? "" : "s"} in admin and found{" "}
                    {diagnostics.unnormalizedVariantCount} variant
                    {diagnostics.unnormalizedVariantCount === 1 ? "" : "s"} needing review.
                  </p>
                </Banner>
              )}

              {diagnostics.status === "error" && (
                <Banner title="Standard admin diagnostics unavailable" tone="warning">
                  <p>
                    EcoCharge could not complete Environmental Fee product diagnostics for
                    this store from Shopify admin.
                  </p>
                  {diagnostics.message && <p>{diagnostics.message}</p>}
                  {diagnostics.productHandle && (
                    <p>
                      Fee product handle checked: <strong>{diagnostics.productHandle}</strong>
                    </p>
                  )}
                </Banner>
              )}

              {diagnostics.status === "not_available" && (
                <Banner title="Important pricing warning" tone="warning">
                  <p>
                    Standard mode uses real Shopify fee product variants for environmental
                    fees.
                  </p>
                  <p>
                    Shopify Markets and Catalog price adjustments can increase or decrease
                    those fee variant prices in storefront and cart, even when EcoCharge is
                    configured correctly.
                  </p>
                  <p>
                    Review <strong>Markets → Catalogs → Canada</strong> and make sure no
                    percentage-based price increase or decrease is applied to the
                    Environmental Fee product if exact fee parity is required.
                  </p>
                  <p>
                    For stronger fee integrity, <strong>Pro Cart Transform Mode requires both
                    a Shopify Plus store and the Synorai EcoCharge Pro plan</strong>.
                  </p>
                </Banner>
              )}

              <Text as="p" variant="bodyMd">
                Standard stores use separate app-controlled environmental fee line items
                in the cart. This mode does not modify the original product line.
              </Text>

              <BlockStack gap="100">
                {loaderData.standardFeeProductId ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Fee Product ID: {loaderData.standardFeeProductId}
                  </Text>
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Fee Product ID: not saved yet
                  </Text>
                )}

                <Text as="p" variant="bodySm" tone="subdued">
                  Variant map:{" "}
                  {loaderData.standardVariantMapExists ? "saved" : "not saved yet"}
                </Text>

                {diagnostics.productHandle && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Fee product handle: {diagnostics.productHandle}
                  </Text>
                )}
              </BlockStack>

              <InlineStack gap="300">
                {!loaderData.isStandardSetupComplete && (
                  <Button
                    variant="primary"
                    onClick={() => handleModeIntent("setupStandardFeeProduct")}
                    loading={isModeActionLoading}
                    disabled={isModeActionLoading}
                  >
                    Set Up Standard Fee Product
                  </Button>
                )}

                <Button
                  onClick={() => handleModeIntent("repairStandardFeeProduct")}
                  loading={isModeActionLoading}
                  disabled={isModeActionLoading}
                >
                  Repair Standard Fee Setup
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {loaderData.activeMode === "pro_cart_transform" && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Pro Cart Transform Mode
                </Text>
                <Badge tone={loaderData.isTransformActive ? "success" : "warning"}>
                  {loaderData.isTransformActive ? "Configured" : "Not configured"}
                </Badge>
              </InlineStack>

              <Text as="p" variant="bodyMd">
                Pro mode applies environmental fee adjustments using a Shopify Cart
                Transform where supported.
              </Text>

              {loaderData.cartTransformId && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Cart Transform ID: {loaderData.cartTransformId}
                </Text>
              )}

              <InlineStack gap="300">
                {!loaderData.isTransformActive && (
                  <Button
                    variant="primary"
                    onClick={() => handleModeIntent("activateTransform")}
                    loading={isModeActionLoading}
                    disabled={isModeActionLoading}
                  >
                    Enable EcoCharge Fees
                  </Button>
                )}

                <Button
                  onClick={() => handleModeIntent("repairTransform")}
                  loading={isModeActionLoading}
                  disabled={isModeActionLoading}
                >
                  Repair Cart Transform
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Store Compliance Province
            </Text>

            <Text as="p" variant="bodyMd">
              This is the store-level compliance province used by EcoCharge. Standard
              mode uses it for fee product calculations, and Pro mode uses it for cart
              transform fee calculations.
            </Text>

            <InlineStack gap="300" align="space-between">
              <div style={{ minWidth: 280 }}>
                <Select
                  label="Province"
                  options={PROVINCE_OPTIONS}
                  value={province}
                  onChange={(value) => setProvince(value as Province)}
                />
              </div>

              <Button
                variant="primary"
                onClick={handleSaveProvince}
                loading={isSavingProvince}
                disabled={isSavingProvince}
              >
                Save
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}