import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useRouteError, Link, useLocation } from "react-router";

import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

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
    now: new Date().toISOString(),
  };
}

// REQUIRED: boundary headers for embedded redirects/reauth
export const headers: HeadersFunction = (args) => boundary.headers(args);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export default function AppIndex() {
  const location = useLocation();

  const data = useLoaderData() as {
    ok: boolean;
    shopName: string | null;
    myshopifyDomain: string | null;
    countryCode: string | null;
    provinceCode: string | null;
    jurisdiction: string | null;
    now: string;
  };

  const complianceConfigured = Boolean(data.jurisdiction);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginTop: 0 }}>Synorai EcoCharge</h2>
      <p>Eco-fee compliance configuration</p>

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

          {/* ✅ This is the ONLY correct way for your stack */}
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

        <div><strong>Shop:</strong> {data.shopName ?? "(unknown)"}</div>
        <div><strong>Domain:</strong> {data.myshopifyDomain ?? "(unknown)"}</div>
        <div><strong>Billing Country:</strong> {data.countryCode ?? "(unknown)"}</div>
        <div><strong>Billing Province:</strong> {data.provinceCode ?? "(unknown)"}</div>
        <div>
          <strong>Compliance Province (Metafield):</strong>{" "}
          {data.jurisdiction ?? "(not set)"}
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
