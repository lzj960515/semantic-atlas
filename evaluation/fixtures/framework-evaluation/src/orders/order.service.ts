import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { Order } from "./order.entity.js";

export interface PlaceOrderInput {
  customerId: string;
  totalCents: number;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    const order = this.orders.create({
      customerId: input.customerId,
      totalCents: input.totalCents,
    });
    return this.orders.save(order);
  }
}
