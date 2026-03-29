import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

import {
  type TagState,
  computeEcoFeePerUnit,
  formatFeeSuffix,
  getProvinceConfig,
  normalizeProvinceCode,
} from "../../../app/lib/eco-fees";

const NO_CHANGES: CartTransformRunResult = { operations: [] };

function normalizeEffectiveMode(value: string | null | undefined) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();

  if (
    normalized === "pro_cart_transform" ||
    normalized === "standard_fee_product"
  ) {
    return normalized;
  }

  return null;
}

export function cartTransformRun(
  input: CartTransformRunInput,
): CartTransformRunResult {
  const operations: CartTransformRunResult["operations"] = [];

  const effectiveMode = normalizeEffectiveMode(
    input?.shop?.effectiveMode?.value,
  );

  if (effectiveMode !== "pro_cart_transform") {
    return NO_CHANGES;
  }

  const provinceCode = normalizeProvinceCode(input?.shop?.jurisdiction?.value);
  const provinceConfig = getProvinceConfig(provinceCode);

  if (!provinceConfig || !provinceConfig.enabled) {
    return NO_CHANGES;
  }

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const product = line.merchandise.product as {
      title?: string;
      ecoCategoryTags?: TagState[];
    };

    const productTitle = product?.title ?? "Item";
    const ecoCategoryTags = product?.ecoCategoryTags;

    const ecoFeePerUnit = computeEcoFeePerUnit(
      ecoCategoryTags,
      provinceConfig.feeByCategory,
    );

    if (ecoFeePerUnit <= 0) continue;

    const baseAmount = Number(line.cost.amountPerQuantity.amount);
    if (!Number.isFinite(baseAmount)) continue;

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        title: `${productTitle} – ${formatFeeSuffix(
          provinceConfig.label,
          ecoFeePerUnit,
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