import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";

import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { normalizeProvinceCode, type ProvinceCode } from "../lib/eco-fees";
import { runStandardFeeCartSync } from "../lib/standard-fee-cart-runner";
import type { StandardFeeVariantMap } from "../lib/standard-fee-product.server";

const METAFIELD_NAMESPACE = "synorai_ecocharge";

type LoaderData = {
  shopDomain: string;
  province: ProvinceCode | null;
  feeProductId: string | null;
  variantMap: StandardFeeVariantMap | null;
  variantMapExists: boolean;
};

type ActionData =
  | {
      ok: true;
      result: unknown;
    }
  | {
      ok: false;
      error: string;
    };

async function getStandardDebugState(admin: any): Promise<{
  province: ProvinceCode | null;
  feeProductId: string | null;
  variantMap: StandardFeeVariantMap | null;
  variantMapExists: boolean;
}> {
  const query = `#graphql
    query GetStandardDebugState {
      shop {
        jurisdiction: metafield(
          namespace: "${METAFIELD_NAMESPACE}"
          key: "jurisdiction"
        ) {
          value
        }
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

  const rawProvince = json?.data?.shop?.jurisdiction?.value;
  const rawFeeProductId = json?.data?.shop?.feeProductId?.value;
  const rawVariantMap = json?.data?.shop?.feeVariantMap?.value;

  const province = normalizeProvinceCode(rawProvince);

  const feeProductId =
    typeof rawFeeProductId === "string" && rawFeeProductId.trim().length > 0
      ? rawFeeProductId.trim()
      : null;

  let variantMap: StandardFeeVariantMap | null = null;

  if (typeof rawVariantMap === "string" && rawVariantMap.trim().length > 0) {
    try {
      variantMap = JSON.parse(rawVariantMap) as StandardFeeVariantMap;
    } catch {
      variantMap = null;
    }
  }

  return {
    province,
    feeProductId,
    variantMap,
    variantMapExists: Boolean(variantMap),
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const state = await getStandardDebugState(admin);

  const data: LoaderData = {
    shopDomain: session.shop,
    province: state.province,
    feeProductId: state.feeProductId,
    variantMap: state.variantMap,
    variantMapExists: state.variantMapExists,
  };

  return Response.json(data);
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "").trim();

  if (intent !== "runStandardSync") {
    return Response.json({
      ok: false,
      error: "Unknown action.",
    });
  }

  const state = await getStandardDebugState(admin);

  if (!state.province) {
    return Response.json({
      ok: false,
      error: "No valid compliance province is saved for this shop.",
    });
  }

  if (!state.feeProductId) {
    return Response.json({
      ok: false,
      error: "No Standard fee product ID is saved for this shop.",
    });
  }

  if (!state.variantMap) {
    return Response.json({
      ok: false,
      error: "No Standard fee variant map is saved for this shop.",
    });
  }

  const result = await runStandardFeeCartSync({
    province: state.province,
    feeProductId: state.feeProductId,
    variantMap: state.variantMap,
  });

  if (!result.ok) {
    return Response.json({
      ok: false,
      error: result.error,
    });
  }

  return Response.json({
    ok: true,
    result,
  });
}

export default function StandardDebugRoute() {
  const loaderData = useLoaderData() as LoaderData;
  const fetcher = useFetcher<ActionData>();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isRunning = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.ok) {
      setErrorMessage(null);
      setSuccessMessage("Standard cart sync test completed.");
    } else {
      setSuccessMessage(null);
      setErrorMessage(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  const handleRun = () => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const fd = new FormData();
    fd.set("intent", "runStandardSync");

    fetcher.submit(fd, { method: "post" });
  };

  return (
    <Page title="Standard Cart Sync Debug">
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
            <Text as="h2" variant="headingMd">
              Standard Setup State
            </Text>

            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                <strong>Shop:</strong> {loaderData.shopDomain}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Province:</strong> {loaderData.province ?? "Not set"}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Fee Product ID:</strong>{" "}
                {loaderData.feeProductId ?? "Not saved"}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Variant Map:</strong>{" "}
                {loaderData.variantMapExists ? "Saved" : "Not saved"}
              </Text>
            </BlockStack>

            <InlineStack gap="300">
              <Button
                variant="primary"
                onClick={handleRun}
                loading={isRunning}
                disabled={isRunning}
              >
                Run Standard Cart Sync Test
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Last Result
            </Text>

            <div
              style={{
                background: "#f6f6f7",
                borderRadius: 8,
                padding: 12,
                overflowX: "auto",
              }}
            >
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(fetcher.data ?? null, null, 2)}
              </pre>
            </div>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}