import { Body, Controller, Post } from "@nestjs/common";

import { OrderService, type PlaceOrderInput } from "./order.service.js";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  create(@Body() input: PlaceOrderInput) {
    return this.orders.placeOrder(input);
  }
}
