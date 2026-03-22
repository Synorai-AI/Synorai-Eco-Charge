export const ALLOWED_PROVINCES = ["AB", "BC", "SK"] as const;

export type ProvinceCode = typeof ALLOWED_PROVINCES[number];

export type NormalizedCategory =
  | "computers"
  | "laptops"
  | "printers"
  | "peripherals"
  | "av"
  | "cellphones"
  | "display-small"
  | "display-large"
  | "display-xlarge"
  | "all-in-one"
  | "small-appliances"
  | "tools";

export type TagState = {
  tag: string;
  hasTag: boolean;
};

export type ProvinceConfig = {
  enabled: boolean;
  label: string;
  feeByCategory: Record<NormalizedCategory, number>;
};

export const TAG_CATEGORY_MAP: Record<string, NormalizedCategory> = {
  // Computers
  "eco-category-computers": "computers",
  "eco-category-laptops": "laptops",
  "eco-category-printers": "printers",
  "eco-category-peripherals": "peripherals",
  "eco-category-av": "av",
  "eco-category-cellphones": "cellphones",

  // Displays (new)
  "eco-category-display-small": "display-small",
  "eco-category-display-large": "display-large",
  "eco-category-display-xlarge": "display-xlarge",
  "eco-category-all-in-one": "all-in-one",

  // Displays (legacy aliases)
  "eco-category-monitor-small": "display-small",
  "eco-category-monitor-large": "display-large",
  "eco-category-monitor-xlarge": "display-xlarge",

  // Other
  "eco-category-small-appliances": "small-appliances",
  "eco-category-tools": "tools",
};

export const CATEGORY_LABEL_MAP: Record<NormalizedCategory, string> = {
  computers: "Computers",
  laptops: "Laptops",
  printers: "Printers",
  peripherals: "Peripherals",
  av: "AV / Telecom",
  cellphones: "Cellphones",
  "display-small": 'Display under 30"',
  "display-large": 'Display 30" to 45"',
  "display-xlarge": 'Display 46"+',
  "all-in-one": "All-in-One",
  "small-appliances": "Small Appliances",
  tools: "Tools / Lawn / Garden",
};

export const PROVINCE_CONFIG: Record<ProvinceCode, ProvinceConfig> = {
  AB: {
    enabled: true,
    label: "AB Environmental Fee",
    feeByCategory: {
      computers: 0.45,
      laptops: 0.30,
      printers: 1.65,
      peripherals: 0,
      av: 0.55,
      cellphones: 0,
      "display-small": 1.30,
      "display-large": 1.30,
      "display-xlarge": 2.75,
      "all-in-one": 1.30,
      "small-appliances": 0.40,
      tools: 0.65,
    },
  },

  BC: {
    enabled: true,
    label: "BC Environmental Fee",
    feeByCategory: {
      computers: 0.70,
      laptops: 0.45,
      printers: 6.50,
      peripherals: 0.35,
      av: 2.80,
      cellphones: 0.20,
      "display-small": 3.50,
      "display-large": 4.50,
      "display-xlarge": 7.75,
      "all-in-one": 3.50,
      "small-appliances": 0,
      tools: 0,
    },
  },

  SK: {
    enabled: true,
    label: "SK Environmental Fee",
    feeByCategory: {
      computers: 0.80,
      laptops: 0.45,
      printers: 4.50,
      peripherals: 0.20,
      av: 1.25,
      cellphones: 0,
      "display-small": 1.80,
      "display-large": 3.10,
      "display-xlarge": 7.00,
      "all-in-one": 1.80,
      "small-appliances": 0,
      tools: 0,
    },
  },
};

export function isProvinceCode(value: string): value is ProvinceCode {
  return (ALLOWED_PROVINCES as readonly string[]).includes(value);
}

export function normalizeProvinceCode(value: unknown): ProvinceCode | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return isProvinceCode(trimmed) ? trimmed : null;
}

export function getProvinceConfig(
  provinceCode: ProvinceCode | null | undefined,
): ProvinceConfig | null {
  if (!provinceCode) return null;
  return PROVINCE_CONFIG[provinceCode] ?? null;
}

export function getCategoryForTag(tag: string): NormalizedCategory | null {
  return TAG_CATEGORY_MAP[tag] ?? null;
}

export function getReadableCategoryLabel(
  category: NormalizedCategory,
): string {
  return CATEGORY_LABEL_MAP[category];
}

export function getFeeForCategory(
  provinceCode: ProvinceCode,
  category: NormalizedCategory,
): number {
  return PROVINCE_CONFIG[provinceCode]?.feeByCategory?.[category] ?? 0;
}

export function getCategoryFeeEntriesForProvince(provinceCode: ProvinceCode): {
  category: NormalizedCategory;
  fee: number;
  label: string;
}[] {
  const config = PROVINCE_CONFIG[provinceCode];

  return (Object.keys(config.feeByCategory) as NormalizedCategory[]).map(
    (category) => ({
      category,
      fee: config.feeByCategory[category] ?? 0,
      label: CATEGORY_LABEL_MAP[category],
    }),
  );
}

export function resolveHighestFeeCategoryFromTags(
  ecoCategoryTags: TagState[] | undefined,
  feeByCategory: Record<NormalizedCategory, number>,
): { category: NormalizedCategory; fee: number } | null {
  if (!ecoCategoryTags?.length) return null;

  let bestCategory: NormalizedCategory | null = null;
  let bestFee = 0;

  for (const tagState of ecoCategoryTags) {
    if (!tagState.hasTag) continue;

    const normalizedCategory = TAG_CATEGORY_MAP[tagState.tag];
    if (!normalizedCategory) continue;

    const fee = feeByCategory[normalizedCategory];
    if (typeof fee !== "number") continue;

    if (fee > bestFee) {
      bestFee = fee;
      bestCategory = normalizedCategory;
    }
  }

  if (!bestCategory || bestFee <= 0) {
    return null;
  }

  return {
    category: bestCategory,
    fee: bestFee,
  };
}

export function computeEcoFeePerUnit(
  ecoCategoryTags: TagState[] | undefined,
  feeByCategory: Record<NormalizedCategory, number>,
): number {
  const resolved = resolveHighestFeeCategoryFromTags(
    ecoCategoryTags,
    feeByCategory,
  );

  return resolved?.fee ?? 0;
}

export function formatFeeSuffix(label: string, fee: number): string {
  return `♻️ ${label}: +$${fee.toFixed(2)} per unit`;
}

export function formatCartFeeLineTitle(
  provinceCode: ProvinceCode,
  category: NormalizedCategory,
): string {
  return `♻️ ${provinceCode} Environmental Fee – ${CATEGORY_LABEL_MAP[category]}`;
}