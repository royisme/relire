/**
 * Guards the four score fields of the pronunciation prompts: each one is a
 * typed placeholder, never a digit-valued example a model could copy back as
 * if it had measured it. Owns that assertion only; the general template
 * checks (variables, blocks, field coverage) stay in tests/prompts.test.ts.
 */
import { expect, test } from 'bun:test';
import { renderTemplate } from '../src/services/ai/prompts/engine';
import { PROMPTS, type PromptId } from '../src/services/ai/prompts/registry';

const SCORE_KEYS = ['overallScore', 'accuracyScore', 'fluencyScore', 'rhythmScore'] as const;
const IDS: PromptId[] = ['pronunciationAudio', 'pronunciationText'];

for (const id of IDS) {
  for (const lang of ['en', 'zh'] as const) {
    test(`${id}.${lang} asks for the four scores with a placeholder, never an example number`, () => {
      const def = PROMPTS.find((p) => p.id === id)!;
      const out = renderTemplate(def.defaults[lang], def.sample);
      for (const key of SCORE_KEYS) {
        expect(out, `${id}.${lang}: "${key}" is not followed by a placeholder`).toMatch(new RegExp(`"${key}": <`));
        expect(out, `${id}.${lang}: "${key}" still shows an example number`).not.toMatch(new RegExp(`"${key}": \\d`));
      }
      expect(out).not.toContain('{{');
      expect(out).toContain(def.sample.referenceText!);
    });
  }
}
