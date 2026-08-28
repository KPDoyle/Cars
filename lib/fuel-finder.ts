import "server-only";

type Token = { value: string; expiresAt: number };
let cached: Token | null = null;

export function fuelFinderConfig() {
  const clientId = process.env.FUEL_FINDER_CLIENT_ID;
  const clientSecret = process.env.FUEL_FINDER_CLIENT_SECRET;
  const baseUrl = (process.env.FUEL_FINDER_API_URL ?? "https://www.fuel-finder.service.gov.uk").replace(/\/$/, "");
  const tokenUrl = process.env.FUEL_FINDER_TOKEN_URL ?? `${baseUrl}/api/v1/oauth/generate_access_token`;
  return { clientId, clientSecret, baseUrl, tokenUrl, configured: Boolean(clientId && clientSecret) };
}

export async function getFuelFinderToken() {
  const config = fuelFinderConfig();
  if (!config.clientId || !config.clientSecret) throw new Error("Fuel Finder credentials are not configured.");
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    token?: string;
    data?: { access_token?: string; expires_in?: number };
  };
  const accessToken = payload.access_token ?? payload.token ?? payload.data?.access_token;
  const expiresIn = payload.expires_in ?? payload.data?.expires_in ?? 3600;
  if (!response.ok || !accessToken) {
    throw new Error(`Fuel Finder authentication failed (HTTP ${response.status}).`);
  }
  cached = { value: accessToken, expiresAt: Date.now() + Math.max(60, expiresIn) * 1000 };
  return cached.value;
}

export async function fuelFinderGet(path: string, params: Record<string, string | number | undefined> = {}) {
  const config = fuelFinderConfig();
  if (!config.configured) throw new Error("Fuel Finder is not configured.");
  const token = await getFuelFinderToken();
  const url = new URL(path, `${config.baseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({ error: "Non-JSON response" }));
  if (!response.ok) throw new Error(`Fuel Finder API failed (HTTP ${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  return payload;
}
