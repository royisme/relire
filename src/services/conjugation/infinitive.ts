/**
 * The learner's infinitive in the form the engine, the request and its cache key all use. Owns that one
 * normalisation and nothing else, and imports no engine code, so the main bundle (api.ts) can use it without
 * carrying rules, assembly or verification. Does not own lookup keys (grammarPack/lookup.ts).
 */
import { foldApostrophes } from '../../types/conjugationAnswer';

/**
 * The learner's infinitive in the engine's form: NFC, trimmed, lowercase (French infinitives are), single spaces
 * and the typographic apostrophe (`isPronominalInfinitive` and the pack schema accept only U+2019). The cache key
 * lowercases too, so a request and its key always agree.
 */
export const engineInfinitive = (typed: string) =>
  foldApostrophes(typed.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' '));
