import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  HeadersFunction,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useLocation,
  useRouteError,
  Link,
} from "react-router";

import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { isProvinceCode } from "../lib/eco-fees";
import { runStandardFeeSetupPipeline } from "../lib/standard-fee-product.server";

const METAFIELD_NAMESPACE = "synorai_ecocharge";
const JURISDICTION_KEY = "jurisdiction";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const result = await admin.graphql(`
    query BootstrapShop {
      shop {
        name
        myshopifyDomain
        billingAddress {
          countryCodeV2
          provinceCode
        }
        metafield(namespace: "synorai_ecocharge", key: "jurisdiction") {
          value
        }
      }
    }
  `);

  const json = await result.json();
  const shop = json?.data?.shop;
  const billing = shop?.billingAddress;
  const jurisdiction = shop?.metafield?.value ?? null;

  const countryCode = billing?.countryCodeV2 ?? null;
  const provinceCode = billing?.provinceCode ?? null;

  return {
    ok: true,
    shopName: shop?.name ?? null,
    myshopifyDomain: shop?.myshopifyDomain ?? null,
    countryCode,
    provinceCode,
    jurisdiction,
    detectedSupported:
      countryCode === "CA" &&
      typeof provinceCode === "string" &&
      isProvinceCode(provinceCode),
    now: new Date().toISOString(),
  };
}

/**
 * One-click setup: use the store's own billing address province (what the
 * merchant registered with Shopify — not geo-IP guessing), save it as the
 * compliance province, and run the full fee product pipeline.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  if (String(formData.get("intent")) !== "quickSetup") {
    return Response.json({ ok: false, error: "Unknown action." });
  }

  const contextRes = await admin.graphql(`
    query QuickSetupContext {
      shop {
        id
        billingAddress {
          countryCodeV2
          provinceCode
        }
      }
    }
  `);
  const contextJson = await contextRes.json();
  const shopId: string | null = contextJson?.data?.shop?.id ?? null;
  const billing = contextJson?.data?.shop?.billingAddress;
  const provinceCode: string | null = billing?.provinceCode ?? null;

  if (!shopId) {
    return Response.json({ ok: false, error: "Unable to resolve the shop ID." });
  }

  if (
    billing?.countryCodeV2 !== "CA" ||
    !provinceCode ||
    !isProvinceCode(provinceCode)
  ) {
    return Response.json({
      ok: false,
      error:
        "Your store's billing address isn't in a supported province — pick a province manually in Settings.",
    });
  }

  const metafieldRes = await admin.graphql(
    `#graphql
      mutation QuickSetupSaveProvince($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: METAFIELD_NAMESPACE,
            key: JURISDICTION_KEY,
            type: "single_line_text_field",
            value: provinceCode,
          },
        ],
      },
    },
  );
  const metafieldJson = await metafieldRes.json();
  const metafieldErrors = metafieldJson?.data?.metafieldsSet?.userErrors ?? [];
  if (metafieldErrors.length > 0) {
    return Response.json({
      ok: false,
      error: metafieldErrors.map((e: any) => e.message).join(", "),
    });
  }

  const pipeline = await runStandardFeeSetupPipeline(admin, shopId);
  if (!pipeline.ok) {
    return Response.json({
      ok: false,
      error: `Province saved, but fee product setup failed: ${pipeline.error}`,
    });
  }

  return Response.json({ ok: true, province: provinceCode });
}

// REQUIRED: boundary headers for embedded redirects/reauth
export const headers: HeadersFunction = (args) => boundary.headers(args);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

type QuickSetupData = { ok: true; province: string } | { ok: false; error: string };

export default function AppIndex() {
  const location = useLocation();
  const quickSetup = useFetcher<QuickSetupData>();

  const data = useLoaderData() as {
    ok: boolean;
    shopName: string | null;
    myshopifyDomain: string | null;
    countryCode: string | null;
    provinceCode: string | null;
    jurisdiction: string | null;
    detectedSupported: boolean;
    now: string;
  };

  const quickSetupDone = quickSetup.data?.ok === true;
  const jurisdiction = quickSetupDone
    ? (quickSetup.data as { province: string }).province
    : data.jurisdiction;
  const complianceConfigured = Boolean(jurisdiction);
  const isSettingUp = quickSetup.state !== "idle";

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginTop: 0 }}>Synorai EcoCharge</h2>
      <p>Eco-fee compliance configuration</p>

      {!complianceConfigured && data.detectedSupported && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #6ee7b7",
            background: "#ecfdf5",
            borderRadius: 8,
            maxWidth: 760,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>
            Set up in one click
          </h3>
          <p style={{ marginTop: 0 }}>
            Your store&apos;s registered address is in{" "}
            <strong>{data.provinceCode}</strong>. One click saves that as your
            compliance province and creates the fee product with your
            province&apos;s current rates.
          </p>
          <button
            onClick={() => {
              const fd = new FormData();
              fd.set("intent", "quickSetup");
              quickSetup.submit(fd, { method: "post" });
            }}
            disabled={isSettingUp}
            style={{
              padding: "10px 16px",
              background: isSettingUp ? "#6b7280" : "#047857",
              color: "#fff",
              borderRadius: 8,
              border: "none",
              fontSize: 14,
              fontWeight: 600,
              cursor: isSettingUp ? "wait" : "pointer",
            }}
          >
            {isSettingUp
              ? "Setting up…"
              : `Set up for ${data.provinceCode} now`}
          </button>
          {quickSetup.data && quickSetup.data.ok === false && (
            <p style={{ color: "#b42318", marginBottom: 0 }}>
              {(quickSetup.data as { error: string }).error}
            </p>
          )}
        </div>
      )}

      {quickSetupDone && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #6ee7b7",
            background: "#ecfdf5",
            borderRadius: 8,
            maxWidth: 760,
          }}
        >
          <strong>Setup complete for {jurisdiction}.</strong> Last step: enable
          the <em>EcoCharge Standard</em> app embed in your theme —{" "}
          <Link to={`settings${location.search}`}>open Settings</Link> for the
          Theme Editor button, then tag your products using the guide there.
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid #ddd",
          background: "#fafafa",
          borderRadius: 8,
          maxWidth: 760,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Store info</h3>

          <div style={{ display: "flex", gap: 8 }}>
            <Link
              to={`reports${location.search}`}
              style={{
                display: "inline-block",
                padding: "8px 12px",
                background: "#fff",
                color: "#111",
                border: "1px solid #111",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              Remittance Report
            </Link>
            <Link
              to={`settings${location.search}`}
              style={{
                display: "inline-block",
                padding: "8px 12px",
                background: "#111",
                color: "#fff",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              Open Settings
            </Link>
          </div>
        </div>

        <div><strong>Shop:</strong> {data.shopName ?? "(unknown)"}</div>
        <div><strong>Domain:</strong> {data.myshopifyDomain ?? "(unknown)"}</div>
        <div><strong>Billing Country:</strong> {data.countryCode ?? "(unknown)"}</div>
        <div><strong>Billing Province:</strong> {data.provinceCode ?? "(unknown)"}</div>
        <div>
          <strong>Compliance Province (Metafield):</strong>{" "}
          {jurisdiction ?? "(not set)"}
        </div>

        <div style={{ marginTop: 12 }}>
          <span
            style={{
              display: "inline-block",
              padding: "6px 10px",
              borderRadius: 999,
              background: complianceConfigured ? "#d1fae5" : "#fee2e2",
              color: "#111",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {complianceConfigured ? "Compliance configured" : "Compliance NOT configured"}
          </span>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Server time: {data.now}
        </div>
      </div>
    </div>
  );
}
