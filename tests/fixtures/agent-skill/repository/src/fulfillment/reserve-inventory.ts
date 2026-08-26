export function reserveInventory(quantity: number): void {
  if (quantity < 0) throw new Error("Inventory quantity cannot be negative");
}
