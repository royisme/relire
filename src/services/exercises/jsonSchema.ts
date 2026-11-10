/**
 * JSON schemas of the exercise contracts, in a form every provider accepts.
 * Owns the Zod-to-JSON-schema conversion; providers forward the result as their
 * response schema and the same Zod schema validates what comes back. Does not
 * name a provider or send anything.
 */
import { z } from 'zod';
import { AtelierItemSchema } from '../../types/atelier';
import {
  DrillsSchema,
  ExplanationSchema,
  GeneratedExercisesSchema,
  HintSchema,
  OpenGradeSchema,
} from '../../types/exerciseAi';
import { ConjugationAnswerSchema } from '../../types/conjugationAnswer';
import { TranscriptionSchema } from '../../types/transcription';
import { ImportDraftSchema } from './importDraft';

/** A plain JSON-schema document. */
export type JsonSchema = Record<string, unknown>;

/**
 * Converts a Zod schema to draft-07 JSON schema for the input side (so fields
 * with defaults stay optional for the model). Gemini's `responseSchema` rejects
 * `const`; a singleton `enum` says the same thing and every provider accepts
 * it. The result is copied through JSON so only enumerable fields survive:
 * Zod attaches a non-enumerable `~standard` converter that would regenerate
 * `const` if a consumer re-ran it. Validate answers with the original schema,
 * never with this output (it does not carry refinements).
 */
export function toProviderJsonSchema(schema: z.ZodType): JsonSchema {
  const converted = z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
    override: ({ jsonSchema }) => {
      if (jsonSchema.const !== undefined) {
        jsonSchema.enum = [jsonSchema.const];
        delete jsonSchema.const;
      }
    },
  });
  return JSON.parse(JSON.stringify(converted)) as JsonSchema;
}

/** Response schema for units generated from an article. */
export const exerciseJsonSchema = () => toProviderJsonSchema(GeneratedExercisesSchema);

/** Response schema for adaptive drills. */
export const drillsJsonSchema = () => toProviderJsonSchema(DrillsSchema);

/** Response schema for reading a worksheet into a draft. */
export const importDraftJsonSchema = () => toProviderJsonSchema(ImportDraftSchema);

/** Response schema for the text read from page images. */
export const transcriptionJsonSchema = () => toProviderJsonSchema(TranscriptionSchema);

/** Response schema for a hint. */
export const hintJsonSchema = () => toProviderJsonSchema(HintSchema);

/** Response schema for a mistake explanation. */
export const explanationJsonSchema = () => toProviderJsonSchema(ExplanationSchema);

/** Response schema for an open-answer grade. */
export const openGradeJsonSchema = () => toProviderJsonSchema(OpenGradeSchema);

/** Response schema for one atelier round. */
export const atelierRoundJsonSchema = () => toProviderJsonSchema(z.object({ items: z.array(AtelierItemSchema) }));

/** Response schema for the conjugation of one verb. */
export const conjugationJsonSchema = () => toProviderJsonSchema(ConjugationAnswerSchema);
