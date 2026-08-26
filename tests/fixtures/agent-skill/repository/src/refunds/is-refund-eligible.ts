export function isRefundEligible(ageInDays: number, isGift: boolean): boolean {
  return ageInDays <= 30 && !isGift;
}
