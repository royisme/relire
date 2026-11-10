/** Owns private gate diagnostics and lexical identity, not validation or repair. */
import { normalizeLookupToken } from '../../src/services/grammarPack/lookup';
import type { ReaderGlossaryEntry } from '../../src/types/gradedReader';

export interface Diagnostic {
  gate: 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  severity: 'error' | 'warning';
  readerId: string;
  targetId: string;
  ordinal: number | null;
  part: number | null;
  spelling: string;
  reason: string;
  selected?: { lemma: string; sense: string };
  candidates?: readonly unknown[];
}
export type Report = (gate: Diagnostic['gate'], reason: string, location?: Partial<Diagnostic>) => void;
export const lexicalKey = (entry: Pick<ReaderGlossaryEntry, 'pos' | 'lemma' | 'sense'>) =>
  JSON.stringify([entry.pos, normalizeLookupToken(entry.lemma), entry.sense]);
export const atomId = (targetId: string, ordinal: number, part: number) => `${targetId}:${ordinal}:${part}`;
