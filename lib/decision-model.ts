export type DecisionModel = {
  studyEvidenceWeight: number;

  // Configurable 100-point research baseline. Defaults reproduce the original
  // study weighting exactly and are normalised automatically if edited.
  baselineValueWeight: number;
  baselineDepreciationWeight: number;
  baselineWarrantyWeight: number;
  baselineReliabilityWeight: number;
  baselineComfortWeight: number;
  baselineAppealWeight: number;
  baselinePracticalityWeight: number;
  baselineRunningCostWeight: number;
  baselineRangeWeight: number;
  baselineChargingWeight: number;
  baselineSafetyWeight: number;
  baselineTechnologyWeight: number;

  // Buyer-fit scoring layer.
  budgetWeight: number;
  warrantyWeight: number;
  depreciationWeight: number;
  comfortWeight: number;
  runningCostWeight: number;
  journeyWeight: number;
  strategyWeight: number;
  overBudgetBasePenalty: number;
  overBudgetPenaltyPer1000: number;
  overBudgetPenaltyCap: number;
};

export const defaultDecisionModel: DecisionModel = {
  studyEvidenceWeight: 30,

  baselineValueWeight: 20,
  baselineDepreciationWeight: 20,
  baselineWarrantyWeight: 15,
  baselineReliabilityWeight: 10,
  baselineComfortWeight: 10,
  baselineAppealWeight: 0,
  baselinePracticalityWeight: 8,
  baselineRunningCostWeight: 7,
  baselineRangeWeight: 4,
  baselineChargingWeight: 3,
  baselineSafetyWeight: 2,
  baselineTechnologyWeight: 1,

  budgetWeight: 25,
  warrantyWeight: 15,
  depreciationWeight: 20,
  comfortWeight: 10,
  runningCostWeight: 10,
  journeyWeight: 10,
  strategyWeight: 8,
  overBudgetBasePenalty: 5,
  overBudgetPenaltyPer1000: 4,
  overBudgetPenaltyCap: 25,
};
