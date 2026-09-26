import type { z } from "zod";
import { fieldErrors } from "../../../shared/schemas";
import { badRequest } from "./errors";

/** Parses input with a Zod schema or throws a 400 with per-field messages. */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown, message = "Some fields need attention"): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    const first = Object.values(fields)[0];
    throw badRequest(Object.keys(fields).length === 1 && first ? first : message, fields);
  }
  return result.data;
}
