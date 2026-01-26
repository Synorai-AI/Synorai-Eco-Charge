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

const METAFIELD_NAMESPACE = "synorai_ecocharge";
const METAFIELD_KEY = "jurisdiction";

// Cart transform function identification (robust matching)
const EXPECTED_FUNCTION_TITLE = "eco-fee-cart-transform";
const EXPECTED_API_TYPE = "cart_transform";

const ALLOWED_PROVINCES = ["AB", "BC", "SK"] as const;
type Province = (typeof ALLOWED_PROVINCES)[number];

const PROVINCE_OPTIONS = [
  { label: "Alberta (AB)", value: "AB" },
  { label: "British Columbia (BC)", value: "BC" },
  { label: "Saskatchewan (SK)", value: "SK" },
];

type LoaderData = {
  shopDomain: string;
  currentProvince: Province | null;

  // Transform health/status
  functionId: string | null;
  transformId: string | null;
  transformActive: boolean;
  transformStatusMessage?: string;
};

type ActionData =
  | { ok: true; intent: "save_province"; province: Province }
  | { ok: true; intent: "activate_transform"; transformId: string }
  | { ok: false; intent: "save_province" | "activate_transform"; error: string };

function isProvince(value: string): value is Province {
  return (ALLOWED_PROVINCES as readonly string[]).includes(value);
}

/**
 * Shopify IDs can show up as:
 * - plain ids (e.g., "019bd31f-...")
 * - gid strings (e.g., "gid://shopify/ShopifyFunction/123")
 * We normalize by extracting the last segment if it looks like gid, otherwise return as-is.
 */
function normalizeShopifyId(id: unknown): string | null {
  if (typeof id !== "string" || !id.trim()) return null;
  const s = id.trim();
  if (s.startsWith("gid://")) {
    const parts = s.split("/");
    return parts[parts.length - 1] || null;
  }
  return s;
}

async function getCurrentProvince(admin: any): Promise<Province | null> {
  const query = `#graphql
    query GetSettings {
      shop {
        metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
          value
        }
      }
    }
  `;

  const res = await admin.graphql(query);
  const json = await res.json();

  const raw = json?.data?.shop?.metafield?.value;
  return typeof raw === "string" && isProvince(raw) ? raw : null;
}

async function getCartTransformStatus(admin: any): Promise<{
  functionId: string | null;
  transformId: string | null;
  transformActive: boolean;
  message?: string;
}> {
  // 1) Find the cart transform function id
  const functionsQuery = `#graphql
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

  const functionsRes = await admin.graphql(functionsQuery);
  const functionsJson = await functionsRes.json();

  const functions: Array<{ id: string; title: string; apiType: string }> =
    functionsJson?.data?.shopifyFunctions?.nodes ?? [];

  const match = functions.find((fn) => {
    const apiType = (fn.apiType || "").toLowerCase();
    const title = (fn.title || "").toLowerCase();
    return apiType === EXPECTED_API_TYPE && title === EXPECTED_FUNCTION_TITLE;
  });

  const functionIdRaw = match?.id ?? null;
  const functionId = normalizeShopifyId(functionIdRaw);

  if (!functionId) {
    return {
      functionId: null,
      transformId: null,
      transformActive: false,
      message:
        "Cart transform function not found. Ensure the function is deployed and titled 'eco-fee-cart-transform'.",
    };
  }

  // 2) Check if a cart transform exists for this function
  const transformsQuery = `#graphql
    query GetCartTransforms {
      cartTransforms(first: 50) {
        nodes {
          id
          functionId
          blockOnFailure
        }
      }
    }
  `;

  const transformsRes = await admin.graphql(transformsQuery);
  const transformsJson = await transformsRes.json();

  const nodes: Array<{ id: string; functionId: string }> =
    transformsJson?.data?.cartTransforms?.nodes ?? [];

  const found = nodes.find((t) => {
    const tFunc = normalizeShopifyId(t.functionId);
    return tFunc === functionId;
  });

  const transformId = normalizeShopifyId(found?.id ?? null);

  return {
    functionId,
    transformId,
    transformActive: Boolean(transformId),
    message: transformId
      ? "Cart Transform is active on this store."
      : "Cart Transform is not active yet. Click Enable to activate EcoCharge fees.",
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const currentProvince = await getCurrentProvince(admin);
  const transformStatus = await getCartTransformStatus(admin);

  const data: LoaderData = {
    shopDomain: session.shop,
    currentProvince,
    functionId: transformStatus.functionId,
    transformId: transformStatus.transformId,
    transformActive: transformStatus.transformActive,
    transformStatusMessage: transformStatus.message,
  };

  return data;
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intentRaw = formData.get("intent");
  const intent = typeof intentRaw === "string" ? intentRaw : "";

  // -------------------------
  // Intent: Activate transform
  // -------------------------
  if (intent === "activate_transform") {
    try {
      // Re-check status (idempotent)
      const status = await getCartTransformStatus(admin);

      if (!status.functionId) {
        const bad: ActionData = {
          ok: false,
          intent: "activate_transform",
          error: status.message || "Unable to locate function for activation.",
        };
        return bad;
      }

      if (status.transformActive && status.transformId) {
        const ok: ActionData = {
          ok: true,
          intent: "activate_transform",
          transformId: status.transformId,
        };
        return ok;
      }

      // Create cart transform
      const mutation = `#graphql
        mutation CreateCartTransform($functionId: String!) {
          cartTransformCreate(functionId: $functionId, blockOnFailure: false) {
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

      const variables = { functionId: status.functionId };

      const res = await admin.graphql(mutation, { variables });
      const json = await res.json();

      const userErrors = json?.data?.cartTransformCreate?.userErrors ?? [];
      if (userErrors.length > 0) {
        const fail: ActionData = {
          ok: false,
          intent: "activate_transform",
          error: userErrors.map((e: any) => e.message).join(", "),
        };
        return fail;
      }

      const createdIdRaw = json?.data?.cartTransformCreate?.cartTransform?.id;
      const createdId = normalizeShopifyId(createdIdRaw);

      if (!createdId) {
        const fail: ActionData = {
          ok: false,
          intent: "activate_transform",
          error: "Cart Transform creation returned no id.",
        };
        return fail;
      }

      const ok: ActionData = {
        ok: true,
        intent: "activate_transform",
        transformId: createdId,
      };
      return ok;
    } catch (e: any) {
      const fail: ActionData = {
        ok: false,
        intent: "activate_transform",
        error:
          e?.message ||
          "Unexpected error while activating Cart Transform. Check server logs.",
      };
      return fail;
    }
  }

  // -------------------------
  // Intent: Save province
  // -------------------------
  if (intent === "save_province") {
    const provinceRaw = formData.get("province");
    const province = typeof provinceRaw === "string" ? provinceRaw.trim() : "";

    if (!province || !isProvince(province)) {
      const bad: ActionData = {
        ok: false,
        intent: "save_province",
        error: "Invalid province selected.",
      };
      return bad;
    }

    // Get shop.id (ownerId for metafieldsSet)
    const shopIdQuery = `#graphql
      query GetShopId { shop { id } }
    `;
    const shopIdRes = await admin.graphql(shopIdQuery);
    const shopIdJson = await shopIdRes.json();
    const shopId = shopIdJson?.data?.shop?.id;

    if (!shopId) {
      const fail: ActionData = {
        ok: false,
        intent: "save_province",
        error: "Unable to resolve Shop ID for metafield owner.",
      };
      return fail;
    }

    const mutation = `#graphql
      mutation SetComplianceProvince($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { namespace key value }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      metafields: [
        {
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          type: "single_line_text_field",
          value: province,
        },
      ],
    };

    const writeRes = await admin.graphql(mutation, { variables });
    const writeJson = await writeRes.json();

    const userErrors = writeJson?.data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length > 0) {
      const fail: ActionData = {
        ok: false,
        intent: "save_province",
        error: userErrors.map((e: any) => e.message).join(", "),
      };
      return fail;
    }

    const ok: ActionData = { ok: true, intent: "save_province", province };
    return ok;
  }

  // Unknown intent
  const bad: ActionData = {
    ok: false,
    intent: "save_province",
    error: "Unknown action.",
  };
  return bad;
}

export default function SettingsRoute() {
  const loaderData = useLoaderData() as LoaderData;

  const provinceFetcher = useFetcher<ActionData>();
  const activateFetcher = useFetcher<ActionData>();

  const initialProvince = useMemo<Province>(() => {
    return loaderData.currentProvince ?? "AB";
  }, [loaderData.currentProvince]);

  const [province, setProvince] = useState<Province>(initialProvince);

  const [provinceSuccess, setProvinceSuccess] = useState(false);
  const [provinceError, setProvinceError] = useState<string | null>(null);

  const [activateSuccess, setActivateSuccess] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const isSavingProvince = provinceFetcher.state !== "idle";
  const isActivating = activateFetcher.state !== "idle";

  // Reset UI when switching shops
  useEffect(() => {
    setProvince(initialProvince);
    setProvinceSuccess(false);
    setProvinceError(null);

    setActivateSuccess(false);
    setActivateError(null);
  }, [initialProvince, loaderData.shopDomain]);

  // Province save completion
  useEffect(() => {
    if (provinceFetcher.state !== "idle" || !provinceFetcher.data) return;

    if (provinceFetcher.data.ok && provinceFetcher.data.intent === "save_province") {
      setProvince(provinceFetcher.data.province);
      setProvinceSuccess(true);
      setProvinceError(null);
    } else if (!provinceFetcher.data.ok && provinceFetcher.data.intent === "save_province") {
      setProvinceSuccess(false);
      setProvinceError(provinceFetcher.data.error);
    }
  }, [provinceFetcher.state, provinceFetcher.data]);

  // Activation completion
  useEffect(() => {
    if (activateFetcher.state !== "idle" || !activateFetcher.data) return;

    if (activateFetcher.data.ok && activateFetcher.data.intent === "activate_transform") {
      setActivateSuccess(true);
      setActivateError(null);
      // We can't mutate loaderData directly; easiest is to reload the page
      // to reflect updated loader transformActive status.
      window.location.reload();
    } else if (!activateFetcher.data.ok && activateFetcher.data.intent === "activate_transform") {
      setActivateSuccess(false);
      setActivateError(activateFetcher.data.error);
    }
  }, [activateFetcher.state, activateFetcher.data]);

  const handleSaveProvince = () => {
    setProvinceSuccess(false);
    setProvinceError(null);

    const fd = new FormData();
    fd.set("intent", "save_province");
    fd.set("province", province);

    provinceFetcher.submit(fd, { method: "post" });
  };

  const handleActivate = () => {
    setActivateSuccess(false);
    setActivateError(null);

    const fd = new FormData();
    fd.set("intent", "activate_transform");

    activateFetcher.submit(fd, { method: "post" });
  };

  const transformBadge = loaderData.transformActive ? (
    <Badge tone="success">Active</Badge>
  ) : (
    <Badge tone="critical">Not active</Badge>
  );

  return (
    <Page title="EcoCharge Settings">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                EcoCharge Status
              </Text>
              {transformBadge}
            </InlineStack>

            <Text as="p" variant="bodyMd">
              {loaderData.transformStatusMessage ||
                "EcoCharge uses a Cart Transform function to add transparent environmental fees at checkout."}
            </Text>

            {activateSuccess && (
              <Banner title="Enabled" status="success">
                EcoCharge was enabled successfully.
              </Banner>
            )}

            {activateError && (
              <Banner title="Enable failed" status="critical">
                {activateError}
              </Banner>
            )}

            {!loaderData.transformActive && (
              <Button
                variant="primary"
                onClick={handleActivate}
                loading={isActivating}
                disabled={isActivating}
              >
                Enable EcoCharge Fees
              </Button>
            )}

            {loaderData.transformActive && loaderData.transformId && (
              <Text as="p" variant="bodySm" tone="subdued">
                Cart Transform ID: {loaderData.transformId}
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Store Compliance Province
            </Text>

            <Text as="p" variant="bodyMd">
              This is the fallback province used when the customer hasn’t selected a shipping province
              (pickup / no shipping chosen). It does not collect fees — it only adjusts line item prices.
            </Text>

            {provinceSuccess && (
              <Banner title="Saved" status="success">
                Province compliance was updated successfully.
              </Banner>
            )}

            {provinceError && (
              <Banner title="Save failed" status="critical">
                {provinceError}
              </Banner>
            )}

            <InlineStack gap="300" align="space-between">
              <div style={{ minWidth: 280 }}>
                <Select
                  label="Province"
                  options={PROVINCE_OPTIONS}
                  value={province}
                  onChange={(v) => setProvince(v as Province)}
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

            <Text as="p" variant="bodySm" tone="subdued">
              Current shop: {loaderData.shopDomain}
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
