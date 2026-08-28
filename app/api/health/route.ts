import { NextResponse } from "next/server";
import { getLiveSnapshot } from "@/lib/live-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const live = await getLiveSnapshot();
    const safetyLive = live.safety.filter((item) => item.status === "live").length;
    const recallsLive = live.recalls.filter((item) => item.status === "live").length;
    const marketReady = Boolean(
      live.market.petrolPencePerLitre &&
      live.market.octopusOffPeakPence &&
      live.market.vedStandardAnnual,
    );
    const publicFeedsHealthy =
      marketReady &&
      live.diagnostics.failedSourceCount === 0 &&
      safetyLive >= Math.ceil(live.safety.length * 0.75) &&
      recallsLive >= Math.ceil(live.recalls.length * 0.75);

    return NextResponse.json(
      {
        ok: publicFeedsHealthy,
        generatedAt: live.generatedAt,
        publicFeeds: {
          market: marketReady ? "live" : "degraded",
          manufacturerAndGovernmentSources: {
            live: live.diagnostics.liveSourceCount,
            fallback: live.diagnostics.fallbackSourceCount,
            failed: live.diagnostics.failedSourceCount,
          },
          euroNcap: { live: safetyLive, total: live.safety.length },
          dvsaRecalls: { live: recallsLive, total: live.recalls.length },
        },
        optionalLicensedFeeds: live.integrations
          .filter((item) => item.requiresCredentials)
          .map((item) => ({ id: item.id, status: item.status, detail: item.detail })),
      },
      {
        status: publicFeedsHealthy ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Health check failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
