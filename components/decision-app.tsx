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
  ExternalLink,
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
  researchBaselineScore,
  tco,
  warrantyExit,
} from "@/lib/calculations";
import { defaultDecisionModel, type DecisionModel } from "@/lib/decision-model";
import type { BuyerProfile, LiveSnapshot, Vehicle } from "@/lib/types";

const vehicles = rawData.vehicles as unknown as Vehicle[];
const MODEL_STORAGE_KEY = "carwise-decision-model-v1";

type View = "dashboard" | "compare" | "deals" | "profile" | "model" | "data" | "methodology";

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
  { id: "profile", label: "Build your decision", icon: SlidersHorizontal },
  { id: "data", label: "Data monitor", icon: Database },
  { id: "methodology", label: "Method", icon: Info },
];

const researchWeightRows: Array<{ key: keyof DecisionModel; label: string; original: number }> = [
  { key: "baselineValueWeight", label: "Purchase price / value", original: 20 },
  { key: "baselineDepreciationWeight", label: "Depreciation / resale", original: 20 },
  { key: "baselineWarrantyWeight", label: "Warranty", original: 15 },
  { key: "baselineReliabilityWeight", label: "Reliability / support", original: 10 },
  { key: "baselineComfortWeight", label: "Comfort / quality", original: 10 },
  { key: "baselinePracticalityWeight", label: "Practicality", original: 8 },
  { key: "baselineRunningCostWeight", label: "Running costs", original: 7 },
  { key: "baselineRangeWeight", label: "Range / flexibility", original: 4 },
  { key: "baselineChargingWeight", label: "Charging", original: 3 },
  { key: "baselineSafetyWeight", label: "Safety", original: 2 },
  { key: "baselineTechnologyWeight", label: "Technology", original: 1 },
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

function publicListingSearch(vehicle: Vehicle, source: "autotrader" | "motors" | "cargurus" | "manufacturer") {
  const terms = `${vehicle.brand} ${vehicle.model} ${vehicle.trim} used UK`;
  const query = source === "autotrader"
    ? `site:autotrader.co.uk ${terms}`
    : source === "motors"
      ? `site:motors.co.uk ${terms}`
      : source === "cargurus"
        ? `site:cargurus.co.uk ${terms}`
        : `${vehicle.brand} approved used ${vehicle.model} UK official`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function dealBand(vehicle: Vehicle, price: number) {
  if (price <= vehicle.excellentDeal) return { label: "Excellent deal", className: "good" };
  if (price <= vehicle.fairDealMax) return { label: "Fair price", className: "warn" };
  return { label: "Above fair value", className: "risk" };
}

function RecommendationCard({
  vehicle,
  profile,
  model,
  rank,
  featured = false,
}: {
  vehicle: Vehicle;
  profile: BuyerProfile;
  model: DecisionModel;
  rank: number;
  featured?: boolean;
}) {
  const score = personalisedScore(vehicle, profile, model);
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

export function DecisionApp({ initialLive }: { initialLive: LiveSnapshot }) {
  const [view, setView] = useState<View>("dashboard");
  const [live, setLive] = useState<LiveSnapshot>(initialLive);
  const [refreshing, setRefreshing] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [profile, setProfile] = useState<BuyerProfile>(() => ({
    ...defaultProfile,
    electricityPence: initialLive.market.octopusOffPeakPence ?? defaultProfile.electricityPence,
    petrolPencePerLitre: initialLive.market.petrolPencePerLitre ?? defaultProfile.petrolPencePerLitre,
  }));
  const [decisionModel, setDecisionModel] = useState<DecisionModel>(defaultDecisionModel);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([
    "kia-ev3-air-long-range",
    "toyota-rav4-phev-icon",
    "toyota-chr-plus-design",
  ]);
  const [dealQuery, setDealQuery] = useState("");
  const [manualDealVehicleId, setManualDealVehicleId] = useState("kia-ev3-air-long-range");
  const [manualDealPrice, setManualDealPrice] = useState(28950);
  const [manualDealMileage, setManualDealMileage] = useState(8000);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<DecisionModel>;
        setDecisionModel({ ...defaultDecisionModel, ...parsed });
      }
    } catch {
      // Ignore malformed local preferences and keep the transparent defaults.
    } finally {
      setModelLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!modelLoaded) return;
    window.localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(decisionModel));
  }, [decisionModel, modelLoaded]);

  const liveVehicles = useMemo(() => {
    const observationMap = new Map(live.vehicleObservations.map((item) => [item.vehicleId, item]));
    return vehicles.map((vehicle) => {
      const observation = observationMap.get(vehicle.id);
      const observedPrice = observation?.observedNewPrice;
      const threshold = vehicle.powertrain === "BEV" ? live.market.vedZevThreshold : live.market.vedOtherThreshold;
      const taxablePrice = observedPrice ?? vehicle.newPrice;
      const annualTax = live.market.vedStandardAnnual + (taxablePrice > threshold ? live.market.vedExpensiveSupplement : 0);
      return {
        ...vehicle,
        newPrice: observedPrice ?? vehicle.newPrice,
        nearlyNewPrice: observation?.observedUsedMedian ?? vehicle.nearlyNewPrice,
        taxAnnual: annualTax,
      };
    });
  }, [live]);

  const sources = live.sources;
  const safetyMap = useMemo(() => new Map(live.safety.map((item) => [item.vehicleId, item])), [live.safety]);
  const recallMap = useMemo(() => new Map(live.recalls.map((item) => [item.vehicleId, item])), [live.recalls]);
  const ranked = useMemo(
    () => [...liveVehicles].sort((a, b) => personalisedScore(b, profile, decisionModel) - personalisedScore(a, profile, decisionModel)),
    [liveVehicles, profile, decisionModel],
  );
  const bevRanked = ranked.filter((vehicle) => vehicle.powertrain === "BEV");
  const phevRanked = ranked.filter((vehicle) => vehicle.powertrain === "PHEV");
  const winner = ranked[0];
  const winnerTco = tco(winner, profile);
  const winnerExit = warrantyExit(winner, profile);
  const technologyWinner = personalisedScore(bevRanked[0], profile, decisionModel) >= personalisedScore(phevRanked[0], profile, decisionModel) ? "BEV" : "PHEV";
  const studyProfile = useMemo<BuyerProfile>(() => ({
    ...defaultProfile,
    electricityPence: live.market.octopusOffPeakPence ?? defaultProfile.electricityPence,
    petrolPencePerLitre: live.market.petrolPencePerLitre ?? defaultProfile.petrolPencePerLitre,
  }), [live.market.octopusOffPeakPence, live.market.petrolPencePerLitre]);
  const profileChangeCount = (Object.keys(profile) as Array<keyof BuyerProfile>)
    .filter((key) => profile[key] !== studyProfile[key]).length;
  const modelChangeCount = (Object.keys(defaultDecisionModel) as Array<keyof DecisionModel>)
    .filter((key) => decisionModel[key] !== defaultDecisionModel[key]).length;
  const modelFactorWeightTotal = decisionModel.budgetWeight
    + decisionModel.warrantyWeight
    + decisionModel.depreciationWeight
    + decisionModel.comfortWeight
    + decisionModel.runningCostWeight
    + decisionModel.journeyWeight
    + decisionModel.strategyWeight;
  const baselineWeightTotal = researchWeightRows.reduce((sum, item) => sum + decisionModel[item.key], 0);
  const currentWinnerScore = personalisedScore(winner, profile, decisionModel);
  const currentWinnerResearchScore = researchBaselineScore(winner, decisionModel);
  const studyScoreForCurrentWinner = personalisedScore(winner, studyProfile, decisionModel);
  const scoreDeltaFromStudy = currentWinnerScore - studyScoreForCurrentWinner;
  const manualDealVehicle = liveVehicles.find((vehicle) => vehicle.id === manualDealVehicleId) ?? liveVehicles[0];
  const manualDealAssessment = dealBand(manualDealVehicle, manualDealPrice);
  const manualDealModel = { ...manualDealVehicle, nearlyNewPrice: manualDealPrice };
  const manualDealTco = tco(manualDealModel, { ...profile, purchaseMode: "nearly-new" });
  const manualSaving = Math.max(0, manualDealVehicle.newPrice - manualDealPrice);

  const alerts = useMemo(() => {
    const items: Array<{ level: "info" | "good" | "warn"; title: string; body: string }> = [];
    const observations = new Map(live.vehicleObservations.map((item) => [item.vehicleId, item]));

    for (const vehicle of liveVehicles) {
      const observation = observations.get(vehicle.id);
      if (observation?.observedNewPrice && observation.observedNewPrice <= vehicle.excellentDeal) {
        items.push({
          level: "good",
          title: `${vehicle.brand} ${vehicle.model} has reached the excellent-deal band`,
          body: `Observed manufacturer price ${money(observation.observedNewPrice)} versus excellent-deal threshold ${money(vehicle.excellentDeal)}.`,
        });
      }
    }

    for (const recall of live.recalls) {
      if ((recall.recallCount ?? 0) > 0) {
        const vehicle = liveVehicles.find((item) => item.id === recall.vehicleId);
        items.push({
          level: "warn",
          title: `${vehicle?.brand ?? "Vehicle"} ${vehicle?.model ?? ""}: ${recall.recallCount} model-year recall${recall.recallCount === 1 ? "" : "s"}`,
          body: "Check the specific VIN/registration before purchase to confirm whether any safety work is outstanding.",
        });
      }
    }

    const failed = live.sources.filter((source) => source.status === "failed");
    if (failed.length) {
      items.push({
        level: "warn",
        title: `${failed.length} source check${failed.length === 1 ? "" : "s"} need attention`,
        body: failed.map((source) => source.name).join(", "),
      });
    }

    if (!items.length) {
      items.push({
        level: "good",
        title: "No material data alerts",
        body: "Connected live sources are healthy and no monitored price has crossed an alert threshold.",
      });
    }
    return items.slice(0, 8);
  }, [live, liveVehicles]);

  const changeProfile = <K extends keyof BuyerProfile>(key: K, value: BuyerProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const changeDecisionModel = <K extends keyof DecisionModel>(key: K, value: DecisionModel[K]) => {
    setDecisionModel((current) => ({ ...current, [key]: value }));
  };

  const resetResearchBaseline = () => {
    setDecisionModel((current) => {
      const next = { ...current };
      for (const item of researchWeightRows) next[item.key] = defaultDecisionModel[item.key];
      return next;
    });
  };

  const normaliseResearchBaseline = () => {
    setDecisionModel((current) => {
      const total = researchWeightRows.reduce((sum, item) => sum + current[item.key], 0);
      const next = { ...current };
      if (total <= 0) {
        for (const item of researchWeightRows) next[item.key] = defaultDecisionModel[item.key];
        return next;
      }
      let allocated = 0;
      researchWeightRows.forEach((item, index) => {
        if (index === researchWeightRows.length - 1) {
          next[item.key] = Math.max(0, Number((100 - allocated).toFixed(1)));
          return;
        }
        const value = Number(((current[item.key] / total) * 100).toFixed(1));
        next[item.key] = value;
        allocated += value;
      });
      return next;
    });
  };

  const refreshLive = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/live", { cache: "no-store" });
      if (!response.ok) throw new Error("Live refresh failed");
      const nextLive = await response.json() as LiveSnapshot;
      setLive(nextLive);
      setProfile((current) => ({
        ...current,
        electricityPence: nextLive.market.octopusOffPeakPence ?? current.electricityPence,
        petrolPencePerLitre: nextLive.market.petrolPencePerLitre ?? current.petrolPencePerLitre,
      }));
    } finally {
      setRefreshing(false);
    }
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
          <button className="brand-home" onClick={() => changeView("dashboard")} aria-label="Go to CarWise home">
            <span className="brand-mark"><CarFront size={21} /></span>
            <span className="brand-copy"><strong>CarWise</strong><span>Decision intelligence</span></span>
          </button>
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
          <strong>Configurable model</strong>
          <p>Public UK data, buyer assumptions and a configurable research baseline drive the live recommendation.</p>
          <div className="status-row"><span className="dot live" /> Public-data mode active</div>
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
            <span className="freshness"><span className="dot live" /> Live: {new Date(live.generatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            <button className="icon-button" aria-label="Refresh live data" onClick={refreshLive} disabled={refreshing}><RefreshCcw size={18} className={refreshing ? "spin" : ""} /></button>
            <button className={classNames("icon-button", alertsOpen && "active")} aria-label="Alerts" onClick={() => setAlertsOpen((open) => !open)}>
              <Bell size={18} />
              {alerts.length ? <span className="alert-count">{alerts.length}</span> : null}
            </button>
            {alertsOpen ? (
              <div className="alerts-panel">
                <div className="alerts-head"><div><span>Decision alerts</span><strong>{alerts.length} active</strong></div><button onClick={() => setAlertsOpen(false)} aria-label="Close alerts"><X size={16} /></button></div>
                <div className="alerts-list">
                  {alerts.map((alert, index) => (
                    <article className={classNames("alert-item", alert.level)} key={`${alert.title}-${index}`}>
                      <span className="alert-dot" />
                      <div><strong>{alert.title}</strong><p>{alert.body}</p></div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
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
                    <strong>{personalisedScore(winner, profile, decisionModel).toFixed(1)}</strong>
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
                  <div><span>Technology verdict</span><strong>{technologyWinner}</strong><p>The verdict responds to your buyer profile and the active decision-model weights.</p></div>
                </div>
                <div className="decision-card">
                  <span className="decision-icon"><CircleDollarSign size={20} /></span>
                  <div><span>Budget model</span><strong>{money(profile.budget)} max</strong><p>Cars above your maximum budget are penalised using the configurable model rules.</p></div>
                </div>
                <div className="decision-card">
                  <span className="decision-icon"><Settings2 size={20} /></span>
                  <div><span>Model blend</span><strong>{decisionModel.studyEvidenceWeight}% research / {100 - decisionModel.studyEvidenceWeight}% buyer</strong><p>The research baseline and buyer profile are configurable together from Build your decision.</p></div>
                </div>
              </div>
            </div>

            <div className="section-head">
              <div><p className="eyebrow">Separate technology rankings</p><h2>Best candidates for your profile</h2></div>
              <button className="secondary-button" onClick={() => changeView("profile")}><Settings2 size={16} /> Build your decision</button>
            </div>
            <div className="ranking-columns">
              <div>
                <div className="column-title"><BatteryCharging size={18} /><h3>BEV ranking</h3><span>{bevRanked.length} shortlisted</span></div>
                <div className="vehicle-list">{bevRanked.slice(0, 3).map((vehicle, index) => <RecommendationCard key={vehicle.id} vehicle={vehicle} profile={profile} model={decisionModel} rank={index + 1} featured={index === 0} />)}</div>
              </div>
              <div>
                <div className="column-title"><Gauge size={18} /><h3>PHEV ranking</h3><span>{phevRanked.length} shortlisted</span></div>
                <div className="vehicle-list">{phevRanked.slice(0, 3).map((vehicle, index) => <RecommendationCard key={vehicle.id} vehicle={vehicle} profile={profile} model={decisionModel} rank={index + 1} featured={index === 0} />)}</div>
              </div>
            </div>

            <div className="insight-grid">
              <div className="insight-card"><span className="mini-icon"><BadgePoundSterling size={18} /></span><div><span>Energy advantage</span><strong>{money(annualEnergyCost(bevRanked[0], profile).total)}/yr</strong><p>Modelled home-charging cost for the leading BEV at {profile.electricityPence}p/kWh.</p></div></div>
              <div className="insight-card"><span className="mini-icon"><Settings2 size={18} /></span><div><span>Decision model</span><strong>{modelChangeCount ? `${modelChangeCount} custom settings` : "Default model"}</strong><p>Your buyer profile and 100-point ranking formula are configurable together.</p></div></div>
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
              {liveVehicles.filter((vehicle) => compareIds.includes(vehicle.id)).map((vehicle) => {
                const energy = annualEnergyCost(vehicle, profile);
                const cost = tco(vehicle, profile);
                const exit = warrantyExit(vehicle, profile);
                const safety = safetyMap.get(vehicle.id);
                const recall = recallMap.get(vehicle.id);
                const score = personalisedScore(vehicle, profile, decisionModel);
                return (
                  <article key={vehicle.id} className="compare-card">
                    <div className="compare-title"><div><VehicleBadge powertrain={vehicle.powertrain} /><h3>{vehicle.brand} {vehicle.model}</h3><p>{vehicle.trim}</p></div><span className={classNames("score-chip", scoreClass(score))}>{score.toFixed(1)}</span></div>
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
                    <Metric label="Euro NCAP" value={safety?.stars ? `${safety.stars}/5 (${safety.testYear ?? "—"})${safety.ratingExpired ? " · expired" : ""}` : "No current result"} />
                    <Metric label="Adult / child safety" value={safety?.adultProtection != null && safety?.childProtection != null ? `${safety.adultProtection}% / ${safety.childProtection}%` : "—"} />
                    <Metric label="Model-year recalls" value={recall?.status === "live" && recall.recallCount != null ? `${recall.recallCount}` : "Check unavailable"} />
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
            <PageTitle eyebrow="New vs nearly-new" title="Deal explorer" description="Use the reviewed market benchmarks, search the public web for current listings, or enter any car you find and assess it instantly without an API subscription." />
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
                      <td><strong>{money(vehicle.nearlyNewPrice)}</strong><span>{live.vehicleObservations.find((item) => item.vehicleId === vehicle.id)?.observedUsedMedian ? "Live market median" : "Research snapshot"}</span></td>
                      <td className="positive">{money(vehicle.newPrice - vehicle.nearlyNewPrice)}<span>{Math.round(((vehicle.newPrice - vehicle.nearlyNewPrice) / vehicle.newPrice) * 100)}%</span></td>
                      <td>{money(vehicle.excellentDeal)}</td>
                      <td>{money(vehicle.fairDealMax)}</td>
                      <td><span className={classNames("risk-pill", riskClass(vehicle.residualRisk))}>{vehicle.residualRisk}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="manual-deal-card">
              <div className="manual-deal-head">
                <div>
                  <p className="eyebrow">No-API listing checker</p>
                  <h3>Found a car? Test the deal here</h3>
                  <p>Enter the asking price and mileage from any dealer, classified advert or manufacturer used-car page.</p>
                </div>
                <span className={classNames("deal-grade", manualDealAssessment.className)}>{manualDealAssessment.label}</span>
              </div>
              <div className="manual-deal-form">
                <label>
                  <span>Vehicle</span>
                  <select
                    value={manualDealVehicleId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      const nextVehicle = liveVehicles.find((vehicle) => vehicle.id === nextId);
                      setManualDealVehicleId(nextId);
                      if (nextVehicle) setManualDealPrice(nextVehicle.nearlyNewPrice);
                    }}
                  >
                    {liveVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} · {vehicle.trim}</option>)}
                  </select>
                </label>
                <label><span>Asking price</span><div className="input-prefix"><b>£</b><input type="number" min="10000" step="250" value={manualDealPrice} onChange={(event) => setManualDealPrice(Number(event.target.value) || 0)} /></div></label>
                <label><span>Mileage</span><div className="input-suffix"><input type="number" min="0" step="500" value={manualDealMileage} onChange={(event) => setManualDealMileage(Number(event.target.value) || 0)} /><b>miles</b></div></label>
              </div>
              <div className="manual-deal-results">
                <div><span>Saving vs current new</span><strong>{money(manualSaving)}</strong></div>
                <div><span>Excellent threshold</span><strong>{money(manualDealVehicle.excellentDeal)}</strong></div>
                <div><span>Maximum fair price</span><strong>{money(manualDealVehicle.fairDealMax)}</strong></div>
                <div><span>{profile.ownershipYears}yr TCO at this price</span><strong>{money(manualDealTco.total)}</strong></div>
              </div>
              <div className="public-searches">
                <div><strong>Find current examples</strong><span>Public web searches — no API account</span></div>
                <a href={publicListingSearch(manualDealVehicle, "autotrader")} target="_blank" rel="noreferrer">Auto Trader <ExternalLink size={13} /></a>
                <a href={publicListingSearch(manualDealVehicle, "motors")} target="_blank" rel="noreferrer">Motors <ExternalLink size={13} /></a>
                <a href={publicListingSearch(manualDealVehicle, "cargurus")} target="_blank" rel="noreferrer">CarGurus <ExternalLink size={13} /></a>
                <a href={publicListingSearch(manualDealVehicle, "manufacturer")} target="_blank" rel="noreferrer">Manufacturer used <ExternalLink size={13} /></a>
              </div>
              <p className="manual-deal-note">Mileage is recorded for your assessment and should be checked against age, warranty mileage and condition. The TCO uses your entered purchase price plus the transparent study running-cost and residual assumptions.</p>
            </div>
            <div className="callout"><TriangleAlert size={18} /><div><strong>No commercial data subscription is required for the core decision.</strong><p>Current new-car facts come from public/official sources. Nearly-new benchmarks remain reviewed guide values until you replace them with the asking price of a real car using the checker above.</p></div></div>
          </section>
        ) : null}

        {view === "profile" ? (
          <section className="page">
            <PageTitle eyebrow="Your car-ranking formula" title="Build your decision" description="Tell CarWise how you buy and use a car, decide what matters most, then see the ranking change immediately." />

            <div className="section-head model-section-head">
              <div><p className="eyebrow">Step 1 · You and your car</p><h2>Tell CarWise what you need</h2><p>These settings describe your real budget, mileage, journeys, energy costs and ownership plans.</p></div>
            </div>
            <div className="profile-layout">
              <div className="settings-card">
                <h3>Your life & budget</h3>
                <RangeField label="Maximum budget" value={profile.budget} min={25000} max={60000} step={1000} suffix="" onChange={(value) => changeProfile("budget", value)} />
                <RangeField label="Annual mileage" value={profile.annualMiles} min={4000} max={25000} step={500} suffix=" miles" onChange={(value) => changeProfile("annualMiles", value)} />
                <RangeField label="Typical journey" value={profile.typicalJourney} min={10} max={100} step={5} suffix=" miles" onChange={(value) => changeProfile("typicalJourney", value)} />
                <RangeField label="How long you will keep it" value={profile.ownershipYears} min={3} max={7} step={0.5} suffix=" years" onChange={(value) => changeProfile("ownershipYears", value)} />
                <div className="choice-field"><span>How you want to buy</span><div className="choice-buttons"><button className={profile.purchaseMode === "new" ? "active" : ""} onClick={() => changeProfile("purchaseMode", "new")}>New</button><button className={profile.purchaseMode === "nearly-new" ? "active" : ""} onClick={() => changeProfile("purchaseMode", "nearly-new")}>6–12 months old</button></div></div>
              </div>

              <div className="settings-card">
                <h3>Energy & charging</h3>
                <div className="live-assumption"><span className="dot live" /><strong>Octopus live rate: {live.market.octopusOffPeakPence ?? "—"}p/kWh</strong><small>Official source checked {live.market.octopusCheckedAt ? new Date(live.market.octopusCheckedAt).toLocaleString("en-GB") : "—"}</small></div>
                <RangeField label="Home electricity" value={profile.electricityPence} min={5} max={35} step={1} suffix="p/kWh" onChange={(value) => changeProfile("electricityPence", value)} />
                <div className="live-assumption"><span className="dot live" /><strong>UK petrol live: {live.market.petrolPencePerLitre?.toFixed(1) ?? "—"}p/L</strong><small>DESNZ weekly official data</small></div>
                <RangeField label="Petrol" value={profile.petrolPencePerLitre} min={115} max={210} step={1} suffix="p/L" onChange={(value) => changeProfile("petrolPencePerLitre", value)} />
                <RangeField label="How reliably you would charge a PHEV" value={profile.chargeDiscipline} min={20} max={100} step={5} suffix="%" onChange={(value) => changeProfile("chargeDiscipline", value)} />
                <div className="assumption-note"><Zap size={17} /><p>A plug-in hybrid only gets credit for electric miles you could realistically drive.</p></div>
              </div>

              <div className="settings-card">
                <h3>Extra personal priorities</h3>
                <RangeField label="Warranty matters to me" value={profile.warrantyWeight} min={5} max={25} step={1} suffix="%" onChange={(value) => changeProfile("warrantyWeight", value)} />
                <RangeField label="Avoiding depreciation matters to me" value={profile.depreciationWeight} min={10} max={30} step={1} suffix="%" onChange={(value) => changeProfile("depreciationWeight", value)} />
                <RangeField label="Comfort matters to me" value={profile.comfortWeight} min={5} max={20} step={1} suffix="%" onChange={(value) => changeProfile("comfortWeight", value)} />
                <button className="secondary-button full" onClick={() => setProfile(studyProfile)}><RefreshCcw size={16} /> Reset buyer profile</button>
              </div>

              <div className="live-result-card">
                <div>
                  <p className="eyebrow">Your current leader</p>
                  <VehicleBadge powertrain={winner.powertrain} />
                  <h2>{winner.brand} {winner.model}</h2>
                  <p>{winner.trim}</p>
                  <span className={classNames("profile-active", profileChangeCount > 0 && "changed")}>
                    {profileChangeCount > 0 ? `${profileChangeCount} buyer setting${profileChangeCount === 1 ? "" : "s"} changed` : "Default buyer profile"}
                  </span>
                </div>
                <div className="live-score">
                  <strong>{currentWinnerScore.toFixed(1)}</strong>
                  <span>/100 fit</span>
                  <small className={classNames("score-delta", scoreDeltaFromStudy > 0.05 ? "up" : scoreDeltaFromStudy < -0.05 ? "down" : "")}>
                    {Math.abs(scoreDeltaFromStudy) < 0.05 ? "Study profile" : `${scoreDeltaFromStudy > 0 ? "+" : ""}${scoreDeltaFromStudy.toFixed(1)} vs study profile`}
                  </small>
                </div>
                <div className="metric-grid compact"><div><span>Purchase</span><strong>{money(purchasePrice(winner, profile))}</strong></div><div><span>TCO</span><strong>{money(winnerTco.total)}</strong></div><div><span>Energy</span><strong>{money(annualEnergyCost(winner, profile).total)}/yr</strong></div><div><span>Warranty exit</span><strong>{winnerExit.yearsFromPurchase.toFixed(1)} yrs</strong></div></div>
              </div>
            </div>

            <div className="section-head model-section-head">
              <div><p className="eyebrow">Step 2 · What makes a good car?</p><h2>Spend your 100 decision points</h2><p>Give more points to the things you care about most. CarWise uses this to recalculate the research score for every car.</p></div>
            </div>
            <div className="baseline-editor-card">
              <div className="baseline-editor-top">
                <div>
                  <h2>Your 100-point formula</h2>
                  <p>The original study uses 20 + 20 + 15 + 10 + 10 + 8 + 7 + 4 + 3 + 2 + 1 = 100. Change any number to build your own formula.</p>
                </div>
                <div className={classNames("baseline-total", Math.abs(baselineWeightTotal - 100) < 0.05 && "exact")}>
                  <strong>{baselineWeightTotal.toFixed(1)}</strong>
                  <span>/ 100 points</span>
                  <small>{Math.abs(baselineWeightTotal - 100) < 0.05 ? "Ready" : "CarWise will normalise it"}</small>
                </div>
              </div>

              <div className="baseline-point-grid">
                {researchWeightRows.map((item) => {
                  const effective = baselineWeightTotal > 0 ? (decisionModel[item.key] / baselineWeightTotal) * 100 : 0;
                  return (
                    <label className="baseline-point-row" key={item.key}>
                      <span className="baseline-point-copy">
                        <strong>{item.label}</strong>
                        <small>Original {item.original} pts · Current share {effective.toFixed(1)}%</small>
                      </span>
                      <span className="baseline-point-input">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step={1}
                          value={decisionModel[item.key]}
                          onFocus={(event) => event.currentTarget.select()}
                          onClick={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const cleaned = event.currentTarget.value.replace(/^0+(?=\d)/, "");
                            if (cleaned !== event.currentTarget.value) event.currentTarget.value = cleaned;
                            changeDecisionModel(item.key, Math.max(0, Math.min(100, Number(cleaned) || 0)));
                          }}
                          aria-label={`${item.label} decision points`}
                        />
                        <b>pts</b>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="baseline-editor-actions">
                <button className="primary-button" onClick={normaliseResearchBaseline}>Make total exactly 100</button>
                <button className="secondary-button" onClick={resetResearchBaseline}><RefreshCcw size={16} /> Restore original 100</button>
              </div>
            </div>

            <div className="section-head model-section-head">
              <div><p className="eyebrow">Step 3 · How should CarWise decide?</p><h2>Balance research with your personal fit</h2><p>This decides whether the final answer should lean more on the general research or more on your own circumstances.</p></div>
            </div>
            <div className="profile-layout">
              <div className="settings-card">
                <h3>Research vs you</h3>
                <RangeField label="Research influence" value={decisionModel.studyEvidenceWeight} min={0} max={100} step={5} suffix="%" onChange={(value) => changeDecisionModel("studyEvidenceWeight", value)} />
                <div className="assumption-note"><Settings2 size={17} /><p><strong>{decisionModel.studyEvidenceWeight}% research</strong> + <strong>{100 - decisionModel.studyEvidenceWeight}% your personal fit</strong>.</p></div>
                <p className="baseline-editor-note">30% research / 70% personal fit is the default. Move towards research for a more general best-car answer; move towards personal fit for a more individual recommendation.</p>
              </div>

              <div className="live-result-card">
                <div>
                  <p className="eyebrow">Your formula result</p>
                  <VehicleBadge powertrain={winner.powertrain} />
                  <h2>{winner.brand} {winner.model}</h2>
                  <p>{winner.trim}</p>
                  <span className={classNames("profile-active", (modelChangeCount > 0 || profileChangeCount > 0) && "changed")}>
                    {modelChangeCount > 0 || profileChangeCount > 0 ? "Your custom formula is active" : "Original CarWise formula"}
                  </span>
                </div>
                <div className="live-score"><strong>{currentWinnerScore.toFixed(1)}</strong><span>/100 final fit</span><small>{modelLoaded ? "Saved automatically" : "Loading saved model"}</small></div>
                <div className="metric-grid compact">
                  <div><span>Research score</span><strong>{currentWinnerResearchScore.toFixed(1)}/100</strong></div>
                  <div><span>Research influence</span><strong>{decisionModel.studyEvidenceWeight}%</strong></div>
                  <div><span>Personal influence</span><strong>{100 - decisionModel.studyEvidenceWeight}%</strong></div>
                  <div><span>100-point total</span><strong>{baselineWeightTotal.toFixed(1)}</strong></div>
                </div>
                <div className="profile-ranking">
                  <div className="profile-ranking-head"><span>Live overall ranking</span><small>Changes as you edit your formula</small></div>
                  {ranked.slice(0, 5).map((vehicle, index) => (
                    <div className="profile-ranking-row" key={vehicle.id}>
                      <span>#{index + 1}</span>
                      <div><strong>{vehicle.brand} {vehicle.model}</strong><small>Research {researchBaselineScore(vehicle, decisionModel).toFixed(1)} · {vehicle.trim}</small></div>
                      <b>{personalisedScore(vehicle, profile, decisionModel).toFixed(1)}</b>
                    </div>
                  ))}
                </div>
                <button className="primary-button" onClick={() => changeView("dashboard")}>See full decision <ChevronRight size={16} /></button>
              </div>
            </div>

            <details className="optional-feeds decision-advanced">
              <summary>Advanced tuning — optional</summary>
              <p>You normally do not need these controls. They let you change how strongly CarWise calculates buyer fit and how harshly it treats cars over budget.</p>
              <div className="profile-layout">
                <div className="settings-card">
                  <h3>Buyer-fit ingredients</h3>
                  <RangeField label="Budget fit" value={decisionModel.budgetWeight} min={0} max={40} step={1} suffix="" onChange={(value) => changeDecisionModel("budgetWeight", value)} />
                  <RangeField label="Warranty fit" value={decisionModel.warrantyWeight} min={0} max={40} step={1} suffix="" onChange={(value) => changeDecisionModel("warrantyWeight", value)} />
                  <RangeField label="Depreciation / residual" value={decisionModel.depreciationWeight} min={0} max={40} step={1} suffix="" onChange={(value) => changeDecisionModel("depreciationWeight", value)} />
                  <RangeField label="Comfort" value={decisionModel.comfortWeight} min={0} max={30} step={1} suffix="" onChange={(value) => changeDecisionModel("comfortWeight", value)} />
                </div>
                <div className="settings-card">
                  <h3>Usage & purchase fit</h3>
                  <RangeField label="Running cost" value={decisionModel.runningCostWeight} min={0} max={30} step={1} suffix="" onChange={(value) => changeDecisionModel("runningCostWeight", value)} />
                  <RangeField label="Journey / range fit" value={decisionModel.journeyWeight} min={0} max={30} step={1} suffix="" onChange={(value) => changeDecisionModel("journeyWeight", value)} />
                  <RangeField label="New vs nearly-new strategy" value={decisionModel.strategyWeight} min={0} max={25} step={1} suffix="" onChange={(value) => changeDecisionModel("strategyWeight", value)} />
                </div>
                <div className="settings-card">
                  <h3>Budget strictness</h3>
                  <RangeField label="Initial over-budget penalty" value={decisionModel.overBudgetBasePenalty} min={0} max={20} step={1} suffix=" pts" onChange={(value) => changeDecisionModel("overBudgetBasePenalty", value)} />
                  <RangeField label="Extra penalty per £1k" value={decisionModel.overBudgetPenaltyPer1000} min={0} max={10} step={0.5} suffix=" pts" onChange={(value) => changeDecisionModel("overBudgetPenaltyPer1000", value)} />
                  <RangeField label="Maximum budget penalty" value={decisionModel.overBudgetPenaltyCap} min={0} max={50} step={1} suffix=" pts" onChange={(value) => changeDecisionModel("overBudgetPenaltyCap", value)} />
                  <button className="secondary-button full" onClick={() => setDecisionModel(defaultDecisionModel)}><RefreshCcw size={16} /> Reset decision rules</button>
                </div>
              </div>
            </details>

            <div className="callout"><Info size={18} /><div><strong>Buyer profile and decision rules now live together.</strong><p>You can start at the top, work down the page and see the recommendation change without switching between two separate menus. The original study can always be restored.</p></div></div>
          </section>
        ) : null}

        {view === "data" ? (
          <section className="page">
            <PageTitle eyebrow="Continuous evidence layer" title="Data monitor" description="The production decision engine runs on public and official sources without paid API credentials. Commercial feeds are optional enhancements rather than dependencies." />
            <div className="monitor-summary">
              <div><span className="mini-icon"><Database size={19} /></span><div><span>Sources configured</span><strong>{sources.length}</strong></div></div>
              <div><span className="mini-icon"><CheckCircle2 size={19} /></span><div><span>Live / current</span><strong>{live.diagnostics.liveSourceCount}</strong></div></div>
              <div><span className="mini-icon"><RefreshCcw size={19} /></span><div><span>Last refresh</span><strong>{new Date(live.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</strong></div></div>
              <div><span className="mini-icon"><Activity size={19} /></span><div><span>Failed probes</span><strong>{live.diagnostics.failedSourceCount}</strong></div></div>
              <div><span className="mini-icon"><ShieldCheck size={19} /></span><div><span>Euro NCAP live</span><strong>{live.safety.filter((item) => item.status === "live").length}/{live.safety.length}</strong></div></div>
              <div><span className="mini-icon"><TriangleAlert size={19} /></span><div><span>Recall checks live</span><strong>{live.recalls.filter((item) => item.status === "live").length}/{live.recalls.length}</strong></div></div>
            </div>
            <div className="no-api-banner"><CheckCircle2 size={20} /><div><strong>Core app: fully operational without commercial APIs</strong><p>Pricing checks, grants, tax, electricity, fuel, safety, recalls, rankings, TCO, comparisons and manual deal assessment all work in public-data mode.</p></div></div>
            <div className="integration-grid">
              {live.integrations.filter((integration) => !integration.requiresCredentials).map((integration) => (
                <article className="integration-card" key={integration.id}>
                  <div className="integration-head"><strong>{integration.name}</strong><span className={classNames("status-pill", integration.status)}><span className={classNames("dot", integration.status === "live" && "live")} />{integration.status}</span></div>
                  <p>{integration.detail}</p>
                </article>
              ))}
            </div>
            <details className="optional-feeds">
              <summary>Optional commercial data enhancements</summary>
              <p>MarketCheck, CAP HPI, Auto Trader Connect and Fuel Finder can enrich the app later, but none is required for the site to function.</p>
            </details>
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
              <p className="pipeline-note">Ambiguous webpage values are never silently promoted into the recommendation. Public authoritative sources refresh automatically, reviewed fallback values remain visible, and a real listing can always be assessed manually without any external API.</p>
            </div>
          </section>
        ) : null}

        {view === "methodology" ? (
          <section className="page">
            <PageTitle eyebrow="Research rules preserved" title="How the decision engine works" description="The application mirrors the study: BEVs and PHEVs are ranked separately first, then compared using the configurable research baseline, buyer-specific suitability and total ownership cost." />
            <div className="method-grid">
              <article className="method-card"><span>01</span><h3>Start with the buyer</h3><p>Budget, mileage, journey pattern, home charging, energy prices and warranty-exit strategy drive the buyer profile.</p></article>
              <article className="method-card"><span>02</span><h3>Configure the research baseline</h3><p>All 11 original 100-point study factors are editable. The active weights are normalised automatically to 100.</p></article>
              <article className="method-card"><span>03</span><h3>Blend research and buyer fit</h3><p>Choose how much the configured research baseline contributes to the final result, then tune the personalised scoring layer separately.</p></article>
              <article className="method-card"><span>04</span><h3>Model real usage</h3><p>WLTP is not treated as real-world range. PHEV electric share is constrained by real-world range and charging discipline.</p></article>
              <article className="method-card"><span>05</span><h3>Price the ownership period</h3><p>TCO includes depreciation, energy, servicing, tax, MOT and a tyre allowance, then applies the intended warranty-exit strategy.</p></article>
              <article className="method-card"><span>06</span><h3>Preserve evidence and uncertainty</h3><p>Observed data, assumptions and forecasts remain distinct. Changing a weight changes interpretation of the evidence, not the evidence itself.</p></article>
            </div>
            <div className="weights-card">
              <div><p className="eyebrow">Active research weighting</p><h3>Configurable 100-point research baseline</h3><p>Raw total {baselineWeightTotal}; effective weights are normalised proportionally to 100.</p></div>
              <div className="weight-bars">
                {researchWeightRows.map((item) => {
                  const effective = baselineWeightTotal > 0 ? (decisionModel[item.key] / baselineWeightTotal) * 100 : 0;
                  return <div className="weight-row" key={item.key}><span>{item.label}</span><div><i style={{ width: `${Math.min(100, effective * 4)}%` }} /></div><strong>{effective.toFixed(1)}%</strong></div>;
                })}
              </div>
            </div>
            <div className="callout"><Info size={18} /><div><strong>Resetting the Decision model restores the published study.</strong><p>The original 20/20/15/10/10/8/7/4/3/2/1 weighting reproduces the stored research scores exactly; the configurable layer then lets you test alternative research priorities without losing the original benchmark.</p></div></div>
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
