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

const referenceBuyerProfile: BuyerProfile = {
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

function budgetFit(vehicle: Vehicle, profile: BuyerProfile) {
  const price = purchasePrice(vehicle, profile);
  const gap = profile.budget - price;
  if (gap >= 0) return clamp(gap / Math.max(6000, profile.budget * 0.25), 0, 1);
  return clamp(gap / 8000, -1.5, 0);
}

function effectiveWarrantyFit(vehicle: Vehicle, profile: BuyerProfile) {
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
  const desiredWarrantyYears = profile.ownershipYears + 1.5;
  return clamp((effectiveWarrantyYears - desiredWarrantyYears) / 3, -1, 1);
}

function depreciationFit(vehicle: Vehicle) {
  const riskFit = vehicle.residualRisk === "Low" ? 1 : vehicle.residualRisk === "Medium" ? 0.25 : -1;
  const residualFit = clamp((vehicle.fiveYearResidualPct - 40) / 10, -1, 1);
  return clamp((riskFit * 0.6) + (residualFit * 0.4), -1, 1);
}

function runningCostFit(vehicle: Vehicle, profile: BuyerProfile) {
  const energy = annualEnergyCost(vehicle, profile).total;
  const pencePerMile = (energy / Math.max(1, profile.annualMiles)) * 100;
  return clamp((10 - pencePerMile) / 8, -1, 1);
}

function journeyFit(vehicle: Vehicle, profile: BuyerProfile) {
  if (vehicle.powertrain === "PHEV") {
    return clamp((electricShare(vehicle, profile) - 0.7) / 0.3, -1, 1);
  }
  const winterCoverage = vehicle.winterElectricMiles / Math.max(profile.typicalJourney, 1);
  return clamp((winterCoverage - 2) / 3, -1, 1);
}

function longHoldPenalty(vehicle: Vehicle, profile: BuyerProfile) {
  if (profile.ownershipYears <= 5 || vehicle.residualRisk === "Low") return 0;
  return (profile.ownershipYears - 5) * (vehicle.residualRisk === "High" ? 1.8 : 0.8);
}

export function personalisedScore(vehicle: Vehicle, profile: BuyerProfile) {
  // The published study score is the anchor. Buyer controls apply deltas from
  // that study profile, so the page reacts materially without double-counting
  // the factors already embedded in baseScore.
  let score = vehicle.baseScore;

  score += (budgetFit(vehicle, profile) - budgetFit(vehicle, referenceBuyerProfile)) * 6;

  const warrantyNow = effectiveWarrantyFit(vehicle, profile) * profile.warrantyWeight;
  const warrantyReference = effectiveWarrantyFit(vehicle, referenceBuyerProfile) * referenceBuyerProfile.warrantyWeight;
  score += (warrantyNow - warrantyReference) * 0.32;

  const depFit = depreciationFit(vehicle);
  score += depFit * (profile.depreciationWeight - referenceBuyerProfile.depreciationWeight) * 0.22;

  const comfortFit = clamp((vehicle.comfortScore - 85) / 10, -1, 1);
  score += comfortFit * (profile.comfortWeight - referenceBuyerProfile.comfortWeight) * 0.18;

  score += (runningCostFit(vehicle, profile) - runningCostFit(vehicle, referenceBuyerProfile)) * 5;
  score += (journeyFit(vehicle, profile) - journeyFit(vehicle, referenceBuyerProfile)) * 4;

  score -= longHoldPenalty(vehicle, profile) - longHoldPenalty(vehicle, referenceBuyerProfile);

  return Math.max(0, Math.min(100, score));
}
