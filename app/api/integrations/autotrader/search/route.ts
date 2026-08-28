import { NextRequest, NextResponse } from "next/server";
import { autoTraderConfig, getAutoTraderToken } from "@/lib/autotrader";

export const dynamic = "force-dynamic";

const SAFE_FILTERS = new Set([
  "make", "model", "generation", "derivative", "fuelType", "bodyType", "transmissionType",
  "minPrice", "maxPrice", "minMileage", "maxMileage", "minYear", "maxYear",
  "sort", "postcode", "distance", "advertisingLocation", "page", "pageSize", "stockId", "searchId",
]);

export async function GET(request: NextRequest) {
  const config = autoTraderConfig();
  if (!config.configured) {
    return NextResponse.json(
      {
        configured: false,
        error: "Auto Trader Connect credentials are not configured.",
        required: ["AUTOTRADER_API_KEY", "AUTOTRADER_API_SECRET", "AUTOTRADER_ADVERTISER_ID"],
      },
      { status: 503 },
    );
  }

  const base = new URL(process.env.AUTOTRADER_SEARCH_PATH ?? "/search", `${config.baseUrl}/`);
  base.searchParams.set("advertiserId", config.advertiserId!);
  base.searchParams.set("searchType", request.nextUrl.searchParams.get("searchType") ?? "public");
  base.searchParams.set("page", request.nextUrl.searchParams.get("page") ?? "1");
  base.searchParams.set("pageSize", String(Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? 20)))));
  base.searchParams.set("advertisingLocation", request.nextUrl.searchParams.get("advertisingLocation") ?? "autotrader");

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (SAFE_FILTERS.has(key) && value) base.searchParams.set(key, value);
  }

  try {
    const token = await getAutoTraderToken();
    const response = await fetch(base, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ error: "Non-JSON response" }));
    if (!response.ok) {
      return NextResponse.json(
        {
          configured: true,
          upstreamStatus: response.status,
          cfRay: response.headers.get("cf-ray"),
          error: payload,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      configured: true,
      source: "Auto Trader Connect Search",
      checkedAt: new Date().toISOString(),
      data: payload,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : "Auto Trader Search request failed" },
      { status: 502 },
    );
  }
}
