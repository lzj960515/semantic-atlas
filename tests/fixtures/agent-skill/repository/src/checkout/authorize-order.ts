import { currentRiskPolicy } from "../risk/current-risk-policy.js";

export function authorizeOrder(riskScore: number): boolean {
  return currentRiskPolicy(riskScore);
}
