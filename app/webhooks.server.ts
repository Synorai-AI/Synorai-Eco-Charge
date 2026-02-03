import { authenticate } from "./shopify.server";

export async function handleWebhook(request: Request) {
  const { topic, shop } = await authenticate.webhook(request);

  console.log("📩 Webhook received:", topic, shop);

  return new Response("OK", { status: 200 });
}
