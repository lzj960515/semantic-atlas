import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import type { SendEmailJob } from "./jobs/email.job.js";

@Injectable()
export class EmailProducer {
  constructor(@InjectQueue("email") private readonly emailQueue: Queue<SendEmailJob>) {}

  enqueue(payload: SendEmailJob) {
    return this.emailQueue.add("send-email", payload);
  }
}
