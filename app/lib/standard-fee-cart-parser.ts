import type {
  CartLineLike,
  MerchandiseLineInput,
} from "./standard-fee-reconciliation";
import { isSynoraiFeeLine } from "./standard-fee-reconciliation";
import type { StandardFeeVariantMap } from "./standard-fee-product.server";

export type AjaxCartLineItem = {
  key?: string;
  quantity?: number;
  product_id?: number | null;
  variant_id?: number | null;
  title?: string;
  properties?: Record<string, unknown> | null;
  product_title?: string;
  tags?: string[] | string;
};

export type ParsedStandardCart = {
  merchandiseLines: MerchandiseLineInput[];
  feeLines: CartLineLike[];
};

function normalizeTags(tags: string[] | string | undefined): string[] {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0);
  }

  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

function toCartLineLike(line: AjaxCartLineItem): CartLineLike {
  return {
    key: typeof line.key === "string" ? line.key : undefined,
    quantity: typeof line.quantity === "number" ? line.quantity : 0,
    product_id:
      typeof line.product_id === "number" ? line.product_id : null,
    variant_id:
      typeof line.variant_id === "number" ? line.variant_id : null,
    title: typeof line.title === "string" ? line.title : undefined,
    properties: line.properties ?? null,
    product: {
      title:
        typeof line.product_title === "string"
          ? line.product_title
          : typeof line.title === "string"
            ? line.title
            : undefined,
      tags: normalizeTags(line.tags),
    },
  };
}

export function toMerchandiseLineInput(
  line: AjaxCartLineItem,
): MerchandiseLineInput | null {
  const key = typeof line.key === "string" ? line.key.trim() : "";
  const quantity = typeof line.quantity === "number" ? line.quantity : 0;
  const title =
    typeof line.product_title === "string" && line.product_title.trim().length > 0
      ? line.product_title.trim()
      : typeof line.title === "string" && line.title.trim().length > 0
        ? line.title.trim()
        : "Item";

  if (!key || quantity <= 0) {
    return null;
  }

  return {
    key,
    quantity,
    title,
    tags: normalizeTags(line.tags),
  };
}

export function parseStandardCart(
  items: AjaxCartLineItem[],
  feeProductId: string | null,
  variantMap: StandardFeeVariantMap,
): ParsedStandardCart {
  const merchandiseLines: MerchandiseLineInput[] = [];
  const feeLines: CartLineLike[] = [];

  for (const item of items) {
    const cartLine = toCartLineLike(item);

    if (isSynoraiFeeLine(cartLine, feeProductId, variantMap)) {
      feeLines.push(cartLine);
      continue;
    }

    const merchandiseLine = toMerchandiseLineInput(item);
    if (merchandiseLine) {
      merchandiseLines.push(merchandiseLine);
    }
  }

  return {
    merchandiseLines,
    feeLines,
  };
}