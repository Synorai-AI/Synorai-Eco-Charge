import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { unsubscribeByToken } from "../lib/rate-alerts.server";

/**
 * One-click unsubscribe target for the EHF rate-change list.
 *
 * The GET itself performs the unsubscribe so the link in an email really is
 * one click, which is what CASL expects and what people assume. The tradeoff
 * is that a link-prefetching mail scanner can trigger it, so the page always
 * offers a way straight back onto the list.
 */

export const meta: MetaFunction = () => [
  { title: "Unsubscribed — Synorai EHF rate alerts" },
  { name: "robots", content: "noindex,nofollow" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const removed = await unsubscribeByToken(token);
  return { removed };
}

const wrap: React.CSSProperties = {
  maxWidth: 620,
  margin: "0 auto",
  padding: "60px 20px 80px",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  color: "#14281d",
  lineHeight: 1.6,
};

export default function RatesUnsubscribePage() {
  const { removed } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  return (
    <main style={wrap}>
      <a href="/" style={{ display: "inline-block", marginBottom: 28 }}>
        <img
          src="/synorai-logo.png"
          alt="Synorai"
          width={433}
          height={99}
          style={{ width: 168, height: "auto", display: "block" }}
        />
      </a>

      {removed ? (
        <>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>You&apos;re unsubscribed</h1>
          <p style={{ fontSize: 17, color: "#3f5a49" }}>
            We won&apos;t email you about EHF rate changes again. The rate
            schedules stay free to read any time.
          </p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>
            We couldn&apos;t find that link
          </h1>
          <p style={{ fontSize: 17, color: "#3f5a49" }}>
            That unsubscribe link is missing or no longer valid — you may have
            already used it. If you keep receiving emails you don&apos;t want,
            reply to any of them or write to{" "}
            <a href="mailto:support@synorai.ai" style={{ color: "#7402FA" }}>
              support@synorai.ai
            </a>{" "}
            and we&apos;ll remove you by hand.
          </p>
        </>
      )}

      <p style={{ fontSize: 15, marginTop: 30 }}>
        <a href="/rates#alerts" style={{ color: "#7402FA", fontWeight: 600 }}>
          {removed ? "Changed your mind? Re-subscribe" : "Back to the EHF rates"}
        </a>
      </p>
    </main>
  );
}
