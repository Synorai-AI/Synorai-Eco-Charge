import { PROVINCE_CONFIG, type ProvinceCode } from "./eco-fees";
import {
  addAjaxCartItem,
  changeAjaxCartLineQuantity,
  getAjaxCart,
  removeAjaxCartLine,
  type AjaxCartResponse,
} from "./standard-fee-cart-ajax";
import {
  buildStandardCartSyncPlan,
  type StandardCartSyncPlan,
} from "./standard-fee-cart-sync";
import type { StandardFeeVariantMap } from "./standard-fee-product.server";

export type StandardFeeCartRunnerInput = {
  province: ProvinceCode;
  feeProductId: string | null;
  variantMap: StandardFeeVariantMap;
};

export type StandardFeeCartRunnerResult = {
  ok: true;
  plan: StandardCartSyncPlan;
  cart: AjaxCartResponse;
} | {
  ok: false;
  error: string;
};

function buildFeeLineProperties(
  province: ProvinceCode,
  category: string,
): Record<string, string> {
  return {
    _synorai_fee: "true",
    _synorai_province: province,
    _synorai_category: category,
  };
}

export async function runStandardFeeCartSync(
  input: StandardFeeCartRunnerInput,
): Promise<StandardFeeCartRunnerResult> {
  try {
    const provinceConfig = PROVINCE_CONFIG[input.province];
    if (!provinceConfig?.enabled) {
      return {
        ok: false,
        error: `Province ${input.province} is not enabled.`,
      };
    }

    const cart = await getAjaxCart();
    const items = Array.isArray(cart.items) ? cart.items : [];

    const plan = buildStandardCartSyncPlan({
      items,
      province: input.province,
      feeProductId: input.feeProductId,
      variantMap: input.variantMap,
      feeByCategory: provinceConfig.feeByCategory,
    });

    for (const line of plan.diff.toRemove) {
      await removeAjaxCartLine(line.key);
    }

    for (const line of plan.diff.toUpdate) {
      await changeAjaxCartLineQuantity(line.key, line.quantity);
    }

    for (const line of plan.diff.toAdd) {
      await addAjaxCartItem({
        variantId: line.variantId,
        quantity: line.quantity,
        properties: buildFeeLineProperties(line.province, line.category),
      });
    }

    const finalCart = await getAjaxCart();

    return {
      ok: true,
      plan,
      cart: finalCart,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown cart sync error.",
    };
  }
}