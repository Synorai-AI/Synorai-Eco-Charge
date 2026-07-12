import { authenticate } from "./shopify.server";
import db from "./db.server";

/**
 * Compliance (GDPR/privacy) webhook handler.
 *
 * Data inventory for these topics: the app stores NO customer-level data.
 * EhfOrderRecord holds destination province/country codes, order numbers,
 * and fee amounts — nothing identifying a person. Session rows are merchant
 * staff auth, managed by the Shopify library.
 */
export async function handleWebhook(request: Request) {
  const { topic, shop } = await authenticate.webhook(request);

  console.log("📩 Compliance webhook received:", topic, shop);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // Nothing to return: no customer-level data is stored.
      break;

    case "CUSTOMERS_REDACT":
      // Nothing to delete: order records contain no customer identifiers.
      break;

    case "SHOP_REDACT":
      // Shop uninstalled 48h+ ago — purge everything we hold for it.
      await db.ehfOrderRecord.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      break;

    default:
      break;
  }

  return new Response("OK", { status: 200 });
}
