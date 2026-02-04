import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";

import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { authenticate, registerWebhooks } from "../shopify.server";

type LoaderData = {
  shop: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  console.log("[webhooks] registering for shop:", session.shop);
  const result = await registerWebhooks({ session });
  console.log("[webhooks] register result:", result);

  return { shop: session.shop };
}

  // Register mandatory compliance webhooks after install/auth
  await registerWebhooks({ session });

  const data: LoaderData = {
    shop: session.shop,
  };

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
