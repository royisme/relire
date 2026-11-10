/**
 * One reader sentence per item rewritten into a Practice unit by rule, with no AI and no key.
 * Items follow the reader's sentence order and carry the edition
 * provenance, so a saved set needs no reader or service. Does not own the kinds (`transform/`) or saving.
 */
import type { TFunction } from 'i18next';
import { ExerciseUnitSchema, type ExerciseUnit } from '../../types/exercises';
import type { PublishedReader } from '../../types/gradedReader';
import type { ReaderTransformKind } from '../../types/readerTransform';
import { TRANSFORM_TAGS, TRANSFORMERS } from './transform';

interface ReaderTransformInput {
  reader: PublishedReader;
  kind: ReaderTransformKind;
  makeId?: () => string;
  now?: () => number;
  t: TFunction;
}

export function prepareReaderTransform({
  reader,
  kind,
  makeId = () => crypto.randomUUID(),
  now = () => Date.now(),
  t,
}: ReaderTransformInput): ExerciseUnit[] {
  const covered = reader.body.sentences.flatMap((sentence) => {
    const transformed = TRANSFORMERS[kind](sentence, reader.body.glossary);
    return transformed ? [{ sentence, answer: transformed.answer }] : [];
  });
  // A kind that covers no sentence of this reader offers nothing rather than an empty set.
  if (!covered.length) return [];
  const setId = makeId();
  const createdAt = now();
  return [
    ExerciseUnitSchema.parse({
      id: `unit-${makeId()}`,
      setId,
      setTitle: reader.body.title.fr,
      createdAt,
      level: reader.body.level,
      learningArea: 'grammar',
      section: 'GRAMMAIRE',
      unitNumber: 1,
      title: t(`readerTransform.${kind}.title`),
      instruction: t(`readerTransform.${kind}.instruction`),
      type: 'WORD_TRANSFORM',
      grammarTags: [TRANSFORM_TAGS[kind]],
      items: covered.map(({ sentence, answer }, index) => ({
        id: sentence.id,
        type: 'WORD_TRANSFORM',
        itemNumber: index + 1,
        prompt: sentence.fr,
        expectedAnswer: answer,
        explanation: t(`readerTransform.${kind}.explanation`),
        grammarTag: TRANSFORM_TAGS[kind],
        meta: {
          source: 'reader-transform',
          readerId: reader.body.id,
          version: reader.version,
          sentenceId: sentence.id,
          kind,
          ignoreSentencePunctuation: true,
        },
      })),
    }),
  ];
}
