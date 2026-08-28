import { NextRequest, NextResponse } from "next/server";
import { capHpiConfig, capHpiGet } from "@/lib/cap-hpi";

export const dynamic = "force-dynamic";

async function optional(path: string) {
  try {
    return { ok: true as const, data: await capHpiGet(path) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "CAP HPI request failed" };
  }
}

export async function GET(request: NextRequest) {
  const vrm = request.nextUrl.searchParams.get("vrm")?.replace(/\s+/g, "").toUpperCase();
  if (!vrm) return NextResponse.json({ error: "Provide ?vrm=AB12CDE" }, { status: 400 });

  const config = capHpiConfig();
  if (!config.configured) {
    return NextResponse.json(
      {
        configured: false,
        error: "CAP HPI credentials are not configured.",
        required: ["CAP_HPI_CLIENT_ID", "CAP_HPI_CLIENT_SECRET"],
      },
      { status: 503 },
    );
  }

  try {
    const encoded = encodeURIComponent(vrm);
    const [derivative, vehicle, checks, mot, dvla, products] = await Promise.all([
      optional(`/v1/vrms/${encoded}/derivative`),
      optional(`/v1/vrms/${encoded}`),
      optional(`/v1/vrms/${encoded}/checks`),
      optional(`/v1/vrms/${encoded}/mots/latest`),
      optional(`/v1/vrms/${encoded}/dvla`),
      optional("/products"),
    ]);

    return NextResponse.json({
      configured: true,
      source: "CAP HPI UK API",
      checkedAt: new Date().toISOString(),
      vrm,
      entitlements: products,
      derivative,
      vehicle,
      checks,
      latestMot: mot,
      dvla,
      valuationEndpointsReady: {
        current: `POST /v1/vrms/${vrm}/current-valuations`,
        future: `POST /v1/vrms/${vrm}/future-valuations`,
        note: "Valuation POST bodies depend on the CAP HPI products contracted to the account and are intentionally not guessed.",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : "CAP HPI lookup failed" },
      { status: 502 },
    );
  }
}
