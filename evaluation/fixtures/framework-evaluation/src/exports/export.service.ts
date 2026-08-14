import { Injectable } from "@nestjs/common";

import type { ExportJob } from "./jobs/export.job.js";

@Injectable()
export class ExportService {
  async generate(request: ExportJob): Promise<string> {
    return `/exports/${request.accountId}.${request.format}`;
  }
}
