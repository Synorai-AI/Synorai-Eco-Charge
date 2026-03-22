export type AjaxCartResponse = {
  token?: string;
  note?: string | null;
  attributes?: Record<string, string>;
  item_count?: number;
  items?: unknown[];
};

export type AddCartItemInput = {
  variantId: string;
  quantity: number;
  properties?: Record<string, string>;
};

function extractNumericVariantId(variantId: string): number {
  const raw = variantId.split("/").pop()?.trim() ?? "";
  const numeric = Number(raw);

  if (!raw || !Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid Shopify variant ID: ${variantId}`);
  }

  return numeric;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (data &&
        typeof data === "object" &&
        "description" in data &&
        typeof (data as { description?: unknown }).description === "string" &&
        (data as { description: string }).description) ||
      (data &&
        typeof data === "object" &&
        "message" in data &&
        typeof (data as { message?: unknown }).message === "string" &&
        (data as { message: string }).message) ||
      `Cart request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}

export async function getAjaxCart(): Promise<AjaxCartResponse> {
  const response = await fetch("/cart.js", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
  });

  return parseJsonResponse<AjaxCartResponse>(response);
}

export async function addAjaxCartItem(
  input: AddCartItemInput,
): Promise<AjaxCartResponse> {
  const numericVariantId = extractNumericVariantId(input.variantId);

  const response = await fetch("/cart/add.js", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      items: [
        {
          id: numericVariantId,
          quantity: input.quantity,
          properties: input.properties ?? {},
        },
      ],
    }),
  });

  return parseJsonResponse<AjaxCartResponse>(response);
}

export async function changeAjaxCartLineQuantity(
  lineKey: string,
  quantity: number,
): Promise<AjaxCartResponse> {
  if (!lineKey.trim()) {
    throw new Error("Cart line key is required.");
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(`Invalid cart line quantity: ${quantity}`);
  }

  const response = await fetch("/cart/change.js", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      id: lineKey,
      quantity,
    }),
  });

  return parseJsonResponse<AjaxCartResponse>(response);
}

export async function removeAjaxCartLine(
  lineKey: string,
): Promise<AjaxCartResponse> {
  return changeAjaxCartLineQuantity(lineKey, 0);
}