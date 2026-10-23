import { z } from 'zod';
import { InvalidAnswerError } from './errors';

/**
 * Turns a failed schema parse into an `InvalidAnswerError` that keeps the
 * schema's own reasons. Owns that conversion only; the schemas live in
 * `types/` and `services/exercises/`, and there is no fallback content here.
 */

const MAX_REPORTED_ISSUES = 6;

/** One line per issue: where in the answer, and what is wrong with it. */
export function describeIssues(error: z.ZodError): string[] {
  const lines = error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message));
  const rest = error.issues.length - lines.length;
  return rest > 0 ? [...lines, `and ${rest} more`] : lines;
}

/** Validates a model answer with the task's schema, or throws with the real reasons. */
export function parseAnswer<S extends z.ZodType>(task: string, schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new InvalidAnswerError(task, describeIssues(result.error));
  return result.data;
}

/** Runs a parser that throws `ZodError` (such as `parseImportDraft`) and reports failures the same way. */
export function guardAnswer<T>(task: string, parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    if (err instanceof z.ZodError) throw new InvalidAnswerError(task, describeIssues(err));
    throw err;
  }
}
