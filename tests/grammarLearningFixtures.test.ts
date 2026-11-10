/** The public pilot fixtures are invented schema-valid probes, never real or reviewed teaching material. */
import { expect, test } from 'bun:test';
import { GrammarTopicSchema } from '../src/types/grammarTopic';
import { learningFixture, referenceOnlyFixture, secondLearningFixture } from './fixtures/grammarLearning';
import { topicExerciseRevision, topicToExerciseUnit } from '../src/services/grammarTopics/checkpoints';

test('two interactive TEST topics and one reference-only topic have distinct identities and bilingual headings', async () => {
  const topics = [learningFixture(), secondLearningFixture(), referenceOnlyFixture()];
  expect(new Set(topics.map((topic) => topic.id)).size).toBe(3);
  for (const language of ['en', 'zh'] as const) {
    expect(new Set(topics.map((topic) => topic.title[language])).size).toBe(3);
  }
  for (const topic of topics) expect(GrammarTopicSchema.safeParse(topic).success).toBe(true);
  expect(topics[2].learning).toBeUndefined();
  const units = await Promise.all(
    topics.slice(0, 2).map(async (topic) => topicToExerciseUnit(topic, await topicExerciseRevision(topic), 123)),
  );
  expect(units[0].id).not.toBe(units[1].id);
  for (const unit of units) {
    expect(unit.items).toHaveLength(6);
    expect(unit.items.filter((item) => item.type === 'FILL_BLANKS')).toHaveLength(3);
    expect(unit.items.every((item) => item.prompt.startsWith('TEST '))).toBe(true);
  }
});
