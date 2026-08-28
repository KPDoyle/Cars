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

export function personalisedScore(vehicle: Vehicle, profile: BuyerProfile) {
  let score = vehicle.baseScore;

  const warrantyDelta = vehicle.warrantyYears - 7;
  score += warrantyDelta * (profile.warrantyWeight / 15) * 0.75;

  const price = purchasePrice(vehicle, profile);
  const budgetGap = profile.budget - price;
  score += Math.max(-8, Math.min(5, budgetGap / 3000));

  const depreciationPenalty = vehicle.residualRisk === "High" ? 4 : vehicle.residualRisk === "Medium" ? 1.5 : 0;
  score -= depreciationPenalty * (profile.depreciationWeight / 20);

  score += ((vehicle.comfortScore - 85) / 10) * (profile.comfortWeight / 10);

  if (vehicle.powertrain === "PHEV") {
    const share = electricShare(vehicle, profile);
    score += (share - 0.75) * 8;
  } else if (vehicle.realWorldElectricMiles > profile.typicalJourney * 4) {
    score += 1;
  }

  if (price > profile.budget) score -= Math.min(15, (price - profile.budget) / 1000);

  return Math.max(0, Math.min(100, score));
}
