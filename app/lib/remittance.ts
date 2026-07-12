import {
  ALLOWED_PROVINCES,
  CATEGORY_LABEL_MAP,
  PROVINCE_CONFIG,
  formatCartFeeLineTitle,
  normalizeProvinceCode,
  resolveHighestFeeCategoryFromTags,
  type NormalizedCategory,
  type ProvinceCode,
} from "./eco-fees";

/**
 * Pure remittance math shared by the orders/paid webhook and tests.
 * Everything here works on plain data — no Prisma, no Admin API.
 */

export type OrderLineInput = {
  productId: number | null;
  title: string | null;
  variantTitle: string | null;
  quantity: number;
  unitPriceCents: number;
};

export type ChargedFeeLine = {
  province: ProvinceCode;
  category: NormalizedCategory;
  quantity: number;
  unitCents: number;
  totalCents: number;
};

export type ExpectedFeeLine = {
  category: NormalizedCategory;
  quantity: number;
  unitCents: number;
  totalCents: number;
};

let feeTitleIndex: Map<string, { province: ProvinceCode; category: NormalizedCategory }> | null =
  null;

function getFeeTitleIndex() {
  if (!feeTitleIndex) {
    feeTitleIndex = new Map();
    for (const province of ALLOWED_PROVINCES) {
      for (const category of Object.keys(CATEGORY_LABEL_MAP) as NormalizedCategory[]) {
        feeTitleIndex.set(formatCartFeeLineTitle(province, category), {
          province,
          category,
        });
      }
    }
  }
  return feeTitleIndex;
}

/** Match an order line's variant/product title to a fee variant title. */
export function parseFeeLineTitle(
  title: string | null | undefined,
): { province: ProvinceCode; category: NormalizedCategory } | null {
  const trimmed = typeof title === "string" ? title.trim() : "";
  if (!trimmed) return null;
  return getFeeTitleIndex().get(trimmed) ?? null;
}

export function splitOrderLines(lines: OrderLineInput[]): {
  chargedFees: ChargedFeeLine[];
  merchandise: OrderLineInput[];
} {
  const chargedFees: ChargedFeeLine[] = [];
  const merchandise: OrderLineInput[] = [];

  for (const line of lines) {
    const parsed =
      parseFeeLineTitle(line.variantTitle) ?? parseFeeLineTitle(line.title);

    if (parsed) {
      chargedFees.push({
        province: parsed.province,
        category: parsed.category,
        quantity: line.quantity,
        unitCents: line.unitPriceCents,
        totalCents: line.unitPriceCents * line.quantity,
      });
    } else {
      merchandise.push(line);
    }
  }

  return { chargedFees, merchandise };
}

/**
 * What EHF is owed for these merchandise lines if the order lands in
 * `destination`. Tags come from the Admin API (order payloads don't include
 * them). Lines whose tags are unknown contribute nothing — the caller decides
 * whether the result is trustworthy via `tagsResolved`.
 */
export function computeExpectedFees(
  merchandise: Array<{ quantity: number; tags: string[] }>,
  destination: ProvinceCode,
): { lines: ExpectedFeeLine[]; totalCents: number } {
  const feeByCategory = PROVINCE_CONFIG[destination].feeByCategory;
  const grouped = new Map<NormalizedCategory, ExpectedFeeLine>();

  for (const line of merchandise) {
    const resolved = resolveHighestFeeCategoryFromTags(
      line.tags.map((tag) => ({ tag, hasTag: true })),
      feeByCategory,
    );
    if (!resolved) continue;

    const unitCents = Math.round(resolved.fee * 100);
    const existing = grouped.get(resolved.category);

    if (existing) {
      existing.quantity += line.quantity;
      existing.totalCents += unitCents * line.quantity;
    } else {
      grouped.set(resolved.category, {
        category: resolved.category,
        quantity: line.quantity,
        unitCents,
        totalCents: unitCents * line.quantity,
      });
    }
  }

  const lines = Array.from(grouped.values());
  return {
    lines,
    totalCents: lines.reduce((sum, l) => sum + l.totalCents, 0),
  };
}

export function normalizeDestination(shippingAddress: {
  province_code?: string | null;
  country_code?: string | null;
} | null | undefined): {
  country: string | null;
  province: ProvinceCode | null;
  rawProvince: string | null;
} {
  const country =
    typeof shippingAddress?.country_code === "string"
      ? shippingAddress.country_code.trim().toUpperCase()
      : null;
  const rawProvince =
    typeof shippingAddress?.province_code === "string"
      ? shippingAddress.province_code.trim().toUpperCase()
      : null;

  return {
    country,
    rawProvince,
    province: country === "CA" ? normalizeProvinceCode(rawProvince) : null,
  };
}

export function dollarsToCents(value: string | number | null | undefined): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}
