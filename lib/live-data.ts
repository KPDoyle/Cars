import "server-only";

import rawData from "@/data/vehicle-data.json";
import type {
  IntegrationStatus,
  LiveRecallObservation,
  LiveSafetyObservation,
  LiveSnapshot,
  LiveVehicleObservation,
  Source,
  Vehicle,
} from "@/lib/types";

const BASE_SOURCES = rawData.sources as unknown as Source[];
const VEHICLES = rawData.vehicles as unknown as Vehicle[];

const USER_AGENT = "CarWiseLive/1.0 (+https://github.com/KPDoyle/Cars)";

async function fetchText(url: string, revalidate = 1800) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,text/plain,application/json,*/*" },
    next: { revalidate },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&pound;|&#163;/gi, "£")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[+]/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPrice(text: string, expected?: number, anchors: string[] = []) {
  if (!expected) return undefined;

  const scopes: string[] = [];
  const normalized = normalize(text);
  for (const anchor of anchors) {
    const target = normalize(anchor);
    let from = 0;
    while (target) {
      const idx = normalized.indexOf(target, from);
      if (idx < 0) break;
      scopes.push(text.slice(Math.max(0, idx - 1400), idx + 3500));
      from = idx + target.length;
      if (scopes.length >= 12) break;
    }
    if (scopes.length >= 12) break;
  }
  scopes.push(text);

  const ranked: Array<{ price: number; scoped: boolean }> = [];
  scopes.forEach((scope, index) => {
    for (const match of scope.matchAll(/£\s?([1-9][0-9]{1,2}(?:,[0-9]{3})+)/g)) {
      const price = Number(match[1].replaceAll(",", ""));
      if (price >= 15000 && price <= 120000) ranked.push({ price, scoped: index < scopes.length - 1 });
    }
  });

  if (!ranked.length) return undefined;
  const closest = ranked.toSorted((a, b) => {
    const distance = Math.abs(a.price - expected) - Math.abs(b.price - expected);
    if (distance !== 0) return distance;
    return Number(b.scoped) - Number(a.scoped);
  })[0]?.price;

  return closest && Math.abs(closest - expected) / expected <= 0.15 ? closest : undefined;
}

async function getManufacturerObservations(): Promise<{ observations: LiveVehicleObservation[]; sources: Source[] }> {
  const pricingSources = BASE_SOURCES.filter((source) => source.type === "Manufacturer pricing" || source.type === "Dealer pricing");
  const updated = new Map<string, Source>();
  const observations: LiveVehicleObservation[] = [];

  await Promise.all(
    pricingSources.map(async (source) => {
      try {
        const html = await fetchText(source.url, 3600);
        const text = htmlToText(html);
        const observed = extractPrice(text, source.expectedPrice, source.anchors);
        updated.set(source.id, {
          ...source,
          status: observed ? "live" : "current",
          observedPrice: observed,
          observedAt: new Date().toISOString(),
          lastChecked: new Date().toISOString(),
        });

        const vehicle = VEHICLES.find((item) => item.sourceIds.includes(source.id));
        if (vehicle) {
          observations.push({
            vehicleId: vehicle.id,
            observedNewPrice: observed,
            priceSource: source.url,
            priceCheckedAt: new Date().toISOString(),
            sourceStatus: observed ? "live" : "fallback",
          });
        }
      } catch {
        updated.set(source.id, { ...source, status: "failed", lastChecked: new Date().toISOString() });
        const vehicle = VEHICLES.find((item) => item.sourceIds.includes(source.id));
        if (vehicle) {
          observations.push({ vehicleId: vehicle.id, sourceStatus: "failed" });
        }
      }
    }),
  );

  const merged = BASE_SOURCES.map((source) => updated.get(source.id) ?? source);
  return { observations, sources: merged };
}

async function probeReferenceSources(): Promise<Source[]> {
  const skip = new Set([
    ...BASE_SOURCES.filter((source) => source.type === "Manufacturer pricing" || source.type === "Dealer pricing").map((source) => source.id),
    "gov-ev-grant",
    "gov-ved",
  ]);
  const targets = BASE_SOURCES.filter((source) => !skip.has(source.id));

  return Promise.all(
    targets.map(async (source): Promise<Source> => {
      try {
        const html = await fetchText(source.url, Math.max(1800, source.refreshHours * 3600));
        const text = htmlToText(html);
        const linkedVehicle = source.type === "Warranty"
          ? VEHICLES.find((vehicle) => vehicle.sourceIds.includes(source.id))
          : undefined;
        const generatedWarrantyAnchors = linkedVehicle
          ? [
              `${linkedVehicle.warrantyYears} year`,
              ...(linkedVehicle.warrantyMiles >= 900000
                ? ["unlimited"]
                : [linkedVehicle.warrantyMiles.toLocaleString("en-GB")]),
            ]
          : [];
        const anchors = source.anchors?.length ? source.anchors : generatedWarrantyAnchors;
        const anchorsPresent = anchors.length === 0 || anchors.every((anchor) => normalize(text).includes(normalize(anchor)));
        return {
          ...source,
          lastChecked: new Date().toISOString(),
          status: anchorsPresent ? "live" : "changed",
        };
      } catch {
        return {
          ...source,
          lastChecked: new Date().toISOString(),
          status: "failed",
        };
      }
    }),
  );
}

async function getGrantObservations() {
  const url = "https://www.gov.uk/zero-emission-vehicle-grants/cars";
  try {
    const text = htmlToText(await fetchText(url, 1800));
    const band1Start = text.indexOf("Band 1 cars");
    const band2Start = text.indexOf("Band 2 cars");
    const band1Text = band1Start >= 0 && band2Start > band1Start ? text.slice(band1Start, band2Start) : "";
    const band2Text = band2Start >= 0 ? text.slice(band2Start) : "";

    const observations = VEHICLES.map((vehicle): Partial<LiveVehicleObservation> & { vehicleId: string } => {
      if (vehicle.powertrain !== "BEV") return { vehicleId: vehicle.id, grantEligible: false };
      const aliases = [
        `${vehicle.brand} ${vehicle.model}`,
        vehicle.model,
        vehicle.model.replace("E-Tech", "").trim(),
      ].map(normalize);
      const inBand1 = aliases.some((alias) => alias && normalize(band1Text).includes(alias));
      const inBand2 = aliases.some((alias) => alias && normalize(band2Text).includes(alias));
      if (inBand1) return { vehicleId: vehicle.id, grantEligible: true, grantBand: 1, grantAmount: 3750 };
      if (inBand2) return { vehicleId: vehicle.id, grantEligible: true, grantBand: 2, grantAmount: 1500 };
      return { vehicleId: vehicle.id, grantEligible: false };
    });

    return { observations, source: { id: "gov-ev-grant", status: "live" as const, checkedAt: new Date().toISOString(), url } };
  } catch {
    return { observations: [], source: { id: "gov-ev-grant", status: "failed" as const, checkedAt: new Date().toISOString(), url } };
  }
}

async function getOctopusData() {
  const marketingUrl = "https://octopus.energy/smart/intelligent-octopus-go/";
  const productsUrl = "https://api.octopus.energy/v1/products/?brand=OCTOPUS_ENERGY&is_business=false";
  try {
    const [marketing, productsResponse] = await Promise.all([
      fetchText(marketingUrl, 1800),
      fetch(productsUrl, { headers: { "user-agent": USER_AGENT }, next: { revalidate: 1800 } }),
    ]);
    const text = htmlToText(marketing);
    const rateMatch =
      text.match(/smart charge[^.]{0,180}?([0-9]+(?:\.[0-9]+)?)p\/kWh/i) ??
      text.match(/([0-9]+(?:\.[0-9]+)?)p\/kWh/i);
    let productCount: number | undefined;
    if (productsResponse.ok) {
      const payload = await productsResponse.json() as { count?: number };
      productCount = payload.count;
    }
    return {
      offPeakPence: rateMatch ? Number(rateMatch[1]) : undefined,
      checkedAt: new Date().toISOString(),
      status: "live" as const,
      productCount,
    };
  } catch {
    return { offPeakPence: undefined, checkedAt: new Date().toISOString(), status: "failed" as const };
  }
}

function parseUkDate(value: string) {
  const clean = value.trim();
  const dmy = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const date = new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function getFuelData() {
  const statsUrl = "https://www.gov.uk/government/statistics/weekly-road-fuel-prices";
  try {
    const html = await fetchText(statsUrl, 1800);
    const links = [...new Set(
      [...html.matchAll(/href=["']([^"']+\.csv(?:\?[^"']*)?)["']/gi)]
        .map((match) => match[1])
        .map((link) => link.startsWith("http") ? link : new URL(link, "https://www.gov.uk").toString()),
    )];
    if (!links.length) throw new Error("CSV attachment not found");

    const candidates = await Promise.all(
      links.map(async (csvUrl) => {
        try {
          const csv = await fetchText(csvUrl, 1800);
          const rows = csv.trim().split(/\r?\n/).filter(Boolean);
          let best: { date: string; dateValue: number; petrol: number; diesel: number; sourceUrl: string } | undefined;

          for (let i = 1; i < rows.length; i += 1) {
            const cols = rows[i]
              .replace(/^\uFEFF/, "")
              .split(",")
              .map((value) => value.replaceAll('"', "").trim());
            const date = parseUkDate(cols[0] ?? "");
            const petrol = Number(cols[1]);
            const diesel = Number(cols[2]);
            if (!date || !Number.isFinite(petrol) || !Number.isFinite(diesel)) continue;
            if (petrol < 50 || petrol > 300 || diesel < 50 || diesel > 300) continue;

            const row = {
              date: cols[0],
              dateValue: date.getTime(),
              petrol,
              diesel,
              sourceUrl: csvUrl,
            };
            if (!best || row.dateValue > best.dateValue) best = row;
          }
          return best;
        } catch {
          return undefined;
        }
      }),
    );

    const latest = candidates
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .toSorted((a, b) => b.dateValue - a.dateValue)[0];

    if (!latest) throw new Error("Latest fuel row not found");
    return {
      date: latest.date,
      petrol: latest.petrol,
      diesel: latest.diesel,
      checkedAt: new Date().toISOString(),
      status: "live" as const,
      sourceUrl: latest.sourceUrl,
    };
  } catch {
    return { checkedAt: new Date().toISOString(), status: "failed" as const };
  }
}

async function getTaxData() {
  const url = "https://www.gov.uk/guidance/vehicle-tax-for-electric-and-low-emissions-vehicles";
  const annexUrl = "https://www.gov.uk/government/publications/budget-2025-overview-of-tax-legislation-and-rates-ootlar/annex-a-rates-and-allowances";
  try {
    const [guide, annex] = await Promise.all([fetchText(url, 21600), fetchText(annexUrl, 21600)]);
    const text = htmlToText(`${guide} ${annex}`);
    const standard = Number(text.match(/standard rate of £([0-9,]+)/i)?.[1]?.replaceAll(",", "") ?? 200);
    const supplement = Number(text.match(/additional rate of £([0-9,]+)/i)?.[1]?.replaceAll(",", "") ?? text.match(/£([0-9,]+)[^£]{0,80}Expensive Car Supplement/i)?.[1]?.replaceAll(",", "") ?? 440);
    return {
      standard: Number.isFinite(standard) ? standard : 200,
      supplement: Number.isFinite(supplement) ? supplement : 440,
      zevThreshold: 50000,
      otherThreshold: 40000,
      checkedAt: new Date().toISOString(),
      status: "live" as const,
    };
  } catch {
    return { standard: 200, supplement: 440, zevThreshold: 50000, otherThreshold: 40000, checkedAt: new Date().toISOString(), status: "failed" as const };
  }
}

const MARKETCHECK_MODEL: Record<string, string> = {
  "kia-ev3-air-long-range": "EV3",
  "toyota-chr-plus-design": "C-HR+",
  "renault-scenic-techno-lr": "Scenic",
  "skoda-elroq-85-se": "Elroq",
  "hyundai-kona-electric-65": "Kona",
  "toyota-rav4-phev-icon": "RAV4",
  "ford-kuga-phev-stline": "Kuga",
  "mg-hs-phev-trophy": "HS",
};

async function getMarketCheckUsedObservations(): Promise<LiveVehicleObservation[]> {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (!apiKey) return [];

  return Promise.all(
    VEHICLES.map(async (vehicle): Promise<LiveVehicleObservation> => {
      try {
        const url = new URL("https://api.marketcheck.com/v2/search/car/uk/active");
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("make", vehicle.brand);
        url.searchParams.set("model", MARKETCHECK_MODEL[vehicle.id] ?? vehicle.model);
        url.searchParams.set("year", "2025,2026");
        url.searchParams.set("miles_range", "0-15000");
        url.searchParams.set("inventory_type", "used");
        url.searchParams.set("rows", "0");
        url.searchParams.set("stats", "price,miles");

        const response = await fetch(url, {
          headers: { accept: "application/json", "user-agent": USER_AGENT },
          next: { revalidate: 43200 },
        });
        if (!response.ok) throw new Error(`MarketCheck HTTP ${response.status}`);
        const payload = await response.json() as {
          num_found?: number;
          stats?: {
            price?: { median?: number; min?: number; max?: number; count?: number };
            miles?: { median?: number };
          };
        };
        const price = payload.stats?.price;
        return {
          vehicleId: vehicle.id,
          observedUsedMedian: price?.median,
          observedUsedMin: price?.min,
          observedUsedMax: price?.max,
          observedUsedCount: price?.count ?? payload.num_found,
          observedUsedMilesMedian: payload.stats?.miles?.median,
          usedCheckedAt: new Date().toISOString(),
          sourceStatus: price?.median ? "live" : "fallback",
        };
      } catch {
        return {
          vehicleId: vehicle.id,
          usedCheckedAt: new Date().toISOString(),
          sourceStatus: "failed",
        };
      }
    }),
  );
}


const SAFETY_CONFIG: Record<string, Omit<LiveSafetyObservation, "vehicleId" | "checkedAt" | "status">> = {
  "kia-ev3-air-long-range": {
    sourceUrl: "https://www.euroncap.com/assessments/kia/ev3/1111/",
    stars: 4,
    testYear: 2025,
    adultProtection: 83,
    childProtection: 84,
    vulnerableRoadUsers: 78,
    safetyAssist: 78,
    note: "Standard equipment rating is 4 stars; Euro NCAP also publishes a 5-star Safety Pack result.",
  },
  "toyota-chr-plus-design": {
    sourceUrl: "https://www.euroncap.com/assessments/toyota/c-hr/1206/",
    stars: 5,
    testYear: 2025,
    adultProtection: 88,
    childProtection: 85,
    vulnerableRoadUsers: 80,
    safetyAssist: 79,
    note: "Partner model to the 2025 Toyota bZ4X; Euro NCAP performed additional validation tests.",
  },
  "renault-scenic-techno-lr": {
    sourceUrl: "https://www.euroncap.com/assessments/renault/scenic-e-tech/1067/",
    stars: 5,
    testYear: 2022,
    adultProtection: 88,
    childProtection: 89,
    vulnerableRoadUsers: 77,
    safetyAssist: 85,
    note: "Rating published for the Scenic E-Tech and applied to the tested 87 kWh Techno derivative.",
  },
  "skoda-elroq-85-se": {
    sourceUrl: "https://www.euroncap.com/assessments/skoda/elroq/1128/",
    stars: 5,
    testYear: 2025,
    adultProtection: 90,
    childProtection: 87,
    vulnerableRoadUsers: 77,
    safetyAssist: 78,
  },
  "hyundai-kona-electric-65": {
    sourceUrl: "https://www.euroncap.com/assessments/hyundai/kona/1051/",
    stars: 4,
    testYear: 2023,
    adultProtection: 80,
    childProtection: 83,
    vulnerableRoadUsers: 64,
    safetyAssist: 60,
    note: "Euro NCAP's 2023 KONA assessment applies to the electric variant but achieved four stars.",
  },
  "toyota-rav4-phev-icon": {
    sourceUrl: "https://www.euroncap.com/assessments/toyota/rav4/0764/",
    stars: 5,
    testYear: 2019,
    adultProtection: 93,
    childProtection: 87,
    vulnerableRoadUsers: 85,
    safetyAssist: 77,
    ratingExpired: true,
    note: "The 2019 Euro NCAP rating is shown as expired; it remains historical evidence, not a current-protocol rating.",
  },
  "ford-kuga-phev-stline": {
    sourceUrl: "https://www.euroncap.com/assessments/ford/kuga/0792/",
    stars: 5,
    testYear: 2019,
    adultProtection: 92,
    childProtection: 86,
    vulnerableRoadUsers: 82,
    safetyAssist: 73,
    ratingExpired: true,
    note: "The 2019 Euro NCAP rating is shown as expired; it remains historical evidence, not a current-protocol rating.",
  },
  "mg-hs-phev-trophy": {
    sourceUrl: "https://www.euroncap.com/assessments/mg/hs/1061/",
    stars: 5,
    testYear: 2024,
    adultProtection: 90,
    childProtection: 85,
    vulnerableRoadUsers: 83,
    safetyAssist: 74,
    note: "Euro NCAP confirms the 1.5 litre plug-in-hybrid MG HS is covered by the rating.",
  },
};

function percentFrom(text: string, label: string) {
  const match = text.match(new RegExp(`${label}\\s+(\\d{1,3})%`, "i"));
  return match ? Number(match[1]) : undefined;
}

async function getEuroNcapObservations(): Promise<LiveSafetyObservation[]> {
  return Promise.all(
    VEHICLES.map(async (vehicle): Promise<LiveSafetyObservation> => {
      const config = SAFETY_CONFIG[vehicle.id];
      if (!config) {
        return {
          vehicleId: vehicle.id,
          sourceUrl: "https://www.euroncap.com/",
          checkedAt: new Date().toISOString(),
          status: "failed",
          note: "No vehicle-specific Euro NCAP source configured.",
        };
      }
      try {
        const text = htmlToText(await fetchText(config.sourceUrl, 21600));
        const adultProtection = percentFrom(text, "Adult Occupant") ?? config.adultProtection;
        const childProtection = percentFrom(text, "Child Occupant") ?? config.childProtection;
        const vulnerableRoadUsers = percentFrom(text, "Vulnerable Road Users") ?? config.vulnerableRoadUsers;
        const safetyAssist = percentFrom(text, "Safety Assist") ?? config.safetyAssist;
        const ratingExpired = /rating expired|expired/i.test(text) || config.ratingExpired;
        return { vehicleId: vehicle.id, ...config, adultProtection, childProtection, vulnerableRoadUsers, safetyAssist, ratingExpired, checkedAt: new Date().toISOString(), status: "live" };
      } catch {
        return { vehicleId: vehicle.id, ...config, checkedAt: new Date().toISOString(), status: "fallback", note: `${config.note ? `${config.note} ` : ""}Live Euro NCAP page check failed; last verified values retained.` };
      }
    }),
  );
}

const RECALL_CONFIG: Record<string, { makeAliases: string[]; modelAliases: string[]; year: number }> = {
  "kia-ev3-air-long-range": { makeAliases: ["KIA"], modelAliases: ["EV3"], year: 2025 },
  "toyota-chr-plus-design": { makeAliases: ["TOYOTA (GB) PLC", "TOYOTA"], modelAliases: ["C-HR+", "C-HR PLUS"], year: 2026 },
  "renault-scenic-techno-lr": { makeAliases: ["RENAULT"], modelAliases: ["SCENIC E-TECH", "SCENIC"], year: 2025 },
  "skoda-elroq-85-se": { makeAliases: ["SKODA"], modelAliases: ["ELROQ"], year: 2025 },
  "hyundai-kona-electric-65": { makeAliases: ["HYUNDAI"], modelAliases: ["KONA EV", "KONA ELECTRIC", "KONA"], year: 2025 },
  "toyota-rav4-phev-icon": { makeAliases: ["TOYOTA (GB) PLC", "TOYOTA"], modelAliases: ["RAV4"], year: 2025 },
  "ford-kuga-phev-stline": { makeAliases: ["FORD"], modelAliases: ["KUGA"], year: 2025 },
  "mg-hs-phev-trophy": { makeAliases: ["MG MOTOR UK LTD", "MG MOTOR", "MG"], modelAliases: ["HS PHEV", "HS"], year: 2025 },
};

function recallOptions(html: string) {
  const values: Array<{ value: string; label: string }> = [];
  for (const match of html.matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)) {
    const value = match[1]?.trim();
    const label = htmlToText(match[2] ?? "").trim();
    if (value && label) values.push({ value, label });
  }
  return values;
}

function modelMatches(label: string, aliases: string[]) {
  const normalizedLabel = normalize(label);
  return aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return normalizedAlias && (normalizedLabel === normalizedAlias || normalizedLabel.includes(normalizedAlias));
  });
}

async function getPublicRecallObservations(): Promise<LiveRecallObservation[]> {
  const base = "https://www.check-vehicle-recalls.service.gov.uk";
  return Promise.all(
    VEHICLES.map(async (vehicle): Promise<LiveRecallObservation> => {
      const config = RECALL_CONFIG[vehicle.id];
      const checkedAt = new Date().toISOString();
      if (!config) return { vehicleId: vehicle.id, sourceUrl: base, checkedAt, status: "failed", note: "Recall lookup is not configured." };
      let successfulMakePage: string | undefined;
      for (const make of config.makeAliases) {
        const modelListUrl = `${base}/recall-type/vehicle/make/${encodeURIComponent(make)}/model`;
        try {
          const html = await fetchText(modelListUrl, 21600);
          successfulMakePage = modelListUrl;
          const selected = recallOptions(html).find((option) => modelMatches(option.label, config.modelAliases));
          if (!selected) continue;
          const recallsUrl = `${base}/recall-type/vehicle/make/${encodeURIComponent(make)}/model/${encodeURIComponent(selected.value)}/year/${config.year}/recalls`;
          const recallsText = htmlToText(await fetchText(recallsUrl, 21600));
          const countMatch = recallsText.match(/This vehicle has\s+(\d+)\s+recalls?/i);
          const noRecalls = /This vehicle has no recalls/i.test(recallsText);
          if (countMatch || noRecalls) return { vehicleId: vehicle.id, sourceUrl: recallsUrl, checkedAt: new Date().toISOString(), status: "live", recallCount: countMatch ? Number(countMatch[1]) : 0, modelMatched: selected.label, year: config.year, note: "DVSA model-year recall history; an individual VIN/registration check is still required to confirm whether a specific vehicle has outstanding work." };
        } catch {}
      }
      if (successfulMakePage) return { vehicleId: vehicle.id, sourceUrl: successfulMakePage, checkedAt, status: "live", recallCount: 0, year: config.year, note: "This model is not currently listed among recalled vehicles in the DVSA model selector. Individual VIN/registration checks remain authoritative for a specific car." };
      return { vehicleId: vehicle.id, sourceUrl: base, checkedAt, status: "failed", year: config.year, note: "The public DVSA recall service could not be reached during this refresh." };
    }),
  );
}

async function integrationStatuses(): Promise<IntegrationStatus[]> {
  const capConfigured = Boolean(process.env.CAP_HPI_CLIENT_ID && process.env.CAP_HPI_CLIENT_SECRET);
  const autoConfigured = Boolean(process.env.AUTOTRADER_CLIENT_ID && process.env.AUTOTRADER_CLIENT_SECRET);
  const fuelFinderConfigured = Boolean(process.env.FUEL_FINDER_CLIENT_ID && process.env.FUEL_FINDER_CLIENT_SECRET);
  const dvsaConfigured = Boolean(process.env.DVSA_RECALLS_CLIENT_ID && process.env.DVSA_RECALLS_CLIENT_SECRET && process.env.DVSA_RECALLS_API_KEY);
  const marketCheckConfigured = Boolean(process.env.MARKETCHECK_API_KEY);

  let capStatus: IntegrationStatus["status"] = capConfigured ? "configured" : "unconfigured";
  let capDetail = capConfigured ? "Credentials present; token health check pending." : "Add CAP HPI OAuth credentials to enable licensed current/future valuations.";
  if (capConfigured) {
    try {
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.CAP_HPI_CLIENT_ID!,
        client_secret: process.env.CAP_HPI_CLIENT_SECRET!,
        scope: "CapHpi.UK.PublicApi",
      });
      const response = await fetch("https://identity.cap-hpi.com/connect/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      });
      capStatus = response.ok ? "live" : "failed";
      capDetail = response.ok ? "OAuth connected; licensed valuation calls can be enabled." : `OAuth failed with HTTP ${response.status}.`;
    } catch {
      capStatus = "failed";
      capDetail = "CAP HPI OAuth health check failed.";
    }
  }

  return [
    { id: "manufacturer", name: "Manufacturer UK sites", status: "live", detail: "Primary price and warranty pages are probed server-side with validation and fallback.", requiresCredentials: false },
    { id: "gov-grant", name: "GOV.UK Electric Car Grant", status: "live", detail: "Band 1/Band 2 eligibility is read from the current official list.", requiresCredentials: false },
    { id: "octopus", name: "Octopus Energy", status: "live", detail: "Public Octopus API availability plus current Intelligent Octopus Go off-peak rate.", requiresCredentials: false },
    { id: "fuel", name: "DESNZ weekly road fuel prices", status: "live", detail: "Latest official UK petrol/diesel CSV is read automatically.", requiresCredentials: false },
    { id: "euro-ncap", name: "Euro NCAP vehicle safety", status: "live", detail: "Vehicle-specific Euro NCAP pages are checked with protocol year and expiry context.", requiresCredentials: false },
    { id: "public-recalls", name: "DVSA / GOV.UK public recalls", status: "live", detail: "Model-year recall history uses the public DVSA service; VIN-level outstanding status remains a purchase-time check.", requiresCredentials: false },
    { id: "marketcheck", name: "MarketCheck UK live inventory", status: marketCheckConfigured ? "configured" : "unconfigured", detail: marketCheckConfigured ? "API key present; live UK inventory endpoint enabled." : "Add a MarketCheck API key to enable live UK nearly-new listings immediately.", requiresCredentials: true },
    { id: "cap-hpi", name: "CAP HPI valuations", status: capStatus, detail: capDetail, requiresCredentials: true },
    { id: "autotrader", name: "Auto Trader Connect Search Adverts", status: autoConfigured ? "configured" : "unconfigured", detail: autoConfigured ? "Credentials present; production Search Adverts access must be approved by Auto Trader." : "Requires Auto Trader Connect credentials and Search Adverts production approval.", requiresCredentials: true },
    { id: "fuel-finder", name: "GOV.UK Fuel Finder API", status: fuelFinderConfigured ? "configured" : "unconfigured", detail: fuelFinderConfigured ? "Credentials present; use for local forecourt prices." : "OAuth credentials required for near-real-time local forecourt prices; weekly UK average remains live without credentials.", requiresCredentials: true },
    { id: "dvsa-recalls-api", name: "DVSA Manufacturer Recalls API", status: dvsaConfigured ? "configured" : "unconfigured", detail: dvsaConfigured ? "Manufacturer API credentials are present." : "Optional manufacturer-grade API access requires DVSA onboarding; the public DVSA recall feed is already active.", requiresCredentials: true },
  ];
}

export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  const [manufacturer, referenceSources, grants, octopus, fuel, tax, usedMarket, safety, recalls, integrations] = await Promise.all([
    getManufacturerObservations(),
    probeReferenceSources(),
    getGrantObservations(),
    getOctopusData(),
    getFuelData(),
    getTaxData(),
    getMarketCheckUsedObservations(),
    getEuroNcapObservations(),
    getPublicRecallObservations(),
    integrationStatuses(),
  ]);

  const grantMap = new Map(grants.observations.map((item) => [item.vehicleId, item]));
  const manufacturerMap = new Map(manufacturer.observations.map((item) => [item.vehicleId, item]));
  const usedMap = new Map(usedMarket.map((item) => [item.vehicleId, item]));
  const vehicleObservations: LiveVehicleObservation[] = VEHICLES.map((vehicle) => {
    const manufacturerObservation = manufacturerMap.get(vehicle.id);
    const usedObservation = usedMap.get(vehicle.id);
    const grant = grantMap.get(vehicle.id);
    const statuses = [manufacturerObservation?.sourceStatus, usedObservation?.sourceStatus].filter(Boolean);
    const sourceStatus: LiveVehicleObservation["sourceStatus"] =
      statuses.includes("live") ? "live" : statuses.includes("failed") && statuses.length === 1 ? "failed" : "fallback";

    return {
      vehicleId: vehicle.id,
      ...manufacturerObservation,
      ...usedObservation,
      grantEligible: grant?.grantEligible,
      grantBand: grant?.grantBand,
      grantAmount: grant?.grantAmount,
      sourceStatus,
    };
  });

  const sourceMap = new Map(manufacturer.sources.map((source) => [source.id, source]));
  for (const source of referenceSources) sourceMap.set(source.id, source);
  const now = new Date().toISOString();
  const sources: Source[] = BASE_SOURCES.map((source): Source => {
    const current = sourceMap.get(source.id) ?? source;
    if (source.id === "gov-ev-grant") return { ...current, status: grants.source.status === "live" ? "live" as const : "failed" as const, lastChecked: grants.source.checkedAt };
    if (source.id === "gov-ved") return { ...current, status: tax.status === "live" ? "live" as const : "failed" as const, lastChecked: tax.checkedAt };
    return current;
  });
  sources.push(
    { id: "octopus-live", name: "Octopus Intelligent Go", url: "https://octopus.energy/smart/intelligent-octopus-go/", type: "Electricity tariff", quality: "Primary", refreshHours: 1, lastChecked: octopus.checkedAt, status: octopus.status === "live" ? "live" : "failed" },
    { id: "desnz-fuel", name: "DESNZ weekly road fuel prices", url: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices", type: "Fuel price", quality: "Primary", refreshHours: 24, lastChecked: fuel.checkedAt, status: fuel.status === "live" ? "live" : "failed" },
    ...safety.map((item): Source => ({ id: `euroncap-${item.vehicleId}`, name: `Euro NCAP – ${VEHICLES.find((vehicle) => vehicle.id === item.vehicleId)?.brand ?? ""} ${VEHICLES.find((vehicle) => vehicle.id === item.vehicleId)?.model ?? ""}`.trim(), url: item.sourceUrl, type: "Safety", quality: "Primary", refreshHours: 24, lastChecked: item.checkedAt, status: item.status === "live" ? "live" : item.status === "failed" ? "failed" : "current" })),
    { id: "dvsa-public-recalls", name: "DVSA / GOV.UK vehicle recall service", url: "https://www.check-vehicle-recalls.service.gov.uk/", type: "Recalls", quality: "Primary", refreshHours: 24, lastChecked: recalls[0]?.checkedAt ?? now, status: recalls.some((item) => item.status === "live") ? "live" : "failed" },
  );

  const liveSourceCount = sources.filter((source) => source.status === "live").length;
  const failedSourceCount = sources.filter((source) => source.status === "failed").length;
  const fallbackSourceCount = sources.filter((source) => source.status !== "live" && source.status !== "failed").length;

  return {
    generatedAt: now,
    market: {
      petrolPencePerLitre: "petrol" in fuel ? fuel.petrol : undefined,
      dieselPencePerLitre: "diesel" in fuel ? fuel.diesel : undefined,
      fuelCheckedAt: fuel.checkedAt,
      octopusOffPeakPence: octopus.offPeakPence,
      octopusCheckedAt: octopus.checkedAt,
      vedStandardAnnual: tax.standard,
      vedExpensiveSupplement: tax.supplement,
      vedZevThreshold: tax.zevThreshold,
      vedOtherThreshold: tax.otherThreshold,
      taxCheckedAt: tax.checkedAt,
    },
    vehicleObservations,
    sources,
    integrations,
    safety,
    recalls,
    diagnostics: {
      liveSourceCount,
      fallbackSourceCount,
      failedSourceCount,
    },
  };
}
