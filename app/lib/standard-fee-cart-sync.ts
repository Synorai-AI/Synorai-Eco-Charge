import type {
  NormalizedCategory,
  ProvinceCode,
} from "./eco-fees";
import {
  buildExistingFeeState,
  buildRequiredFeeState,
  diffFeeStates,
  type CartLineLike,
  type ExistingFeeLine,
  type FeeDiffResult,
  type RequiredFeeLine,
} from "./standard-fee-reconciliation";
import {
  parseStandardCart,
  type AjaxCartLineItem,
} from "./standard-fee-cart-parser";
import type { StandardFeeVariantMap } from "./standard-fee-product.server";

export type StandardCartSyncInput = {
  items: AjaxCartLineItem[];
  province: ProvinceCode;
  feeProductId: string | null;
  variantMap: StandardFeeVariantMap;
  feeByCategory: Record<NormalizedCategory, number>;
};

export type StandardCartSyncPlan = {
  merchandiseCount: number;
  feeLineCount: number;
  requiredFeeLineCount: number;
  existingFeeLineCount: number;
  diff: FeeDiffResult;
};

export type StandardCartSyncDebug = {
  merchandiseLines: ReturnType<typeof parseStandardCart>["merchandiseLines"];
  feeLines: CartLineLike[];
  requiredState: Record<string, RequiredFeeLine>;
  existingState: Record<string, ExistingFeeLine>;
};

export function buildStandardCartSyncPlan(
  input: StandardCartSyncInput,
): StandardCartSyncPlan {
  const { merchandiseLines, feeLines } = parseStandardCart(
    input.items,
    input.feeProductId,
    input.variantMap,
  );

  const requiredState = buildRequiredFeeState(
    merchandiseLines,
    input.province,
    input.variantMap,
    input.feeByCategory,
  );

  const existingState = buildExistingFeeState(
    feeLines,
    input.feeProductId,
    input.variantMap,
  );

  const diff = diffFeeStates(requiredState, existingState);

  return {
    merchandiseCount: merchandiseLines.length,
    feeLineCount: feeLines.length,
    requiredFeeLineCount: Object.keys(requiredState).length,
    existingFeeLineCount: Object.keys(existingState).length,
    diff,
  };
}

export function buildStandardCartSyncDebug(
  input: StandardCartSyncInput,
): StandardCartSyncDebug {
  const { merchandiseLines, feeLines } = parseStandardCart(
    input.items,
    input.feeProductId,
    input.variantMap,
  );

  const requiredState = buildRequiredFeeState(
    merchandiseLines,
    input.province,
    input.variantMap,
    input.feeByCategory,
  );

  const existingState = buildExistingFeeState(
    feeLines,
    input.feeProductId,
    input.variantMap,
  );

  return {
    merchandiseLines,
    feeLines,
    requiredState,
    existingState,
  };
}