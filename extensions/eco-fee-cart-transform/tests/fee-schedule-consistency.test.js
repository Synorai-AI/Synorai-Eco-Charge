import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_PROVINCES,
  PROVINCE_CONFIG,
  PUBLIC_FEE_SCHEDULE_BY_PROVINCE,
  TAG_CATEGORY_MAP,
} from "../../../app/lib/eco-fees";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const STANDARD_EMBED_PATH = resolve(
  repoRoot,
  "extensions/synorai-ecocharge-storefront/blocks/synorai-ecocharge-standard-embed.liquid",
);

describe("fee schedule single source of truth", () => {
  const liquidSource = readFileSync(STANDARD_EMBED_PATH, "utf8");

  test("the storefront embed carries no fee amounts of its own", () => {
    // Fee amounts must only live in PROVINCE_CONFIG (app/lib/eco-fees.ts).
    // The storefront resolves fees from the variant map metafield instead.
    expect(liquidSource).not.toContain("feeByProvince");
  });

  test("the storefront embed tag map matches TAG_CATEGORY_MAP", () => {
    const match = liquidSource.match(/"tagCategoryMap":\s*(\{[^}]*\})/);
    expect(match).not.toBeNull();

    const embeddedTagMap = JSON.parse(match[1]);
    expect(embeddedTagMap).toEqual(TAG_CATEGORY_MAP);
  });

  test("public fee schedule amounts always equal the canonical schedule", () => {
    for (const province of ALLOWED_PROVINCES) {
      for (const entry of PUBLIC_FEE_SCHEDULE_BY_PROVINCE[province]) {
        expect(
          PROVINCE_CONFIG[province].feeByCategory[entry.key],
          `${province}/${entry.key}`,
        ).toBe(entry.fee);
      }
    }
  });

  test("every province defines a fee for every display tier", () => {
    const displayTiers = [
      "display-small",
      "display-large",
      "display-xlarge",
      "display-xxlarge",
    ];

    for (const province of ALLOWED_PROVINCES) {
      for (const tier of displayTiers) {
        const fee = PROVINCE_CONFIG[province].feeByCategory[tier];
        expect(typeof fee, `${province}/${tier}`).toBe("number");
        expect(fee, `${province}/${tier}`).toBeGreaterThan(0);
      }
    }
  });
});
