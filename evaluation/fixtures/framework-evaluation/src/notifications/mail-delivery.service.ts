import { Injectable } from "@nestjs/common";

import type { SendEmailJob } from "./jobs/email.job.js";

@Injectable()
export class MailDeliveryService {
  async send(message: SendEmailJob): Promise<string> {
    return `${message.template}:${message.recipient}`;
  }
}
