/**
 * What the article import asks a model to read from page images: the printed
 * title (empty when the page has none) and the text. Owns this answer contract
 * only; the review screen and the saved article live elsewhere.
 */
import { z } from 'zod';

export const MAX_TRANSCRIBED_TEXT = 80000;

export const TranscriptionSchema = z.object({
  title: z.string().trim().max(300),
  text: z.string().trim().min(1).max(MAX_TRANSCRIBED_TEXT),
});
export type Transcription = z.infer<typeof TranscriptionSchema>;
