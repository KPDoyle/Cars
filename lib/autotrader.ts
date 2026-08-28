import "server-only";

type Token = { value: string; expiresAt: number };
let cached: Token | null = null;

export function autoTraderConfig() {
  const key = process.env.AUTOTRADER_API_KEY ?? process.env.AUTOTRADER_CLIENT_ID;
  const secret = process.env.AUTOTRADER_API_SECRET ?? process.env.AUTOTRADER_CLIENT_SECRET;
  const advertiserId = process.env.AUTOTRADER_ADVERTISER_ID;
  const baseUrl = (process.env.AUTOTRADER_API_URL ?? "https://api.autotrader.co.uk").replace(/\/$/, "");
  return { key, secret, advertiserId, baseUrl, configured: Boolean(key && secret && advertiserId) };
}

export async function getAutoTraderToken() {
  const config = autoTraderConfig();
  if (!config.key || !config.secret) throw new Error("Auto Trader API credentials are not configured.");
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const body = new URLSearchParams({ key: config.key, secret: config.secret });
  const response = await fetch(`${config.baseUrl}/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    cache: "no-store",
  });
  const cfRay = response.headers.get("cf-ray") ?? undefined;
  const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_at?: string | number; message?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`Auto Trader authentication failed (HTTP ${response.status}${cfRay ? `, CF-Ray ${cfRay}` : ""}).`);
  }

  const parsedExpiry = payload.expires_at ? new Date(payload.expires_at).getTime() : NaN;
  cached = {
    value: payload.access_token,
    expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 14 * 60_000,
  };
  return cached.value;
}

export async function autoTraderFetch(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const config = autoTraderConfig();
  if (!config.configured) throw new Error("Auto Trader is not configured.");
  const token = await getAutoTraderToken();
  const url = new URL(path, `${config.baseUrl}/`);
  url.searchParams.set("advertiserId", config.advertiserId!);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  let response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 401) {
    cached = null;
    const retryToken = await getAutoTraderToken();
    response = await fetch(url, {
      headers: { authorization: `Bearer ${retryToken}`, accept: "application/json" },
      cache: "no-store",
    });
  }

  const cfRay = response.headers.get("cf-ray") ?? undefined;
  const payload = await response.json().catch(() => ({ error: "Non-JSON response" }));
  if (!response.ok) {
    throw new Error(`Auto Trader API failed (HTTP ${response.status}${cfRay ? `, CF-Ray ${cfRay}` : ""}): ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload;
}
