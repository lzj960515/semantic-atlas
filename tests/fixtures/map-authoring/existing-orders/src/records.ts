export interface Order {
  id: string;
  totalCents: number;
  address?: string;
  state: "awaiting-shipment" | "shipped" | "cancelled";
}

export interface OrderPlaced {
  orderId: string;
  paidCents: number;
}

export interface Shipment {
  orderId: string;
  destination: string;
}
