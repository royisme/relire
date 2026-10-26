/** Pure reader-sentence sampling into one standalone listening unit; no loading, speech, AI or persistence. */
import type { TFunction } from 'i18next';
import { ExerciseUnitSchema, type ExerciseUnit } from '../../types/exercises';
import type { PublishedReader } from '../../types/gradedReader';
import { authoredText } from '../../utils/authoredText';

interface ReaderDictationInput {
  reader: PublishedReader;
  count?: number;
  language: string | undefined;
  rng?: () => number;
  makeId?: () => string;
  now?: () => number;
  t: TFunction;
}

export function prepareReaderDictation({
  reader,
  count = 6,
  language,
  rng = Math.random,
  makeId = () => crypto.randomUUID(),
  now = () => Date.now(),
  t,
}: ReaderDictationInput): ExerciseUnit[] {
  const pool = reader.body.sentences.map((_, index) => index);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const selected = pool.slice(0, Math.min(count, pool.length)).sort((a, b) => a - b);
  const setId = makeId();
  const createdAt = now();
  return [
    ExerciseUnitSchema.parse({
      id: `unit-${makeId()}`,
      setId,
      setTitle: reader.body.title.fr,
      createdAt,
      level: reader.body.level,
      learningArea: 'listening',
      section: 'COMPRENDRE',
      unitNumber: 1,
      title: t('readerDictation.title'),
      instruction: t('readerDictation.instruction'),
      type: 'NUMBER_DICTATION',
      grammarTags: ['listening-dictation'],
      items: selected.map((sentenceIndex, index) => {
        const sentence = reader.body.sentences[sentenceIndex];
        return {
          id: sentence.id,
          type: 'NUMBER_DICTATION',
          itemNumber: index + 1,
          prompt: authoredText(sentence.translation, language),
          expectedAnswer: sentence.fr,
          audioText: sentence.fr,
          grammarTag: 'listening-dictation',
          meta: {
            source: 'reader-dictation',
            readerId: reader.body.id,
            version: reader.version,
            sentenceId: sentence.id,
            strictAccents: true,
            ignoreSentencePunctuation: true,
            playbackEngine: 'device',
          },
        };
      }),
    }),
  ];
}
