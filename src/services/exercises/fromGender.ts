/** Pure reviewed-noun sampling into one standalone GENDER_CHECK unit; no AI, loading or persistence. */
import type { TFunction } from 'i18next';
import { ExerciseUnitSchema, type ExerciseLevel, type ExerciseUnit } from '../../types/exercises';
import type { NounGenderPack } from '../../types/nounGender';
import { matchNounGender } from '../nounGender/match';

export const DEFAULT_GENDER_COUNT = 8;
export const DEFAULT_GENDER_LEVEL: ExerciseLevel = 'A1';

interface GenderDrillInput {
  pack: NounGenderPack;
  count?: number;
  level?: ExerciseLevel;
  rng?: () => number;
  makeId?: () => string;
  now?: () => number;
  t: TFunction;
}

export function prepareGenderDrills({
  pack,
  count = DEFAULT_GENDER_COUNT,
  level = DEFAULT_GENDER_LEVEL,
  rng = Math.random,
  makeId = () => crypto.randomUUID(),
  now = () => Date.now(),
  t,
}: GenderDrillInput): ExerciseUnit[] {
  if (!Number.isInteger(count) || count < 1 || count > pack.nouns.length)
    throw new Error(t('nounGender.drill.countRange', { max: pack.nouns.length }));
  const pool = [...pack.nouns];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const setId = makeId();
  const createdAt = now();
  const title = t('nounGender.drill.title');
  return [
    ExerciseUnitSchema.parse({
      id: `unit-${makeId()}`,
      setId,
      setTitle: title,
      createdAt,
      level,
      section: 'GRAMMAIRE',
      unitNumber: 1,
      title,
      instruction: t('nounGender.drill.instruction'),
      type: 'GENDER_CHECK',
      grammarTags: ['gender-number'],
      items: pool.slice(0, count).map((noun, index) => {
        const match = matchNounGender(pack, noun.lemma);
        return {
          id: noun.id,
          itemNumber: index + 1,
          prompt: noun.lemma,
          expectedAnswer: noun.gender === 'm' ? 'M' : 'F',
          grammarTag: 'gender-number',
          meta: {
            source: 'noun-gender',
            nounId: noun.id,
            rules: match
              ? [
                  {
                    id: match.rule.id,
                    percent: (100 * match.rule.dictionary.agree) / match.rule.dictionary.n,
                    n: match.rule.dictionary.n,
                  },
                ]
              : [],
            exception: match?.exception ?? false,
          },
        };
      }),
    }),
  ];
}
