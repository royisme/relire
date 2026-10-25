/** Application-authored import refusals retain their key and values until the UI translates them. */
export interface ImportProblem {
  key: `vocab.import.errors.${string}`;
  params?: Record<string, string | number>;
}
export type ImportReason = ImportProblem | string;

export class ImportRefusal extends Error {
  constructor(readonly problem: ImportProblem) {
    super(problem.key);
  }
}

export function importReason(error: unknown): ImportReason {
  if (error instanceof ImportRefusal) return error.problem;
  return error instanceof Error ? error.message : String(error);
}
