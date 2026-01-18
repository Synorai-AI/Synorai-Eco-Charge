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
  feeByCategoryTag: Record<string, number>;
};

const PROVINCE_CONFIG: Record<ProvinceCode, ProvinceConfig> = {
  AB: {
    enabled: true,
    label: "AB Environmental Fee",
    feeByCategoryTag: {
      "eco-category-computers": 0.45,
      "eco-category-laptops": 0.30,
      "eco-category-printers": 1.65,
      "eco-category-small-appliances": 0.40,
      "eco-category-av": 0.55,
      "eco-category-tools": 0.65,
      "eco-category-monitor-small": 1.30,
      "eco-category-monitor-large": 2.75,
      "eco-category-monitor-xlarge": 2.75,
      "eco-category-peripherals": 0.0,
      "eco-category-printers-floorstanding": 0.0,
      "eco-category-phone-noncell": 0.0,
      "eco-category-phone-cell": 0.0,
    },
  },

  BC: {
    enabled: true,
    label: "BC Environmental Fee",
    feeByCategoryTag: {
      "eco-category-computers": 0.70,
      "eco-category-laptops": 0.45,
      "eco-category-monitor-small": 3.50,   // ≤29"
      "eco-category-monitor-large": 4.50,   // 30–45"
      "eco-category-monitor-xlarge": 7.75,  // ≥46"
      "eco-category-printers": 6.50,
      "eco-category-printers-floorstanding": 42.00,
      "eco-category-peripherals": 0.35,
      "eco-category-av": 2.80,
      "eco-category-phone-noncell": 0.70,
      "eco-category-phone-cell": 0.20,
    },
  },

  SK: {
    enabled: true,
    label: "SK Environmental Fee",
    feeByCategoryTag: {
      "eco-category-computers": 0.80,
      "eco-category-laptops": 0.45,
      "eco-category-monitor-small": 1.80,
      "eco-category-monitor-large": 3.10,
      "eco-category-monitor-xlarge": 7.00,
      "eco-category-printers": 4.50,
      "eco-category-peripherals": 0.20,
      "eco-category-av": 1.25,
      "eco-category-phone-noncell": 0.50,
    },
  },

  // Not enabled in v1 yet
  NB: { enabled: false, label: "NB Environmental Fee", feeByCategoryTag: {} },
  NL: { enabled: false, label: "NL Environmental Fee", feeByCategoryTag: {} },

  MB: { enabled: false, label: "MB Environmental Fee", feeByCategoryTag: {} },
  ON: { enabled: false, label: "ON Environmental Fee", feeByCategoryTag: {} },
  QC: { enabled: false, label: "QC Environmental Fee", feeByCategoryTag: {} },
  NS: { enabled: false, label: "NS Environmental Fee", feeByCategoryTag: {} },
  PE: { enabled: false, label: "PE Environmental Fee", feeByCategoryTag: {} },
  NT: { enabled: false, label: "NT Environmental Fee", feeByCategoryTag: {} },
  NU: { enabled: false, label: "NU Environmental Fee", feeByCategoryTag: {} },
  YT: { enabled: false, label: "YT Environmental Fee", feeByCategoryTag: {} },
};

function normalizeProvinceCode(value: unknown): ProvinceCode | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  if (trimmed in PROVINCE_CONFIG) return trimmed as ProvinceCode;
  return null;
}

type TagState = { tag: string; hasTag: boolean };

function computeEcoFeePerUnit(
  ecoCategoryTags: TagState[] | undefined,
  feeByCategoryTag: Record<string, number>
): number {
  if (!ecoCategoryTags || ecoCategoryTags.length === 0) return 0;

  let fee = 0;
  for (const t of ecoCategoryTags) {
    if (!t?.hasTag) continue;
    const amount = feeByCategoryTag[t.tag];
    if (typeof amount === "number" && amount > 0) fee = Math.max(fee, amount);
  }
  return fee;
}

function formatFeeSuffix(label: string, fee: number): string {
  return `♻️ ${label}: +$${fee.toFixed(2)} per unit`;
}

export function cartTransformRun(input: CartTransformRunInput): CartTransformRunResult {
  const operations: CartTransformRunResult["operations"] = [];

  // ✅ DEBUG: prove function is running and what province it sees
  const rawProvince = input?.shop?.jurisdiction?.value;
  console.error("[EcoCharge] RUN");
  console.error("[EcoCharge] jurisdiction metafield:", rawProvince);

  const provinceCode = normalizeProvinceCode(rawProvince);
  console.error("[EcoCharge] province normalized:", provinceCode);

  if (!provinceCode) return NO_CHANGES;

  const provinceConfig = PROVINCE_CONFIG[provinceCode];
  console.error("[EcoCharge] province enabled:", provinceConfig.enabled);

  if (!provinceConfig.enabled) return NO_CHANGES;

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const product = line.merchandise.product as unknown as Record<string, any>;
    const productTitle = typeof product?.title === "string" ? product.title : "Item";

    const ecoCategoryTags = product?.ecoCategoryTags as TagState[] | undefined;
    const trueTags = (ecoCategoryTags ?? []).filter(t => t?.hasTag).map(t => t.tag);

    console.error("[EcoCharge] line", line.id, "title:", productTitle);
    console.error("[EcoCharge] trueTags:", trueTags);

    const ecoFeePerUnit = computeEcoFeePerUnit(ecoCategoryTags, provinceConfig.feeByCategoryTag);
    console.error("[EcoCharge] ecoFeePerUnit:", ecoFeePerUnit);

    if (ecoFeePerUnit <= 0) continue;

    const baseAmount = Number(line.cost.amountPerQuantity.amount);
    if (!Number.isFinite(baseAmount)) continue;

    const newPricePerUnit = baseAmount + ecoFeePerUnit;
    const newTitle = `${productTitle} – ${formatFeeSuffix(provinceConfig.label, ecoFeePerUnit)}`;

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        title: newTitle,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: newPricePerUnit.toFixed(2),
            },
          },
        },
      },
    });
  }

  console.error("[EcoCharge] operations:", operations.length);
  return operations.length ? { operations } : NO_CHANGES;
}
