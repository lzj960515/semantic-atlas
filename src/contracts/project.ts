import { z } from "zod";

export const projectFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    paths: z.array(z.string().min(1)),
  })
  .strict();

export type ProjectFile = z.infer<typeof projectFileSchema>;

/** User-local identities are derived from registered paths, never stored separately. */
export interface RegisteredProject {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly repositoryPath: string;
}

export interface ProjectSelectionFailure {
  readonly code: "PROJECT_NOT_FOUND" | "PROJECT_AMBIGUOUS";
  readonly message: string;
  readonly selector: string;
  readonly candidates: readonly RegisteredProject[];
}
