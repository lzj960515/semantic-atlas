import type { OrderPlacedEvent } from "../checkout/place-order.js";

export interface OrderAnalyticsRecord {
  readonly orderId: string;
  readonly totalCents: number;
}

export function recordOrder(event: OrderPlacedEvent): OrderAnalyticsRecord {
  return { orderId: event.orderId, totalCents: event.totalCents };
}
