/** Invented TEST gate inputs only; synthetic review labels/hashes never authorize real content. */
import { normalizeLookupToken as key } from '../../src/services/grammarPack/lookup';
import syllabusJson from '../../data/graded-readers/syllabus.json';
import { ReaderSyllabusSchema } from '../../src/types/gradedReader';
import type { ReaderDraft } from '../../scripts/graded-readers/drafts';
import { contentHash, policyHash, type GateContext } from '../../scripts/graded-readers/gateInputs';
import { memoryLexicon, type LexiconCandidate } from '../../scripts/graded-readers/lexiconIndex';
import { targetInventory, tokenize } from '../../scripts/graded-readers/tokenize';
import { gradedReaderFixture } from './gradedReaders';

export const testRows: (LexiconCandidate & { form: string })[] = [
  { form: 'livre', lemma: 'livre', pos: 'noun', slot: 'singular' },
  { form: 'petit', lemma: 'petit', pos: 'adjective', slot: 'ms' },
  { form: 'est', lemma: 'être', pos: 'verb', slot: 'tenses.present.3sg' },
  { form: 'est', lemma: 'est', pos: 'noun', slot: 'singular' },
  { form: 'a', lemma: 'avoir', pos: 'verb', slot: 'tenses.present.3sg' },
  { form: 'a', lemma: 'a', pos: 'noun', slot: 'singular' },
  { form: 'son', lemma: 'son', pos: 'noun', slot: 'singular' },
  { form: 'suis', lemma: 'être', pos: 'verb', slot: 'tenses.present.1sg' },
  { form: 'suis', lemma: 'suivre', pos: 'verb', slot: 'tenses.present.1sg' },
  { form: 'suis', lemma: 'suivre', pos: 'verb', slot: 'tenses.present.2sg' },
  { form: 'suis', lemma: 'suivre', pos: 'verb', slot: 'tenses.imperatif.2sg' },
  ...['parle', 'aime'].flatMap((form) =>
    ['tenses.present.1sg', 'tenses.present.3sg', 'tenses.imperatif.2sg', 'tenses.subjonctif.1sg'].map((slot) => ({
      form,
      lemma: form === 'parle' ? 'parler' : 'aimer',
      pos: 'verb' as const,
      slot,
    })),
  ),
];
export function gateFixture(): { draft: ReaderDraft; context: GateContext } {
  const body = gradedReaderFixture();
  const syllabus = ReaderSyllabusSchema.parse(structuredClone(syllabusJson));
  syllabus.stages[0].readerId = body.id;
  syllabus.stages[0].include = true;
  const core = body.glossary
    .filter((entry) => entry.pos === 'function')
    .map(({ lemma, sense, forms, gloss }) => ({ headword: lemma, pos: 'function' as const, sense, forms, gloss }));
  const context: GateContext = {
    syllabus,
    core,
    candidates: {
      stage: 1,
      entries: structuredClone(
        body.glossary.filter((entry) => entry.pos !== 'function').map(({ id: _id, ...entry }) => entry),
      ),
    },
    previous: [],
    reviews: { records: [] },
    topicIds: syllabus.stages.flatMap((stage) => stage.topicIds),
    lexicon: memoryLexicon(testRows),
    reviewedNouns: [{ lemma: 'livre', gender: 'masculine' }],
    evidence: {
      reviewedBy: 'TEST ONLY',
      reference: 'TEST synthetic input',
      topics: body.topics.map((topicId) => ({ topicId, sentenceIds: ['s1'] })),
      extractionQuestions: ['recognize-book', 'type-size'],
      compounds: [],
      modalLemmas: [],
      pronominals: [],
      compoundPast: [],
      inversions: [],
      clauseMarkers: [],
    },
  };
  const draft: ReaderDraft = {
    status: 'draft',
    body,
    analyses: [],
    verbGroups: [],
    issues: [],
    provenance: {
      origin: 'ai-authored',
      model: 'TEST synthetic generator',
      generatedAt: '2026-10-23',
      promptHash: contentHash('TEST'),
      syllabusHash: policyHash(syllabus, core, 1),
      dependencyHashes: [],
    },
  };
  annotate(draft, context);
  return { draft, context };
}
export function annotate(
  draft: ReaderDraft,
  context: GateContext,
  overrides: Record<string, ReaderDraft['analyses'][number]['verb']> = {},
) {
  draft.analyses = [];
  draft.verbGroups = [];
  const readingIds: Record<string, string> = Object.fromEntries(
    draft.body.glossary.flatMap((entry) => entry.forms.map((form) => [key(form), entry.id])),
  );
  for (const target of targetInventory(draft.body)) {
    for (const word of tokenize(target, { compounds: context.evidence.compounds }).words) {
      const entryIds: string[] = [];
      if (word.phrase)
        entryIds.push(
          draft.body.glossary.find((entry) => entry.pos === 'phrase' && entry.forms.includes(word.phrase!))!.id,
        );
      for (const atom of word.atoms) {
        // An entry may list only the elision surface (c’), while the atom carries the expansion (ce).
        const entryId =
          readingIds[key(atom.readings[0])] ?? (atom.role === 'elision' ? readingIds[key(atom.spelling)] : undefined);
        if (!entryId) throw new Error(`TEST builder needs explicit reading for ${atom.spelling}`);
        const entry = draft.body.glossary.find((entry) => entry.id === entryId)!;
        const verb =
          overrides[atom.id] ??
          (entry.pos === 'verb'
            ? { kind: 'finite' as const, tense: 'present' as const, person: '3sg' as const }
            : undefined);
        draft.analyses.push({
          targetId: target.id,
          ordinal: atom.ordinal,
          part: atom.part,
          entryId,
          ...(verb && { verb }),
        });
        if (verb)
          draft.verbGroups.push({ targetId: target.id, atomIds: [atom.id], kind: 'simple', finiteAtomId: atom.id });
        entryIds.push(entryId);
      }
      const sentence = draft.body.sentences.find((item) => item.id === target.id);
      if (sentence) sentence.tokens[word.ordinal] = { ordinal: word.ordinal, entryIds: [...new Set(entryIds)] };
    }
  }
}
export function setStage(draft: ReaderDraft, context: GateContext, order: number) {
  // Repeated TEST bodies are separate editorial predecessors, not invented production lessons.
  const original = structuredClone(draft);
  context.previous = [];
  for (const stage of context.syllabus.stages) if (stage.order <= order) stage.include = true;
  for (let i = 1; i < order; i++) {
    const previous = structuredClone(original);
    previous.body.order = i;
    previous.body.id = context.syllabus.stages[i - 1].readerId;
    previous.body.topics = [...context.syllabus.stages[i - 1].topicIds];
    previous.provenance.syllabusHash = policyHash(context.syllabus, context.core, i);
    previous.provenance.dependencyHashes = context.previous.map((item) => ({
      readerId: item.body.id,
      contentHash: contentHash(item.body),
    }));
    context.previous.push(previous);
    context.reviews.records.push({
      readerId: previous.body.id,
      contentHash: contentHash(previous.body),
      reviewedBy: 'TEST ONLY',
      reviewedAt: '2026-10-23',
    });
  }
  draft.body.order = order;
  draft.body.id = context.syllabus.stages[order - 1].readerId;
  draft.body.topics = [...context.syllabus.stages[order - 1].topicIds];
  context.candidates.stage = order;
  context.evidence.topics = draft.body.topics.map((topicId) => ({ topicId, sentenceIds: ['s1'] }));
  draft.provenance.syllabusHash = policyHash(context.syllabus, context.core, order);
  draft.provenance.dependencyHashes = context.previous.map((item) => ({
    readerId: item.body.id,
    contentHash: contentHash(item.body),
  }));
}
export function refreshPolicy(draft: ReaderDraft, context: GateContext) {
  draft.provenance.syllabusHash = policyHash(context.syllabus, context.core, draft.body.order);
}
