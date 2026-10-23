/** Invented TEST single-rule mutations paired with the all-gates passing fixture. */
import type { ReaderDraft } from '../../scripts/graded-readers/drafts';
import type { GateContext } from '../../scripts/graded-readers/gateInputs';
import { memoryLexicon } from '../../scripts/graded-readers/lexiconIndex';
import { annotate, refreshPolicy } from './gradedReaderGates';

export const gateMutations: [string, string, (draft: ReaderDraft, context: GateContext) => void][] = [
  ['G0', 'strict schema', (draft) => Object.assign(draft, { hiddenException: true })],
  [
    'G0',
    'topic metadata',
    (_, context) => {
      context.topicIds = [];
    },
  ],
  [
    'G0',
    'stage id',
    (draft) => {
      draft.body.id = 'wrong';
    },
  ],
  [
    'G0',
    'stage topics',
    (draft) => {
      draft.body.topics.pop();
    },
  ],
  [
    'G0',
    'candidate stage',
    (_, context) => {
      context.candidates.stage = 2;
    },
  ],
  [
    'G0',
    'policy hash',
    (draft) => {
      draft.provenance.syllabusHash = 'b'.repeat(64);
    },
  ],
  [
    'G0',
    'issues',
    (draft) => {
      draft.issues.push('TEST unresolved');
    },
  ],
  [
    'G0',
    'unknown analysis target',
    (draft) => {
      draft.analyses[0].targetId = 'invented-target';
    },
  ],
  [
    'G0',
    'missing reviewed evidence',
    (_, context) => {
      context.evidence.reviewedBy = '';
    },
  ],
  [
    'G1',
    'missing part',
    (draft) => {
      draft.analyses.splice(0, 1);
    },
  ],
  [
    'G1',
    'duplicate part',
    (draft) => {
      draft.analyses.push({ ...draft.analyses[0] });
    },
  ],
  [
    'G1',
    'extra part',
    (draft) => {
      draft.analyses.push({ ...draft.analyses[0], part: 9 });
    },
  ],
  [
    'G1',
    'binding order',
    (draft) => {
      draft.body.sentences[0].tokens[0].entryIds.reverse();
    },
  ],
  [
    'G2',
    'unknown attestation',
    (_, context) => {
      context.lexicon = memoryLexicon([]);
    },
  ],
  [
    'G2',
    'wrong exact slot',
    (draft) => {
      draft.analyses.find((analysis) => analysis.verb)!.verb = { kind: 'finite', tense: 'present', person: '1sg' };
    },
  ],
  [
    'G2',
    'missing verb analysis',
    (draft) => {
      delete draft.analyses.find((analysis) => analysis.verb)!.verb;
    },
  ],
  [
    'G2',
    'verb on nonverb',
    (draft) => {
      draft.analyses[0].verb = { kind: 'infinitive' };
    },
  ],
  [
    'G2',
    'unreviewed function form',
    (draft, context) => {
      context.core[0].forms = ['wrong'];
      refreshPolicy(draft, context);
    },
  ],
  [
    'G3',
    'budget plus one',
    (draft, context) => {
      context.syllabus.stages[0].newWordBudget = 2;
      refreshPolicy(draft, context);
    },
  ],
  [
    'G3',
    'outside closed candidates',
    (_, context) => {
      context.candidates.entries.pop();
    },
  ],
  [
    'G3',
    'changed reviewed gloss',
    (draft) => {
      draft.body.glossary[0].gloss.en = 'TEST different';
    },
  ],
  [
    'G3',
    'missing local gloss',
    (draft) => {
      draft.analyses[0].entryId = 'missing-entry';
    },
  ],
  [
    'G3',
    'unencountered form',
    (draft) => {
      draft.body.glossary[0].forms.push('livres');
    },
  ],
  [
    'G4',
    'verb outside any group',
    (draft) => {
      draft.verbGroups.pop();
    },
  ],
  [
    'G4',
    'overlapping groups',
    (draft) => {
      draft.verbGroups.push(structuredClone(draft.verbGroups[0]));
    },
  ],
  [
    'G4',
    'cross-target group',
    (draft) => {
      draft.verbGroups[0].atomIds.push(draft.verbGroups[1].finiteAtomId);
    },
  ],
  [
    'G4',
    'dangling finite head',
    (draft) => {
      draft.verbGroups[0].finiteAtomId = 'missing:0:0';
    },
  ],
  [
    'G4',
    'duplicate member',
    (draft) => {
      draft.verbGroups[0].atomIds.push(draft.verbGroups[0].atomIds[0]);
    },
  ],
  [
    'G4',
    'nonverb member',
    (draft) => {
      draft.verbGroups[0].atomIds.push('s1:1:0');
    },
  ],
  [
    'G5',
    'sentence cap plus one',
    (draft, context) => {
      context.syllabus.stages[0].maxSentenceWords = 3;
      refreshPolicy(draft, context);
    },
  ],
  [
    'G5',
    'text cap plus one',
    (draft, context) => {
      context.syllabus.stages[0].maxTextWords = 10;
      refreshPolicy(draft, context);
    },
  ],
  [
    'G5',
    'sentence count plus one',
    (draft, context) => {
      context.syllabus.stages[0].maxSentences = 3;
      draft.body.sentences.push({ ...structuredClone(draft.body.sentences[2]), id: 's4' });
      annotate(draft, context);
      refreshPolicy(draft, context);
    },
  ],
  [
    'G5',
    'reviewed noun conflict',
    (_, context) => {
      context.reviewedNouns = [{ lemma: 'livre', gender: 'feminine' }];
    },
  ],
  [
    'G5',
    'missing topic evidence',
    (_, context) => {
      context.evidence.topics.pop();
    },
  ],
  [
    'G5',
    'invalid topic sentence',
    (_, context) => {
      context.evidence.topics[0].sentenceIds = ['absent'];
    },
  ],
  [
    'G5',
    'missing extraction intent',
    (_, context) => {
      context.evidence.extractionQuestions.pop();
    },
  ],
];
