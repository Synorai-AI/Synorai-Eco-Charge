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

const LOGO = (
  <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
    <path fill="#57c040" d="M7.74,4.52c0-.15.12-.26.28-.26s.28.12.28.26v.46c.31.02.66.09.98.22.19.07.44.2.44.5,0,.27-.21.49-.5.49-.16,0-.29-.08-.49-.15-.18-.06-.4-.15-.7-.15-.53,0-.77.16-.77.45,0,.19.17.34.42.45.59.25,1.2.29,1.69.66.33.24.52.56.52,1.05,0,.86-.66,1.41-1.59,1.53v.45c0,.15-.12.26-.28.26s-.28-.12-.28-.26v-.43c-.41-.02-.84-.12-1.18-.27-.29-.12-.45-.28-.45-.52,0-.28.23-.49.51-.49.18,0,.29.09.51.21.18.09.42.19.81.19.63,0,.79-.31.79-.56,0-.24-.17-.39-.43-.49-.41-.18-.97-.27-1.43-.53-.4-.22-.73-.56-.73-1.22,0-.72.57-1.25,1.61-1.34v-.47Z"/>
    <g fill="#57c040">
      <path d="M4.27,14.19c.23.25.51.49.74.66.09,0,1.27,0,1.36,0-.81-.64-.3-.23-.97-.76-.45-.35-.43-1,0-1.34.7-.56.27-.2.97-.75-.95,0-2.55.2-3.21-1.25-.14,1.05.19,2.41,1.11,3.44Z"/>
      <path d="M3.23,8.71c.47-.79.26-.42.82-1.39l.77.43c.23.12.47-.06.43-.29,0-.01-.57-3.62-.57-3.62-.03-.19-.23-.29-.39-.22,0,0-2.51.96-3.49,1.33-.24.09-.25.4-.04.51l.76.43c-.37.62-.19.32-.83,1.39-.93,1.56-.93,3.5,0,5.06.72,1.21,1.91,2.06,3.27,2.38-1.6-1.63-1.86-4.12-.73-6.01Z"/>
      <path d="M9.95,3.95c.79,1.32.16.26.83,1.39l-.77.43c-.21.12-.2.42.04.51.26.1,3.23,1.23,3.49,1.33.17.07.37-.04.39-.22.37-2.54.22-1.43.57-3.62.04-.23-.2-.41-.43-.29l-.76.43c-.37-.62-.19-.31-.82-1.39C11.57.96,9.85,0,8,0,6.58,0,5.22.58,4.25,1.57c2.17-.51,4.48.36,5.7,2.38Z"/>
      <path d="M3.6,2.38c-.07.11-.61,1.02-.68,1.14.53-.2.8-.3,1.15-.44.51-.2,1.1.12,1.19.67.06.38.02.14.19,1.2l.6-1.01c.5-.85,1.54-1.19,2.12-1.08-1.23-.9-2.87-1.16-4.57-.49Z"/>
      <path d="M15.61,8.87c-.77,1.85-2.67,3.13-4.79,3.13-1.96,0-1.19,0-1.65,0,0-.51,0,.33,0-.86,0-.25-.29-.37-.47-.23-.62.48-1.66,1.27-2.93,2.29-.15.12-.15.33,0,.45.38.3,2.05,1.61,2.93,2.29.2.15.47,0,.47-.22v-.86h1.65c1.84,0,3.56-.97,4.49-2.53.72-1.21.88-2.65.48-3.95-.05.17-.11.33-.18.49Z"/>
      <path d="M13.55,10.55c.71-.51,1.3-1.26,1.62-2.18.1-.29.18-.65.21-.94-.1-.18-.57-.96-.68-1.15-.05.34-.13.84-.19,1.21-.08.52-.63.88-1.19.67-.36-.14-.09-.04-1.15-.44.49.84,1.45,2.08.49,3.34.26-.1.57-.27.89-.5Z"/>
    </g>
  </svg>
);

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
      {/* Hero */}
      <section
        style={{
          background: "linear-gradient(135deg,#0b3d2e 0%,#14532d 55%,#166534 100%)",
          color: "#fff",
          padding: "64px 20px 72px",
        }}
      >
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: "#fff",
                padding: 6,
                flexShrink: 0,
              }}
            >
              {LOGO}
            </div>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 0.3 }}>
              Synorai
            </span>
          </div>

          <h1
            style={{
              fontSize: 42,
              lineHeight: 1.15,
              margin: "34px 0 14px",
              maxWidth: 720,
              fontWeight: 800,
            }}
          >
            Practical software, built with{" "}
            <span style={{ color: "#4ade80" }}>privacy at its core</span>.
          </h1>
          <p style={{ fontSize: 19, color: "#bbf7d0", maxWidth: 640, margin: 0 }}>
            Synorai builds compliance and automation tools for small
            businesses — made in Airdrie, Alberta, by people who run one.
          </p>
        </div>
      </section>

      {/* Product */}
      <section style={{ padding: "48px 20px 8px", background: "#f6faf7" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#3a6b4d",
              letterSpacing: 1,
              margin: "0 0 10px",
            }}
          >
            OUR SOFTWARE
          </p>

          <div
            style={{
              background: "#fff",
              border: "1px solid #d8eadd",
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
      <section style={{ padding: "24px 20px 48px", background: "#f6faf7" }}>
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
                border: "1px solid #d8eadd",
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
          borderTop: "1px solid #e3efe7",
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
            color: "#5b7263",
          }}
        >
          <span>© 2026 Synorai Inc. · Airdrie, Alberta, Canada</span>
          <span>
            <a href="mailto:support@synorai.ai" style={{ color: "#166534" }}>
              support@synorai.ai
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}
