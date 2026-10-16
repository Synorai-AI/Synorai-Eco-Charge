import type { Config } from "@react-router/dev/config";

// React Router rejects form actions whose Origin header doesn't match the
// request URL. Render terminates TLS in front of react-router-serve, so the
// server sees http:// while the browser sends an https:// Origin, and every
// admin action fails with 400 "Bad Request". Allow the app's own host.
const PRODUCTION_HOST = "eco-fee-automator.onrender.com";

function hostFromEnv(): string | null {
  try {
    return process.env.SHOPIFY_APP_URL
      ? new URL(process.env.SHOPIFY_APP_URL).host
      : null;
  } catch {
    return null;
  }
}

const envHost = hostFromEnv();

export default {
  allowedActionOrigins: [
    PRODUCTION_HOST,
    ...(envHost && envHost !== PRODUCTION_HOST ? [envHost] : []),
  ],
} satisfies Config;
