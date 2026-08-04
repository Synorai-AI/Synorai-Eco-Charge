import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// remittance.server.ts pulls in Prisma at module load; the province resolution
// under test never touches the database.
vi.mock("../../../app/db.server", () => ({ default: {} }));

const { resolvePosDestination } = await import("../../../app/lib/remittance.server");

/**
 * The real client throws GraphqlQueryError when the response body carries
 * errors — which is what a missing access scope produces.
 */
class GraphqlQueryError extends Error {}

const LOCATION_ACCESS_DENIED =
  "Access denied for location field. Required access: `read_locations` access " +
  "scope, `read_inventory` access scope or `read_markets_home` access scope.";

function adminStub({ onLocation, jurisdiction }) {
  return {
    graphql: async (query) => {
      if (query.includes("PosLocationProvince")) return onLocation();
      if (query.includes("PosShopJurisdiction")) {
        return {
          json: async () => ({
            data: { shop: { metafield: jurisdiction ? { value: jurisdiction } : null } },
          }),
        };
      }
      throw new Error(`unexpected query: ${query}`);
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POS province resolution", () => {
  /**
   * Production regression, 2026-08-04: five POS orders (7719802962057 and
   * friends) were filed as "destination not determined" because the app does
   * not hold read_locations. The location query threw, and the shop
   * jurisdiction fallback sat downstream of it inside the same try block, so
   * it never ran — with "AB" configured in Settings the whole time.
   */
  test("falls back to shop jurisdiction when the location lookup is denied", async () => {
    const admin = adminStub({
      onLocation: () => {
        throw new GraphqlQueryError(LOCATION_ACCESS_DENIED);
      },
      jurisdiction: "AB",
    });

    await expect(
      resolvePosDestination(admin, 987654321, "7719802962057"),
    ).resolves.toEqual({ country: "CA", province: "AB" });
  });

  test("prefers the selling location's province when it is readable", async () => {
    const admin = adminStub({
      onLocation: () => ({
        json: async () => ({
          data: { location: { address: { provinceCode: "bc", countryCode: "ca" } } },
        }),
      }),
      jurisdiction: "AB",
    });

    await expect(resolvePosDestination(admin, 42, "order-1")).resolves.toEqual({
      country: "CA",
      province: "BC",
    });
  });

  test("falls back when the location resolves but carries no country", async () => {
    const admin = adminStub({
      onLocation: () => ({
        json: async () => ({ data: { location: { address: {} } } }),
      }),
      jurisdiction: "SK",
    });

    await expect(resolvePosDestination(admin, 42, "order-2")).resolves.toEqual({
      country: "CA",
      province: "SK",
    });
  });

  test("uses shop jurisdiction when the order carries no location_id (re-scan path)", async () => {
    const admin = adminStub({
      onLocation: () => {
        throw new Error("location must not be queried without a location_id");
      },
      jurisdiction: "AB",
    });

    await expect(resolvePosDestination(admin, null, "order-3")).resolves.toEqual({
      country: "CA",
      province: "AB",
    });
  });

  test("returns nothing attributable when the jurisdiction metafield is unset", async () => {
    const admin = adminStub({
      onLocation: () => {
        throw new GraphqlQueryError(LOCATION_ACCESS_DENIED);
      },
      jurisdiction: null,
    });

    await expect(resolvePosDestination(admin, 42, "order-4")).resolves.toEqual({
      country: null,
      province: null,
    });
  });

  test("a denied location lookup is logged as info, not as an error", async () => {
    const admin = adminStub({
      onLocation: () => {
        throw new GraphqlQueryError(LOCATION_ACCESS_DENIED);
      },
      jurisdiction: "AB",
    });

    await resolvePosDestination(admin, 42, "order-5");

    expect(console.error).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("falling back to shop jurisdiction"),
    );
  });
});
