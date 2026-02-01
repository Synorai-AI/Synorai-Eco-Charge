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

  // Cart Transform status
  functionId: string | null;
  cartTransformId: string | null;
  isTransformActive: boolean;
};

type ActionData =
  | { ok: true; kind: "province"; province: Province }
  | { ok: true; kind: "transform"; cartTransformId: string }
  | { ok: false; error: string };

function isProvince(value: string): value is Province {
  return (ALLOWED_PROVINCES as readonly string[]).includes(value);
}

async function getFunctionId(admin: any): Promise<string | null> {
  // Find the deployed function for this app (cart_transform)
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

  // Your function title is eco-fee-cart-transform (from your earlier output)
  const match = nodes.find(
    (n) =>
      n.apiType === "cart_transform" &&
      (n.title === "eco-fee-cart-transform" ||
        n.title === "eco-fee-cart-transform (production)" ||
        n.title.includes("eco-fee-cart-transform"))
  );

  return match?.id ?? null;
}

async function getCartTransformForFunction(
  admin: any,
  functionId: string
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

async function createCartTransform(
  admin: any,
  functionId: string
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
    return { cartTransformId: null, error: errs.map((e: any) => e.message).join(", ") };
  }

  const id = json?.data?.cartTransformCreate?.cartTransform?.id ?? null;
  if (!id) return { cartTransformId: null, error: "Cart Transform creation returned no ID." };

  return { cartTransformId: id };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  // Province metafield
  const provinceQuery = `#graphql
    query GetSettings {
      shop {
        metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
          value
        }
      }
    }
  `;
  const provinceRes = await admin.graphql(provinceQuery);
  const provinceJson = await provinceRes.json();

  const raw = provinceJson?.data?.shop?.metafield?.value;
  const currentProvince =
    typeof raw === "string" && isProvince(raw) ? raw : null;

  // Cart Transform status
  const functionId = await getFunctionId(admin);
  let cartTransformId: string | null = null;

  if (functionId) {
    const found = await getCartTransformForFunction(admin, functionId);
    cartTransformId = found.cartTransformId;
  }

  const data: LoaderData = {
    shopDomain: session.shop,
    currentProvince,
    functionId,
    cartTransformId,
    isTransformActive: Boolean(cartTransformId),
  };

  return Response.json(data);
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "").trim();

  if (intent === "activateTransform") {
    const functionId = await getFunctionId(admin);
    if (!functionId) {
      return Response.json({ ok: false, error: "Unable to find cart_transform function for this app." });
    }

    // If it already exists, treat as success (idempotent)
    const existing = await getCartTransformForFunction(admin, functionId);
    if (existing.cartTransformId) {
      return Response.json({ ok: true, kind: "transform", cartTransformId: existing.cartTransformId });
    }

    const created = await createCartTransform(admin, functionId);
    if (!created.cartTransformId) {
      return Response.json({ ok: false, error: created.error ?? "Failed to create Cart Transform." });
    }

    return Response.json({ ok: true, kind: "transform", cartTransformId: created.cartTransformId });
  }

  if (intent === "saveProvince") {
    const provinceRaw = formData.get("province");
    const province = typeof provinceRaw === "string" ? provinceRaw.trim() : "";

    if (!province || !isProvince(province)) {
      return Response.json({ ok: false, error: "Invalid province selected." });
    }

    // Resolve shop.id (ownerId for metafieldsSet)
    const shopIdQuery = `#graphql
      query GetShopId {
        shop { id }
      }
    `;
    const shopIdRes = await admin.graphql(shopIdQuery);
    const shopIdJson = await shopIdRes.json();
    const shopId = shopIdJson?.data?.shop?.id;

    if (!shopId) {
      return Response.json({
        ok: false,
        error: "Unable to resolve Shop ID for metafield owner.",
      });
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
      return Response.json({
        ok: false,
        error: userErrors.map((e: any) => e.message).join(", "),
      });
    }

    return Response.json({ ok: true, kind: "province", province });
  }

  return Response.json({ ok: false, error: "Unknown action." });
}

export default function SettingsRoute() {
  const loaderData = useLoaderData() as LoaderData;

  const activateFetcher = useFetcher<ActionData>();
  const saveFetcher = useFetcher<ActionData>();

  const initialProvince = useMemo<Province>(() => {
    return loaderData.currentProvince ?? "AB";
  }, [loaderData.currentProvince]);

  const [province, setProvince] = useState<Province>(initialProvince);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isActivating = activateFetcher.state !== "idle";
  const isSaving = saveFetcher.state !== "idle";

  // Reset UI when shop changes
  useEffect(() => {
    setProvince(initialProvince);
    setSuccessMessage(null);
    setErrorMessage(null);
  }, [initialProvince, loaderData.shopDomain]);

  // Handle activation result
  useEffect(() => {
    if (activateFetcher.state !== "idle" || !activateFetcher.data) return;

    if (activateFetcher.data.ok) {
      setErrorMessage(null);
      setSuccessMessage("EcoCharge fees were enabled successfully.");
    } else {
      setSuccessMessage(null);
      setErrorMessage(activateFetcher.data.error);
    }
  }, [activateFetcher.state, activateFetcher.data]);

  // Handle save result
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

  const handleActivate = () => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const fd = new FormData();
    fd.set("intent", "activateTransform");

    activateFetcher.submit(fd, { method: "post" });
  };

  const handleSave = () => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const fd = new FormData();
    fd.set("intent", "saveProvince");
    fd.set("province", province);

    saveFetcher.submit(fd, { method: "post" });
  };

  const isTransformActive = loaderData.isTransformActive;

  return (
    <Page title="EcoCharge Settings">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                EcoCharge Status
              </Text>
              <Badge tone={isTransformActive ? "success" : "warning"}>
                {isTransformActive ? "Active" : "Not active"}
              </Badge>
            </InlineStack>

            <Text as="p" variant="bodyMd">
              EcoCharge applies fee adjustments using a Shopify Cart Transform function.
            </Text>

            {loaderData.cartTransformId && (
              <Text as="p" variant="bodySm" tone="subdued">
                Cart Transform ID: {loaderData.cartTransformId}
              </Text>
            )}

            {!isTransformActive && (
              <Button variant="primary" onClick={handleActivate} loading={isActivating} disabled={isActivating}>
                Enable EcoCharge Fees
              </Button>
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

            {successMessage && (
              <Banner title="Success" status="success">
                {successMessage}
              </Banner>
            )}

            {errorMessage && (
              <Banner title="Action failed" status="critical">
                {errorMessage}
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
                onClick={handleSave}
                loading={isSaving}
                disabled={isSaving}
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
