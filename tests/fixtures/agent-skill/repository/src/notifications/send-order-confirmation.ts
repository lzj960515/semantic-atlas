import type { Order } from "../orders/order.js";

export function sendOrderConfirmation(order: Order): string {
  return `Order ${order.id}: ${order.totalCents} cents`;
}
