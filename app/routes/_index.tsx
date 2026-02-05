import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // If Shopify is loading the embedded app, it will include shop/host (and often embedded=1).
  // DO NOT use React Router's redirect() here — let Shopify's auth helper do the correct
  // top-level redirect / headers so the iframe handshake doesn't break.
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");

  if (shop || host || embedded) {
    // This will either:
    // - redirect to /auth if needed, or
    // - return the correct embedded response/headers so Admin can load /app properly.
    await authenticate.admin(request);
  }

  // Keep "/" as a simple health page for Render pings.
  return null;
}

export default function Index() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Synorai EcoCharge backend is running ✅</h1>
      <p>This is the backend for the Synorai EcoCharge Shopify app.</p>
      <p>
        Use <code>/app</code> for the embedded admin UI, or start install flow at{" "}
        <code>/auth?shop=&lt;your-store&gt;.myshopify.com</code>.
      </p>
    </div>
  );
}
