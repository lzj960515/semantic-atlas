import { z } from "zod";

export const contentIdentifierSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 identifier");

export const gitObjectIdSchema = z
  .string()
  .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, "Expected a Git object ID");
