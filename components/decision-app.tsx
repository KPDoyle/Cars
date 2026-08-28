"use client";

import {
  Activity,
  BadgePoundSterling,
  BatteryCharging,
  Bell,
  CarFront,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Database,
  Gauge,
  GitCompareArrows,
  Info,
  LayoutDashboard,
  Menu,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import rawData from "@/data/vehicle-data.json";
import {
  annualEnergyCost,
  money,
  money2,
  personalisedScore,
  purchasePrice,
  tco,
  warrantyExit,
} from "@/lib/calculations";
import type { BuyerProfile, Source, Vehicle } from "@/lib/types";

const vehicles = rawData.vehicles as unknown as Vehicle[];
const sources = rawData.sources as unknown as Source[];

type View = "dashboard" | "compare" | "deals" | "profile" | "data" | "methodology";

const defaultProfile: BuyerProfile = {
  budget: 50000,
  annualMiles: 8000,
  typicalJourney: 35,
  electricityPence: 8,
  petrolPencePerLitre: 144,
  chargeDiscipline: 90,
  ownershipYears: 5,
  purchaseMode: "nearly-new",
  warrantyWeight: 15,
  depreciationWeight: 20,
  comfortWeight: 10,
};

const nav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Decision", icon: LayoutDashboard },
  { id: "compare", label: "Compare", icon: GitCompareArrows },
  { id: "deals", label: "Deals", icon: BadgePoundSterling },
  { id: "profile", label: "Buyer profile", icon: SlidersHorizontal },
  { id: "data", label: "Data monitor", icon: Database },
  { id: "methodology", label: "Method", icon: Info },
];

function classNames(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

function riskClass(risk: string) {
  return risk === "Low" ? "good" : risk === "High" ? "risk" : "warn";
}

function scoreClass(score: number) {
  if (score >= 86) return "excellent";
  if (score >= 80) return "good";
  if (score >= 74) return "fair";
  return "weak";
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <div className="range-head">
        <span>{label}</span>
        <strong>{value.toLocaleString("en-GB")}{suffix}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="range-scale"><span>{min.toLocaleString("en-GB")}</span><span>{max.toLocaleString("en-GB")}</span></div>
    </label>
  );
}

function VehicleBadge({ powertrain }: { powertrain: Vehicle["powertrain"] }) {
  return <span className={classNames("power-badge", powertrain === "BEV" ? "bev" : "phev")}>{powertrain}</span>;
}

function RecommendationCard({
  vehicle,
  profile,
  rank,
  featured = false,
}: {
  vehicle: Vehicle;
  profile: BuyerProfile;
  rank: number;
  featured?: boolean;
}) {
  const score = personalisedScore(vehicle, profile);
  const cost = tco(vehicle, profile);
  const exit = warrantyExit(vehicle, profile);
  const energy = annualEnergyCost(vehicle, profile);
  return (
    <article className={classNames("vehicle-card", featured && "featured")}>
      <div className="vehicle-topline">
        <div className="rank">#{rank}</div>
        <VehicleBadge powertrain={vehicle.powertrain} />
        <span className={classNames("score-chip", scoreClass(score))}>{score.toFixed(1)}</span>
      </div>
      <div>
        <p className="eyebrow">{vehicle.brand} · {vehicle.segment}</p>
        <h3>{vehicle.model}</h3>
        <p className="trim">{vehicle.trim}</p>
      </div>
      <p className="verdict">{vehicle.verdict}</p>
      <div className="metric-grid compact">
        <div><span>Buy price</span><strong>{money(purchasePrice(vehicle, profile))}</strong></div>
        <div><span>{profile.ownershipYears}yr TCO</span><strong>{money(cost.total)}</strong></div>
        <div><span>Energy / yr</span><strong>{money(energy.total)}</strong></div>
        <div><span>Safe exit</span><strong>{exit.yearsFromPurchase.toFixed(1)} yrs</strong></div>
      </div>
      <div className="card-footer">
        <span className={classNames("risk-pill", riskClass(vehicle.residualRisk))}>{vehicle.residualRisk} residual risk</span>
        <span>{vehicle.warrantyYears}yr warranty</span>
      </div>
    </article>
  );
}

export function DecisionApp() {
  const [view, setView] = useState<View>("dashboard");
  const [profile, setProfile] = useState<BuyerProfile>(defaultProfile);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([
    "kia-ev3-air-long-range",
    "toyota-rav4-phev-icon",
    "toyota-chr-plus-icon",
  ]);
  const [dealQuery, setDealQuery] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("carwise-profile-v1");
    if (saved) {
      try {
        setProfile({ ...defaultProfile, ...JSON.parse(saved) });
      } catch {
        // Ignore invalid local state and use research defaults.
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("carwise-profile-v1", JSON.stringify(profile));
  }, [profile]);

  const ranked = useMemo(
    () => [...vehicles].sort((a, b) => personalisedScore(b, profile) - personalisedScore(a, profile)),
    [profile],
  );
  const bevRanked = ranked.filter((vehicle) => vehicle.powertrain === "BEV");
  const phevRanked = ranked.filter((vehicle) => vehicle.powertrain === "PHEV");
  const winner = ranked[0];
  const winnerTco = tco(winner, profile);
  const winnerExit = warrantyExit(winner, profile);
  const technologyWinner = personalisedScore(bevRanked[0], profile) >= personalisedScore(phevRanked[0], profile) ? "BEV" : "PHEV";

  const changeProfile = <K extends keyof BuyerProfile>(key: K, value: BuyerProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const changeView = (next: View) => {
    setView(next);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <aside className={classNames("sidebar", mobileOpen && "open")}>
        <div className="brand">
          <div className="brand-mark"><CarFront size={21} /></div>
          <div><strong>CarWise</strong><span>Decision intelligence</span></div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="nav-list" aria-label="Primary navigation">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={classNames("nav-item", view === item.id && "active")} onClick={() => changeView(item.id)}>
                <Icon size={18} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <div className="status-head"><Activity size={15} /><span>Research engine</span></div>
          <strong>{sources.length} sources monitored</strong>
          <p>Seeded 28 Aug 2026. Scheduled source checks are included in the repository.</p>
          <div className="status-row"><span className="dot live" /> Data model ready</div>
        </div>
      </aside>

      {mobileOpen ? <button className="scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="topbar-copy">
            <span>UK electrified SUV study</span>
            <strong>{nav.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="freshness"><span className="dot live" /> Research snapshot: 28 Aug 2026</span>
            <button className="icon-button" aria-label="Alerts"><Bell size={18} /></button>
          </div>
        </header>

        {view === "dashboard" ? (
          <section className="page dashboard-page">
            <div className="hero-grid">
              <div className="hero-card">
                <div className="hero-kicker"><Sparkles size={16} /> Your best purchase today</div>
                <div className="hero-main">
                  <div>
                    <div className="hero-badges"><VehicleBadge powertrain={winner.powertrain} /><span className="recommend-chip">Overall winner</span></div>
                    <h1>{winner.brand} {winner.model}</h1>
                    <p className="hero-trim">{winner.trim}</p>
                    <p className="hero-copy">{winner.verdict}</p>
                  </div>
                  <div className="hero-score">
                    <span>Fit score</span>
                    <strong>{personalisedScore(winner, profile).toFixed(1)}</strong>
                    <small>/100</small>
                  </div>
                </div>
                <div className="hero-metrics">
                  <div><span>Recommended buy</span><strong>{profile.purchaseMode === "new" ? "New" : "6–12 months old"}</strong></div>
                  <div><span>Target price</span><strong>{money(winner.excellentDeal)}</strong></div>
                  <div><span>Maximum fair price</span><strong>{money(winner.fairDealMax)}</strong></div>
                  <div><span>Modelled {profile.ownershipYears}yr TCO</span><strong>{money(winnerTco.total)}</strong></div>
                </div>
                <div className="hero-bottom">
                  <div><ShieldCheck size={18} /><span>Sell in about <strong>{winnerExit.yearsFromPurchase.toFixed(1)} years</strong> to retain ~{winnerExit.warrantyRemainingYears.toFixed(1)} years of principal warranty.</span></div>
                  <button className="link-button" onClick={() => changeView("compare")}>Compare finalists <ChevronRight size={16} /></button>
                </div>
              </div>

              <div className="decision-stack">
                <div className="decision-card technology">
                  <span className="decision-icon"><Zap size={20} /></span>
                  <div><span>Technology verdict</span><strong>{technologyWinner}</strong><p>Cheap home charging and low annual mileage make a full EV the stronger default.</p></div>
                </div>
                <div className="decision-card">
                  <span className="decision-icon"><CircleDollarSign size={20} /></span>
                  <div><span>Budget sweet spot</span><strong>£28k–£36k</strong><p>Nearly-new absorbs the steepest first-year depreciation without sacrificing much warranty.</p></div>
                </div>
                <div className="decision-card">
                  <span className="decision-icon"><ShieldCheck size={20} /></span>
                  <div><span>Warranty benchmark</span><strong>7yr / 100k</strong><p>Calendar warranty duration matters more than mileage at ~{profile.annualMiles.toLocaleString()} miles/year.</p></div>
                </div>
              </div>
            </div>

            <div className="section-head">
              <div><p className="eyebrow">Separate technology rankings</p><h2>Best candidates for your profile</h2></div>
              <button className="secondary-button" onClick={() => changeView("profile")}><Settings2 size={16} /> Change assumptions</button>
            </div>
            <div className="ranking-columns">
              <div>
                <div className="column-title"><BatteryCharging size={18} /><h3>BEV ranking</h3><span>{bevRanked.length} shortlisted</span></div>
                <div className="vehicle-list">{bevRanked.slice(0, 3).map((vehicle, index) => <RecommendationCard key={vehicle.id} vehicle={vehicle} profile={profile} rank={index + 1} featured={index === 0} />)}</div>
              </div>
              <div>
                <div className="column-title"><Gauge size={18} /><h3>PHEV ranking</h3><span>{phevRanked.length} shortlisted</span></div>
                <div className="vehicle-list">{phevRanked.slice(0, 3).map((vehicle, index) => <RecommendationCard key={vehicle.id} vehicle={vehicle} profile={profile} rank={index + 1} featured={index === 0} />)}</div>
              </div>
            </div>

            <div className="insight-grid">
              <div className="insight-card"><span className="mini-icon"><BadgePoundSterling size={18} /></span><div><span>Energy advantage</span><strong>{money(annualEnergyCost(bevRanked[0], profile).total)}/yr</strong><p>Modelled home-charging cost for the leading BEV at {profile.electricityPence}p/kWh.</p></div></div>
              <div className="insight-card"><span className="mini-icon"><RefreshCcw size={18} /></span><div><span>Live-data principle</span><strong>Never overwrite history</strong><p>Price and warranty observations are time-stamped so price-cut and residual risk can be detected.</p></div></div>
              <div className="insight-card"><span className="mini-icon"><TriangleAlert size={18} /></span><div><span>Biggest market risk</span><strong>EV price compression</strong><p>Manufacturer cuts can reduce both the new price and the resale value of existing cars.</p></div></div>
            </div>
          </section>
        ) : null}

        {view === "compare" ? (
          <section className="page">
            <PageTitle eyebrow="Buyer suitability" title="Compare finalists" description="Compare BEVs and PHEVs on the things that matter to this buyer rather than headline specifications alone." />
            <div className="compare-picker">
              {vehicles.map((vehicle) => {
                const selected = compareIds.includes(vehicle.id);
                return (
                  <button
                    key={vehicle.id}
                    className={classNames("picker-chip", selected && "selected")}
                    onClick={() => setCompareIds((current) => selected ? current.filter((id) => id !== vehicle.id) : current.length < 4 ? [...current, vehicle.id] : current)}
                  >
                    {selected ? <CheckCircle2 size={14} /> : null}{vehicle.brand} {vehicle.model}
                  </button>
                );
              })}
            </div>
            <div className="compare-grid">
              {vehicles.filter((vehicle) => compareIds.includes(vehicle.id)).map((vehicle) => {
                const energy = annualEnergyCost(vehicle, profile);
                const cost = tco(vehicle, profile);
                const exit = warrantyExit(vehicle, profile);
                return (
                  <article key={vehicle.id} className="compare-card">
                    <div className="compare-title"><div><VehicleBadge powertrain={vehicle.powertrain} /><h3>{vehicle.brand} {vehicle.model}</h3><p>{vehicle.trim}</p></div><span className={classNames("score-chip", scoreClass(personalisedScore(vehicle, profile)))}>{personalisedScore(vehicle, profile).toFixed(1)}</span></div>
                    <Metric label="Buy price" value={money(purchasePrice(vehicle, profile))} />
                    <Metric label="Real-world EV range" value={`${vehicle.realWorldElectricMiles} mi`} />
                    <Metric label="Winter EV range" value={`${vehicle.winterElectricMiles} mi`} />
                    <Metric label="Warranty" value={`${vehicle.warrantyYears}yr / ${vehicle.warrantyMiles >= 900000 ? "unlimited" : `${Math.round(vehicle.warrantyMiles / 1000)}k`} mi`} />
                    <Metric label="Electric share" value={`${Math.round(energy.electricFraction * 100)}%`} />
                    <Metric label="Energy / year" value={money(energy.total)} />
                    <Metric label={`${profile.ownershipYears}yr TCO`} value={money(cost.total)} />
                    <Metric label="TCO / mile" value={money2(cost.perMile)} />
                    <Metric label="Safe warranty exit" value={`${exit.yearsFromPurchase.toFixed(1)} yrs`} />
                    <Metric label="Boot" value={`${vehicle.bootLitres} L`} />
                    <Metric label="Parking score" value={`${vehicle.parkingScore}/100`} />
                    <Metric label="Residual risk" value={vehicle.residualRisk} risk={vehicle.residualRisk} />
                    <div className="compare-verdict"><strong>Why buy it</strong><p>{vehicle.verdict}</p><strong>Biggest risk</strong><p>{vehicle.biggestRisk}</p></div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {view === "deals" ? (
          <section className="page">
            <PageTitle eyebrow="New vs nearly-new" title="Deal explorer" description="See where the first owner has already absorbed enough depreciation to make a nearly-new car compelling." />
            <div className="toolbar">
              <label className="search-box"><Search size={17} /><input value={dealQuery} onChange={(event) => setDealQuery(event.target.value)} placeholder="Search vehicle or brand" /></label>
              <div className="mode-toggle">
                <button className={profile.purchaseMode === "new" ? "active" : ""} onClick={() => changeProfile("purchaseMode", "new")}>New</button>
                <button className={profile.purchaseMode === "nearly-new" ? "active" : ""} onClick={() => changeProfile("purchaseMode", "nearly-new")}>6–12 months</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="deal-table">
                <thead><tr><th>Vehicle</th><th>Power</th><th>New</th><th>Nearly-new</th><th>1st-year saving</th><th>Excellent deal</th><th>Fair max</th><th>Residual risk</th></tr></thead>
                <tbody>
                  {ranked.filter((vehicle) => `${vehicle.brand} ${vehicle.model}`.toLowerCase().includes(dealQuery.toLowerCase())).map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td><strong>{vehicle.brand} {vehicle.model}</strong><span>{vehicle.trim}</span></td>
                      <td><VehicleBadge powertrain={vehicle.powertrain} /></td>
                      <td>{money(vehicle.newPrice)}</td>
                      <td><strong>{money(vehicle.nearlyNewPrice)}</strong></td>
                      <td className="positive">{money(vehicle.newPrice - vehicle.nearlyNewPrice)}<span>{Math.round(((vehicle.newPrice - vehicle.nearlyNewPrice) / vehicle.newPrice) * 100)}%</span></td>
                      <td>{money(vehicle.excellentDeal)}</td>
                      <td>{money(vehicle.fairDealMax)}</td>
                      <td><span className={classNames("risk-pill", riskClass(vehicle.residualRisk))}>{vehicle.residualRisk}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="callout"><TriangleAlert size={18} /><div><strong>Deal thresholds are evidence-led guide prices, not guaranteed valuations.</strong><p>The live architecture separates asking prices, observed market data and modelled residuals so the app can tighten these bands as richer valuation feeds are connected.</p></div></div>
          </section>
        ) : null}

        {view === "profile" ? (
          <section className="page">
            <PageTitle eyebrow="Personalise the decision" title="Buyer profile" description="The recommendation recalculates immediately. Your settings are saved only in this browser." />
            <div className="profile-layout">
              <div className="settings-card">
                <h3>Usage & budget</h3>
                <RangeField label="Maximum budget" value={profile.budget} min={25000} max={60000} step={1000} suffix="" onChange={(value) => changeProfile("budget", value)} />
                <RangeField label="Annual mileage" value={profile.annualMiles} min={4000} max={25000} step={500} suffix=" miles" onChange={(value) => changeProfile("annualMiles", value)} />
                <RangeField label="Typical journey" value={profile.typicalJourney} min={10} max={100} step={5} suffix=" miles" onChange={(value) => changeProfile("typicalJourney", value)} />
                <RangeField label="Ownership period" value={profile.ownershipYears} min={3} max={7} step={0.5} suffix=" years" onChange={(value) => changeProfile("ownershipYears", value)} />
                <div className="choice-field"><span>Purchase strategy</span><div className="choice-buttons"><button className={profile.purchaseMode === "new" ? "active" : ""} onClick={() => changeProfile("purchaseMode", "new")}>New</button><button className={profile.purchaseMode === "nearly-new" ? "active" : ""} onClick={() => changeProfile("purchaseMode", "nearly-new")}>6–12 months old</button></div></div>
              </div>
              <div className="settings-card">
                <h3>Energy assumptions</h3>
                <RangeField label="Home electricity" value={profile.electricityPence} min={5} max={35} step={1} suffix="p/kWh" onChange={(value) => changeProfile("electricityPence", value)} />
                <RangeField label="Petrol" value={profile.petrolPencePerLitre} min={115} max={210} step={1} suffix="p/L" onChange={(value) => changeProfile("petrolPencePerLitre", value)} />
                <RangeField label="PHEV charging discipline" value={profile.chargeDiscipline} min={20} max={100} step={5} suffix="%" onChange={(value) => changeProfile("chargeDiscipline", value)} />
                <div className="assumption-note"><Zap size={17} /><p>A PHEV is only rewarded for electric miles it can realistically deliver under your journey length and charging discipline.</p></div>
              </div>
              <div className="settings-card">
                <h3>Decision priorities</h3>
                <RangeField label="Warranty importance" value={profile.warrantyWeight} min={5} max={25} step={1} suffix="%" onChange={(value) => changeProfile("warrantyWeight", value)} />
                <RangeField label="Depreciation importance" value={profile.depreciationWeight} min={10} max={30} step={1} suffix="%" onChange={(value) => changeProfile("depreciationWeight", value)} />
                <RangeField label="Comfort importance" value={profile.comfortWeight} min={5} max={20} step={1} suffix="%" onChange={(value) => changeProfile("comfortWeight", value)} />
                <button className="secondary-button full" onClick={() => setProfile(defaultProfile)}><RefreshCcw size={16} /> Reset to study profile</button>
              </div>
              <div className="live-result-card">
                <div>
                  <p className="eyebrow">Recommendation after your changes</p>
                  <VehicleBadge powertrain={winner.powertrain} />
                  <h2>{winner.brand} {winner.model}</h2>
                  <p>{winner.trim}</p>
                </div>
                <div className="live-score"><strong>{personalisedScore(winner, profile).toFixed(1)}</strong><span>/100 fit</span></div>
                <div className="metric-grid compact"><div><span>Purchase</span><strong>{money(purchasePrice(winner, profile))}</strong></div><div><span>TCO</span><strong>{money(winnerTco.total)}</strong></div><div><span>Energy</span><strong>{money(annualEnergyCost(winner, profile).total)}/yr</strong></div><div><span>Exit</span><strong>{winnerExit.yearsFromPurchase.toFixed(1)} yrs</strong></div></div>
                <button className="primary-button" onClick={() => changeView("dashboard")}>View full decision <ChevronRight size={16} /></button>
              </div>
            </div>
          </section>
        ) : null}

        {view === "data" ? (
          <section className="page">
            <PageTitle eyebrow="Continuous evidence layer" title="Data monitor" description="Every material fact should be dated, sourced and confidence-rated. The repository includes a scheduled source checker that detects page changes and captured price observations." />
            <div className="monitor-summary">
              <div><span className="mini-icon"><Database size={19} /></span><div><span>Sources configured</span><strong>{sources.length}</strong></div></div>
              <div><span className="mini-icon"><CheckCircle2 size={19} /></span><div><span>Primary sources</span><strong>{sources.filter((source) => source.quality === "Primary").length}</strong></div></div>
              <div><span className="mini-icon"><RefreshCcw size={19} /></span><div><span>Fastest refresh</span><strong>24 hours</strong></div></div>
              <div><span className="mini-icon"><Activity size={19} /></span><div><span>Monitoring model</span><strong>Change detection</strong></div></div>
            </div>
            <div className="table-wrap source-wrap">
              <table className="source-table">
                <thead><tr><th>Source</th><th>Category</th><th>Quality</th><th>Refresh</th><th>Last checked</th><th>Status</th></tr></thead>
                <tbody>{sources.map((source) => <tr key={source.id}><td><a href={source.url} target="_blank" rel="noreferrer"><strong>{source.name}</strong><span>{new URL(source.url).hostname}</span></a></td><td>{source.type}</td><td>{source.quality}</td><td>{source.refreshHours >= 168 ? "Weekly" : "Daily"}</td><td>{new Date(source.lastChecked).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td><td><span className={classNames("status-pill", source.status)}><span className={classNames("dot", source.status === "current" && "live")} />{source.status}</span></td></tr>)}</tbody>
              </table>
            </div>
            <div className="pipeline-card">
              <p className="eyebrow">Scheduled ingestion workflow</p><h3>Fetch → snapshot → extract → validate → compare → flag → publish</h3>
              <div className="pipeline-steps">
                {["Fetch authorised/public source", "Hash original page", "Extract price candidates", "Compare previous observation", "Flag material change", "Commit refreshed dataset"].map((step, index) => <div key={step}><span>{index + 1}</span><p>{step}</p></div>)}
              </div>
              <p className="pipeline-note">The first release deliberately does not auto-apply ambiguous scraped values to a recommendation. It records observations and change flags for review. Commercial feeds such as CAP HPI and authorised advert APIs can later become high-confidence auto-publish connectors.</p>
            </div>
          </section>
        ) : null}

        {view === "methodology" ? (
          <section className="page">
            <PageTitle eyebrow="Research rules preserved" title="How the decision engine works" description="The application mirrors the study: BEVs and PHEVs are ranked separately first, then compared using buyer-specific suitability and total ownership cost." />
            <div className="method-grid">
              <article className="method-card"><span>01</span><h3>Start with the buyer</h3><p>Budget, mileage, 30–40 mile journey pattern, home charging, cheap electricity and warranty-exit strategy drive the recommendation.</p></article>
              <article className="method-card"><span>02</span><h3>Separate technologies</h3><p>BEV and PHEV rankings are kept separate. Neither technology receives a blanket bonus simply for its architecture.</p></article>
              <article className="method-card"><span>03</span><h3>Model real usage</h3><p>WLTP is not treated as real-world range. PHEV electric share is constrained by real-world range and charging discipline.</p></article>
              <article className="method-card"><span>04</span><h3>Price the whole ownership period</h3><p>TCO includes depreciation, energy, servicing, tax, MOT and a tyre allowance, then applies the intended warranty-exit strategy.</p></article>
              <article className="method-card"><span>05</span><h3>Preserve evidence history</h3><p>New prices, promotions, warranty terms and source snapshots should be time-series records so market changes are auditable.</p></article>
              <article className="method-card"><span>06</span><h3>Show uncertainty</h3><p>Observed data, assumptions and forecasts are different things. Residual-risk labels remain explicit rather than being hidden in one score.</p></article>
            </div>
            <div className="weights-card">
              <div><p className="eyebrow">Original study weighting</p><h3>100-point decision model</h3></div>
              <div className="weight-bars">
                {[
                  ["Purchase price / value", 20], ["Depreciation / resale", 20], ["Warranty", 15], ["Reliability / support", 10], ["Comfort / quality", 10], ["Practicality", 8], ["Running costs", 7], ["Range / flexibility", 4], ["Charging", 3], ["Safety", 2], ["Technology", 1],
                ].map(([label, value]) => <div className="weight-row" key={label as string}><span>{label}</span><div><i style={{ width: `${Number(value) * 4}%` }} /></div><strong>{value}%</strong></div>)}
              </div>
            </div>
            <div className="callout"><Info size={18} /><div><strong>This MVP is a decision-support model, not a valuation service.</strong><p>Its architecture is ready for licensed valuations, live adverts, manufacturer feeds and richer reliability data. Until those are connected, residuals and deal thresholds remain transparent research-model assumptions.</p></div></div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>;
}

function Metric({ label, value, risk }: { label: string; value: string; risk?: string }) {
  return <div className="metric-row"><span>{label}</span>{risk ? <strong className={classNames("risk-text", riskClass(risk))}>{value}</strong> : <strong>{value}</strong>}</div>;
}
