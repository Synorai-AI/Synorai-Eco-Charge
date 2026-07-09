# EHF Fee Schedule — Sources and Update Runbook

Last verified: **2026-07-08**

## Single source of truth

All fee amounts live in **`app/lib/eco-fees.ts` → `PROVINCE_CONFIG`**. Everything
else derives from it:

- **Fee product variant prices** — `getRequiredFeeVariants()` in
  `app/lib/standard-fee-product.server.ts` builds variants from
  `PROVINCE_CONFIG`; `normalizeStandardFeeProductVariants` updates prices on
  already-installed stores, `ensureStandardFeeProductVariants` creates any
  missing variants.
- **Variant map metafield** (`synorai_ecocharge.standard_fee_variant_map`) —
  written by the backend; carries variant IDs *and* prices per
  province/category.
- **Storefront JS (standard tier)** — resolves the winning category using the
  variant map's prices. It carries **no fee table of its own** (this used to be
  a hardcoded copy in the Liquid embed, which drifted — never reintroduce it;
  `extensions/eco-fee-cart-transform/tests/fee-schedule-consistency.test.js`
  fails the build if `feeByProvince` reappears in the embed).
- **Pro cart transform** — imports `PROVINCE_CONFIG` directly at build time.
- **Merchant-facing schedule preview** — `PUBLIC_FEE_SCHEDULE_BY_PROVINCE`
  looks its amounts up from `PROVINCE_CONFIG` at module load.

## How to update fees when a program publishes a new schedule

1. Edit the amounts in `PROVINCE_CONFIG` (and the doc comment's
   verified-against dates).
2. Run the consistency tests:
   `cd extensions/eco-fee-cart-transform && npx vitest run`.
3. Deploy the app backend **and** redeploy the extensions
   (`npm run deploy`) — the cart transform bakes fees in at build time.
4. Have each installed store re-run setup (Settings → save / bootstrap):
   this triggers variant price normalization and creation of any new
   variants, then rewrites the variant map metafield.
   (TODO: automate this with a post-deploy job that iterates sessions.)

**Never rename an existing `CATEGORY_LABEL_MAP` label.** Labels are baked into
live variant titles; `parseVariantTitle` matches titles exactly, so a renamed
label orphans installed variants. Add a new category instead.

## Verified schedule (AB/BC/SK 2026-07-08; MB/NB/NL/NS/PE/QC 2026-07-09)

Display tiers: small ≤29", large 30"–45", xlarge 46"–64", xxlarge 65"+.

| Category | AB | BC | MB | NB | NL | NS | PE | QC | SK |
|---|---|---|---|---|---|---|---|---|---|
| computers | 0.45 | 0.85 | 0.80 | 1.20 | 1.20 | 0.80 | 0.80 | 1.00 | 0.80 |
| laptops | 0.30 | 0.50 | 0.45 | 0.65 | 0.60 | 0.40 | 0.40 | 0.60 | 0.45 |
| printers | 1.65 | 6.95 | 4.50 | 6.75 | 6.50 | 5.25 | 5.25 | 7.25 | 4.50 |
| peripherals | — | 0.55 | 0.20 | 0.50 | 0.45 | 0.25 | 0.25 | 0.55 | 0.20 |
| av | 0.55 | 3.50 | 1.25 | 3.75 | 3.75 | 2.25 | 2.25 | 3.75 | 1.25 |
| cellphones | — | 0.20 | 0.10 | 0.20 | 0.25 | 0.11 | 0.11 | 0.20 | — |
| display-small | 1.30 | 4.95 | 1.80 | 5.00 | 5.95 | 3.00 | 3.00 | 5.50 | 1.80 |
| display-large | 2.75 | 6.80 | 3.10 | 7.05 | 9.05 | 5.50 | 5.50 | 8.50 | 3.10 |
| display-xlarge | 2.75 | 11.00 | 7.00 | 14.25 | 17.10 | 10.50 | 10.50 | 16.75 | 7.00 |
| display-xxlarge | 2.75 | 13.85 | 8.85 | 17.95 | 21.55 | 13.25 | 13.25 | 21.10 | 8.85 |
| small-appliances | 0.40 | — | — | — | — | — | — | — | — |
| tools | 0.65 | — | — | — | — | — | — | — | — |

**Not covered (documented scope limits):**

- **Ontario** — the regulated EHF program ended in 2021 (individual producer
  responsibility). Ontario retailers may charge a self-set recovery fee;
  supporting that means a merchant-configurable schedule, not program data.
- **Appliance categories outside AB** — NB/NL/NS/PE added Phase 3 appliance
  categories (personal care, kitchen countertop, etc.) in Jan 2026 with
  granular per-type fees our single `small-appliances` category can't
  represent. Electronics only for now.
- **Territories** — YT and NWT run small programs; not yet modeled.
- **Quebec localization** — cart fee line titles are English
  ("QC Environmental Fee"); French labels are a follow-up for QC storefronts.

### Sources

- **Alberta (ARMA)** — fee schedule for Apr 1, 2025 – Sep 30, 2026:
  https://www.albertarecycling.ca/stewardship-recycling/electronics/ and
  https://files.albertarecycling.ca/Electronics_Products-Definitions-and-Fees.pdf
  AB uses only two display tiers (<30" = 1.30, ≥30" = 2.75); xlarge/xxlarge
  mirror the ≥30" fee. **Re-check on Oct 1, 2026** when the published schedule
  window ends.
- **British Columbia (EPRA-BC)** — Technical Product Listing *updated June
  2026*:
  https://www.recyclemy-assets.com/1780319839-epra-bc-obligated-products-definitions-june-2026.pdf
  (linked from https://recyclemyelectronics.ca/bc/product-definitions-and-ehf).
  June 2026 was a **major increase** (e.g. displays ≤29" went 3.50 → 4.95) and
  introduced the 65"+ tier.
- **Saskatchewan (EPRA-SK)** — Product Definitions *revised June 1, 2026*:
  https://www.recyclemy-assets.com/1780319839-epra-sk-obligated-products-definitions-june-2026.pdf
  (linked from https://recyclemyelectronics.ca/sk/product-definitions-and-ehf).
  SK has no cellular category. SK display tiers: 1.80 / 3.10 / 7.00 (46"–64") /
  8.85 (≥65").
- **MB / NB / NL / NS / PE / QC (EPRA)** — Product Definitions, all *revised
  June 2026*, each linked from
  `recyclemyelectronics.ca/<province>/product-definitions-and-ehf`
  (PEI uses `/pei`); PDF asset URLs as of 2026-07-09:
  - MB: https://www.recyclemy-assets.com/1780319839-epra-mb-obligated-products-definitions-june-2026.pdf
  - NB: https://www.recyclemy-assets.com/1780319339-epra-nb-obligated-products-definitions-en-june-2026.pdf
  - NL: https://www.recyclemy-assets.com/1780319839-epra-nl-obligated-products-definitions-june-2026.pdf
  - NS: https://www.recyclemy-assets.com/1780319839-epra-ns-obligated-products-definitions-june-2026.pdf
  - PE: https://www.recyclemy-assets.com/1780319839-epra-pei-obligated-products-definitions-june-2026.pdf
  - QC: https://www.recyclemy-assets.com/1780319339-epra-qc-obligated-products-definitions-en-june-2026.pdf

EPRA revises these listings periodically (recent changes have landed in May /
June). **Check each program page quarterly.**

## Known open issues (flagged, intentionally not changed here)

- ~~Fee variants are created with `taxable: false`.~~ **Resolved 2026-07-09**:
  fee variants are now created and normalized with `taxable: true` (EHF is part
  of the taxable consideration — GST, and PST where applicable). Existing
  stores pick this up on their next Settings save.
- **Merchant retagging needed for the new 65"+ tier.** Products previously
  tagged `eco-category-display-xlarge` that are 65"+ should be retagged
  `eco-category-display-xxlarge`, otherwise BC/SK charge the 46"–64" fee.
- **Pro tier (`lineUpdate` cart transform)** folds the fee into the line price
  using `PROVINCE_CONFIG` compiled into the function — a fee change requires an
  extension redeploy, not just a backend deploy.
