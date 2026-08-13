import { describe, test, expect } from "vitest";

import { normalizeDestination } from "../../../app/lib/remittance";
import { normalizeProvinceCode } from "../../../app/lib/eco-fees";

/**
 * Production regression, 2026-08-13: order #4518AC shipped a desktop to
 * Ontario and was filed under ALBERTA with $0.45 owed.
 *
 * Ontario runs no EHF program, so it is deliberately absent from
 * PROVINCE_CONFIG — which makes normalizeProvinceCode("ON") return null. The
 * province fallback triggered on `!destination.province`, could not tell
 * "we don't know where this went" from "we know, and it has no program", and
 * overwrote the real destination with the shop's own province. That inflates
 * what the merchant appears to owe ARMA on goods that left Alberta.
 *
 * These tests pin the distinction the fallback condition now relies on:
 * `province` is null for both cases, `rawProvince` is only null for the
 * genuinely-unknown one.
 */
describe("no-program provinces are known destinations, not unknown ones", () => {
  test("Ontario is not a priceable province code", () => {
    expect(normalizeProvinceCode("ON")).toBeNull();
    expect(normalizeProvinceCode("YT")).toBeNull();
    expect(normalizeProvinceCode("NT")).toBeNull();
    expect(normalizeProvinceCode("NU")).toBeNull();
  });

  test("an Ontario shipment keeps its destination in rawProvince", () => {
    const destination = normalizeDestination({
      province_code: "ON",
      country_code: "CA",
    });

    // Not priceable...
    expect(destination.province).toBeNull();
    // ...but emphatically not unknown. This is what stops the fallback.
    expect(destination.rawProvince).toBe("ON");
    expect(destination.country).toBe("CA");
  });

  test("a genuinely address-less order has no rawProvince either", () => {
    const destination = normalizeDestination(null);

    expect(destination.province).toBeNull();
    expect(destination.rawProvince).toBeNull();
    expect(destination.country).toBeNull();
  });

  test("the fallback condition separates the two cases", () => {
    const needsFallback = (d) =>
      !d.province && !d.rawProvince && (d.country === null || d.country === "CA");

    // #4518AC — Ontario shipment. Must NOT fall back to the shop province.
    expect(
      needsFallback(normalizeDestination({ province_code: "ON", country_code: "CA" })),
    ).toBe(false);

    // A POS sale with no address at all. Must fall back.
    expect(needsFallback(normalizeDestination(null))).toBe(true);

    // A POS sale carrying a billing country but no province. Must fall back —
    // this is the case the previous fix (PR #29) restored.
    expect(
      needsFallback(normalizeDestination({ province_code: null, country_code: "CA" })),
    ).toBe(true);

    // A priceable province is never a fallback case.
    expect(
      needsFallback(normalizeDestination({ province_code: "BC", country_code: "CA" })),
    ).toBe(false);
  });

  test("exports are unaffected — non-CA keeps province null and country set", () => {
    const destination = normalizeDestination({
      province_code: "WA",
      country_code: "US",
    });

    expect(destination.province).toBeNull();
    expect(destination.country).toBe("US");
  });
});
