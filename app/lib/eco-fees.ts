export const ALLOWED_PROVINCES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "PE",
  "QC",
  "SK",
] as const;

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
  | "display-xxlarge"
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
  "eco-category-display-xxlarge": "display-xxlarge",

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
  // NOTE: label text is baked into live fee product variant titles via
  // formatVariantTitle/parseVariantTitle. Changing an existing label orphans
  // installed variants — add new categories instead of renaming labels.
  "display-xlarge": 'Display / All-in-One 46"+',
  "display-xxlarge": 'Display / All-in-One 65"+',
  "all-in-one": "All-in-One (retag with display size)",
  "small-appliances": "Small Appliances",
  tools: "Tools / Lawn / Garden",
};

/**
 * Canonical EHF schedule. This is the SINGLE source of truth for fee amounts:
 * fee product variant prices, the variant map metafield, the Pro cart
 * transform, and the merchant-facing schedule preview are all derived from it.
 * Do not hardcode fee amounts anywhere else (see docs/fee-schedule.md).
 *
 * Verified against official program schedules on 2026-07-08 (AB/BC/SK) and
 * 2026-07-09 (MB/NB/NL/NS/PE/QC) — see docs/fee-schedule.md for source URLs:
 * - AB: ARMA fee schedule Apr 1, 2025 – Sep 30, 2026 (albertarecycling.ca).
 *   Two display tiers only (<30" / 30"+), so xlarge/xxlarge mirror 30"+.
 * - BC: EPRA-BC Technical Product Listing, updated June 2026.
 * - MB/NB/NL/NS/PE/QC/SK: EPRA Product Definitions, revised June 2026
 *   (recyclemyelectronics.ca per province). SK has no cellular category.
 *
 * Display tiers: display-small ≤29", display-large 30"–45",
 * display-xlarge 46"–64", display-xxlarge 65"+ (all EPRA provinces).
 *
 * Scope note: NB/NL/NS/PE added Phase 3 appliance categories in Jan 2026
 * (personal care, kitchen countertop, etc.). Our single small-appliances
 * category cannot represent those granular schedules, so appliance fees
 * remain 0 outside AB for now — electronics categories only.
 */
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
      "display-xxlarge": 2.75,
      "all-in-one": 0,
      "small-appliances": 0.40,
      tools: 0.65,
    },
  },

  BC: {
    enabled: true,
    label: "BC Environmental Fee",
    feeByCategory: {
      computers: 0.85,
      laptops: 0.50,
      printers: 6.95,
      peripherals: 0.55,
      av: 3.50,
      cellphones: 0.20,
      "display-small": 4.95,
      "display-large": 6.80,
      "display-xlarge": 11.00,
      "display-xxlarge": 13.85,
      "all-in-one": 0,
      "small-appliances": 0,
      tools: 0,
    },
  },

  MB: {
    enabled: true,
    label: "MB Environmental Fee",
    feeByCategory: {
      computers: 0.80,
      laptops: 0.45,
      printers: 4.50,
      peripherals: 0.20,
      av: 1.25,
      cellphones: 0.10,
      "display-small": 1.80,
      "display-large": 3.10,
      "display-xlarge": 7.00,
      "display-xxlarge": 8.85,
      "all-in-one": 0,
      "small-appliances": 0,
      tools: 0,
    },
  },

  NB: {
    enabled: true,
    label: "NB Environmental Fee",
    feeByCategory: {
      computers: 1.20,
      laptops: 0.65,
      printers: 6.75,
      peripherals: 0.50,
      av: 3.75,
      cellphones: 0.20,
      "display-small": 5.00,
      "display-large": 7.05,
      "display-xlarge": 14.25,
      "display-xxlarge": 17.95,
      "all-in-one": 0,
      "small-appliances": 0,
      tools: 0,
    },
  },

  NL: {
    enabled: true,
    label: "NL Environmental Fee",
    feeByCategory: {
      computers: 1.20,
      laptops: 0.60,
      printers: 6.50,
      peripherals: 0.45,
      av: 3.75,
      cellphones: 0.25,
      "display-small": 5.95,
      "display-large": 9.05,
      "display-xlarge": 17.10,
      "display-xxlarge": 21.55,
      "all-in-one": 0,
      "small-appliances": 0,
      tools: 0,
    },
  },

  NS: {
    enabled: true,
    label: "NS Environmental Fee",
    feeByCategory: {
      computers: 0.80,
      laptops: 0.40,
      printers: 5.25,
      peripherals: 0.25,
      av: 2.25,
      cellphones: 0.11,
      "display-small": 3.00,
      "display-large": 5.50,
      "display-xlarge": 10.50,
      "display-xxlarge": 13.25,
      "all-in-one": 0,
      "small-appliances": 0,
      tools: 0,
    },
  },

  PE: {
    enabled: true,
    label: "PE Environmental Fee",
    feeByCategory: {
      computers: 0.80,
      laptops: 0.40,
      printers: 5.25,
      peripherals: 0.25,
      av: 2.25,
      cellphones: 0.11,
      "display-small": 3.00,
      "display-large": 5.50,
      "display-xlarge": 10.50,
      "display-xxlarge": 13.25,
      "all-in-one": 0,
      "small-appliances": 0,
      tools: 0,
    },
  },

  QC: {
    enabled: true,
    label: "QC Environmental Fee",
    feeByCategory: {
      computers: 1.00,
      laptops: 0.60,
      printers: 7.25,
      peripherals: 0.55,
      av: 3.75,
      cellphones: 0.20,
      "display-small": 5.50,
      "display-large": 8.50,
      "display-xlarge": 16.75,
      "display-xxlarge": 21.10,
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
      "display-small": 1.80,
      "display-large": 3.10,
      "display-xlarge": 7.00,
      "display-xxlarge": 8.85,
      "all-in-one": 0,
      "small-appliances": 0,
      tools: 0,
    },
  },
};

type PublicScheduleRow = {
  key: NormalizedCategory;
  label: string;
  note?: string;
};

// Shared row set for the EPRA provinces that all use the same electronics
// category structure (fees still come from each province's PROVINCE_CONFIG).
const EPRA_STANDARD_ROWS: PublicScheduleRow[] = [
  { key: "computers", label: "Computers and Servers" },
  { key: "laptops", label: "Portable Computers" },
  {
    key: "printers",
    label: "Printers, Copiers, Scanners, and Fax Machines",
  },
  { key: "peripherals", label: "Computer Peripherals" },
  { key: "av", label: "AV and Telecom Equipment" },
  { key: "cellphones", label: "Cellular Devices" },
  {
    key: "display-small",
    label: 'Visual Display and All-in-One Devices 29" and smaller',
    note: "Includes televisions, monitors, and all-in-one devices.",
  },
  {
    key: "display-large",
    label: 'Visual Display and All-in-One Devices 30" to 45"',
  },
  {
    key: "display-xlarge",
    label: 'Visual Display and All-in-One Devices 46" to 64"',
  },
  {
    key: "display-xxlarge",
    label: 'Visual Display and All-in-One Devices 65" and larger',
  },
];

const PUBLIC_FEE_SCHEDULE_ROWS: Record<ProvinceCode, PublicScheduleRow[]> = {
  MB: EPRA_STANDARD_ROWS,
  NB: EPRA_STANDARD_ROWS,
  NL: EPRA_STANDARD_ROWS,
  NS: EPRA_STANDARD_ROWS,
  PE: EPRA_STANDARD_ROWS,
  QC: EPRA_STANDARD_ROWS,

  AB: [
    { key: "computers", label: "Computers and Servers" },
    { key: "laptops", label: "Portable Computers" },
    {
      key: "printers",
      label: "Printers, Copiers, Scanners, and Fax Machines",
    },
    { key: "small-appliances", label: "Small Home Appliances" },
    { key: "av", label: "AV, Telecom, Toys, and Music" },
    { key: "tools", label: "Tools, Lawn, and Garden Equipment" },
    {
      key: "display-small",
      label: 'Visual Display and All-in-One Devices under 30"',
      note: "Includes televisions, monitors, and all-in-one devices.",
    },
    {
      key: "display-large",
      label: 'Visual Display and All-in-One Devices 30" and larger',
    },
  ],

  BC: [
    { key: "computers", label: "Computers and Servers" },
    { key: "laptops", label: "Portable Computers" },
    {
      key: "printers",
      label: "Printers, Copiers, Scanners, and Fax Machines",
    },
    { key: "peripherals", label: "Computer and Gaming Peripherals" },
    { key: "av", label: "Home AV, Gaming, and Telecom Equipment" },
    { key: "cellphones", label: "Cellular Devices" },
    {
      key: "display-small",
      label: 'Visual Display and All-in-One Devices 29" and smaller',
      note: "Includes televisions, monitors, and all-in-one devices.",
    },
    {
      key: "display-large",
      label: 'Visual Display and All-in-One Devices 30" to 45"',
    },
    {
      key: "display-xlarge",
      label: 'Visual Display and All-in-One Devices 46" to 64"',
    },
    {
      key: "display-xxlarge",
      label: 'Visual Display and All-in-One Devices 65" and larger',
    },
  ],

  SK: [
    { key: "computers", label: "Computers and Servers" },
    { key: "laptops", label: "Portable Computers" },
    {
      key: "printers",
      label: "Printers, Copiers, Scanners, and Fax Machines",
    },
    { key: "peripherals", label: "Computer Peripherals" },
    { key: "av", label: "AV and Telecom Equipment" },
    {
      key: "display-small",
      label: 'Visual Display and All-in-One Devices 29" and smaller',
      note: "Includes televisions, monitors, and all-in-one devices.",
    },
    {
      key: "display-large",
      label: 'Visual Display and All-in-One Devices 30" to 45"',
    },
    {
      key: "display-xlarge",
      label: 'Visual Display and All-in-One Devices 46" to 64"',
    },
    {
      key: "display-xxlarge",
      label: 'Visual Display and All-in-One Devices 65" and larger',
    },
  ],
};

// Fee amounts are looked up from PROVINCE_CONFIG so the public schedule can
// never drift from what the app actually charges.
export const PUBLIC_FEE_SCHEDULE_BY_PROVINCE: Record<
  ProvinceCode,
  PublicFeeScheduleEntry[]
> = Object.fromEntries(
  ALLOWED_PROVINCES.map((province) => [
    province,
    PUBLIC_FEE_SCHEDULE_ROWS[province].map((row) => ({
      key: row.key,
      label: row.label,
      fee: PROVINCE_CONFIG[province].feeByCategory[row.key] ?? 0,
      ...(row.note ? { note: row.note } : {}),
    })),
  ]),
) as Record<ProvinceCode, PublicFeeScheduleEntry[]>;

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
