import { NextResponse } from "next/server";
import { getLiveSnapshot } from "@/lib/live-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const snapshot = await getLiveSnapshot();
    return NextResponse.json({
      ok: true,
      generatedAt: snapshot.generatedAt,
      liveSources: snapshot.diagnostics.liveSourceCount,
      failedSources: snapshot.diagnostics.failedSourceCount,
      integrations: snapshot.integrations.map(({ id, status }) => ({ id, status })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 500 },
    );
  }
}
