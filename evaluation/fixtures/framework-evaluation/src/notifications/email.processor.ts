import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import type { SendEmailJob } from "./jobs/email.job.js";
import { MailDeliveryService } from "./mail-delivery.service.js";

@Processor("email")
export class EmailProcessor extends WorkerHost {
  constructor(private readonly delivery: MailDeliveryService) {
    super();
  }

  process(job: Job<SendEmailJob>) {
    return this.delivery.send(job.data);
  }
}
