# EcoCharge POS extension

Why this exists: the Standard tier's theme app embed JavaScript never runs on
Shopify POS, so fees were never auto-added in-store. This extension gives staff
a one-tap smart grid tile that reconciles eco fee lines in the POS cart.

## How it works

1. **Tile** (`pos.home.tile.render`) — "Eco fees" tile on the smart grid;
   tapping it opens the modal.
2. **Modal** (`pos.home.modal.render`) — reads the POS cart, sends the line
   items with a POS session token to `POST /api/pos/fee-plan` on the app
   backend, shows the planned changes, and applies them through the POS Cart
   API (`addLineItem` / `removeLineItem`).
3. **Backend** (`app/routes/api.pos.fee-plan.tsx`) — validates the session
   token, looks up the shop's province + fee variant map metafields, fetches
   product tags via the Admin API, and reuses
   `app/lib/standard-fee-reconciliation.ts` to compute the diff. All fee logic
   stays server-side against the canonical schedule in `app/lib/eco-fees.ts`.

POS cannot run cart transforms reliably (`requiresComponents` restriction) and
never runs theme JS — a tile + Cart API is the supported pattern. Fully
automatic (zero-tap) cart mutation is not supported by POS UI extensions.

## Before first deploy — verify on a dev store

This extension targets the POS UI extensions **2026-07** API (Preact + `s-`
web components, global `shopify` object). It typechecks and bundles, but has
not been run on a live POS device:

- `npm install` at the repo root, then `npm run dev` and test on POS (a real
  device or the POS app in dev mode).
- Pins: `@shopify/ui-extensions ~2026.7.x` must match `api_version = "2026-07"`.
- Cart lines come from `shopify.cart.current.value.lineItems[].{uuid,productId,variantId,quantity}`;
  the tile opens the modal with `shopify.action.presentModal()`.
- The backend auth helper prefers `authenticate.public.pos` and falls back to
  `authenticate.public.checkout` (same session-token validation). If the
  checkout fallback rejects POS tokens, validate the JWT manually with
  `@shopify/shopify-api`'s session token utilities.
- Requests come from `cdn.shopify.com` / `extensions.shopifycdn.com`; the
  `cors()` wrapper from the auth helper must echo those origins.
- Shopify supports each API version for 12 months; bump `api_version` and the
  `@shopify/ui-extensions` pin before 2026-07 expires (July 2027).

## Known limits

- Fees use the shop's configured province (`synorai_ecocharge.jurisdiction`),
  not the POS location's address. Fine for a single-location shop; multi-
  province retailers need per-location province resolution (the fee-plan
  endpoint is where to add it — POS also exposes `retailLocation` on carts to
  cart transforms).
- The fee product must already be provisioned (Standard setup completed in the
  app) and published to the POS sales channel — the existing setup flow does
  both.
