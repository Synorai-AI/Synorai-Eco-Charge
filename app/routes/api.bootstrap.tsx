import type { LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";

import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  // Pull the best “store jurisdiction” signal.
  // We'll start with shop's primary address via Shop object.
  const result = await admin.graphql(`
    query BootstrapShop {
      shop {
        name
        myshopifyDomain
        primaryDomain {
          host
        }
        billingAddress {
          countryCodeV2
          provinceCode
        }
      }
    }
  `);

  const json = await result.json();

  const shop = json?.data?.shop;
  const billing = shop?.billingAddress;

  const payload = {
    ok: true,
    shopName: shop?.name ?? null,
    myshopifyDomain: shop?.myshopifyDomain ?? null,
    countryCode: billing?.countryCodeV2 ?? null,
    provinceCode: billing?.provinceCode ?? null,
    // AB active flag (we’ll refine rules later)
    abActive: billing?.countryCodeV2 === "CA" && billing?.provinceCode === "AB",
    source: "shop.billingAddress",
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// REQUIRED for auth redirect responses
export const headers = boundary.headers;

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
