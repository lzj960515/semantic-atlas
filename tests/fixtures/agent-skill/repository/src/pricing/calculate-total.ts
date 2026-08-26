export function calculateTotal(subtotalCents: number, couponPercent: number): number {
  return subtotalCents - couponPercent;
}
