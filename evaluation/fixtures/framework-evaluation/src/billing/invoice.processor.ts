import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import { InvoiceService } from "./invoice.service.js";

export interface GenerateInvoiceJob {
  customerId: string;
  totalCents: number;
}

@Processor("invoices")
export class InvoiceProcessor extends WorkerHost {
  constructor(private readonly invoices: InvoiceService) {
    super();
  }

  process(job: Job<GenerateInvoiceJob>) {
    return this.invoices.createInvoice(job.data.customerId, job.data.totalCents);
  }
}
