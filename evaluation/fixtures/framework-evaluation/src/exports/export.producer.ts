import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import type { ExportJob } from "./jobs/export.job.js";

@Injectable()
export class ExportProducer {
  constructor(@InjectQueue("exports") private readonly exportQueue: Queue<ExportJob>) {}

  enqueue(payload: ExportJob) {
    return this.exportQueue.add("generate-export", payload);
  }
}
