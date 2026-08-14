import { Args, Mutation, Resolver } from "@nestjs/graphql";

import { OrderService } from "./order.service.js";

@Resolver("Order")
export class OrderResolver {
  constructor(private readonly orders: OrderService) {}

  @Mutation(() => String)
  async createOrder(
    @Args("customerId") customerId: string,
    @Args("totalCents") totalCents: number,
  ) {
    return this.orders.placeOrder({ customerId, totalCents });
  }
}
