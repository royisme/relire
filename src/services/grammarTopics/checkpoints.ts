/** Owns canonical learning identity and pure validated topic-to-exercise mapping; no storage or React. */
import { ExerciseUnitSchema, type ExerciseUnit } from '../../types/exercises';
import { GrammarTopicSchema, type GrammarTopic } from '../../types/grammarTopic';

const compareCodePoints = (a: string, b: string): number => {
  const left = Array.from(a, (character) => character.codePointAt(0)!);
  const right = Array.from(b, (character) => character.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareCodePoints(a, b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

/** Tooling hashes these exact UTF-8 bytes too; unrelated reference edits are excluded. */
export function serializeTopicLearning(input: GrammarTopic): string {
  const topic = GrammarTopicSchema.parse(input);
  if (!topic.learning) throw new Error('Topic has no learning payload');
  const { id: topicId, level, tags, title, learning } = topic;
  return JSON.stringify(canonical({ topicId, level, tags, title, learning }));
}

export async function topicExerciseRevision(topic: GrammarTopic): Promise<string> {
  const bytes = new TextEncoder().encode(serializeTopicLearning(topic));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Timestamp and computed revision belong to preparation, never render or a storage transaction. */
export function topicToExerciseUnit(input: GrammarTopic, exerciseRevision: string, createdAt: number): ExerciseUnit {
  const topic = GrammarTopicSchema.parse(input);
  if (!topic.learning) throw new Error('Topic has no learning payload');
  const id = `topic:${topic.id}:${exerciseRevision}`;
  return ExerciseUnitSchema.parse({
    id,
    setId: id,
    learningArea: 'grammar',
    section: 'GRAMMAIRE',
    unitNumber: 1,
    type: 'FILL_BLANKS',
    title: topic.title.en,
    instruction: topic.learning.instruction.en,
    level: topic.level,
    grammarTags: topic.tags,
    createdAt,
    topicOrigin: { topicId: topic.id, exerciseRevision, title: topic.title, instruction: topic.learning.instruction },
    items: topic.learning.checkpoints.flatMap((checkpoint, i) =>
      checkpoint.questions.map((question, j) => ({
        id: question.id,
        type: question.type,
        itemNumber: i * 2 + j + 1,
        prompt: question.prompt,
        expectedAnswer: question.expectedAnswer,
        acceptableAnswers: question.acceptableAnswers,
        grammarTag: topic.tags[0],
        meta: { strictAccents: true },
        topicQuestion: {
          checkpointId: checkpoint.id,
          checkpointTitle: checkpoint.title,
          instruction: question.instruction,
          feedback: question.feedback,
        },
      })),
    ),
  });
}
