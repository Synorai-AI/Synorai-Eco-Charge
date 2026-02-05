import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";

import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";

type LoaderData = {
  apiKey: string;
  shop: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const data: LoaderData = {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  };

  return data;
};

export default function AppLayout() {
  const { apiKey, shop } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <Frame>
          <NavMenu>
            <Link to="/app" rel="home">
              Home
            </Link>
            <Link to="/app/settings">Settings</Link>
          </NavMenu>

          {/* optional debug */}
          <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
            Current shop: {shop}
          </div>

          <Outlet />
        </Frame>
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch thrown responses so auth headers are preserved.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
