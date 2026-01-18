import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");

  // If Shopify is trying to load the embedded app, it will include host/shop.
  // Redirect to the actual embedded shell route (/app).
  if (shop || host || embedded) {
    const next = new URL(url.toString());
    next.pathname = "/app";
    return redirect(next.pathname + next.search);
  }

  // Otherwise, allow root to act as a simple health/landing page (useful for Render)
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
