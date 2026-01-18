import { authenticate } from "../shopify.server";

function json(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  // Province auto-detect (stable approach): infer from the store's first Location address.
  // NOTE: This may require adding read_locations scope later; we’ll see from the response.
  const resp = await admin.graphql(`
    query EcoChargeBootstrapJurisdiction {
      locations(first: 1) {
        nodes {
          address {
            countryCode
            provinceCode
          }
        }
      }
    }
  `);

  const data = await resp.json();
  const address = data?.data?.locations?.nodes?.[0]?.address ?? null;

  const countryCode: string | null = address?.countryCode ?? null;
  const provinceCode: string | null = address?.provinceCode ?? null;

  return json({
    ok: true,
    shop: session.shop,
    jurisdiction: {
      countryCode,
      provinceCode,
      inferredRegion:
        countryCode === "CA" && provinceCode === "AB" ? "AB" : "UNKNOWN",
    },
    raw: {
      // helpful for debugging without digging in logs
      locationsCount: data?.data?.locations?.nodes?.length ?? 0,
    },
  });
}

