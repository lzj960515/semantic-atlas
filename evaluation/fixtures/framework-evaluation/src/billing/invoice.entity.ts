import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

import { Customer } from "./customer.entity.js";

@Entity("invoices")
export class Invoice {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("integer")
  totalCents!: number;

  @ManyToOne(() => Customer, (customer) => customer.invoices, { nullable: false })
  customer!: Customer;
}
