import type { BuyerProfile, Vehicle } from "./types";

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

export function personalisedScore(vehicle: Vehicle, profile: BuyerProfile) {
  // 30% preserves the underlying study evidence; 70% is recalculated from
  // the active buyer profile so changing the profile can genuinely change
  // the recommended vehicle rather than merely nudging a fixed ranking.
  const budgetFit = buyerBudgetFit(vehicle, profile);
  const warrantyFit = buyerWarrantyFit(vehicle, profile);
  const depreciationFit = buyerDepreciationFit(vehicle);
  const comfortFit = vehicle.comfortScore;
  const runningCostFit = buyerRunningCostFit(vehicle, profile);
  const journeyFit = buyerJourneyFit(vehicle, profile);
  const strategyFit = buyerStrategyFit(vehicle, profile);

  const weights = {
    budget: 25,
    warranty: profile.warrantyWeight,
    depreciation: profile.depreciationWeight,
    comfort: profile.comfortWeight,
    running: 10 + clamp(((profile.annualMiles - 8000) / 17000) * 10, 0, 10),
    journey: 10,
    strategy: 8,
  };

  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const dynamicFit = (
    (budgetFit * weights.budget)
    + (warrantyFit * weights.warranty)
    + (depreciationFit * weights.depreciation)
    + (comfortFit * weights.comfort)
    + (runningCostFit * weights.running)
    + (journeyFit * weights.journey)
    + (strategyFit * weights.strategy)
  ) / totalWeight;

  let score = (vehicle.baseScore * 0.30) + (dynamicFit * 0.70);

  // Maximum budget behaves like a real constraint. A vehicle over budget can
  // still be seen in comparisons, but is strongly penalised in recommendations.
  const price = purchasePrice(vehicle, profile);
  if (price > profile.budget) {
    score -= Math.min(25, 5 + (((price - profile.budget) / 1000) * 4));
  }

  return Math.max(0, Math.min(100, score));
}
