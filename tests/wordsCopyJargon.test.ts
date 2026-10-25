import { expect, test } from 'bun:test';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const wordsCopyKeys = [
  'today.words.status',
  'today.words.why',
  'vocab.due',
  'vocab.learning',
  'vocab.map.introduced',
  'vocab.map.young',
  'vocab.map.mature',
  'vocab.map.leech',
  'vocab.map.tier.young',
  'vocab.map.tier.mature',
  'vocab.map.overlap',
  'vocab.map.leeches',
  'vocab.map.noLeeches',
  'vocab.map.lapses',
  'vocab.quotaReached',
  'vocab.retention',
  'vocab.retentionHelp',
  'vocab.reviewDue',
  'vocab.unintroduced',
  'vocab.resetHelp',
  'vocab.deleteHelp',
  'vocab.sessionCounts',
  'vocab.reviewCounts',
  'vocab.waiting',
  'vocab.nextDue',
  'vocab.noEligible',
  'vocab.analyticsCounts',
  'vocab.goal.description',
  'vocab.goal.target',
  'vocab.goal.progress',
  'vocab.goal.weekly',
  'vocab.game.keptNow',
  'vocab.game.firstMature',
  'vocab.game.doneCounts',
  'vocab.game.nextDue',
];

test('the 35 Words copy-pass keys use plain wording in both locales, including the map overlap explanation', async () => {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    fallbackLng: false,
    resources: { en: { translation: en }, zh: { translation: zh } },
  });
  for (const language of ['en', 'zh']) {
    for (const key of wordsCopyKeys) {
      expect(i18n.exists(key, { lng: language }), `${language}: ${key}`).toBe(true);
      // Stable placeholder names such as {{lapses}} are identifiers, not learner-visible copy.
      expect(i18n.t(key, { lng: language }).replace(/\{\{[^}]+\}\}/g, ''), `${language}: ${key}`).not.toMatch(
        /leech|lapses|allowance|ledger|quota|introduction|\u540d\u989d/i,
      );
    }
  }
});
