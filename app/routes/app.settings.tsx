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
};

type ActionData =
  | { ok: true; province: Province }
  | { ok: false; error: string };

function isProvince(value: string): value is Province {
  return (ALLOWED_PROVINCES as readonly string[]).includes(value);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

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
  const currentProvince =
    typeof raw === "string" && isProvince(raw) ? raw : null;

  const data: LoaderData = {
    shopDomain: session.shop,
    currentProvince,
  };

  return data;
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const provinceRaw = formData.get("province");

  const province =
    typeof provinceRaw === "string" ? provinceRaw.trim() : "";

  if (!province || !isProvince(province)) {
    const bad: ActionData = { ok: false, error: "Invalid province selected." };
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
      error: userErrors.map((e: any) => e.message).join(", "),
    };
    return fail;
  }

  const ok: ActionData = { ok: true, province };
  return ok;
}

export default function SettingsRoute() {
  const loaderData = useLoaderData() as LoaderData;
  const fetcher = useFetcher<ActionData>();

  const initialProvince = useMemo<Province>(() => {
    return loaderData.currentProvince ?? "AB";
  }, [loaderData.currentProvince]);

  const [province, setProvince] = useState<Province>(initialProvince);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSaving = fetcher.state !== "idle";

  // When store changes (switching shops), reset UI to loader value.
  useEffect(() => {
    setProvince(initialProvince);
    setShowSuccess(false);
    setErrorMessage(null);
  }, [initialProvince, loaderData.shopDomain]);

  // When save completes, reflect it in UI.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.ok) {
      setProvince(fetcher.data.province);
      setShowSuccess(true);
      setErrorMessage(null);
    } else {
      setShowSuccess(false);
      setErrorMessage(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  const handleSave = () => {
    setShowSuccess(false);
    setErrorMessage(null);

    const fd = new FormData();
    fd.set("province", province);

    fetcher.submit(fd, { method: "post" });
  };

  return (
    <Page title="EcoCharge Settings">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Store Compliance Province
            </Text>

            <Text as="p" variant="bodyMd">
              This is the fallback province used when the customer hasn’t selected a shipping province
              (pickup / no shipping chosen). It does not collect fees — it only adjusts line item prices.
            </Text>

            {showSuccess && (
              <Banner title="Saved" status="success">
                Province compliance was updated successfully.
              </Banner>
            )}

            {errorMessage && (
              <Banner title="Save failed" status="critical">
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
