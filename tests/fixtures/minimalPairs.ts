/** Owns in-memory minimal-pairs fixtures; TEST ONLY reviews are never owner attestations or real pack files. */
import type { BuildInputs, PairsSource, Reviews } from '../../scripts/minimal-pairs/build';
import { rowHash } from '../../scripts/minimal-pairs/build';
import type { MinimalPairsPack } from '../../src/types/minimalPairs';

export const pairSource = (): PairsSource => ({
  packVersion: '0.1.0',
  pairs: [
    { id: 'rue-roue', contrast: 'y-u', a: 'rue', b: 'roue' },
    { id: 'fee-fait', contrast: 'e-ɛ', a: 'fée', b: 'fait', note: 'minimalPairs.notes.tendency' },
  ],
});

export const pairReviews = (source = pairSource()): Reviews => ({
  records: source.pairs.map((pair) => ({
    pairId: pair.id,
    rowHash: rowHash(pair),
    reviewedBy: 'TEST ONLY',
    reviewedAt: '2026-10-22',
    reference: 'Synthetic test review, not an owner attestation',
  })),
});

export const pairInputs = (): BuildInputs => ({ source: pairSource(), reviews: pairReviews() });

export const pairPack = (): MinimalPairsPack => ({
  schemaVersion: 1,
  ...pairSource(),
  pairs: pairSource().pairs.map((pair) => ({
    ...pair,
    status: 'reviewed',
    reviewedBy: 'TEST ONLY',
    reviewedAt: '2026-10-22',
  })),
});
