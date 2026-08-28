import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DATA_PATH = resolve(process.cwd(), "data/vehicle-data.json");
const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
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
  return [...text.matchAll(/£\s?([1-9][0-9]{1,2}(?:,[0-9]{3})+)/g)]
    .map((match) => Number(match[1].replaceAll(",", "")))
    .filter((value) => value >= 15000 && value <= 120000);
}

function extractObservedPrice(text, source) {
  if (!source.expectedPrice) return undefined;
  const anchors = source.anchors ?? [];
  let scope = text;

  for (const anchor of anchors) {
    const position = text.toLowerCase().indexOf(anchor.toLowerCase());
    if (position >= 0) {
      scope = text.slice(Math.max(0, position - 800), position + 2200);
      break;
    }
  }

  const prices = priceCandidates(scope);
  if (!prices.length) return undefined;
  const best = prices.toSorted((a, b) => Math.abs(a - source.expectedPrice) - Math.abs(b - source.expectedPrice))[0];
  const variance = Math.abs(best - source.expectedPrice) / source.expectedPrice;
  return variance <= 0.25 ? best : undefined;
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
      source.observedPrice = observedPrice;
      source.observedAt = now;
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
await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Source monitor complete: ${changedSources} changed, ${failedSources} failed.`);
