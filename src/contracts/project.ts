import { z } from "zod";

export const projectFileSchema = z.object({
  schemaVersion: z.literal(1),
  paths: z.array(z.string().min(1)),
}).strict();

export type ProjectFile = z.infer<typeof projectFileSchema>;
