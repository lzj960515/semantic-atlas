export function currentRiskPolicy(riskScore: number): boolean {
  return riskScore < 40;
}
