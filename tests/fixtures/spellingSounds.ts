/** Owns disposable spelling-sound fixtures and TEST ONLY reviews; not real content or reviewer attestations. */
import { buildPack, rowHash, type BuildInputs, type PatternNotes } from '../../scripts/spelling-sounds/build';
import type { SpellingSoundsSource, SpellingSoundsReviews } from '../../src/types/spellingSounds';

export const spellingSource = (): SpellingSoundsSource => ({
  schemaVersion: 1,
  patterns: [
    { id: 'ou', spelling: 'ou', group: 'vowels', sound: ['u'], examples: ['vous', 'jour', 'rouge'] },
    { id: 'ch', spelling: 'ch', group: 'consonants', sound: ['ʃ'], examples: ['chat', 'chez', 'chien'] },
  ],
});
export const spellingNotes = (): PatternNotes => ({
  en: { ou: 'TEST ONLY ou note', ch: 'TEST ONLY ch note' },
  zh: { ou: 'TEST ONLY ou locale note', ch: 'TEST ONLY ch locale note' },
});
export const spellingReviews = (source = spellingSource(), notes = spellingNotes()): SpellingSoundsReviews => ({
  records: source.patterns.map((row) => ({
    id: row.id,
    rowHash: rowHash(row, notes),
    kind: 'ai',
    reviewedBy: 'AI review: TEST ONLY',
    reviewedAt: '2026-10-24',
    reference: 'Synthetic fixture, not an attestation',
  })),
});
export const spellingInputs = (): BuildInputs => ({
  source: spellingSource(),
  notes: spellingNotes(),
  reviews: spellingReviews(),
});
export const spellingPack = () => buildPack(spellingInputs());
