import { z } from "zod";

const skillLoadSchema = z.strictObject({
  sequence: z.number().int().positive(),
  file: z.string().regex(
    /^\.agents\/skills\/semantic-atlas\/(?:SKILL\.md|references\/[a-z0-9-]+\.md)$/u,
  ),
});

export type SkillLoad = z.infer<typeof skillLoadSchema>;

export function parseEvaluationSkillTrace(contents: string): readonly SkillLoad[] {
  if (contents.trim().length === 0) return [];
  return contents.trim().split("\n").map((line, index) => {
    const event = skillLoadSchema.parse(JSON.parse(line));
    return { sequence: index + 1, file: event.file };
  });
}
