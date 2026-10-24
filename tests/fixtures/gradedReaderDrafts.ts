/** Invented TEST-only private inputs/analyses; no real lesson, attestation or language approval. */
import type { Core, Candidates, ReaderDraft } from '../../scripts/graded-readers/drafts';
import { gradedReaderFixture } from './gradedReaders';

export function readerDraftFixture(): ReaderDraft {
  const body = gradedReaderFixture();
  const targets: [string, string[][]][] = [
    ['title', [['un-function'], ['livre-object']]],
    ...body.sentences.map((sentence): [string, string[][]] => [
      sentence.id,
      sentence.tokens.map((token) => token.entryIds),
    ]),
    ['q-recognize-book-scaffold', [['ce-function', 'etre-identity']]],
    ['q-recognize-book-option-0', [['un-function'], ['livre-object']]],
    ['q-recognize-book-option-1', [['le-function'], ['livre-object']]],
    ['q-recognize-book-answer-0', [['un-function'], ['livre-object']]],
    ['q-type-size-scaffold', [['le-function'], ['livre-object'], ['etre-identity']]],
    ['q-type-size-answer-0', [['petit-size']]],
  ];
  const analyses: ReaderDraft['analyses'] = targets.flatMap(([targetId, tokens]) =>
    tokens.flatMap((ids, ordinal) =>
      ids.map((entryId, part) => ({
        targetId,
        ordinal,
        part,
        entryId,
        ...(entryId === 'etre-identity'
          ? { verb: { kind: 'finite' as const, tense: 'present' as const, person: '3sg' as const } }
          : {}),
      })),
    ),
  );
  return {
    status: 'draft',
    body,
    analyses,
    verbGroups: analyses
      .filter((atom) => atom.verb)
      .map((atom) => ({
        targetId: atom.targetId,
        atomIds: [`${atom.targetId}:${atom.ordinal}:${atom.part}`],
        kind: 'simple',
        finiteAtomId: `${atom.targetId}:${atom.ordinal}:${atom.part}`,
      })),
    provenance: {
      origin: 'ai-authored',
      model: 'TEST fake model',
      generatedAt: '2026-10-23',
      // TEST placeholders, not an actual prompt, syllabus, dependency hash or review.
      promptHash: 'a'.repeat(64),
      syllabusHash: 'b'.repeat(64),
      dependencyHashes: [],
    },
    issues: [],
  };
}

export function readerCoreFixture(): Core {
  return gradedReaderFixture()
    .glossary.filter((entry) => entry.pos === 'function')
    .map((entry) => ({
      headword: entry.lemma,
      pos: 'function',
      sense: entry.sense,
      forms: entry.forms,
      gloss: entry.gloss,
    }));
}
export function readerCandidatesFixture(stage = 1): Candidates {
  return {
    stage,
    entries: gradedReaderFixture()
      .glossary.filter((entry) => entry.pos !== 'function')
      .map(({ id: _id, ...entry }) => entry),
  };
}
