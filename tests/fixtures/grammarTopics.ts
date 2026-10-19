/** Synthetic schema probes only, never teaching content, generated output or an owner attestation. Never shipped. */
import type { GrammarTopic, GrammarTopicsPack } from '../../src/types/grammarTopic';

const bilingual = () => ({ en: 'TEST ONLY', zh: '\u6d4b\u8bd5' });
export const topicFixture = (): GrammarTopic => ({
  id: 'test-only',
  level: 'A1',
  chapter: 'test-only',
  tags: ['articles'],
  title: bilingual(),
  blocks: [
    { type: 'paragraph', heading: bilingual(), text: bilingual() },
    { type: 'rules', items: [bilingual()] },
    {
      type: 'table',
      header: [bilingual(), { fr: 'TEST' }],
      rows: [[{ fr: 'TEST', ...bilingual() }, { fr: 'TEST' }]],
      firstColumnIsHeader: true,
    },
    {
      type: 'examples',
      items: [
        { fr: 'TEST', ...bilingual() },
        { fr: 'TEST', ...bilingual() },
      ],
    },
    { type: 'note', text: bilingual() },
  ],
  related: [],
  provenance: {
    origin: 'ai-regenerated',
    referenceSet: 'TEST ONLY',
    reference: 'TEST ONLY',
    model: 'TEST ONLY, no AI call',
    generatedAt: '2026-10-18',
    promptHash: '00000000',
  },
  status: 'reviewed',
  reviewedBy: 'TEST ONLY, not an attestation',
  reviewedAt: '2026-10-18',
});

export const topicsFixture = (): GrammarTopicsPack => ({
  schemaVersion: 1,
  packVersion: '0.1.0',
  topics: [topicFixture()],
});
