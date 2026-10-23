/** Invented TEST content only: never published, reviewed or used as a production lesson. */
import { contentHash } from '../../scripts/graded-readers/gateInputs';
import type { PublishedReader, ReaderBody, TokenBinding } from '../../src/types/gradedReader';

const bindings = (...ids: string[][]): TokenBinding[] => ids.map((entryIds, ordinal) => ({ ordinal, entryIds }));
const msg = (en: string, zh: string) => ({ summary: { en, zh } });

/** A schema-valid published wrapper whose version really is the canonical body hash. */
export function publishedReaderFixture(): PublishedReader {
  const body = gradedReaderFixture();
  const version = contentHash(body);
  return {
    schemaVersion: 1,
    body,
    version,
    review: { contentHash: version, reviewedBy: 'TEST ONLY synthetic reviewer', reviewedAt: '2026-10-23' },
  };
}

export function gradedReaderFixture(): ReaderBody {
  return {
    id: 'test-book',
    order: 1,
    level: 'A1',
    title: { fr: 'Un livre', en: 'TEST: A book', zh: '测试：一本书' },
    topics: ['subject-pronouns', 'indefinite-article-forms', 'pattern-cest', 'present-tense-forms'],
    sentences: [
      {
        id: 's1',
        fr: 'C’est un livre.',
        translation: { en: 'This is a book.', zh: '这是一本书。' },
        tokens: bindings(['ce-function', 'etre-identity'], ['un-function'], ['livre-object']),
      },
      {
        id: 's2',
        fr: 'Le livre est petit.',
        translation: { en: 'The book is small.', zh: '这本书很小。' },
        tokens: bindings(['le-function'], ['livre-object'], ['etre-identity'], ['petit-size']),
      },
      {
        id: 's3',
        fr: 'Il est petit.',
        translation: { en: 'It is small.', zh: '它很小。' },
        tokens: bindings(['il-function'], ['etre-identity'], ['petit-size']),
      },
    ],
    glossary: [
      {
        id: 'livre-object',
        lemma: 'livre',
        pos: 'noun',
        sense: 'object',
        forms: ['livre'],
        gloss: { en: 'book', zh: '书' },
        gender: 'masculine',
      },
      {
        id: 'etre-identity',
        lemma: 'être',
        pos: 'verb',
        sense: 'identity',
        forms: ['est'],
        gloss: { en: 'be', zh: '是' },
      },
      {
        id: 'petit-size',
        lemma: 'petit',
        pos: 'adjective',
        sense: 'size',
        forms: ['petit'],
        gloss: { en: 'small', zh: '小的' },
      },
      {
        id: 'ce-function',
        lemma: 'ce',
        pos: 'function',
        sense: 'demonstrative',
        forms: ['ce'],
        gloss: { en: 'this', zh: '这' },
      },
      {
        id: 'un-function',
        lemma: 'un',
        pos: 'function',
        sense: 'article',
        forms: ['un'],
        gloss: { en: 'a; an', zh: '一个' },
      },
      {
        id: 'le-function',
        lemma: 'le',
        pos: 'function',
        sense: 'article',
        forms: ['le'],
        gloss: { en: 'the', zh: '定冠词' },
      },
      {
        id: 'il-function',
        lemma: 'il',
        pos: 'function',
        sense: 'subject',
        forms: ['il'],
        gloss: { en: 'it; he', zh: '它；他' },
      },
    ],
    learning: {
      instruction: { en: 'TEST: Find the words in the text.', zh: '测试：在短文中找出对应的词。' },
      checkpoints: [
        {
          id: 'find-words',
          title: { en: 'TEST: The book', zh: '测试：这本书' },
          questions: [
            {
              question: {
                id: 'recognize-book',
                type: 'CHOICE_SELECT',
                instruction: { en: 'Choose the phrase used in sentence one.', zh: '选择第一句使用的词组。' },
                prompt: 'C’est {un livre|le livre}.',
                expectedAnswer: 'un livre',
                feedback: {
                  correct: msg('Sentence one uses un livre.', '第一句用的是不定冠词词组。'),
                  incorrect: msg('Look at the article in sentence one.', '请再看第一句的冠词。'),
                  byAnswer: [
                    {
                      answer: 'le livre',
                      message: msg('The text introduces a book with un.', '短文用不定冠词介绍一本书。'),
                    },
                  ],
                },
              },
              evidence: { sentenceId: 's1', quote: 'C’est un livre.' },
            },
            {
              question: {
                id: 'type-size',
                type: 'FILL_BLANKS',
                instruction: { en: 'Copy the adjective from sentence two.', zh: '抄写第二句的形容词。' },
                prompt: 'Le livre est [___].',
                expectedAnswer: 'petit',
                feedback: {
                  correct: msg('Petit describes the book.', '这个形容词描述书的大小。'),
                  incorrect: msg('Copy the last word of sentence two.', '请抄写第二句的最后一个词。'),
                },
              },
              evidence: { sentenceId: 's2', quote: 'Le livre est petit.' },
            },
          ],
        },
      ],
    },
  };
}
