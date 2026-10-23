/**
 * The words shown when an AI call fails. Providers name their own problems
 * (quota, network) and those are shown as they are. When the model answered in
 * a shape the app cannot use, the reasons come from the schema in English only,
 * so they are wrapped in a translated sentence. Does not decide what to do about the error.
 */
import i18n from '../i18n';
import { InvalidAnswerError } from '../services/ai/errors';

export function aiErrorText(err: unknown): string {
  if (err instanceof InvalidAnswerError) return i18n.t('errors.invalidAnswer', { msg: err.issues.join('; ') });
  return err instanceof Error ? err.message : String(err);
}
