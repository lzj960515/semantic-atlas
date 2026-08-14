import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Order } from "./order.entity.js";
import { OrderResolver } from "./order.resolver.js";
import { OrderService } from "./order.service.js";
import { OrdersController } from "./orders.controller.js";

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [OrdersController],
  providers: [OrderService, OrderResolver],
  exports: [OrderService],
})
export class OrdersModule {}
