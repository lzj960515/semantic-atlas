import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { Customer } from "./customer.entity.js";
import { Invoice } from "./invoice.entity.js";

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async createInvoice(customerId: string, totalCents: number): Promise<Invoice> {
    const customer = await this.customers.findOneByOrFail({ id: customerId });
    const invoice = this.invoices.create({ customer, totalCents });
    return this.invoices.save(invoice);
  }

  findById(id: string): Promise<Invoice | null> {
    return this.invoices.findOne({ where: { id }, relations: { customer: true } });
  }
}
