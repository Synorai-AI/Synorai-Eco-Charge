import { describe, test, expect } from "vitest";

import {
  computeExpectedFees,
  dollarsToCents,
  normalizeDestination,
  parseFeeLineTitle,
  splitOrderLines,
} from "../../../app/lib/remittance";
import { PROVINCE_CONFIG, formatCartFeeLineTitle } from "../../../app/lib/eco-fees";

describe("remittance math", () => {
  test("parses fee line titles for every province/category with a fee", () => {
    expect(parseFeeLineTitle(formatCartFeeLineTitle("AB", "laptops"))).toEqual({
      province: "AB",
      category: "laptops",
    });
    expect(parseFeeLineTitle(formatCartFeeLineTitle("QC", "display-xxlarge"))).toEqual({
      province: "QC",
      category: "display-xxlarge",
    });
    expect(parseFeeLineTitle("Some Regular Product")).toBeNull();
    expect(parseFeeLineTitle(null)).toBeNull();
  });

  test("splits an order into charged fees and merchandise", () => {
    const { chargedFees, merchandise } = splitOrderLines([
      {
        productId: 1,
        title: "Lenovo ThinkPad T480",
        variantTitle: null,
        quantity: 2,
        unitPriceCents: 39999,
      },
      {
        productId: 2,
        title: "Environmental Fee",
        variantTitle: formatCartFeeLineTitle("AB", "laptops"),
        quantity: 2,
        unitPriceCents: 30,
      },
    ]);

    expect(merchandise).toHaveLength(1);
    expect(chargedFees).toEqual([
      {
        province: "AB",
        category: "laptops",
        quantity: 2,
        unitCents: 30,
        totalCents: 60,
      },
    ]);
  });

  test("computes expected fees for the destination province", () => {
    const { lines, totalCents } = computeExpectedFees(
      [
        { quantity: 2, tags: ["eco-category-laptops", "REFURBISHED"] },
        { quantity: 1, tags: ["eco-category-display-xxlarge"] },
        { quantity: 3, tags: [] }, // untagged: no fee
      ],
      "BC",
    );

    const bcLaptop = Math.round(PROVINCE_CONFIG.BC.feeByCategory.laptops * 100);
    const bcXXL = Math.round(
      PROVINCE_CONFIG.BC.feeByCategory["display-xxlarge"] * 100,
    );

    expect(totalCents).toBe(bcLaptop * 2 + bcXXL);
    expect(lines).toHaveLength(2);
  });

  test("expected fees group same-category lines", () => {
    const { lines } = computeExpectedFees(
      [
        { quantity: 1, tags: ["eco-category-laptops"] },
        { quantity: 4, tags: ["eco-category-laptops"] },
      ],
      "SK",
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
  });

  test("normalizes destinations", () => {
    expect(
      normalizeDestination({ province_code: "bc", country_code: "ca" }),
    ).toEqual({ country: "CA", rawProvince: "BC", province: "BC" });

    expect(
      normalizeDestination({ province_code: "WA", country_code: "US" }),
    ).toEqual({ country: "US", rawProvince: "WA", province: null });

    // ON has no regulated program: destination recorded, no expected schedule.
    expect(
      normalizeDestination({ province_code: "ON", country_code: "CA" }).province,
    ).toBeNull();

    expect(normalizeDestination(null).country).toBeNull();
  });

  test("dollar strings convert to cents safely", () => {
    expect(dollarsToCents("0.30")).toBe(30);
    expect(dollarsToCents("1249.00")).toBe(124900);
    expect(dollarsToCents(null)).toBe(0);
    expect(dollarsToCents("garbage")).toBe(0);
  });
});
