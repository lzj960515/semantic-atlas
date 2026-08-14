import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  customerId!: string;

  @Column("integer")
  totalCents!: number;
}
