/** Validates the SDK's actual NBest[0] detail shape; no phoneme labels or coaching are inferred. */
import { z } from 'zod';
import i18n from '../../../../i18n';
import type { PronunciationAssessment } from '../../../../types';

const score = z.number().min(0).max(100);
const detailSchema = z.object({
  PronunciationAssessment: z.object({
    PronScore: score,
    AccuracyScore: score,
    FluencyScore: score,
    CompletenessScore: score.optional(),
  }),
  Words: z
    .array(
      z.object({
        Word: z.string().min(1),
        PronunciationAssessment: z
          .object({
            AccuracyScore: score.optional(),
            ErrorType: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export function mapAzureResult(detail: unknown, text: string, referenceText: string): PronunciationAssessment {
  const parsed = detailSchema.safeParse(detail);
  if (!parsed.success) throw new Error(i18n.t('azureAssessment.invalidResult', { reason: parsed.error.message }));
  const { PronunciationAssessment: scores, Words: words } = parsed.data;
  return {
    overallScore: scores.PronScore,
    accuracyScore: scores.AccuracyScore,
    fluencyScore: scores.FluencyScore,
    ...(scores.CompletenessScore !== undefined ? { completenessScore: scores.CompletenessScore } : {}),
    ...(words
      ? {
          wordResults: words.map(({ Word: word, PronunciationAssessment: assessment }) => ({
            word,
            ...(assessment?.AccuracyScore !== undefined ? { accuracyScore: assessment.AccuracyScore } : {}),
            ...(assessment?.ErrorType !== undefined ? { errorType: assessment.ErrorType } : {}),
          })),
        }
      : {}),
    ...(text.trim() ? { transcribedSpeech: text } : {}),
    referenceText,
    evaluatedAt: new Date().toISOString(),
  };
}
