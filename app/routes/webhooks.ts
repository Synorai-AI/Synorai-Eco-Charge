import type { ActionFunctionArgs } from "react-router";
import { handleWebhook } from "../webhooks.server";

// Shopify POSTs webhooks here.
export async function action({ request }: ActionFunctionArgs) {
  try {
    return await handleWebhook(request);
  } catch (err) {
    // If HMAC verification fails or something throws, Shopify expects non-200.
    console.error("❌ Webhook error:", err);
    return new Response("Unauthorized", { status: 401 });
  }
}

// Optional: prevent your browser from showing a scary error on GET /webhooks
export async function loader() {
  return new Response("OK", { status: 200 });
}
