import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";

const ALLOWLISTED_DEV_PRO_TEST_SHOPS = new Set([
  "eco-fee-test-store.myshopify.com",
]);

function isAllowlistedDevProTestShop(shopDomain: string): boolean {
  return ALLOWLISTED_DEV_PRO_TEST_SHOPS.has(shopDomain.trim().toLowerCase());
}

type LoaderData = {
  apiKey: string;
  shopDomain: string;
  hasActivePayment: boolean;
  isDevelopmentStore: boolean;
  activeSubscriptionName: string | null;
  isAllowlistedDevProTestStore: boolean;
  canAccessApp: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query AppGateData {
      shop {
        plan {
          partnerDevelopment
        }
      }
      appInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);

  const responseJson = await response.json();

  const isDevelopmentStore =
    responseJson?.data?.shop?.plan?.partnerDevelopment === true;

  const activeSubscriptions: Array<{
    id?: string | null;
    name?: string | null;
    status?: string | null;
  }> = responseJson?.data?.appInstallation?.activeSubscriptions ?? [];

  const activeSubscription =
    activeSubscriptions.find(
      (subscription) =>
        String(subscription?.status || "").toUpperCase() === "ACTIVE",
    ) ?? null;

  const hasActivePayment = Boolean(activeSubscription);

  const activeSubscriptionName =
    typeof activeSubscription?.name === "string" &&
    activeSubscription.name.trim().length > 0
      ? activeSubscription.name.trim()
      : null;

  const shopDomain = session.shop;
  const isAllowlistedDevProTestStore =
    isDevelopmentStore && isAllowlistedDevProTestShop(shopDomain);

  const canAccessApp = hasActivePayment || isAllowlistedDevProTestStore;

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shopDomain,
    hasActivePayment,
    isDevelopmentStore,
    activeSubscriptionName,
    isAllowlistedDevProTestStore,
    canAccessApp,
  };
};

export default function App() {
  const {
    apiKey,
    shopDomain,
    hasActivePayment,
    isDevelopmentStore,
    activeSubscriptionName,
    isAllowlistedDevProTestStore,
    canAccessApp,
  } = useLoaderData() as LoaderData;

  return (
    <ShopifyAppProvider apiKey={apiKey} isEmbeddedApp>
      <PolarisAppProvider i18n={polarisTranslations}>
        {canAccessApp ? (
          <Outlet />
        ) : (
          <div
            style={{
              padding: "2rem",
              maxWidth: "720px",
              margin: "0 auto",
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>
              Synorai EcoCharge
            </h1>

            <div
              style={{
                border: "1px solid #e1e3e5",
                borderRadius: "12px",
                padding: "1.25rem",
                background: "#fff8e1",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
                Subscription required
              </h2>

              <p style={{ marginTop: 0, lineHeight: 1.6 }}>
                Your store does not currently have an active Synorai EcoCharge
                subscription.
              </p>

              {isDevelopmentStore && !isAllowlistedDevProTestStore && (
                <p style={{ lineHeight: 1.6 }}>
                  Development stores also require an active Synorai EcoCharge test
                  subscription before app access is allowed.
                </p>
              )}

              {activeSubscriptionName && (
                <p style={{ lineHeight: 1.6 }}>
                  Detected subscription: <strong>{activeSubscriptionName}</strong>
                </p>
              )}

              <p style={{ lineHeight: 1.6 }}>
                Please approve a Synorai EcoCharge plan in Shopify billing, then
                reload the app and continue setup.
              </p>

              <p style={{ marginBottom: 0, lineHeight: 1.6 }}>
                If billing was just approved, wait a few moments and refresh this
                page.
              </p>

              <p style={{ marginTop: "1rem", marginBottom: 0, lineHeight: 1.6, color: "#6d7175" }}>
                Shop: <strong>{shopDomain}</strong>
              </p>
            </div>
          </div>
        )}
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
