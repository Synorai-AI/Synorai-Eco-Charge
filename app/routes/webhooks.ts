import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    // This verifies the Shopify HMAC signature.
    // If invalid, authenticate.webhook will throw.
    const { topic, shop } = await authenticate.webhook(request);

    console.log("📩 Webhook received:", { topic, shop });

    // Mandatory privacy compliance webhooks (must exist even if no-op)
    switch (topic) {
      case "customers/data_request":
        // No-op: EcoCharge does not store customer personal data
        break;
      case "customers/redact":
        // No-op: EcoCharge does not store customer personal data
        break;
      case "shop/redact":
        // No-op: EcoCharge does not store customer personal data
        break;
      default:
        // Accept other topics if Shopify sends them
        break;
    }

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    // IMPORTANT for Shopify automated checks:
    // invalid HMAC should not return 200.
    console.error("❌ Webhook HMAC verification failed:", err?.message ?? err);
    return new Response("Unauthorized", { status: 401 });
  }
}
