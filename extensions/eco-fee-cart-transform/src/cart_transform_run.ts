import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = { operations: [] };

type ProvinceCode =
  | "AB" | "BC" | "SK"
  | "MB" | "ON" | "QC" | "NS" | "NB" | "NL" | "PE"
  | "NT" | "NU" | "YT";

type ProvinceConfig = {
  enabled: boolean;
  label: string;
  feeByCategory: Record<NormalizedCategory, number>;
};

/**
 * Internal normalized categories.
 * Merchants may use multiple tag aliases that resolve to one category.
 */
type NormalizedCategory =
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

/**
 * Tag → normalized category mapping.
 * Supports legacy monitor tags AND new display tags.
 */
const TAG_CATEGORY_MAP: Record<string, NormalizedCategory> = {
  // Computers
  "eco-category-computers": "computers",
  "eco-category-laptops": "laptops",
  "eco-category-printers": "printers",
  "eco-category-peripherals": "peripherals",
  "eco-category-av": "av",
  "eco-category-cellphones": "cellphones",

  // Displays (new)
  "eco-category-display-small": "display-small",   // <= 30"
  "eco-category-display-large": "display-large",   // >30" and <46"
  "eco-category-display-xlarge": "display-xlarge", // >=46"
  "eco-category-all-in-one": "all-in-one",

  // Displays (legacy aliases)
  "eco-category-monitor-small": "display-small",
  "eco-category-monitor-large": "display-large",
  "eco-category-monitor-xlarge": "display-xlarge",

  // Other
  "eco-category-small-appliances": "small-appliances",
  "eco-category-tools": "tools",
};

/**
 * Province fee tables.
 * V1 SHIPPING PROVINCES: AB, BC, SK.
 * All other provinces are disabled (future updates).
 *
 * Display sizing note:
 * Many fee schedules use <=29, 30–45, >=46.
 * Your merchant guidance uses <=30, >30 & <46, >=46.
 * We map small/large/xlarge to those brackets as configured per province.
 *
 * All-in-one devices are treated as displays in fee schedules, but size matters.
 * Best practice: tag AIOs with the correct display size tag.
 * We set "all-in-one" to the small display fee as a conservative default.
 */
const PROVINCE_CONFIG: Record<ProvinceCode, ProvinceConfig> = {
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

  // ✅ SK enabled using Jan 5, 2026 spreadsheet values
  SK: {
    enabled: true,
    label: "SK Environmental Fee",
    feeByCategory: {
      computers: 0.80,         // Desktop Computers
      laptops: 0.45,           // Portable Computers
      printers: 4.50,          // Desktop Printers
      peripherals: 0.20,       // Computer Peripherals
      av: 1.25,                // Home Audio/Video Systems (home theatre)
      cellphones: 0,           // Cellular Devices & Pagers is "—" in sheet
      "display-small": 1.80,   // Display Devices ≤29" (AIO included)
      "display-large": 3.10,   // Display Devices 30–45" (AIO included)
      "display-xlarge": 7.00,  // Display Devices ≥46" (AIO included)
      "all-in-one": 1.80,      // default to small unless also size-tagged
      "small-appliances": 0,
      tools: 0,
    },
  },

  // Future provinces (disabled for v1)
  NB: { enabled: false, label: "NB Environmental Fee", feeByCategory: {} },
  NL: { enabled: false, label: "NL Environmental Fee", feeByCategory: {} },
  MB: { enabled: false, label: "MB Environmental Fee", feeByCategory: {} },
  ON: { enabled: false, label: "ON Environmental Fee", feeByCategory: {} },
  QC: { enabled: false, label: "QC Environmental Fee", feeByCategory: {} },
  NS: { enabled: false, label: "NS Environmental Fee", feeByCategory: {} },
  PE: { enabled: false, label: "PE Environmental Fee", feeByCategory: {} },
  NT: { enabled: false, label: "NT Environmental Fee", feeByCategory: {} },
  NU: { enabled: false, label: "NU Environmental Fee", feeByCategory: {} },
  YT: { enabled: false, label: "YT Environmental Fee", feeByCategory: {} },
};

function normalizeProvinceCode(value: unknown): ProvinceCode | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed in PROVINCE_CONFIG) return trimmed as ProvinceCode;
  return null;
}

type TagState = { tag: string; hasTag: boolean };

function computeEcoFeePerUnit(
  ecoCategoryTags: TagState[] | undefined,
  feeByCategory: Record<NormalizedCategory, number>
): number {
  if (!ecoCategoryTags?.length) return 0;

  let fee = 0;

  for (const t of ecoCategoryTags) {
    if (!t.hasTag) continue;

    const normalized = TAG_CATEGORY_MAP[t.tag];
    if (!normalized) continue;

    const amount = feeByCategory[normalized];
    if (typeof amount === "number" && amount > fee) {
      fee = amount;
    }
  }

  return fee;
}

function formatFeeSuffix(label: string, fee: number): string {
  return `♻️ ${label}: +$${fee.toFixed(2)} per unit`;
}

export function cartTransformRun(
  input: CartTransformRunInput
): CartTransformRunResult {
  const operations: CartTransformRunResult["operations"] = [];

  const provinceCode = normalizeProvinceCode(input?.shop?.jurisdiction?.value);
  if (!provinceCode) return NO_CHANGES;

  const provinceConfig = PROVINCE_CONFIG[provinceCode];
  if (!provinceConfig.enabled) return NO_CHANGES;

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const product = line.merchandise.product as any;
    const productTitle = product?.title ?? "Item";
    const ecoCategoryTags = product?.ecoCategoryTags as TagState[] | undefined;

    const ecoFeePerUnit = computeEcoFeePerUnit(
      ecoCategoryTags,
      provinceConfig.feeByCategory
    );
    if (ecoFeePerUnit <= 0) continue;

    const baseAmount = Number(line.cost.amountPerQuantity.amount);
    if (!Number.isFinite(baseAmount)) continue;

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        title: `${productTitle} – ${formatFeeSuffix(
          provinceConfig.label,
          ecoFeePerUnit
        )}`,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: (baseAmount + ecoFeePerUnit).toFixed(2),
            },
          },
        },
      },
    });
  }

  return operations.length ? { operations } : NO_CHANGES;
}
