import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { recordPageView } from "../lib/pageviews.server";

const APP_LISTING_URL = "https://apps.shopify.com/synorai-ecocharge";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const host = data?.canonicalHost ?? "synorai.ai";
  const title = "Synorai — practical software with privacy at its core";
  const description =
    "Synorai builds compliance and automation software for small businesses, starting with Synorai EcoCharge: automatic Canadian EHF eco fees for Shopify electronics retailers.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: `https://${host}/` },
    { tagName: "link", rel: "canonical", href: `https://${host}/` },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // If Shopify is loading the embedded app, it will include shop/host (and
  // often embedded=1). DO NOT use React Router's redirect() here — let
  // Shopify's auth helper do the correct top-level redirect / headers so the
  // iframe handshake doesn't break.
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");

  if (shop || host || embedded) {
    // This will either redirect to /auth if needed, or return the correct
    // embedded response/headers so Admin can load /app properly.
    await authenticate.admin(request);
  } else {
    await recordPageView(request, "/");
  }

  return {
    canonicalHost: process.env.PRIMARY_HOST ?? url.host,
  };
}

const wrap: React.CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  color: "#14281d",
  margin: 0,
};

export default function Index() {
  const { canonicalHost } = useLoaderData() as { canonicalHost: string };
  void canonicalHost;

  return (
    <main style={wrap}>
      {/* Brand header — logo sits on white so the navy wordmark stays legible */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #ecebf5",
          padding: "16px 20px",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <img
            src="/synorai-logo.png"
            alt="Synorai"
            width={433}
            height={99}
            style={{ width: 168, height: "auto", display: "block" }}
          />
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          background:
            "linear-gradient(135deg,#0A0358 0%,#150A6B 55%,#3D0FA8 100%)",
          color: "#fff",
          padding: "68px 20px 76px",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 42,
              lineHeight: 1.15,
              margin: "0 0 16px",
              maxWidth: 720,
              fontWeight: 800,
              letterSpacing: -0.5,
            }}
          >
            Practical software, built with{" "}
            <span style={{ color: "#01D2FC" }}>privacy at its core</span>.
          </h1>
          <p
            style={{
              fontSize: 19,
              color: "#c8c4e8",
              maxWidth: 640,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Synorai builds compliance and automation tools for small
            businesses — made in Alberta, Canada, by people who run one.
          </p>
        </div>
      </section>

      {/* Product */}
      <section style={{ padding: "48px 20px 8px", background: "#f7f7fb" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#5b53a6",
              letterSpacing: 1,
              margin: "0 0 10px",
            }}
          >
            OUR SOFTWARE
          </p>

          <div
            style={{
              background: "#fff",
              border: "1px solid #e4e2f0",
              borderRadius: 14,
              padding: "26px 28px",
              boxShadow: "0 4px 18px rgba(20,40,29,0.06)",
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 26 }}>
              Synorai EcoCharge
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: 16, color: "#3f5a49" }}>
              Automatic Canadian eco fees (EHF) for electronics retailers on
              Shopify. The correct provincial fee is applied in the cart, at
              checkout, and on POS — for all nine provinces with a regulated
              program — with a per-province remittance report at filing time.
            </p>
            <ul
              style={{
                margin: "0 0 20px 20px",
                padding: 0,
                color: "#3f5a49",
                fontSize: 15,
                lineHeight: 1.8,
              }}
            >
              <li>Rates verified against the official ARMA and EPRA schedules</li>
              <li>One-tap eco fees on point of sale for in-store sales</li>
              <li>Remittance report itemized by category, the way programs ask for it</li>
              <li>No customer personal data stored — by design</li>
            </ul>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href={APP_LISTING_URL}
                style={{
                  background: "#166534",
                  color: "#fff",
                  fontWeight: 700,
                  padding: "12px 20px",
                  borderRadius: 999,
                  textDecoration: "none",
                  fontSize: 15,
                }}
              >
                View on the Shopify App Store →
              </a>
              <Link
                to="/rates"
                style={{
                  border: "2px solid #166534",
                  color: "#166534",
                  fontWeight: 700,
                  padding: "10px 20px",
                  borderRadius: 999,
                  textDecoration: "none",
                  fontSize: 15,
                }}
              >
                Free: current EHF rates, all 9 provinces
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: "24px 20px 48px", background: "#f7f7fb" }}>
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {[
            {
              title: "Privacy first",
              body: "Our tools store the minimum data needed to do the job — and no customer personal information, ever.",
            },
            {
              title: "Honest software",
              body: "No inflated claims. Our products do what they say, say what they do, and nothing runs behind your back.",
            },
            {
              title: "Built by operators",
              body: "Synorai grew out of a real computer shop. We build the tools we needed ourselves — then share them.",
            },
          ].map((v) => (
            <div
              key={v.title}
              style={{
                background: "#fff",
                border: "1px solid #e4e2f0",
                borderRadius: 12,
                padding: "18px 20px",
              }}
            >
              <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>{v.title}</h3>
              <p style={{ margin: 0, fontSize: 14.5, color: "#3f5a49", lineHeight: 1.6 }}>
                {v.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #e4e2f0",
          padding: "26px 20px 40px",
          background: "#fff",
        }}
      >
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 14,
            color: "#5f5b7d",
          }}
        >
          <span>© 2026 Synorai Inc. · Alberta, Canada</span>
          <span>
            <a href="mailto:support@synorai.ai" style={{ color: "#7402FA" }}>
              support@synorai.ai
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}
