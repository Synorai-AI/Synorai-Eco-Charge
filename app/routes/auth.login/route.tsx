import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

type AuthData = {
  errors: ReturnType<typeof loginErrorMessage>;
  initialShop: string;
};

function getShopFromQuery(request: Request): string {
  const url = new URL(request.url);
  const rawShop = url.searchParams.get("shop");

  return typeof rawShop === "string" ? rawShop.trim() : "";
}

async function getSubmittedShop(request: Request): Promise<string> {
  const formData = await request.clone().formData().catch(() => null);
  const rawShop = formData?.get("shop");

  if (typeof rawShop === "string" && rawShop.trim().length > 0) {
    return rawShop.trim();
  }

  return getShopFromQuery(request);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
    initialShop: getShopFromQuery(request),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const initialShop = await getSubmittedShop(request);
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
    initialShop,
  };
};

export default function Auth() {
  const loaderData = useLoaderData() as AuthData;
  const actionData = useActionData() as AuthData | undefined;

  const errors = actionData?.errors ?? loaderData.errors;
  const initialShop = actionData?.initialShop ?? loaderData.initialShop;

  const [shop, setShop] = useState(initialShop);

  useEffect(() => {
    setShop(initialShop);
  }, [initialShop]);

  const hasPrefilledShop = initialShop.length > 0;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
          <s-section heading="Log in">
            <div style={{ display: "grid", gap: "12px" }}>
              <p style={{ margin: 0 }}>
                Shopify can send you here if embedded auth context drops during app
                install, billing approval, or a direct reopen.
              </p>

              {hasPrefilledShop ? (
                <p style={{ margin: 0 }}>
                  Detected store domain: <strong>{initialShop}</strong>
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  Enter your full <strong>.myshopify.com</strong> store domain to
                  continue.
                </p>
              )}

              <s-text-field
                name="shop"
                label="Shop domain"
                details="example.myshopify.com"
                value={shop}
                onChange={(e) => setShop(e.currentTarget.value)}
                autocomplete="on"
                error={errors.shop}
              ></s-text-field>

              <s-button type="submit">Log in</s-button>
            </div>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
