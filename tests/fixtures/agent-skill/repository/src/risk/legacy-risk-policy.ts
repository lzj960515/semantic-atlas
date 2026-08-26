export function legacyRiskPolicy(riskScore: number): boolean {
  return riskScore < 80;
}
