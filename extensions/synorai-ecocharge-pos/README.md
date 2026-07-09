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

## Before first deploy — verify these assumptions on a dev store

This extension was written against the POS UI extensions **2025-01** API from
documentation, without a live POS device to test on:

- `cd extensions/synorai-ecocharge-pos && npm install`, then `npm run dev` at
  the repo root and test on POS (a real device or the POS app in dev mode).
- Confirm the package versions: `@shopify/ui-extensions-react ~2025.1.0`
  matches API version `2025-01`. If the CLI complains, run
  `shopify app generate extension --template pos_ui` in a scratch app and copy
  the exact dependency pins it produces.
- Confirm `api.cart.subscribable.initial.lineItems[].{uuid,productId,variantId,quantity}`
  field names, and `api.action.presentModal()` on the tile target.
- The backend auth helper prefers `authenticate.public.pos` and falls back to
  `authenticate.public.checkout` (same session-token validation). If the
  checkout fallback rejects POS tokens, validate the JWT manually with
  `@shopify/shopify-api`'s session token utilities.
- Requests come from `cdn.shopify.com` / `extensions.shopifycdn.com`; the
  `cors()` wrapper from the auth helper must echo those origins.

## Known limits

- Fees use the shop's configured province (`synorai_ecocharge.jurisdiction`),
  not the POS location's address. Fine for a single-location shop; multi-
  province retailers need per-location province resolution (the fee-plan
  endpoint is where to add it — POS also exposes `retailLocation` on carts to
  cart transforms).
- The fee product must already be provisioned (Standard setup completed in the
  app) and published to the POS sales channel — the existing setup flow does
  both.
