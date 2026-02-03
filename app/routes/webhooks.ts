import { authenticate } from "../shopify.server";

export const action = async ({ request }: { request: Request }) => {
  // Shopify verifies HMAC automatically here
  const { topic, shop } = await authenticate.webhook(request);

  console.log("📩 Compliance webhook received:", topic, shop);

  // Shopify requires a fast 200 OK response
  return new Response("OK", { status: 200 });
};
