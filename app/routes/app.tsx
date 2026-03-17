import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

const APP_HANDLE = "synorai-ecocharge";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, redirect, session } = await authenticate.admin(request);

  const { hasActivePayment } = await billing.check();

  const shop = session.shop;
  const storeHandle = shop.replace(".myshopify.com", "");

  if (!hasActivePayment) {
    return redirect(
      `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/pricing_plans`,
      {
        target: "_top",
      },
    );
  }

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function App() {
  return (
    <AppProvider isEmbeddedApp>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error();
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};