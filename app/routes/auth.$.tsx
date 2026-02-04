import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate, registerWebhooks } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Ensure mandatory compliance webhooks are registered after install/auth
  await registerWebhooks({ session });

  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
