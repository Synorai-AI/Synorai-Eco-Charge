-- Order channel ("pos" / "online") from Shopify's order source_name.
-- Nullable: existing rows predate channel capture and genuinely don't know.
ALTER TABLE "EhfOrderRecord" ADD COLUMN "channel" TEXT;
