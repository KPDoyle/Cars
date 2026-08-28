import "server-only";

type Token = { value: string; expiresAt: number };
let cached: Token | null = null;

export function capHpiConfig() {
  const clientId = process.env.CAP_HPI_CLIENT_ID;
  const clientSecret = process.env.CAP_HPI_CLIENT_SECRET;
  const baseUrl = (process.env.CAP_HPI_API_URL ?? "https://api.cap-hpi.co.uk").replace(/\/$/, "");
  return { clientId, clientSecret, baseUrl, configured: Boolean(clientId && clientSecret) };
}

export async function getCapHpiToken() {
  const config = capHpiConfig();
  if (!config.clientId || !config.clientSecret) throw new Error("CAP HPI credentials are not configured.");
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "CapHpi.UK.PublicApi",
  });
  const response = await fetch("https://identity.cap-hpi.com/connect/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`CAP HPI authentication failed (HTTP ${response.status}).`);
  }
  cached = { value: payload.access_token, expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 600) * 1000 };
  return cached.value;
}

export async function capHpiGet(path: string) {
  const config = capHpiConfig();
  if (!config.configured) throw new Error("CAP HPI is not configured.");
  const token = await getCapHpiToken();
  const response = await fetch(`${config.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({ error: "Non-JSON response" }));
  if (!response.ok) throw new Error(`CAP HPI API failed (HTTP ${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  return payload;
}
