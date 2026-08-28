import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "make",
  "model",
  "year",
  "year_range",
  "price_range",
  "miles_range",
  "postal_code",
  "county",
  "country",
  "fuel_type",
  "powertrain_type",
  "body_type",
  "sort_by",
  "sort_order",
  "stats",
  "facets",
  "inventory_type",
]);

export async function GET(request: NextRequest) {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        configured: false,
        error: "MARKETCHECK_API_KEY is not configured.",
        action: "Add a MarketCheck API key in Vercel environment variables to activate live UK used-car inventory.",
      },
      { status: 503 },
    );
  }

  const target = new URL("https://api.marketcheck.com/v2/search/car/uk/active");
  target.searchParams.set("api_key", apiKey);
  target.searchParams.set("rows", String(Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("rows") ?? 10)))));
  target.searchParams.set("start", String(Math.max(0, Number(request.nextUrl.searchParams.get("start") ?? 0))));

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (ALLOWED.has(key) && value) target.searchParams.set(key, value);
  }

  try {
    const response = await fetch(target, {
      headers: { accept: "application/json", "user-agent": "CarWiseLive/1.0" },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { configured: true, upstreamStatus: response.status, error: payload },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        configured: true,
        source: "MarketCheck UK active inventory",
        checkedAt: new Date().toISOString(),
        ...payload,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : "MarketCheck request failed" },
      { status: 502 },
    );
  }
}
