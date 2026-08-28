import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DATA_PATH = resolve(process.cwd(), "data/vehicle-data.json");
const HISTORY_PATH = resolve(process.cwd(), "data/price-history.json");
const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
let priceHistory = [];
try {
  priceHistory = JSON.parse(await readFile(HISTORY_PATH, "utf8"));
} catch {
  priceHistory = [];
}
const now = new Date().toISOString();

function hashContent(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&pound;|&#163;/gi, "£")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function priceCandidates(text) {
  return [...text.matchAll(/£\s?((?:[1-9][0-9]{0,2}(?:,[0-9]{3})+)|(?:[1-9][0-9]{4,5}))/g)]
    .map((match) => Number(match[1].replaceAll(",", "")))
    .filter((value) => value >= 15000 && value <= 120000);
}

function extractObservedPrice(text, source) {
  if (!source.expectedPrice) return undefined;
  const expected = source.expectedPrice;
  const candidates = priceCandidates(text);
  if (!candidates.length) return undefined;
  const best = candidates.toSorted((a, b) => Math.abs(a - expected) - Math.abs(b - expected))[0];
  const variance = Math.abs(best - expected) / expected;
  return variance <= 0.15 ? best : undefined;
}

let changedSources = 0;
let failedSources = 0;

for (const source of data.sources) {
  try {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "CarWiseResearchMonitor/0.1 (+https://github.com/KPDoyle/Cars)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const text = htmlToText(html);
    const nextHash = hashContent(text);
    const previousHash = source.contentHash;
    const changed = Boolean(previousHash && previousHash !== nextHash);
    const observedPrice = extractObservedPrice(text, source);

    source.lastChecked = now;
    source.contentHash = nextHash;
    source.status = changed ? "changed" : "current";
    if (changed) changedSources += 1;

    if (observedPrice) {
      const previousObserved = source.observedPrice;
      source.observedPrice = observedPrice;
      source.observedAt = now;

      const last = priceHistory
        .filter((entry) => entry.sourceId === source.id)
        .toSorted((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)))[0];
      if (!last || last.price !== observedPrice) {
        priceHistory.push({
          checkedAt: now,
          sourceId: source.id,
          sourceName: source.name,
          price: observedPrice,
          previousPrice: previousObserved,
          url: source.url,
        });
      }
    }
  } catch (error) {
    source.lastChecked = now;
    source.status = "failed";
    source.lastError = error instanceof Error ? error.message : String(error);
    failedSources += 1;
  }
}

data.monitor = { lastRun: now, changedSources, failedSources };
data.asOf = data.asOf || now.slice(0, 10);
await Promise.all([
  writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8"),
  writeFile(HISTORY_PATH, `${JSON.stringify(priceHistory.slice(-1000), null, 2)}\n`, "utf8"),
]);
console.log(`Source monitor complete: ${changedSources} changed, ${failedSources} failed.`);
