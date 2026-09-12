export type DecisionModel = {
  studyEvidenceWeight: number;
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
