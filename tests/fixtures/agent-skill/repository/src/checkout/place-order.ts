import { sendOrderConfirmation } from "../notifications/send-order-confirmation.js";
import type { Order } from "../orders/order.js";
import { calculateTotal } from "../pricing/calculate-total.js";

export interface OrderPlacedEvent {
  readonly orderId: string;
  readonly totalCents: number;
}

export function placeOrder(
  id: string,
  subtotalCents: number,
  couponPercent: number,
  buyerLocale: string,
): { readonly order: Order; readonly event: OrderPlacedEvent; readonly confirmation: string } {
  const order: Order = {
    id,
    totalCents: calculateTotal(subtotalCents, couponPercent),
    buyerLocale,
  };
  return {
    order,
    event: { orderId: order.id, totalCents: order.totalCents },
    confirmation: sendOrderConfirmation(order),
  };
}
