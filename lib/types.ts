export type Powertrain = "BEV" | "PHEV";
export type Risk = "Low" | "Medium" | "High";

export type Vehicle = {
  id: string;
  brand: string;
  model: string;
  trim: string;
  powertrain: Powertrain;
  segment: string;
  newPrice: number;
  nearlyNewPrice: number;
  excellentDeal: number;
  fairDealMax: number;
  warrantyYears: number;
  warrantyMiles: number;
  batteryWarrantyYears: number;
  batteryWarrantyMiles: number;
  batteryKwh: number;
  wltpMiles: number;
  realWorldElectricMiles: number;
  winterElectricMiles: number;
  efficiencyMiPerKwh: number;
  petrolMpg?: number;
  dcChargeKw: number;
  charge1080Mins: number;
  bootLitres: number;
  lengthMm: number;
  widthMm: number;
  parkingScore: number;
  comfortScore: number;
  practicalityScore: number;
  reliabilityScore: number;
  safetyScore: number;
  technologyScore: number;
  residualRisk: Risk;
  fiveYearResidualPct: number;
  serviceAnnual: number;
  taxAnnual: number;
  baseScore: number;
  verdict: string;
  biggestRisk: string;
  sourceIds: string[];
};

export type Source = {
  id: string;
  name: string;
  url: string;
  type: string;
  quality: string;
  refreshHours: number;
  lastChecked: string;
  status: "current" | "changed" | "failed" | "stale" | "live" | "unconfigured";
  expectedPrice?: number;
  anchors?: string[];
  contentHash?: string;
  observedPrice?: number;
  observedAt?: string;
};

export type BuyerProfile = {
  budget: number;
  annualMiles: number;
  typicalJourney: number;
  electricityPence: number;
  petrolPencePerLitre: number;
  chargeDiscipline: number;
  ownershipYears: number;
  purchaseMode: "new" | "nearly-new";
  warrantyWeight: number;
  depreciationWeight: number;
  comfortWeight: number;
};


export type LiveVehicleObservation = {
  vehicleId: string;
  observedNewPrice?: number;
  observedUsedMedian?: number;
  observedUsedMin?: number;
  observedUsedMax?: number;
  observedUsedCount?: number;
  observedUsedMilesMedian?: number;
  usedCheckedAt?: string;
  priceSource?: string;
  priceCheckedAt?: string;
  grantBand?: 1 | 2;
  grantAmount?: number;
  grantEligible?: boolean;
  sourceStatus: "live" | "fallback" | "failed";
};

export type IntegrationStatus = {
  id: string;
  name: string;
  status: "live" | "configured" | "unconfigured" | "failed";
  detail: string;
  requiresCredentials: boolean;
};

export type LiveSnapshot = {
  generatedAt: string;
  market: {
    petrolPencePerLitre?: number;
    dieselPencePerLitre?: number;
    fuelCheckedAt?: string;
    octopusOffPeakPence?: number;
    octopusCheckedAt?: string;
    vedStandardAnnual: number;
    vedExpensiveSupplement: number;
    vedZevThreshold: number;
    vedOtherThreshold: number;
    taxCheckedAt?: string;
  };
  vehicleObservations: LiveVehicleObservation[];
  sources: Source[];
  integrations: IntegrationStatus[];
  diagnostics: {
    liveSourceCount: number;
    fallbackSourceCount: number;
    failedSourceCount: number;
  };
};
