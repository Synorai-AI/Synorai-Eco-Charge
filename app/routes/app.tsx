import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

type LoaderData = {
  apiKey: string;
  hasActivePayment: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query ActiveSubscriptions {
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

  const activeSubscriptions =
    responseJson?.data?.appInstallation?.activeSubscriptions ?? [];

  const hasActivePayment = activeSubscriptions.some(
    (subscription: { status?: string }) => subscription.status === "ACTIVE",
  );

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    hasActivePayment,
  };
};

export default function App() {
  const { apiKey, hasActivePayment } = useLoaderData() as LoaderData;

  return (
    <AppProvider apiKey={apiKey} isEmbeddedApp>
      {hasActivePayment ? (
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

            <p style={{ lineHeight: 1.6 }}>
              Please subscribe to a plan in Shopify billing, then reload the app
              and continue setup.
            </p>

            <p style={{ marginBottom: 0, lineHeight: 1.6 }}>
              If billing was just approved, wait a few moments and refresh this
              page.
            </p>
          </div>
        </div>
      )}
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error();
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};