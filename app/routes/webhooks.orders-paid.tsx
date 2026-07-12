import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordPaidOrder } from "../lib/remittance.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") {
    return new Response();
  }

  try {
    await recordPaidOrder({
      shop,
      payload: payload as any,
      admin: admin ?? undefined,
    });
  } catch (error) {
    // Never fail the webhook — Shopify retries and eventually drops the
    // subscription on repeated 5xx. Log and accept.
    console.error(`[remittance] failed to record order for ${shop}`, error);
  }

  return new Response();
};
