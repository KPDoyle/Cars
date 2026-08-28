import { NextResponse } from "next/server";
import { getLiveSnapshot } from "@/lib/live-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getLiveSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live data refresh failed" },
      { status: 500 },
    );
  }
}
