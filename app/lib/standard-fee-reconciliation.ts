import {
  type NormalizedCategory,
  type ProvinceCode,
  resolveHighestFeeCategoryFromTags,
  type TagState,
} from "./eco-fees";
import type {
  StandardFeeVariantMap,
  StandardFeeVariantMapEntry,
} from "./standard-fee-product.server";

export type CartLineLike = {
  key?: string;
  quantity: number;
  product_id?: number | null;
  variant_id?: number | null;
  title?: string;
  properties?: Record<string, unknown> | null;
  product?: {
    title?: string;
    tags?: string[];
  };
};

export type MerchandiseLineInput = {
  key: string;
  quantity: number;
  title: string;
  tags: string[];
};

export type ExistingFeeLine = {
  key: string;
  quantity: number;
  province: ProvinceCode;
  category: NormalizedCategory;
  variantId: string;
  title: string;
};

export type RequiredFeeLine = {
  province: ProvinceCode;
  category: NormalizedCategory;
  variantId: string;
  quantity: number;
  title: string;
};

export type FeeStateMap = Record<string, RequiredFeeLine | ExistingFeeLine>;

export type FeeDiffResult = {
  toAdd: RequiredFeeLine[];
  toUpdate: Array<{
    key: string;
    quantity: number;
    province: ProvinceCode;
    category: NormalizedCategory;
    variantId: string;
    title: string;
  }>;
  toRemove: ExistingFeeLine[];
};

function makeFeeKey(
  province: ProvinceCode,
  category: NormalizedCategory,
): string {
  return `${province}::${category}`;
}

function numericVariantIdToGid(variantId: number | null | undefined): string | null {
  if (!variantId || !Number.isFinite(variantId)) return null;
  return `gid://shopify/ProductVariant/${variantId}`;
}

function getVariantMapEntryByVariantId(
  variantMap: StandardFeeVariantMap,
  variantId: string,
): { province: ProvinceCode; category: NormalizedCategory; entry: StandardFeeVariantMapEntry } | null {
  for (const province of Object.keys(variantMap) as ProvinceCode[]) {
    const provinceMap = variantMap[province];
    if (!provinceMap) continue;

    for (const category of Object.keys(provinceMap) as NormalizedCategory[]) {
      const entry = provinceMap[category];
      if (!entry) continue;

      if (entry.variantId === variantId) {
        return { province, category, entry };
      }
    }
  }

  return null;
}

export function isSynoraiFeeLine(
  line: CartLineLike,
  feeProductId: string | null,
  variantMap: StandardFeeVariantMap,
): boolean {
  const numericVariantId = line.variant_id ?? null;
  const gidVariantId = numericVariantIdToGid(numericVariantId);

  if (gidVariantId) {
    const matched = getVariantMapEntryByVariantId(variantMap, gidVariantId);
    if (matched) return true;
  }

  const props = line.properties ?? {};
  if (props && String(props["_synorai_fee"] ?? "") === "true") {
    return true;
  }

  if (feeProductId && line.product_id) {
    const numericProductId = feeProductId.split("/").pop();
    if (numericProductId && String(line.product_id) === numericProductId) {
      return true;
    }
  }

  return false;
}

export function toTagStates(tags: string[]): TagState[] {
  return tags.map((tag) => ({
    tag,
    hasTag: true,
  }));
}

export function resolveMerchandiseFeeRequirement(
  line: MerchandiseLineInput,
  province: ProvinceCode,
  variantMap: StandardFeeVariantMap,
  feeByCategory: Record<NormalizedCategory, number>,
): RequiredFeeLine | null {
  const resolved = resolveHighestFeeCategoryFromTags(
    toTagStates(line.tags),
    feeByCategory,
  );

  if (!resolved) return null;

  const provinceMap = variantMap[province];
  if (!provinceMap) return null;

  const entry = provinceMap[resolved.category];
  if (!entry) return null;

  return {
    province,
    category: resolved.category,
    variantId: entry.variantId,
    quantity: line.quantity,
    title: entry.title,
  };
}

export function groupRequiredFeeLines(
  feeLines: RequiredFeeLine[],
): Record<string, RequiredFeeLine> {
  const grouped: Record<string, RequiredFeeLine> = {};

  for (const line of feeLines) {
    const key = makeFeeKey(line.province, line.category);

    if (!grouped[key]) {
      grouped[key] = { ...line };
      continue;
    }

    grouped[key].quantity += line.quantity;
  }

  return grouped;
}

export function buildExistingFeeState(
  cartLines: CartLineLike[],
  feeProductId: string | null,
  variantMap: StandardFeeVariantMap,
): Record<string, ExistingFeeLine> {
  const existing: Record<string, ExistingFeeLine> = {};

  for (const line of cartLines) {
    if (!isSynoraiFeeLine(line, feeProductId, variantMap)) continue;
    if (!line.key) continue;

    const gidVariantId = numericVariantIdToGid(line.variant_id ?? null);
    if (!gidVariantId) continue;

    const matched = getVariantMapEntryByVariantId(variantMap, gidVariantId);
    if (!matched) continue;

    const feeKey = makeFeeKey(matched.province, matched.category);

    existing[feeKey] = {
      key: line.key,
      quantity: line.quantity,
      province: matched.province,
      category: matched.category,
      variantId: matched.entry.variantId,
      title: matched.entry.title,
    };
  }

  return existing;
}

export function buildRequiredFeeState(
  merchandiseLines: MerchandiseLineInput[],
  province: ProvinceCode,
  variantMap: StandardFeeVariantMap,
  feeByCategory: Record<NormalizedCategory, number>,
): Record<string, RequiredFeeLine> {
  const rawRequired: RequiredFeeLine[] = [];

  for (const line of merchandiseLines) {
    const resolved = resolveMerchandiseFeeRequirement(
      line,
      province,
      variantMap,
      feeByCategory,
    );

    if (resolved) {
      rawRequired.push(resolved);
    }
  }

  return groupRequiredFeeLines(rawRequired);
}

export function diffFeeStates(
  required: Record<string, RequiredFeeLine>,
  existing: Record<string, ExistingFeeLine>,
): FeeDiffResult {
  const toAdd: RequiredFeeLine[] = [];
  const toUpdate: FeeDiffResult["toUpdate"] = [];
  const toRemove: ExistingFeeLine[] = [];

  for (const [feeKey, requiredLine] of Object.entries(required)) {
    const existingLine = existing[feeKey];

    if (!existingLine) {
      toAdd.push(requiredLine);
      continue;
    }

    if (existingLine.quantity !== requiredLine.quantity) {
      toUpdate.push({
        key: existingLine.key,
        quantity: requiredLine.quantity,
        province: requiredLine.province,
        category: requiredLine.category,
        variantId: requiredLine.variantId,
        title: requiredLine.title,
      });
    }
  }

  for (const [feeKey, existingLine] of Object.entries(existing)) {
    if (!required[feeKey]) {
      toRemove.push(existingLine);
    }
  }

  return {
    toAdd,
    toUpdate,
    toRemove,
  };
}