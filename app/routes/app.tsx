import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";

import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";

type LoaderData = {
  shop: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Authenticate (this also gives us billing + redirect helpers)
  const { session, billing, redirect } = await authenticate.admin(request);

  // For embedded apps, redirect out to Shopify admin pricing plans if not subscribed
  const { hasActivePayment } = await billing.check();

  if (!hasActivePayment) {
    // IMPORTANT: replace with your actual app handle from the Partner Dashboard / app listing URL
    // Example handle would look like "synorai-ecocharge"
    const appHandle = "synorai-ecocharge";

    const shop = session.shop; // e.g. "cool-shop.myshopify.com"
    const storeHandle = shop.replace(".myshopify.com", "");

    return redirect(
      `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`,
      { target: "_top" }
    );
  }

  const data: LoaderData = { shop: session.shop };
  return data;
}

export default function AppLayout() {
  const { shop } = useLoaderData() as LoaderData;

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <Frame>
        <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
          Current shop: {shop}
        </div>
        <Outlet />
      </Frame>
    </PolarisAppProvider>
  );
}
