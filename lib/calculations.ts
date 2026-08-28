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

export function personalisedScore(vehicle: Vehicle, profile: BuyerProfile) {
  // Start from the study score, then make the buyer controls materially affect
  // the recommendation instead of only changing the displayed TCO.
  let score = vehicle.baseScore;
  const price = purchasePrice(vehicle, profile);

  // Budget fit: being comfortably inside budget is useful; being over budget
  // is a strong negative.
  const budgetScale = Math.max(4000, profile.budget * 0.18);
  const budgetFit = clamp((profile.budget - price) / budgetScale, -1.5, 1);
  score += budgetFit * 6;
  if (price > profile.budget) {
    score -= Math.min(12, (price - profile.budget) / 1000);
  }

  // Warranty fit considers both calendar and mileage limits, the age of a
  // nearly-new purchase, and the buyer's intended ownership period.
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
  const warrantyFit = clamp((effectiveWarrantyYears - desiredWarrantyYears) / 3, -1, 1);
  score += warrantyFit * profile.warrantyWeight * 0.42;

  // Depreciation preference: combine the study's residual-risk label with the
  // five-year retention estimate, and scale it by the user's priority.
  const riskFit = vehicle.residualRisk === "Low" ? 1 : vehicle.residualRisk === "Medium" ? 0.25 : -1;
  const residualFit = clamp((vehicle.fiveYearResidualPct - 40) / 10, -1, 1);
  const depreciationFit = clamp((riskFit * 0.6) + (residualFit * 0.4), -1, 1);
  score += depreciationFit * profile.depreciationWeight * 0.28;

  // Comfort priority now responds directly to the slider.
  const comfortFit = clamp((vehicle.comfortScore - 85) / 10, -1, 1);
  score += comfortFit * profile.comfortWeight * 0.2;

  // Running-cost fit responds to annual mileage and the user's actual
  // electricity/petrol prices.
  const energy = annualEnergyCost(vehicle, profile).total;
  const annualEnergyBudget = Math.max(350, profile.annualMiles * 0.09);
  const runningCostFit = clamp((annualEnergyBudget - energy) / annualEnergyBudget, -1, 1);
  score += runningCostFit * 5;

  // Journey fit: PHEVs are rewarded only when the user's journey can be
  // completed substantially electrically and the user charges regularly.
  // BEVs lose points only when winter range gets tight for the typical trip.
  if (vehicle.powertrain === "PHEV") {
    const share = electricShare(vehicle, profile);
    score += clamp((share - 0.7) / 0.3, -1, 1) * 5;
  } else {
    const winterCoverage = vehicle.winterElectricMiles / Math.max(profile.typicalJourney, 1);
    score += clamp((winterCoverage - 2) / 3, -1, 1) * 2.5;
  }

  // Ownership horizon matters beyond warranty: high residual-risk vehicles
  // are more exposed over a longer intended hold.
  if (profile.ownershipYears > 5 && vehicle.residualRisk !== "Low") {
    const longHoldPenalty = (profile.ownershipYears - 5) * (vehicle.residualRisk === "High" ? 1.8 : 0.8);
    score -= longHoldPenalty;
  }

  return Math.max(0, Math.min(100, score));
}
