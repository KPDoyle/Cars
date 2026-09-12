import type { BuyerProfile, Vehicle } from "./types";
import { defaultDecisionModel, type DecisionModel } from "./decision-model";

const UK_GALLON_LITRES = 4.54609;

export function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function money2(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function purchasePrice(vehicle: Vehicle, profile: BuyerProfile) {
  return profile.purchaseMode === "new" ? vehicle.newPrice : vehicle.nearlyNewPrice;
}

export function electricShare(vehicle: Vehicle, profile: BuyerProfile) {
  if (vehicle.powertrain === "BEV") return 1;
  const journeyCoverage = Math.min(1, vehicle.realWorldElectricMiles / Math.max(profile.typicalJourney, 1));
  return Math.min(0.98, journeyCoverage * (profile.chargeDiscipline / 100));
}

export function annualEnergyCost(vehicle: Vehicle, profile: BuyerProfile) {
  const electricFraction = electricShare(vehicle, profile);
  const electricMiles = profile.annualMiles * electricFraction;
  const electricityKwh = electricMiles / vehicle.efficiencyMiPerKwh;
  const electricity = electricityKwh * (profile.electricityPence / 100);

  if (vehicle.powertrain === "BEV") {
    return { total: electricity, electricity, petrol: 0, electricFraction: 1 };
  }

  const petrolMiles = profile.annualMiles - electricMiles;
  const mpg = vehicle.petrolMpg ?? 42;
  const litres = (petrolMiles / mpg) * UK_GALLON_LITRES;
  const petrol = litres * (profile.petrolPencePerLitre / 100);
  return { total: electricity + petrol, electricity, petrol, electricFraction };
}

export function estimatedResidual(vehicle: Vehicle, profile: BuyerProfile) {
  const price = purchasePrice(vehicle, profile);
  const years = Math.min(profile.ownershipYears, 5);
  const fiveYear = vehicle.fiveYearResidualPct / 100;
  const annualRetention = Math.pow(fiveYear, 1 / 5);
  const ageAdjustment = profile.purchaseMode === "nearly-new" ? 0.75 : 0;
  const residual = price * Math.pow(annualRetention, Math.max(0.5, years - ageAdjustment));
  return Math.max(price * 0.2, residual);
}

export function tco(vehicle: Vehicle, profile: BuyerProfile) {
  const price = purchasePrice(vehicle, profile);
  const residual = estimatedResidual(vehicle, profile);
  const energy = annualEnergyCost(vehicle, profile).total * profile.ownershipYears;
  const service = vehicle.serviceAnnual * profile.ownershipYears;
  const tax = vehicle.taxAnnual * profile.ownershipYears;
  const motYears = Math.max(0, profile.ownershipYears - (profile.purchaseMode === "new" ? 3 : 2.25));
  const mot = motYears * 55;
  const tyres = Math.max(0, Math.floor((profile.annualMiles * profile.ownershipYears) / 24000)) * 650;
  const total = price - residual + energy + service + tax + mot + tyres;
  return {
    total,
    annual: total / profile.ownershipYears,
    perMile: total / Math.max(1, profile.annualMiles * profile.ownershipYears),
    depreciation: price - residual,
    energy,
    service,
    tax,
    residual,
  };
}

export function warrantyExit(vehicle: Vehicle, profile: BuyerProfile) {
  const ageAtPurchase = profile.purchaseMode === "nearly-new" ? 0.75 : 0;
  const safeExitAge = Math.max(1, vehicle.warrantyYears - 1.5);
  const yearsFromPurchase = Math.max(0.5, safeExitAge - ageAtPurchase);
  const mileageAtExit = profile.annualMiles * yearsFromPurchase + profile.annualMiles * ageAtPurchase;
  return {
    yearsFromPurchase,
    warrantyRemainingYears: Math.max(0, vehicle.warrantyYears - (ageAtPurchase + yearsFromPurchase)),
    mileageAtExit,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const researchReferenceProfile: BuyerProfile = {
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

export type ResearchFactorScores = {
  value: number;
  depreciation: number;
  warranty: number;
  reliability: number;
  comfort: number;
  appeal: number;
  practicality: number;
  runningCost: number;
  range: number;
  charging: number;
  safety: number;
  technology: number;
};

function researchValueScore(vehicle: Vehicle) {
  const affordability = clamp(100 - ((vehicle.nearlyNewPrice - 25000) / 260), 35, 100);
  const firstOwnerSavingPct = ((vehicle.newPrice - vehicle.nearlyNewPrice) / Math.max(vehicle.newPrice, 1)) * 100;
  const discountValue = clamp(55 + (firstOwnerSavingPct * 2), 50, 100);
  return (affordability * 0.7) + (discountValue * 0.3);
}

function researchDepreciationScore(vehicle: Vehicle) {
  const riskBase = vehicle.residualRisk === "Low" ? 92 : vehicle.residualRisk === "Medium" ? 72 : 45;
  return clamp(riskBase + ((vehicle.fiveYearResidualPct - 40) * 1.3), 30, 100);
}

function researchWarrantyScore(vehicle: Vehicle) {
  const years = clamp((vehicle.warrantyYears / 10) * 100, 0, 100);
  const mileage = vehicle.warrantyMiles >= 900000 ? 100 : clamp((vehicle.warrantyMiles / 100000) * 100, 0, 100);
  return (years * 0.72) + (mileage * 0.28);
}

function researchRunningCostScore(vehicle: Vehicle) {
  const energy = annualEnergyCost(vehicle, researchReferenceProfile).total;
  const annualFixed = energy + vehicle.serviceAnnual + vehicle.taxAnnual;
  return clamp(105 - (annualFixed / 22), 30, 100);
}

function researchRangeScore(vehicle: Vehicle) {
  if (vehicle.powertrain === "BEV") {
    return clamp(45 + (vehicle.realWorldElectricMiles / 7), 55, 100);
  }
  return clamp(65 + (vehicle.realWorldElectricMiles / 3), 65, 95);
}

function researchChargingScore(vehicle: Vehicle) {
  if (vehicle.powertrain === "PHEV") {
    return clamp(58 + (vehicle.batteryKwh / 3), 58, 70);
  }
  const speed = 55 + (vehicle.dcChargeKw / 4);
  const timePenalty = Math.max(0, vehicle.charge1080Mins - 30) * 1.25;
  return clamp(speed - timePenalty, 45, 100);
}

export function researchFactorScores(vehicle: Vehicle): ResearchFactorScores {
  return {
    value: researchValueScore(vehicle),
    depreciation: researchDepreciationScore(vehicle),
    warranty: researchWarrantyScore(vehicle),
    reliability: vehicle.reliabilityScore,
    comfort: vehicle.comfortScore,
    appeal: vehicle.appealScore,
    practicality: vehicle.practicalityScore,
    runningCost: researchRunningCostScore(vehicle),
    range: researchRangeScore(vehicle),
    charging: researchChargingScore(vehicle),
    safety: vehicle.safetyScore,
    technology: vehicle.technologyScore,
  };
}

function weightedResearchScore(vehicle: Vehicle, model: DecisionModel) {
  const factors = researchFactorScores(vehicle);
  const weights = {
    value: Math.max(0, model.baselineValueWeight),
    depreciation: Math.max(0, model.baselineDepreciationWeight),
    warranty: Math.max(0, model.baselineWarrantyWeight),
    reliability: Math.max(0, model.baselineReliabilityWeight),
    comfort: Math.max(0, model.baselineComfortWeight),
    appeal: Math.max(0, model.baselineAppealWeight),
    practicality: Math.max(0, model.baselinePracticalityWeight),
    runningCost: Math.max(0, model.baselineRunningCostWeight),
    range: Math.max(0, model.baselineRangeWeight),
    charging: Math.max(0, model.baselineChargingWeight),
    safety: Math.max(0, model.baselineSafetyWeight),
    technology: Math.max(0, model.baselineTechnologyWeight),
  };
  const totalWeight = Math.max(1, Object.values(weights).reduce((sum, weight) => sum + weight, 0));
  return (
    (factors.value * weights.value)
    + (factors.depreciation * weights.depreciation)
    + (factors.warranty * weights.warranty)
    + (factors.reliability * weights.reliability)
    + (factors.comfort * weights.comfort)
    + (factors.appeal * weights.appeal)
    + (factors.practicality * weights.practicality)
    + (factors.runningCost * weights.runningCost)
    + (factors.range * weights.range)
    + (factors.charging * weights.charging)
    + (factors.safety * weights.safety)
    + (factors.technology * weights.technology)
  ) / totalWeight;
}

export function researchBaselineScore(vehicle: Vehicle, model: DecisionModel = defaultDecisionModel) {
  // Calibration preserves every published baseScore under the original
  // 20/20/15/10/10/8/7/4/3/2/1 research weights, with looks/appeal at 0. Editing the weights then
  // moves each vehicle up or down according to its underlying factor evidence.
  const originalComposite = weightedResearchScore(vehicle, defaultDecisionModel);
  const configuredComposite = weightedResearchScore(vehicle, model);
  return clamp(vehicle.baseScore + (configuredComposite - originalComposite), 0, 100);
}

function buyerBudgetFit(vehicle: Vehicle, profile: BuyerProfile) {
  const price = purchasePrice(vehicle, profile);
  if (price > profile.budget) return 0;
  const headroom = (profile.budget - price) / Math.max(profile.budget * 0.35, 1);
  return 75 + (25 * clamp(headroom, 0, 1));
}

function buyerWarrantyFit(vehicle: Vehicle, profile: BuyerProfile) {
  const ageAtPurchase = profile.purchaseMode === "nearly-new" ? 0.75 : 0;
  const mileageAtPurchase = profile.annualMiles * ageAtPurchase;
  const remainingMileage = vehicle.warrantyMiles >= 900000
    ? Number.POSITIVE_INFINITY
    : Math.max(0, vehicle.warrantyMiles - mileageAtPurchase);
  const mileageLimitedYears = remainingMileage === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : remainingMileage / Math.max(profile.annualMiles, 1);
  const remainingCalendarYears = Math.max(0, vehicle.warrantyYears - ageAtPurchase);
  const effectiveWarrantyYears = Math.min(remainingCalendarYears, mileageLimitedYears);
  const desiredCoverage = profile.ownershipYears + 1.5;
  return clamp((effectiveWarrantyYears / Math.max(desiredCoverage, 1)) * 100, 0, 100);
}

function buyerDepreciationFit(vehicle: Vehicle) {
  const riskBase = vehicle.residualRisk === "Low" ? 92 : vehicle.residualRisk === "Medium" ? 72 : 45;
  return clamp(riskBase + ((vehicle.fiveYearResidualPct - 40) * 1.2), 25, 100);
}

function buyerRunningCostFit(vehicle: Vehicle, profile: BuyerProfile) {
  const annual = annualEnergyCost(vehicle, profile).total;
  const pencePerMile = (annual / Math.max(profile.annualMiles, 1)) * 100;
  return clamp(110 - (pencePerMile * 5.5), 20, 100);
}

function buyerJourneyFit(vehicle: Vehicle, profile: BuyerProfile) {
  if (vehicle.powertrain === "PHEV") {
    return clamp(45 + (electricShare(vehicle, profile) * 55), 25, 100);
  }
  const winterRangeShare = profile.typicalJourney / Math.max(vehicle.winterElectricMiles, 1);
  return clamp(110 - (winterRangeShare * 80), 25, 100);
}

function buyerStrategyFit(vehicle: Vehicle, profile: BuyerProfile) {
  if (profile.purchaseMode === "new") {
    return clamp(90 - (vehicle.residualRisk === "High" ? 15 : vehicle.residualRisk === "Medium" ? 6 : 0), 50, 100);
  }
  const firstOwnerSaving = (vehicle.newPrice - vehicle.nearlyNewPrice) / Math.max(vehicle.newPrice, 1);
  return clamp(60 + (firstOwnerSaving * 180), 50, 100);
}

export function personalisedScore(
  vehicle: Vehicle,
  profile: BuyerProfile,
  model: DecisionModel = defaultDecisionModel,
) {
  const budgetFit = buyerBudgetFit(vehicle, profile);
  const warrantyFit = buyerWarrantyFit(vehicle, profile);
  const depreciationFit = buyerDepreciationFit(vehicle);
  const comfortFit = vehicle.comfortScore;
  const runningCostFit = buyerRunningCostFit(vehicle, profile);
  const journeyFit = buyerJourneyFit(vehicle, profile);
  const strategyFit = buyerStrategyFit(vehicle, profile);

  // Buyer Profile priorities act as multipliers on the configurable engine
  // weights. This keeps "who is buying" separate from "how CarWise scores".
  const weights = {
    budget: Math.max(0, model.budgetWeight),
    warranty: Math.max(0, model.warrantyWeight * (profile.warrantyWeight / 15)),
    depreciation: Math.max(0, model.depreciationWeight * (profile.depreciationWeight / 20)),
    comfort: Math.max(0, model.comfortWeight * (profile.comfortWeight / 10)),
    running: Math.max(0, model.runningCostWeight),
    journey: Math.max(0, model.journeyWeight),
    strategy: Math.max(0, model.strategyWeight),
  };

  const totalWeight = Math.max(1, Object.values(weights).reduce((sum, weight) => sum + weight, 0));
  const dynamicFit = (
    (budgetFit * weights.budget)
    + (warrantyFit * weights.warranty)
    + (depreciationFit * weights.depreciation)
    + (comfortFit * weights.comfort)
    + (runningCostFit * weights.running)
    + (journeyFit * weights.journey)
    + (strategyFit * weights.strategy)
  ) / totalWeight;

  const studyShare = clamp(model.studyEvidenceWeight, 0, 100) / 100;
  const researchScore = researchBaselineScore(vehicle, model);
  let score = (researchScore * studyShare) + (dynamicFit * (1 - studyShare));

  // Maximum budget remains a real constraint, but its severity can now be
  // tuned from the Decision model screen.
  const price = purchasePrice(vehicle, profile);
  if (price > profile.budget) {
    const overBudgetThousands = (price - profile.budget) / 1000;
    score -= Math.min(
      Math.max(0, model.overBudgetPenaltyCap),
      Math.max(0, model.overBudgetBasePenalty) + (overBudgetThousands * Math.max(0, model.overBudgetPenaltyPer1000)),
    );
  }

  return Math.max(0, Math.min(100, score));
}
