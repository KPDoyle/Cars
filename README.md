# CarWise — UK electrified SUV decision engine

CarWise is a buyer-specific decision-support application derived from the UK Electrified SUV Purchase Study. It ranks BEVs and PHEVs separately, compares them using a personalised ownership model, models energy and TCO, calculates a warranty-aware exit strategy, and monitors primary research sources for changes.

## What works now

- Personalised buyer profile with browser persistence
- Separate BEV and PHEV rankings
- Cross-technology winner
- New vs 6–12 month purchase strategy
- Energy-cost model for BEVs and PHEVs
- PHEV charging-discipline modelling
- 3–7 year TCO model
- Warranty-aware exit calculation
- Deal thresholds and first-year depreciation view
- Multi-car comparison
- Source provenance and freshness dashboard
- Daily GitHub Actions source-change monitor
- Static production export compatible with GitHub Pages

## Live-data design

`data/vehicle-data.json` contains reviewed research values plus a source registry. `scripts/refresh-data.mjs` fetches configured public/primary sources, hashes their current content, records the last check, flags changed pages, and captures plausible price observations near configured vehicle anchors.

The monitor intentionally **does not automatically overwrite reviewed vehicle prices** when a webpage changes. This prevents a generic scraper from silently publishing a finance deposit, monthly payment, accessory price or unrelated trim price as the cash purchase price. The next production phase should connect licensed/authorised feeds (for example valuation, advert and manufacturer APIs) and add an admin approval queue.

## Local development

```bash
npm install
npm run dev
```

Production check:

```bash
npm run lint
npm run build
```

Run the source monitor manually:

```bash
npm run refresh:data
```

## Data caveat

The seeded values are the 28 August 2026 research snapshot used to build the MVP. Residual percentages, TCO and deal bands are decision-model inputs and should not be represented as formal valuations until licensed market data is integrated.
