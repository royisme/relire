/**
 * Answers "conjugate this verb" for the Conjugation page, pack first: a verb in the pack is answered from the
 * pack with no AI call and no key; any other verb is asked of the AI (`fetchConjugation`) and then verified
 * against the engine. Owns that decision and the shape the page renders. Does not own the request, its cache or
 * the engine (api.ts, verify.ts), nor loading the pack or request ordering (the caller overtakes stale requests).
 */
import type { ConjugationAnswer } from '../../types/conjugationAnswer';
import { fetchConjugation } from '../api';
import { findPackVerb } from '../grammarPack/lookup';
import type { GrammarPack } from '../../types/grammarPack';
import { verifyAnswer, verifyPackVerb, type VerifiedVerb } from './verify';

export interface ConjugationResult {
  verb: VerifiedVerb;
  /** One example sentence per tense; only an AI answer has them. */
  examples?: ConjugationAnswer['examples'];
}

/** `pack` is the loaded grammar pack; the caller owns loading it. */
export async function resolveVerb(typed: string, pack: GrammarPack): Promise<ConjugationResult> {
  const row = findPackVerb(pack, typed);
  if (row) return { verb: verifyPackVerb(row) };
  const answer = await fetchConjugation(typed);
  return { verb: verifyAnswer(answer), examples: answer.examples };
}
