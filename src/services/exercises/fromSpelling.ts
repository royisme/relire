/** Pure spelling-sound sampling into one standalone listening unit; no loading, speech, AI or persistence. */
import type { TFunction } from 'i18next';
import { ExerciseUnitSchema, type ExerciseUnit } from '../../types/exercises';
import type { SpellingSoundPattern, SpellingSoundsPack } from '../../types/spellingSounds';

interface SpellingDrillInput {
  pack: SpellingSoundsPack;
  count?: number;
  rng?: () => number;
  makeId?: () => string;
  now?: () => number;
  t: TFunction;
}

function shuffled<T>(rows: T[], rng: () => number): T[] {
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows;
}

/** Two other pool spellings that cannot be heard inside the word and do not sound like the target. */
function distractorSpellings(
  pattern: SpellingSoundPattern,
  word: string,
  pool: SpellingSoundPattern[],
  rng: () => number,
): string[] {
  const eligible = pool.filter(
    (other) =>
      other.id !== pattern.id &&
      JSON.stringify(other.sound) !== JSON.stringify(pattern.sound) &&
      other.spelling !== pattern.spelling &&
      !word.includes(other.spelling),
  );
  // Same-group spellings first, each part shuffled on its own, so either group can fill a slot.
  const ordered = [
    ...shuffled(
      eligible.filter((other) => other.group === pattern.group),
      rng,
    ),
    ...shuffled(
      eligible.filter((other) => other.group !== pattern.group),
      rng,
    ),
  ];
  const spellings: string[] = [];
  for (const other of ordered) {
    if (!spellings.includes(other.spelling)) spellings.push(other.spelling);
    if (spellings.length === 2) break;
  }
  return spellings;
}

export function prepareSpellingDrill({
  pack,
  count = 8,
  rng = Math.random,
  makeId = () => crypto.randomUUID(),
  now = () => Date.now(),
  t,
}: SpellingDrillInput): ExerciseUnit[] {
  const pool = pack.patterns.filter((pattern) => pattern.group !== 'silent');
  // Pack words are already distinct across every pattern, so no two items hear the same word.
  const pairs = pool.flatMap((pattern) => pattern.examples.map((word) => ({ pattern, word })));
  const selected = shuffled(pairs, rng).slice(0, Math.min(count, pairs.length));
  const setId = makeId();
  const createdAt = now();
  const title = t('spellingSounds.drill.title');
  return [
    ExerciseUnitSchema.parse({
      id: `unit-${makeId()}`,
      setId,
      setTitle: title,
      createdAt,
      level: 'A1',
      learningArea: 'listening',
      section: 'COMPRENDRE',
      unitNumber: 1,
      title,
      instruction: t('spellingSounds.drill.instruction'),
      type: 'CHOICE_SELECT',
      grammarTags: ['listening-dictation'],
      items: selected.map(({ pattern, word }, index) => ({
        id: `${pattern.id}-${word}`,
        type: 'CHOICE_SELECT',
        itemNumber: index + 1,
        prompt: `{${shuffled([pattern.spelling, ...distractorSpellings(pattern, word, pool, rng)], rng).join('|')}}`,
        expectedAnswer: pattern.spelling,
        audioText: word,
        grammarTag: 'listening-dictation',
        meta: { source: 'spelling-sounds', patternId: pattern.id, strictAccents: true, playbackEngine: 'device' },
      })),
    }),
  ];
}
