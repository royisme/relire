/** Structural tests with invented TEST content only; no publication or linguistic approval. */
import { expect, test } from 'bun:test';
import { z } from 'zod';
import syllabusJson from '../data/graded-readers/syllabus.json';
import reviewsJson from '../data/graded-readers/reviews.json';
import manifest from '../data/grammar-topics/manifest.json';
import {
  ReaderGlossaryEntrySchema,
  TokenBindingSchema,
  SentenceSchema,
  ReaderQuestionSchema,
  ReaderLearningSchema,
  ReaderBodySchema,
  PublishedReaderSchema,
  StageSchema,
  ReaderSyllabusSchema,
  ReaderReviewsSchema,
  type ReaderBody,
  type ReaderSyllabus,
} from '../src/types/gradedReader';
import { gradedReaderFixture } from './fixtures/gradedReaders';
import { bodyMutations, syllabusMutations } from './fixtures/gradedReaderMutations';

// Publication state changes as readers are reviewed; the mutation cases need a known starting point.
const syllabusFixture = (): ReaderSyllabus => {
  const syllabus = structuredClone(ReaderSyllabusSchema.parse(syllabusJson));
  for (const stage of syllabus.stages) Object.assign(stage, { include: false, bundled: false });
  return syllabus;
};
const publishedFixture = () => ({
  schemaVersion: 1 as const,
  body: gradedReaderFixture(),
  // TEST placeholders, not a canonical body hash or an actual review attestation.
  version: 'a'.repeat(64),
  review: { contentHash: 'a'.repeat(64), reviewedBy: 'TEST ONLY synthetic reviewer', reviewedAt: '2026-10-23' },
});

test('all public contracts parse TEST fixtures without changing content', () => {
  const body = gradedReaderFixture();
  expect(ReaderGlossaryEntrySchema.parse(body.glossary[0])).toEqual(body.glossary[0]);
  expect(TokenBindingSchema.parse(body.sentences[0].tokens[0])).toEqual(body.sentences[0].tokens[0]);
  expect(SentenceSchema.parse(body.sentences[0])).toEqual(body.sentences[0]);
  expect(ReaderQuestionSchema.parse(body.learning.checkpoints[0].questions[0])).toEqual(
    body.learning.checkpoints[0].questions[0],
  );
  expect(ReaderLearningSchema.parse(body.learning)).toEqual(body.learning);
  expect(ReaderBodySchema.parse(body)).toEqual(body);
  expect(PublishedReaderSchema.parse(publishedFixture())).toEqual(publishedFixture());
  expect(syllabusJson.stages[0]).toEqual(StageSchema.parse(syllabusJson.stages[0]));
  expect(syllabusJson).toEqual(ReaderSyllabusSchema.parse(syllabusJson));
  expect(ReaderReviewsSchema.parse(reviewsJson)).toEqual(reviewsJson);
  expect(() => z.toJSONSchema(ReaderBodySchema)).not.toThrow();
});

for (const [name, mutate] of bodyMutations) {
  test(`reader rejects ${name}`, () => {
    const body = gradedReaderFixture();
    mutate(body);
    expect(ReaderBodySchema.safeParse(body).success).toBe(false);
  });
}

for (const fr of [
  'C’est un livre',
  'C’est un livre. Il lit.',
  'C’est: un livre.',
  'C’est un livre...',
  'C’est un livre…',
  'C’est un\nlivre.',
  'C’est 1.5 livre.',
  'M. est petit.',
  'C’est\u2028un livre.',
]) {
  test(`sentences reject uncontrolled splitting: ${JSON.stringify(fr)}`, () => {
    expect(SentenceSchema.safeParse({ ...gradedReaderFixture().sentences[0], fr }).success).toBe(false);
  });
}

test('identical sentence occurrences and two distinct checkpoint pairs are valid', () => {
  const body = gradedReaderFixture();
  body.sentences.push({ ...structuredClone(body.sentences[0]), id: 's4' });
  const second = structuredClone(body.learning.checkpoints[0]);
  second.id = 'second-check';
  second.questions.forEach((item) => {
    item.question.id += '-second';
  });
  body.learning.checkpoints.push(second);
  expect(ReaderBodySchema.safeParse(body).success).toBe(true);
});

test('evidence permits exact subquotes, contiguous multiword and elided surface extraction', () => {
  const body = gradedReaderFixture();
  body.learning.checkpoints[0].questions[0].evidence.quote = 'un livre';
  const typed = body.learning.checkpoints[0].questions[1];
  typed.evidence = { sentenceId: 's1', quote: 'C’est un livre.' };
  typed.question.expectedAnswer = 'est';
  typed.question.acceptableAnswers = ['un livre'];
  expect(ReaderBodySchema.safeParse(body).success).toBe(true);
});

// Scan all authored language fields, including nested imported question/feedback contracts.
function languageFields(value: unknown, path: (string | number)[] = []): (string | number)[][] {
  if (Array.isArray(value)) return value.flatMap((entry, i) => languageFields(entry, [...path, i]));
  if (value !== null && typeof value === 'object')
    return Object.entries(value).flatMap(([key, entry]) => languageFields(entry, [...path, key]));
  const key = path.filter((part) => typeof part === 'string').at(-1);
  return typeof value === 'string' &&
    ['fr', 'en', 'zh', 'lemma', 'forms', 'prompt', 'expectedAnswer', 'acceptableAnswers', 'answer', 'quote'].includes(
      String(key),
    )
    ? [path]
    : [];
}
function replaceAt(body: ReaderBody, path: (string | number)[], value: string) {
  let parent: unknown = body;
  for (const key of path.slice(0, -1)) parent = (parent as Record<string | number, unknown>)[key];
  (parent as Record<string | number, unknown>)[path.at(-1)!] = value;
}
const languageBody = gradedReaderFixture();
languageBody.learning.checkpoints[0].questions[1].question.acceptableAnswers = ['est petit'];
languageBody.learning.checkpoints[0].questions[1].question.feedback.correct.detail = {
  en: 'TEST detail',
  zh: '测试说明',
};
for (const path of languageFields(languageBody)) {
  const key = path.filter((part) => typeof part === 'string').at(-1);
  const valid = key === 'zh' ? 'TEST中' : 'TEST';
  const badValues = [
    `${valid}\u0000`,
    `${valid}\t`,
    `${valid}\u0085`,
    `${valid}\u202e`,
    `<b>${valid}</b>`,
    `e\u0301${valid}`,
    ` ${valid} `,
  ];
  if (key === 'zh') badValues.push('TEST without Han');
  else badValues.push('TEST中');
  if (key !== 'en' && key !== 'zh') badValues.push("C'est", "C’est et c'est", 'C‘est', 'C`est');
  test(`language invariants cover ${path.join('.')}`, () => {
    expect(ReaderBodySchema.safeParse(languageBody).success).toBe(true);
    for (const value of badValues) {
      const body = structuredClone(languageBody);
      replaceAt(body, path, value);
      expect(ReaderBodySchema.safeParse(body).success).toBe(false);
    }
  });
}

test('all boundaries reject unknown fields, including shared bilingual/question descendants', () => {
  const body = gradedReaderFixture();
  const item = body.learning.checkpoints[0].questions[0];
  const boundaries: [z.ZodType, object][] = [
    [ReaderGlossaryEntrySchema, body.glossary[0]],
    [TokenBindingSchema, body.sentences[0].tokens[0]],
    [SentenceSchema, body.sentences[0]],
    [ReaderQuestionSchema, item],
    [ReaderLearningSchema, body.learning],
    [ReaderBodySchema, body],
    [PublishedReaderSchema, publishedFixture()],
    [StageSchema, syllabusJson.stages[0]],
    [ReaderSyllabusSchema, syllabusJson],
    [ReaderReviewsSchema, reviewsJson],
  ];
  for (const [schema, value] of boundaries)
    expect(schema.safeParse({ ...value, privateData: true }).success).toBe(false);
  const nested = [
    body.title,
    body.glossary[0].gloss,
    body.sentences[0].translation,
    body.learning.instruction,
    body.learning.checkpoints[0],
    item.evidence,
    item.question,
    item.question.instruction,
    item.question.feedback,
    item.question.feedback.correct,
    item.question.feedback.correct.summary,
    item.question.feedback.byAnswer![0],
    item.question.feedback.byAnswer![0].message,
  ];
  for (const value of nested) {
    Object.assign(value, { privateData: true });
    expect(ReaderBodySchema.safeParse(body).success).toBe(false);
    Reflect.deleteProperty(value, 'privateData');
  }
  const published = publishedFixture();
  Object.assign(published.review, { privateData: true });
  expect(PublishedReaderSchema.safeParse(published).success).toBe(false);
});

for (const [name, mutate] of syllabusMutations) {
  test(`syllabus rejects ${name}`, () => {
    const syllabus = syllabusFixture();
    mutate(syllabus);
    expect(ReaderSyllabusSchema.safeParse(syllabus).success).toBe(false);
  });
}

test('empty, partial and full included/bundled prefixes parse', () => {
  for (const included of [0, 5, 12])
    for (const bundled of [0, included]) {
      const syllabus = syllabusFixture();
      syllabus.stages.forEach((stage, i) => {
        stage.include = i < included;
        stage.bundled = i < bundled;
      });
      expect(ReaderSyllabusSchema.safeParse(syllabus).success).toBe(true);
    }
});

test('committed metadata is the inactive twelve-stage syllabus with real manifest targets', () => {
  const syllabus = syllabusFixture();
  const topicIds = new Set(manifest.topics.map((topic) => topic.id));
  expect(syllabus.syllabusVersion).toBe('0.1.0');
  expect(syllabus).not.toHaveProperty('coreVersion');
  expect(syllabus.stages.map((s) => [s.maxSentenceWords, s.maxTextWords, s.maxSentences])).toEqual([
    [6, 24, 4],
    [7, 35, 5],
    [8, 48, 6],
    [9, 63, 7],
    [10, 80, 8],
    [11, 99, 9],
    [12, 120, 10],
    [13, 143, 11],
    [14, 168, 12],
    [15, 195, 13],
    [16, 224, 14],
    [16, 256, 16],
  ]);
  expect(syllabus.stages.map((s) => s.newWordBudget)).toEqual([6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 10, 10]);
  syllabus.stages.forEach((stage, i) => {
    expect(stage.readerId).toBe(`a1-${String(i + 1).padStart(2, '0')}`);
    expect(typeof stage.include).toBe('boolean');
    expect(stage.bundled).toBe(false);
    for (const id of stage.topicIds) expect(topicIds.has(id)).toBe(true);
  });
});

test('metadata strings cannot hide controls after a valid slug, version or hash', () => {
  const body = gradedReaderFixture();
  body.id += '\n';
  expect(ReaderBodySchema.safeParse(body).success).toBe(false);
  const syllabus = syllabusFixture();
  syllabus.syllabusVersion += '\n';
  expect(ReaderSyllabusSchema.safeParse(syllabus).success).toBe(false);
  const published = publishedFixture();
  published.version += '\n';
  published.review.contentHash += '\n';
  expect(PublishedReaderSchema.safeParse(published).success).toBe(false);
});

test('French permits question/exclamation endings and English permits ordinary apostrophes', () => {
  const sentence = gradedReaderFixture().sentences[0];
  for (const mark of ['?', '!'])
    expect(SentenceSchema.safeParse({ ...sentence, fr: `C’est un livre${mark}` }).success).toBe(true);
  const body = gradedReaderFixture();
  body.sentences[0].translation.en = "It's a book.";
  expect(ReaderBodySchema.safeParse(body).success).toBe(true);
});

test('question ids are unique across distinct checkpoints, not just within each pair', () => {
  const body = gradedReaderFixture();
  const second = structuredClone(body.learning.checkpoints[0]);
  second.id = 'second-check';
  body.learning.checkpoints.push(second);
  expect(ReaderBodySchema.safeParse(body).success).toBe(false);
});

test('stage constraints reject invalid budgets, caps and enum values', () => {
  for (const patch of [
    { newWordBudget: -1 },
    { newWordBudget: 21 },
    { maxSentenceWords: 0 },
    { maxTextWords: 0 },
    { maxSentences: 2 },
    { allowedTenses: ['conditional'] },
    { allowedConstructions: ['unsupported'] },
    { topicIds: [] },
    { theme: 'not a slug' },
  ])
    expect(StageSchema.safeParse({ ...syllabusJson.stages[0], ...patch }).success).toBe(false);
});

test('published review hashes must agree and metadata must be well formed', () => {
  const valid = publishedFixture();
  for (const patch of [
    { version: 'bad' },
    { schemaVersion: 2 },
    { review: { ...valid.review, contentHash: 'b'.repeat(64) } },
    { review: { ...valid.review, reviewedBy: '' } },
    { review: { ...valid.review, reviewedAt: '2026-02-30' } },
  ])
    expect(PublishedReaderSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
});

test('review records use reader identities and hashes without topic semantics', () => {
  const record = { readerId: 'test-book', ...publishedFixture().review };
  expect(ReaderReviewsSchema.parse({ records: [record] })).toEqual({ records: [record] });
  for (const patch of [
    { readerId: '' },
    { contentHash: 'bad' },
    { reviewedBy: '' },
    { reviewedAt: 'yesterday' },
    { topicId: 'test-topic' },
  ])
    expect(ReaderReviewsSchema.safeParse({ records: [{ ...record, ...patch }] }).success).toBe(false);
});
