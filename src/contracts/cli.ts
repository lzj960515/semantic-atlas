import { z } from "zod";

const repositoryDescriptorSchema = z.strictObject({
  id: z.string().regex(/^repo_[A-Za-z0-9._-]+$/),
  root: z.string().min(1),
  headCommit: z.string().regex(/^[a-f0-9]{40}$/),
});

const snapshotDescriptorSchema = z.strictObject({
  id: z.string().regex(/^snap_[a-f0-9]{64}$/),
  gitHead: z.string().regex(/^[a-f0-9]{40}$/),
  createdAt: z.iso.datetime(),
  freshness: z.enum(["current", "stale"]),
});

const warningSchema = z.strictObject({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().min(1),
  details: z.json().optional(),
});

export const cliEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  repository: repositoryDescriptorSchema.nullable(),
  snapshot: snapshotDescriptorSchema.nullable(),
  status: z.enum(["ok", "partial", "error"]),
  data: z.json(),
  warnings: z.array(warningSchema),
});

export type CliEnvelope = z.infer<typeof cliEnvelopeSchema>;
