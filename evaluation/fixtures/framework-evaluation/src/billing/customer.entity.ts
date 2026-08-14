import { Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";

import { Invoice } from "./invoice.entity.js";

@Entity("customers")
export class Customer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @OneToMany(() => Invoice, (invoice) => invoice.customer)
  invoices!: Invoice[];
}
