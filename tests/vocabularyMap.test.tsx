/** VG5 uses synthetic rows only; static markup is not browser or phone acceptance. */
import { expect, spyOn, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { VocabularyBookModel } from '../src/hooks/useVocabularyBook';
import type { VocabularyRow } from '../src/types/vocabulary';
import { bossContextOf, contextOf, leechesOf, tierOf } from '../src/services/vocabulary/game/collection';
import { LEECH_LAPSES, summarizeRegions } from '../src/services/vocabulary/game/regions';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';
import { testBook, testDefinition, testLookup, testMatureSchedule, testRow } from './fixtures/vocabulary';
import { testReaderDefinition, testReaderLookup } from './fixtures/vocabularyReader';

// The shared Link module reads the initial hash on import, with no browser in this harness.
const React = await import('react');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { VocabularyMap, RegionPicture } = await import('../src/components/vocabulary/game/VocabularyMap');
const { RegionWords } = await import('../src/components/vocabulary/game/RegionWords');
const { VocabularyHome } = await import('../src/components/vocabulary/VocabularyHome');
const { VocabularyView } = await import('../src/components/VocabularyView');
const { VocabularyRun } = await import('../src/components/vocabulary/game/VocabularyRun');
const review = await import('../src/hooks/useVocabularyReview');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
else Reflect.deleteProperty(globalThis, 'localStorage');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, getSnapshot, getServerSnapshot) =>
    useStore(subscribe, getSnapshot, getServerSnapshot ?? getSnapshot),
  );
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    store.mockRestore();
  }
};
const now = new Date(2026, 9, 25, 12).getTime();
const model: VocabularyModel = {
  rows: [],
  now,
  epoch: 0,
  ready: true,
  error: null,
  preferences: { newPerDay: 20, retentionPercent: 90, studyBook: 'mine' },
  day: { date: '2026-10-25', introducedKeys: [] },
  refresh: async () => {},
  savePreferences: async () => {},
};
const content: VocabularyBookModel = {
  book: undefined,
  busy: false,
  progress: null,
  error: null,
  restart: false,
  configured: false,
  download: async () => {},
};
const leech: VocabularyRow = {
  ...testRow('mot'),
  schedule: { ...testMatureSchedule(now), scheduledDays: 21, lapses: 8, repetitions: 10 },
  contexts: [
    {
      ...testLookup('mot'),
      id: vocabularyContextKey(testLookup('mot')),
      savedAt: 1,
      definition: { kind: 'ai', analysis: { ...testDefinition('mot').analysis, memoryTrick: 'TEST memory cue' } },
    },
  ],
};

test('tiers follow phase and the 21-day boundary, not lapses or stability', () => {
  expect(tierOf(testRow())).toBe('new');
  expect(tierOf({ ...leech, schedule: { ...leech.schedule!, phase: 'new' } })).toBe('new');
  for (const phase of ['learning', 'relearning'] as const)
    expect(tierOf({ ...leech, schedule: { ...leech.schedule!, phase } })).toBe('learning');
  expect(tierOf({ ...leech, schedule: { ...leech.schedule!, scheduledDays: 20 } })).toBe('young');
  expect(tierOf(leech)).toBe('mature');
});

test('leeches include 8 lapses, exclude 7, and leave the rows unchanged', () => {
  const seven = { ...leech, schedule: { ...leech.schedule!, lapses: 7 } };
  const rows = [testRow(), seven, leech];
  const before = structuredClone(rows);
  expect(leechesOf(rows, LEECH_LAPSES)).toEqual([leech]);
  expect(leechesOf(rows, 7)).toEqual([seven, leech]);
  expect(rows).toEqual(before);
});

test('extra context is deduplicated across saved contexts and gated by reveal', () => {
  const imported: VocabularyRow = {
    ...leech,
    contexts: [
      ...leech.contexts,
      {
        id: 'import',
        savedAt: 2,
        sentence: 'Une phrase importée.',
        requestLanguage: 'en',
        source: { kind: 'import', id: 'deck', title: 'TEST deck', noteId: 'note' },
        definition: { kind: 'imported', front: 'mot', back: 'word', example: 'Une phrase importée.', tags: [] },
      },
      { ...leech.contexts[0], id: 'duplicate' },
    ],
  };
  expect(contextOf(imported)).toEqual({
    memoryTricks: ['TEST memory cue'],
    examples: ['Une phrase mot.', 'Une phrase TEST.', 'Une phrase importée.'],
  });
  const reader = testReaderLookup();
  const withBookAndReader = {
    ...imported,
    bookSource: {
      ...leech.bookSource!,
      senses: [
        {
          gloss: { en: 'TEST', zh: '\u6d4b\u8bd5' },
          examples: [{ fr: 'Une phrase du livre.', en: 'TEST', zh: '\u6d4b\u8bd5' }],
        },
      ],
    },
    contexts: [
      ...imported.contexts,
      { ...reader, id: vocabularyContextKey(reader), savedAt: 3, definition: testReaderDefinition() },
    ],
  };
  expect(contextOf(withBookAndReader).examples).toEqual([
    'Une phrase du livre.',
    'Une phrase mot.',
    'Une phrase TEST.',
    'Une phrase importée.',
    reader.sentence,
  ]);
  expect(bossContextOf(undefined, true)).toBeNull();
  expect(bossContextOf(imported, false)).toBeNull();
  expect(bossContextOf({ ...leech, schedule: { ...leech.schedule!, lapses: 7 } }, true)).toBeNull();
  expect(bossContextOf(imported, true)).toEqual({ ...contextOf(imported), lapses: 8 });
});

for (const language of ['en', 'zh'] as const) {
  test(`${language}: map has translated region names, all text counts and labelled bar states`, async () => {
    await i18n.changeLanguage(language);
    const book = await testBook(251);
    const saved = { ...leech, bookmarked: true, bookmarkedAt: 1 };
    const imported: VocabularyRow = {
      ...testRow('importé'),
      contexts: [
        {
          id: 'import',
          savedAt: 1,
          sentence: '',
          requestLanguage: 'en',
          source: { kind: 'import', id: 'deck', title: 'TEST deck name', noteId: 'note' },
          definition: { kind: 'imported', front: 'importé', back: 'imported', tags: ['TEST tag'] },
        },
      ],
    };
    const rows = [saved, imported, testRow('autre')];
    const html = render(<VocabularyMap model={{ ...model, rows }} content={{ ...content, book }} />);
    for (const key of [
      'title',
      'saved',
      'other',
      'introduced',
      'learning',
      'young',
      'mature',
      'leech',
      'unseen',
      'total',
      'showWords',
    ])
      expect(html).toContain(i18n.t(`vocab.map.${key}`));
    expect(html).toContain(i18n.t('vocab.map.page', { page: 1 }));
    expect(html).toContain(i18n.t('vocab.map.page', { page: 2 }));
    expect(html).toContain('TEST deck name');
    expect(html).toContain('TEST tag');
    expect(html).toContain(i18n.t('vocab.map.leeches', { words: 1 }));
    expect(html).toContain('aria-expanded="false"');
    // No closed group mounts even one member or its context.
    expect(html).not.toContain('lang="fr"');
    expect(html).not.toContain('TEST memory cue');
    const picture = render(
      <RegionPicture counts={{ total: 5, introduced: 4, learning: 1, young: 1, mature: 1, unseen: 1, leech: 1 }} />,
    );
    expect(picture).toContain('role="img"');
    expect(picture.match(/flex-grow:1/g)).toHaveLength(5);
    for (const state of ['new', 'learning', 'young', 'mature'])
      expect(picture).toContain(i18n.t('vocab.map.segment', { label: i18n.t(`vocab.map.tier.${state}`), words: 1 }));
    const home = render(<VocabularyHome model={model} book={book} pending={false} />);
    expect(home).not.toContain('href="#/words/map"');
    const view = render(<VocabularyView model={model} />);
    const nav = view.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).toContain('href="#/words/map"');
    expect(nav).toContain(`>${i18n.t('vocab.map.title')}</a>`);
  });

  test(`${language}: empty, loading and failures are real and retain a fixed status slot`, async () => {
    await i18n.changeLanguage(language);
    const empty = render(<VocabularyMap model={model} content={content} />);
    expect(empty).toContain(i18n.t('vocab.map.empty'));
    expect(empty).toContain(i18n.t('vocab.map.noLeeches'));
    expect(empty).toContain('href="#/words/all"');
    expect(empty).not.toContain(i18n.t('vocab.map.saved'));
    const loading = render(<VocabularyMap model={{ ...model, ready: false }} content={{ ...content, busy: true }} />);
    expect(loading).toContain(i18n.t('common.loading'));
    expect(loading).not.toContain(i18n.t('vocab.map.empty'));
    const failed = render(<VocabularyMap model={model} content={{ ...content, error: 'TEST real failure' }} />);
    expect(failed).toContain('TEST real failure');
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain(i18n.t('vocab.map.empty'));
    for (const html of [empty, loading, failed]) expect(html).toContain('h-16');
  });

  test(`${language}: open lists are bounded, unseen book entries differ from saved new words, and leeches show context`, async () => {
    await i18n.changeLanguage(language);
    const book = await testBook(250);
    const row = { ...testRow('test-1'), schedule: leech.schedule };
    const entries = new Map(book.entries.map((entry) => [entry.key, entry]));
    const rows = new Map([
      [row.key, row],
      [leech.key, leech],
    ]);
    const html = render(<RegionWords keys={book.entries.map((entry) => entry.key)} rows={rows} entries={entries} />);
    expect(html.match(/lang="fr"/g)).toHaveLength(50);
    expect(html).toContain(i18n.t('vocab.map.unseen'));
    expect(html).toContain(i18n.t('vocab.map.tier.mature'));
    expect(html).not.toContain('test-50');
    const group = render(<RegionWords keys={[leech.key]} rows={rows} entries={entries} leeches />);
    expect(group).toContain('TEST memory cue');
    expect(group).toContain('Une phrase TEST.');
    expect(group).toContain(i18n.t('vocab.map.lapses', { lapses: 8 }));
    const newWord = render(
      <RegionWords keys={['test-1']} rows={new Map([['test-1', testRow('test-1')]])} entries={entries} />,
    );
    expect(newWord).toContain(i18n.t('vocab.map.tier.new'));
    expect(summarizeRegions({ rows: [row], book })[0].keys).toHaveLength(250);
  });

  test(`${language}: run mounts boss context only for a leech after reveal`, async () => {
    await i18n.changeLanguage(language);
    let revealed = false;
    let row = leech;
    const session = spyOn(review, 'useVocabularyReview').mockImplementation(() => ({
      active: {
        candidate: { key: row.key, word: row.word, builtIn: false },
        row,
        tokens: { epoch: 0, resetToken: 0, revision: 0 },
      },
      revealed,
      busy: false,
      error: null,
      quotaReached: false,
      pending: null,
      ratings: 0,
      introductions: 0,
      now,
      nextDue: null,
      due: 1,
      remaining: 20,
      reveal: async () => true,
      recall: async () => {},
      skip: () => {},
      retry: () => {},
    }));
    try {
      expect(render(<VocabularyRun model={{ ...model, rows: [row] }} />)).not.toContain('TEST memory cue');
      revealed = true;
      const boss = render(<VocabularyRun model={{ ...model, rows: [row] }} />);
      expect(boss).toContain('TEST memory cue');
      expect(boss).toContain(i18n.t('vocab.map.examples'));
      expect(boss).toContain(i18n.t('vocab.map.lapses', { lapses: 8 }));
      for (const outcome of ['forgot', 'fuzzy', 'remembered']) expect(boss).toContain(i18n.t(`vocab.${outcome}`));
      row = { ...leech, schedule: { ...leech.schedule!, lapses: 7 } };
      const ordinary = render(<VocabularyRun model={{ ...model, rows: [row] }} />);
      expect(ordinary).not.toContain('TEST memory cue');
      expect(ordinary).not.toContain(i18n.t('vocab.map.lapses', { lapses: 7 }));
    } finally {
      session.mockRestore();
    }
  });
}
