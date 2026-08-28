import { NextRequest, NextResponse } from "next/server";
import { fuelFinderConfig, fuelFinderGet } from "@/lib/fuel-finder";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = fuelFinderConfig();
  if (!config.configured) {
    return NextResponse.json(
      {
        configured: false,
        error: "GOV.UK Fuel Finder OAuth credentials are not configured.",
        required: ["FUEL_FINDER_CLIENT_ID", "FUEL_FINDER_CLIENT_SECRET"],
        fallback: "CarWise continues to use official DESNZ weekly UK petrol/diesel prices.",
      },
      { status: 503 },
    );
  }

  const batch = Math.max(1, Number(request.nextUrl.searchParams.get("batch") ?? 1));
  const type = request.nextUrl.searchParams.get("type") === "forecourts" ? "forecourts" : "prices";
  const path = type === "forecourts" ? "/api/v1/pfs" : "/api/v1/pfs/fuel-prices";

  try {
    const data = await fuelFinderGet(path, { "batch-number": batch });
    return NextResponse.json({
      configured: true,
      source: "GOV.UK Fuel Finder",
      checkedAt: new Date().toISOString(),
      type,
      batch,
      data,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : "Fuel Finder request failed" },
      { status: 502 },
    );
  }
}
