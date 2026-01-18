import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";

import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";

type LoaderData = {
  shop: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const data: LoaderData = {
    shop: session.shop,
  };

  return data;
}

export default function AppLayout() {
  // Keeps the loader “used” and gives you a handy sanity check for store switching.
  const { shop } = useLoaderData() as LoaderData;

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <Frame>
        {/* Optional debug: remove later */}
        <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
          Current shop: {shop}
        </div>

        <Outlet />
      </Frame>
    </PolarisAppProvider>
  );
}
