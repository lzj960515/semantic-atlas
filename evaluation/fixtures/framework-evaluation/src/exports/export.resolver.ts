import { Args, Mutation, Resolver } from "@nestjs/graphql";

import { ExportProducer } from "./export.producer.js";

@Resolver("Export")
export class ExportResolver {
  constructor(private readonly exports: ExportProducer) {}

  @Mutation(() => String)
  async requestExport(
    @Args("accountId") accountId: string,
    @Args("format") format: "csv" | "json",
    @Args("requestedBy") requestedBy: string,
  ) {
    const job = await this.exports.enqueue({ accountId, format, requestedBy });
    return job.id;
  }
}
