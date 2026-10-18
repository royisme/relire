/** Reads a model answer as JSON, tolerating a Markdown code fence; no fallback content. */
import i18n from '../../i18n';

export function parseJsonAnswer<T>(rawText: string): T {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  try {
    return JSON.parse(cleaned.trim()) as T;
  } catch {
    throw new Error(i18n.t('errors.badResponse'));
  }
}
