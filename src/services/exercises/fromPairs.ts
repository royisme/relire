/** Pure reviewed-pair sampling into one standalone listening unit; no loading, speech, AI or persistence. */
import type { TFunction } from 'i18next';
import { ExerciseUnitSchema, type ExerciseLevel, type ExerciseUnit } from '../../types/exercises';
import type { MinimalPairsPack } from '../../types/minimalPairs';

export const DEFAULT_PAIRS_COUNT = 8;
export const DEFAULT_PAIRS_LEVEL: ExerciseLevel = 'A1';

interface PairsDrillInput {
  pack: MinimalPairsPack;
  contrasts: string[];
  count?: number;
  level?: ExerciseLevel;
  rng?: () => number;
  makeId?: () => string;
  now?: () => number;
  t: TFunction;
}

export function preparePairsDrills({
  pack,
  contrasts,
  count = DEFAULT_PAIRS_COUNT,
  level = DEFAULT_PAIRS_LEVEL,
  rng = Math.random,
  makeId = () => crypto.randomUUID(),
  now = () => Date.now(),
  t,
}: PairsDrillInput): ExerciseUnit[] {
  const available = new Set(pack.pairs.map((pair) => pair.contrast));
  if (!contrasts.length) throw new Error(t('minimalPairs.drill.pickContrast'));
  for (const contrast of contrasts) {
    if (!available.has(contrast)) throw new Error(t('minimalPairs.drill.unknownContrast', { contrast }));
  }
  const pool = pack.pairs.filter((pair) => contrasts.includes(pair.contrast));
  if (!Number.isInteger(count) || count < 1 || count > pool.length)
    throw new Error(t('minimalPairs.drill.countRange', { max: pool.length }));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const setId = makeId();
  const createdAt = now();
  const title = t('minimalPairs.drill.title');
  return [
    ExerciseUnitSchema.parse({
      id: `unit-${makeId()}`,
      setId,
      setTitle: title,
      createdAt,
      level,
      learningArea: 'listening',
      section: 'COMPRENDRE',
      unitNumber: 1,
      title,
      instruction: t('minimalPairs.drill.instruction'),
      type: 'CHOICE_SELECT',
      grammarTags: ['listening-dictation'],
      items: pool.slice(0, count).map((pair, index) => {
        const target = rng() < 0.5 ? pair.a : pair.b;
        const words = rng() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a];
        return {
          id: pair.id,
          itemNumber: index + 1,
          prompt: `{${words.join('|')}}`,
          expectedAnswer: target,
          audioText: target,
          grammarTag: 'listening-dictation',
          ...(pair.note ? { explanation: t(pair.note) } : {}),
          meta: { source: 'minimal-pairs', contrast: pair.contrast, pairId: pair.id, strictAccents: true },
        };
      }),
    }),
  ];
}
