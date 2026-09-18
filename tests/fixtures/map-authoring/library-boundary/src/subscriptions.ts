export interface Subscription {
  workspace: string;
  paidThrough: number;
  canceled: boolean;
}

export function renew(subscription: Subscription, periodEnd: number): void {
  if (subscription.canceled) throw new Error("subscription canceled");
  subscription.paidThrough = periodEnd;
}
