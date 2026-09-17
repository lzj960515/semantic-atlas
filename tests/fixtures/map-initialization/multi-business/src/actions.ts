import type { Order, OrderPlaced, Sale, Shipment } from "./records.js";

export function placeOrder(id: string, totalCents: number, address?: string) {
  if (totalCents <= 0) throw new Error("An order needs a positive total");
  const order: Order = { id, totalCents, state: "awaiting-shipment" };
  if (address) order.address = address;
  const event: OrderPlaced = { orderId: id, paidCents: totalCents };
  return { order, event };
}

export function cancelOrder(order: Order): boolean {
  if (order.state !== "awaiting-shipment") return false;
  order.state = "cancelled";
  return true;
}

export function requestShipment(event: OrderPlaced, orders: Map<string, Order>) {
  return { orderId: event.orderId, order: orders.get(event.orderId) };
}

export function dispatch(order: Order): Shipment | undefined {
  if (!order.address || order.state !== "awaiting-shipment") return undefined;
  order.state = "shipped";
  return { orderId: order.id, destination: order.address };
}

export function recordSale(event: OrderPlaced): Sale {
  return { orderId: event.orderId, paidCents: event.paidCents };
}

export function revenue(sales: Sale[], orders: Map<string, Order>): number {
  return sales
    .filter((sale) => orders.get(sale.orderId)?.state !== "cancelled")
    .reduce((total, sale) => total + sale.paidCents, 0);
}
