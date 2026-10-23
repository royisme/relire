/** Owns invalid TEST reader/syllabus mutations, not production content or publication decisions. */
import type { ReaderBody, ReaderSyllabus } from '../../src/types/gradedReader';

export const bodyMutations: [string, (body: ReaderBody) => void][] = [
  [
    'duplicate sentence id',
    (b) => {
      b.sentences[1].id = b.sentences[0].id;
    },
  ],
  [
    'reserved sentence id',
    (b) => {
      b.sentences[0].id = 'title';
    },
  ],
  [
    'missing sentence',
    (b) => {
      b.sentences.pop();
    },
  ],
  [
    'duplicate glossary id',
    (b) => {
      b.glossary[1].id = b.glossary[0].id;
    },
  ],
  [
    'duplicate normalized glossary key',
    (b) => {
      b.glossary.push({ ...b.glossary[0], id: 'other-book', lemma: 'LIVRE' });
      b.sentences[0].tokens[2].entryIds.push('other-book');
    },
  ],
  [
    'duplicate form',
    (b) => {
      b.glossary[0].forms.push('livre');
    },
  ],
  [
    'unused glossary entry',
    (b) => {
      b.glossary.push({ ...b.glossary[0], id: 'unused', sense: 'unused' });
    },
  ],
  [
    'missing noun gender',
    (b) => {
      delete b.glossary[0].gender;
    },
  ],
  [
    'non-noun gender',
    (b) => {
      b.glossary[1].gender = 'feminine';
    },
  ],
  [
    'missing binding',
    (b) => {
      b.sentences[0].tokens.pop();
    },
  ],
  [
    'extra binding',
    (b) => {
      b.sentences[0].tokens.push({ ordinal: 3, entryIds: ['livre-object'] });
    },
  ],
  [
    'duplicate ordinal',
    (b) => {
      b.sentences[0].tokens[1].ordinal = 0;
    },
  ],
  [
    'ordinal gap',
    (b) => {
      b.sentences[0].tokens[1].ordinal = 5;
    },
  ],
  [
    'out-of-order bindings',
    (b) => {
      b.sentences[0].tokens.reverse();
    },
  ],
  [
    'negative ordinal',
    (b) => {
      b.sentences[0].tokens[0].ordinal = -1;
    },
  ],
  [
    'fractional ordinal',
    (b) => {
      b.sentences[0].tokens[0].ordinal = 0.5;
    },
  ],
  [
    'dangling binding',
    (b) => {
      b.sentences[0].tokens[0].entryIds[0] = 'missing';
    },
  ],
  [
    'duplicate binding id',
    (b) => {
      b.sentences[0].tokens[0].entryIds.push('ce-function');
    },
  ],
  [
    'empty binding ids',
    (b) => {
      b.sentences[0].tokens[0].entryIds = [];
    },
  ],
  [
    'duplicate topics',
    (b) => {
      b.topics.push(b.topics[0]);
    },
  ],
  [
    'missing topics',
    (b) => {
      b.topics = [];
    },
  ],
  [
    'duplicate checkpoint ids',
    (b) => {
      b.learning.checkpoints.push(structuredClone(b.learning.checkpoints[0]));
    },
  ],
  [
    'duplicate question ids',
    (b) => {
      b.learning.checkpoints[0].questions[1].question.id = b.learning.checkpoints[0].questions[0].question.id;
    },
  ],
  [
    'checkpoint/question id collision',
    (b) => {
      b.learning.checkpoints[0].id = b.learning.checkpoints[0].questions[0].question.id;
    },
  ],
  [
    'typed before recognition',
    (b) => {
      b.learning.checkpoints[0].questions.reverse();
    },
  ],
  [
    'missing checkpoints',
    (b) => {
      b.learning.checkpoints = [];
    },
  ],
  [
    'too many checkpoints',
    (b) => {
      b.learning.checkpoints.push(b.learning.checkpoints[0], b.learning.checkpoints[0]);
    },
  ],
  [
    'missing evidence sentence',
    (b) => {
      b.learning.checkpoints[0].questions[0].evidence.sentenceId = 'missing';
    },
  ],
  [
    'quote in wrong sentence',
    (b) => {
      b.learning.checkpoints[0].questions[0].evidence.sentenceId = 's2';
    },
  ],
  [
    'inexact evidence quote',
    (b) => {
      b.learning.checkpoints[0].questions[0].evidence.quote = 'c’est un livre.';
    },
  ],
  [
    'empty evidence quote',
    (b) => {
      b.learning.checkpoints[0].questions[0].evidence.quote = '';
    },
  ],
  [
    'truncated source atom in evidence',
    (b) => {
      b.learning.checkpoints[0].questions[1].evidence.quote = 'pet';
      b.learning.checkpoints[0].questions[1].question.expectedAnswer = 'pet';
    },
  ],
  [
    'answer absent from evidence',
    (b) => {
      b.learning.checkpoints[0].questions[1].question.expectedAnswer = 'grand';
    },
  ],
  [
    'partial-word answer',
    (b) => {
      b.learning.checkpoints[0].questions[1].question.expectedAnswer = 'pet';
    },
  ],
  [
    'unsupported acceptable answer',
    (b) => {
      b.learning.checkpoints[0].questions[1].question.acceptableAnswers = ['grand'];
    },
  ],
  [
    'duplicate normalized answers',
    (b) => {
      b.learning.checkpoints[0].questions[1].question.acceptableAnswers = ['PETIT'];
    },
  ],
  [
    'multiple choice groups',
    (b) => {
      b.learning.checkpoints[0].questions[0].question.prompt += ' {un|le}';
    },
  ],
  [
    'multiple typed blanks',
    (b) => {
      b.learning.checkpoints[0].questions[1].question.prompt += ' [___]';
    },
  ],
  [
    'missing distractor feedback',
    (b) => {
      delete b.learning.checkpoints[0].questions[0].question.feedback.byAnswer;
    },
  ],
  [
    'correct-answer distractor feedback',
    (b) => {
      b.learning.checkpoints[0].questions[0].question.feedback.byAnswer![0].answer = 'un livre';
    },
  ],
  [
    'unsupported level',
    (b) => {
      Object.assign(b, { level: 'A2' });
    },
  ],
  [
    'order below range',
    (b) => {
      b.order = 0;
    },
  ],
  [
    'order above range',
    (b) => {
      b.order = 13;
    },
  ],
];

export const syllabusMutations: [string, (s: ReaderSyllabus) => void][] = [
  [
    'missing stage',
    (s) => {
      s.stages.pop();
    },
  ],
  [
    'extra stage',
    (s) => {
      s.stages.push(s.stages[0]);
    },
  ],
  [
    'duplicate order',
    (s) => {
      s.stages[1].order = 1;
    },
  ],
  [
    'out-of-order stages',
    (s) => {
      s.stages.reverse();
    },
  ],
  [
    'duplicate reader id',
    (s) => {
      s.stages[1].readerId = s.stages[0].readerId;
    },
  ],
  [
    'duplicate topic',
    (s) => {
      s.stages[0].topicIds.push(s.stages[0].topicIds[0]);
    },
  ],
  [
    'duplicate tense',
    (s) => {
      s.stages[0].allowedTenses.push('present');
    },
  ],
  [
    'duplicate construction',
    (s) => {
      s.stages[5].allowedConstructions.push('modal-infinitive');
    },
  ],
  [
    'missing present',
    (s) => {
      s.stages[0].allowedTenses = ['imperatif'];
    },
  ],
  [
    'bundled but excluded',
    (s) => {
      s.stages[0].bundled = true;
    },
  ],
  [
    'included prefix gap',
    (s) => {
      s.stages[1].include = true;
    },
  ],
  [
    'bundled prefix gap',
    (s) => {
      s.stages[0].include = true;
      s.stages[1].include = true;
      s.stages[1].bundled = true;
    },
  ],
];
for (const field of ['newWordBudget', 'maxSentenceWords', 'maxTextWords', 'maxSentences'] as const)
  syllabusMutations.push([
    `decreasing ${field}`,
    (s) => {
      s.stages[1][field] = s.stages[0][field] - 1;
    },
  ]);
