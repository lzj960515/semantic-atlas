import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import { ExportService } from "./export.service.js";
import type { ExportJob } from "./jobs/export.job.js";

@Processor("exports")
export class ExportProcessor extends WorkerHost {
  constructor(private readonly exports: ExportService) {
    super();
  }

  process(job: Job<ExportJob>) {
    return this.exports.generate(job.data);
  }
}
