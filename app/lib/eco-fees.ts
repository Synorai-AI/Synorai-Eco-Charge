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

export type PublicFeeScheduleEntry = {
  key: string;
  label: string;
  fee: number;
  note?: string;
};

export const TAG_CATEGORY_MAP: Record<string, NormalizedCategory> = {
  // Computers
  "eco-category-computers": "computers",
  "eco-category-laptops": "laptops",
  "eco-category-printers": "printers",
  "eco-category-peripherals": "peripherals",
  "eco-category-av": "av",
  "eco-category-cellphones": "cellphones",

  // Displays
  "eco-category-display-small": "display-small",
  "eco-category-display-large": "display-large",
  "eco-category-display-xlarge": "display-xlarge",

  // Deprecated standalone all-in-one tag kept only for backward compatibility.
  // Billing should use the display size tiers instead.
  "eco-category-all-in-one": "all-in-one",

  // Legacy display aliases kept temporarily for compatibility.
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
  "display-small": 'Display / All-in-One under 30"',
  "display-large": 'Display / All-in-One 30" to 45"',
  "display-xlarge": 'Display / All-in-One 46"+',
  "all-in-one": "All-in-One (retag with display size)",
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
      "display-large": 2.75,
      "display-xlarge": 2.75,
      "all-in-one": 0,
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
      "display-small": 3.25,
      "display-large": 4.50,
      "display-xlarge": 8.00,
      "all-in-one": 0,
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
      "display-small": 3.50,
      "display-large": 6.00,
      "display-xlarge": 8.00,
      "all-in-one": 0,
      "small-appliances": 0,
      tools: 0,
    },
  },
};

export const PUBLIC_FEE_SCHEDULE_BY_PROVINCE: Record<
  ProvinceCode,
  PublicFeeScheduleEntry[]
> = {
  AB: [
    { key: "computers", label: "Computers and Servers", fee: 0.45 },
    { key: "laptops", label: "Portable Computers", fee: 0.30 },
    {
      key: "printers",
      label: "Printers, Copiers, Scanners, and Fax Machines",
      fee: 1.65,
    },
    { key: "small-appliances", label: "Small Home Appliances", fee: 0.40 },
    { key: "av", label: "AV, Telecom, Toys, and Music", fee: 0.55 },
    {
      key: "tools",
      label: "Tools, Lawn, and Garden Equipment",
      fee: 0.65,
    },
    {
      key: "display-small",
      label: 'Visual Display and All-in-One Devices under 30"',
      fee: 1.30,
      note: "Includes televisions, monitors, and all-in-one devices.",
    },
    {
      key: "display-large",
      label: 'Visual Display and All-in-One Devices 30" and larger',
      fee: 2.75,
    },
  ],

  BC: [
    { key: "computers", label: "Computers and Servers", fee: 0.70 },
    { key: "laptops", label: "Portable Computers", fee: 0.45 },
    {
      key: "printers",
      label: "Printers, Copiers, Scanners, and Fax Machines",
      fee: 6.50,
    },
    { key: "peripherals", label: "Computer Peripherals", fee: 0.35 },
    { key: "av", label: "AV and Telecom Equipment", fee: 2.80 },
    { key: "cellphones", label: "Cellular Devices", fee: 0.20 },
    {
      key: "display-small",
      label: 'Visual Display and All-in-One Devices 29" and smaller',
      fee: 3.25,
      note: "Includes televisions, monitors, and all-in-one devices.",
    },
    {
      key: "display-large",
      label: 'Visual Display and All-in-One Devices 30" to 45"',
      fee: 4.50,
    },
    {
      key: "display-xlarge",
      label: 'Visual Display and All-in-One Devices 46" and larger',
      fee: 8.00,
    },
  ],

  SK: [
    { key: "computers", label: "Computers and Servers", fee: 0.80 },
    { key: "laptops", label: "Portable Computers", fee: 0.45 },
    {
      key: "printers",
      label: "Printers, Copiers, Scanners, and Fax Machines",
      fee: 4.50,
    },
    { key: "peripherals", label: "Computer Peripherals", fee: 0.20 },
    { key: "av", label: "AV and Telecom Equipment", fee: 1.25 },
    {
      key: "display-small",
      label: 'Visual Display and All-in-One Devices 29" and smaller',
      fee: 3.50,
      note: "Includes televisions, monitors, and all-in-one devices.",
    },
    {
      key: "display-large",
      label: 'Visual Display and All-in-One Devices 30" to 45"',
      fee: 6.00,
    },
    {
      key: "display-xlarge",
      label: 'Visual Display and All-in-One Devices 46" and larger',
      fee: 8.00,
    },
  ],
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

export function getPublicFeeScheduleEntries(
  provinceCode: ProvinceCode,
): PublicFeeScheduleEntry[] {
  return PUBLIC_FEE_SCHEDULE_BY_PROVINCE[provinceCode] ?? [];
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
  return `♻️ ${provinceCode} Environmental Fee - ${CATEGORY_LABEL_MAP[category]}`;
}
