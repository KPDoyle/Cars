# CarWise — Live UK electrified-SUV decision engine

CarWise is a server-backed decision-support application built from the UK Electrified SUV Purchase Study. It ranks BEVs and PHEVs separately, calculates buyer-specific ownership costs, compares new versus nearly-new purchase strategies, models warranty-aware exit timing, and continuously checks the evidence that drives the recommendation.

## Production

**Public app:** https://cars-ashen-alpha.vercel.app/

The `main` branch deploys automatically to the Vercel project `cars`.

## What is live without supplier credentials

The production server currently refreshes and validates:

- UK manufacturer/dealer cash/OTR price pages for shortlisted vehicles
- GOV.UK Electric Car Grant Band 1/Band 2 eligibility
- current UK VED rules and expensive-car supplement thresholds
- Intelligent Octopus Go off-peak rate and Octopus public product API
- DESNZ official weekly UK petrol and diesel prices
- current warranty source pages, with change detection against expected headline cover
- vehicle-specific Euro NCAP stars, protection percentages, test year and expired-rating context
- public DVSA/GOV.UK model-year recall history for every shortlisted vehicle
- daily source-change monitoring via GitHub Actions
- daily live refresh via Vercel Cron
- manual on-demand refresh from the UI

Every live observation carries a checked-at time and source status. If a source cannot be validated, the application keeps the reviewed fallback rather than silently substituting an ambiguous figure.

## Credential-gated integrations

The code paths are already present; these become live when the relevant provider credentials are added to Vercel.

| Integration | Environment variables | Purpose |
| --- | --- | --- |
| MarketCheck UK | `MARKETCHECK_API_KEY` | live UK nearly-new inventory, median asking price, mileage and listing count |
| CAP HPI | `CAP_HPI_CLIENT_ID`, `CAP_HPI_CLIENT_SECRET` | licensed current/future valuations and residual values |
| Auto Trader Connect | `AUTOTRADER_API_KEY`, `AUTOTRADER_API_SECRET`, `AUTOTRADER_ADVERTISER_ID` | live authentication, VRM vehicle lookup and Search endpoint; production capabilities require Auto Trader approval |
| GOV.UK Fuel Finder | `FUEL_FINDER_CLIENT_ID`, `FUEL_FINDER_CLIENT_SECRET` | OAuth connector for current forecourt/fuel-price batches; national DESNZ fallback stays active |
| DVSA Vehicle Recalls | `DVSA_RECALLS_CLIENT_ID`, `DVSA_RECALLS_CLIENT_SECRET`, `DVSA_RECALLS_API_KEY` | vehicle-level recall data after DVSA onboarding |
| Vercel Cron security | `CRON_SECRET` | optional protection for the scheduled refresh endpoint |

MarketCheck is the quickest route to replacing the reviewed nearly-new price snapshot with live UK listing statistics. CAP HPI is the preferred licensed source for production-grade residual/valuation data.

## Live API endpoints

- `GET /api/live` — current live market snapshot, sources, grant status and integration health
- `GET /api/used/search` — MarketCheck-backed UK used inventory search when `MARKETCHECK_API_KEY` is present
- `GET /api/cron/refresh` — scheduled live-source health/refresh endpoint
- `GET /api/health` — production health check across public feeds and optional provider status
- `GET /api/integrations/autotrader/vehicle?vrm=AB12CDE` — Auto Trader vehicle lookup when licensed
- `GET /api/integrations/autotrader/search?... ` — Auto Trader Search capability when licensed/approved
- `GET /api/integrations/cap-hpi/vehicle?vrm=AB12CDE` — CAP HPI derivative, vehicle, checks, latest MOT, DVLA and product entitlements
- `GET /api/integrations/fuel-finder?type=prices&batch=1` — GOV.UK Fuel Finder live price batch when OAuth credentials are present

Example:

```text
/api/used/search?make=Kia&model=EV3&year=2025,2026&miles_range=0-15000&rows=10
```

## Decision functionality

- personalised buyer profile and sensitivity controls
- separate BEV and PHEV rankings
- cross-technology recommendation
- live/fallback new price handling
- live used-market median override when MarketCheck is connected
- Electric Car Grant eligibility
- energy costs from current electricity/petrol assumptions
- realistic PHEV electric-share modelling
- current VED treatment
- 3–7 year TCO
- warranty-aware recommended disposal timing
- residual-risk treatment
- new vs nearly-new deal bands
- multi-vehicle comparison
- data-source monitor
- vehicle-specific Euro NCAP and recall intelligence in comparisons
- actionable alerts for price thresholds, model-year recalls, failed sources and missing critical integrations
- responsive desktop/tablet/mobile UI

## Data integrity rules

CarWise deliberately keeps these concepts separate:

1. **Live observed data** — fetched and validated now.
2. **Reviewed fallback data** — most recently verified research value used if a live page cannot be parsed confidently.
3. **Modelled estimates** — TCO, real-world range assumptions, residual percentages and scoring assumptions.
4. **Licensed data** — activated only when a contracted/provider API is configured.

A page change never automatically becomes a price unless it passes validation. Finance deposits, monthly payments and manufacturer contributions are not treated as cash prices.

## Scheduled monitoring

### Vercel
`vercel.json` runs `/api/cron/refresh` daily at 05:15 UTC. Vercel Hobby supports daily Cron Jobs.

### GitHub Actions
`.github/workflows/refresh-data.yml` checks the persistent source registry daily and commits changed hashes/observations to maintain an auditable source history.

## Local development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
```

Historical source refresh:

```bash
npm run refresh:data
```

## Production access and provider caveats

The app is fully operational with its public/official live sources. Commercial used-car inventory, Auto Trader data and licensed residual values cannot be truthfully marked live until the relevant provider account/API credentials and production entitlements are supplied. The UI exposes that state explicitly rather than presenting research estimates as live commercial data.

The Vercel project is currently configured with Vercel Authentication covering the production domain. For a genuinely public launch, change **Project Settings → Deployment Protection → Vercel Authentication → Standard Protection**. This preserves protected preview deployments while leaving the production domain public. This is a Vercel account setting, not a code setting.
