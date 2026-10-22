/**
 * The read-aloud result draws only what the provider actually returned: a missing rhythm score
 * leaves no bar, and an absent or empty list leaves no heading with nothing under it.
 */
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { mapAzureResult } from '../src/services/ai/providers/azure/result';
import { AssessmentResult } from '../src/components/shadowing/AssessmentResult';
import type { PronunciationAssessment } from '../src/types';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const render = (assessment: PronunciationAssessment) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <AssessmentResult assessment={assessment} />
    </I18nextProvider>,
  );

const scoresOnly: PronunciationAssessment = { overallScore: 72, accuracyScore: 70, fluencyScore: 74 };

const azure = mapAzureResult(
  {
    PronunciationAssessment: { PronScore: 72, AccuracyScore: 70, FluencyScore: 74, CompletenessScore: 63 },
    Words: [
      { Word: 'Bonjour', PronunciationAssessment: { AccuracyScore: 91, ErrorType: 'None' } },
      { Word: 'tout', PronunciationAssessment: { AccuracyScore: 42, ErrorType: 'Mispronunciation' } },
      { Word: 'le', PronunciationAssessment: { AccuracyScore: 0, ErrorType: 'Omission' } },
      { Word: 'monde', PronunciationAssessment: { AccuracyScore: 85, ErrorType: 'FutureServiceError' } },
      { Word: 'encore', PronunciationAssessment: { ErrorType: 'Insertion' } },
      { Word: 'demain' },
    ],
  },
  '',
  'Bonjour tout le monde encore demain.',
);

const full: PronunciationAssessment = {
  ...scoresOnly,
  rhythmScore: 68,
  transcribedSpeech: 'bonjour tout le monde',
  phonemeFeedback: [{ phoneme: '[ʁ]', targetWord: 'regarder', status: 'needs_work', tip: 'Back of the tongue.' }],
  liaisonFeedback: 'Link the final consonant.',
  intonationFeedback: 'Rise on the question.',
  corrections: [{ word: 'monde', expectedIPA: 'mɔ̃d', actualNote: 'final d dropped', advice: 'Say the d softly.' }],
  strengths: ['Clear nasal vowels'],
  coachingNotes: 'Keep the rhythm steady. Continue ainsi !',
  evaluatedAt: '2026-01-01T00:00:00.000Z',
  referenceText: 'Bonjour tout le monde.',
};

test('a scores-only result draws the three scores and nothing it does not have', () => {
  const html = render(scoresOnly);
  expect(html).toContain('>72<');
  expect(html).toContain(en.shadowing.accuracy);
  expect(html).toContain(en.shadowing.fluency);
  expect(html).not.toContain(en.shadowing.rhythm);
  expect(html).not.toContain(en.shadowing.wordAccuracy);
  expect(html).not.toContain(en.shadowing.completeness);
  expect(html).not.toContain(en.shadowing.sounds);
  expect(html).not.toContain(en.shadowing.words);
  expect(html).not.toContain(en.shadowing.strengths);
  expect(html).not.toContain(en.shadowing.notes);
});

test('a full result draws every section as before', () => {
  const html = render(full);
  expect(html).toContain('>72<');
  expect(html).toContain(en.shadowing.rhythm);
  expect(html).toContain('>68<');
  expect(html).toContain(en.shadowing.sounds);
  expect(html).toContain('[ʁ]');
  expect(html).toContain(en.shadowing.words);
  expect(html).toContain('monde');
  expect(html).toContain(en.shadowing.strengths);
  expect(html).toContain('Clear nasal vowels');
  expect(html).toContain(en.shadowing.notes);
  expect(html).toContain('Keep the rhythm steady.');
});

test('mapped Azure words retain service order, scores and literal unknown errors', () => {
  const html = render(azure);
  const items = [...html.matchAll(/<li\b[^>]*>(.*?)<\/li>/g)].map((match) => match[1].replace(/<[^>]+>/g, ''));
  expect(items).toEqual([
    'Bonjour91',
    `tout42${en.shadowing.wordError.Mispronunciation}`,
    `le0${en.shadowing.wordError.Omission}`,
    'monde85FutureServiceError',
    `encore${en.shadowing.wordError.Insertion}`,
    'demain',
  ]);
  expect(html).toContain(en.shadowing.wordAccuracy);
  expect(html).toContain(en.shadowing.completeness);
  expect(html).toContain('>63<');
  expect(html).toContain(en.shadowing.estimate);
  expect(html).not.toContain('None');
  expect(html).not.toContain(en.shadowing.sounds);
});

test('word and completeness zero scores are real scores', () => {
  const html = render({ ...scoresOnly, completenessScore: 0, wordResults: [{ word: 'zéro', accuracyScore: 0 }] });
  expect(html).toContain(en.shadowing.completeness);
  expect(html.match(/>0</g)).toHaveLength(2);
});

test('known word errors use the selected interface language', async () => {
  await i18n.changeLanguage('zh');
  try {
    const html = render(azure);
    expect(html).toContain(zh.shadowing.wordAccuracy);
    expect(html).toContain(zh.shadowing.completeness);
    expect(html).toContain(zh.shadowing.wordError.Mispronunciation);
    expect(html).toContain(zh.shadowing.wordError.Omission);
    expect(html).toContain(zh.shadowing.wordError.Insertion);
    expect(html).toContain('FutureServiceError');
    expect(html).not.toContain('None');
  } finally {
    await i18n.changeLanguage('en');
  }
});

test('empty word results do not change a scores-only result', () => {
  expect(render({ ...scoresOnly, wordResults: [] })).toBe(render(scoresOnly));
});

test('empty lists leave no heading and no list behind', () => {
  const html = render({ ...full, phonemeFeedback: [], corrections: [], strengths: [] });
  expect(html).toContain(en.shadowing.rhythm);
  expect(html).not.toContain(en.shadowing.sounds);
  expect(html).not.toContain(en.shadowing.words);
  expect(html).not.toContain(en.shadowing.strengths);
  expect(html).toContain(en.shadowing.notes);
});
