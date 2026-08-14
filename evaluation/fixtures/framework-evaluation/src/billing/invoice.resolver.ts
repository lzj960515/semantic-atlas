import { Args, Query, Resolver } from "@nestjs/graphql";

import { InvoiceService } from "./invoice.service.js";

@Resolver("Invoice")
export class InvoiceResolver {
  constructor(private readonly invoices: InvoiceService) {}

  @Query(() => String, { nullable: true })
  async invoice(@Args("id") id: string) {
    const invoice = await this.invoices.findById(id);
    return invoice === null
      ? null
      : { id: invoice.id, totalCents: invoice.totalCents };
  }
}
