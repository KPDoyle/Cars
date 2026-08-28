import { NextRequest, NextResponse } from "next/server";
import { autoTraderConfig, autoTraderFetch } from "@/lib/autotrader";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const registration = request.nextUrl.searchParams.get("vrm")?.replace(/\s+/g, "").toUpperCase();
  if (!registration) return NextResponse.json({ error: "Provide ?vrm=AB12CDE" }, { status: 400 });

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

  try {
    const payload = await autoTraderFetch("/vehicles", {
      registration,
      features: request.nextUrl.searchParams.get("features") === "true" || undefined,
      valuations: request.nextUrl.searchParams.get("valuations") !== "false",
      vehicleMetrics: request.nextUrl.searchParams.get("metrics") === "true" || undefined,
      competitors: request.nextUrl.searchParams.get("competitors") === "true" || undefined,
      fullVehicleCheck: request.nextUrl.searchParams.get("check") === "true" || undefined,
    });
    return NextResponse.json({
      configured: true,
      source: "Auto Trader Connect Vehicles API",
      checkedAt: new Date().toISOString(),
      registration,
      data: payload,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : "Auto Trader request failed" },
      { status: 502 },
    );
  }
}
