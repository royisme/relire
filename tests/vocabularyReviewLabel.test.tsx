/** Invented manifest records; static real-component rendering only, never a content-review attestation. */
import { expect, spyOn, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { VocabularyAnswer } from '../src/components/vocabulary/VocabularyAnswer';
import { VocabularyDetails } from '../src/components/vocabulary/VocabularyDetails';
import { Flashcard } from '../src/components/vocabulary/Flashcard';
import { RunRevealedCard } from '../src/components/vocabulary/game/RunCard';
import { joinVocabulary, type VocabularyJoined } from '../src/services/vocabulary/queue';
import type { VocabularyBook } from '../src/types/vocabulary';
import { testBook, testRow } from './fixtures/vocabulary';

const React = await import('react');
const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => {
  // Match the vocabulary static-render tests: speech stores have no server snapshot.
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
const builtInSection = (html: string) => {
  // Flashcard also has front/back sections; select the answer's own built-in section.
  const section = html
    .match(/<section\b[^>]*>(?:(?!<section\b)[\s\S])*?<\/section>/g)
    ?.find((section) => /<p\b[^>]*>(?:Built-in|\u5185\u7f6e)/.test(section));
  expect(section).toBeDefined();
  return section!;
};
const label = (html: string) => {
  const paragraphs = builtInSection(html).match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? [];
  const metadata = paragraphs.at(-1);
  expect(metadata).toMatch(/class="[^"]*text-xs[^"]*"/);
  return metadata!.replace(/<[^>]*>/g, '');
};

const base = await testBook();
const reviewedBy = 'TEST Élodie  Dupont';
// Just after midnight UTC is still the previous day in America/Los_Angeles.
const reviewedAt = '2026-10-20T00:05:00.000Z';
const reviewed: VocabularyBook = {
  ...base,
  manifest: {
    ...base.manifest,
    review: {
      bookId: base.manifest.bookId,
      contentHash: base.manifest.review.contentHash,
      reviewedBy,
      reviewedAt,
    },
  },
};
const unreviewed: VocabularyBook = {
  ...base,
  manifest: {
    ...base.manifest,
    review: {
      bookId: base.manifest.bookId,
      contentHash: base.manifest.review.contentHash,
      status: 'unreviewed',
    },
  },
};
const candidate = joinVocabulary([], base)[0];
const word: VocabularyJoined = {
  ...candidate,
  row: { ...testRow(candidate.word), bookSource: candidate.bookSource },
};

for (const language of ['en', 'zh'] as const) {
  const plainLabel = language === 'en' ? 'Built-in' : '\u5185\u7f6e';
  const unreviewedLabel = language === 'en' ? 'Built-in · not reviewed' : '\u5185\u7f6e · \u672a\u7ecf\u5ba1\u6838';
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(reviewedAt));
  const reviewedLabel =
    language === 'en'
      ? `Built-in · reviewed by ${reviewedBy} on ${date}`
      : `\u5185\u7f6e · ${reviewedBy} \u4e8e ${date} \u5ba1\u6838`;

  test(`${language}: an unreviewed manifest is explicitly not reviewed, never a review claim`, async () => {
    await i18n.changeLanguage(language);
    const actual = label(render(<VocabularyAnswer word={word} book={unreviewed} />));
    expect(actual).toBe(unreviewedLabel);
    expect(actual).not.toMatch(/(?<!not )reviewed/i);
    expect(actual).not.toMatch(/(?<!\u672a\u7ecf)\u5ba1\u6838/);
  });

  test(`${language}: a reviewed manifest preserves the reviewer name and shows the UTC medium date only`, async () => {
    await i18n.changeLanguage(language);
    const actual = label(render(<VocabularyAnswer word={word} book={reviewed} />));
    expect(actual).toBe(reviewedLabel);
    expect(actual).toContain(reviewedBy);
    expect(actual).not.toContain('00:05');
    expect(actual).not.toContain(reviewedAt);
  });

  test(`${language}: absent book or mismatched version leaves only the built-in label`, async () => {
    await i18n.changeLanguage(language);
    for (const book of [undefined, unreviewed, reviewed]) {
      const mismatched = book && { ...book, manifest: { ...book.manifest, version: 'f'.repeat(64) } };
      const actual = label(render(<VocabularyAnswer word={word} book={mismatched} />));
      expect(actual).toBe(plainLabel);
      expect(actual).not.toMatch(/review|\u5ba1\u6838/i);
    }
  });

  test(`${language}: live and snapshot meanings use their own source version, not each other's`, async () => {
    await i18n.changeLanguage(language);
    const otherSource = {
      ...candidate.bookSource!,
      version: 'f'.repeat(64),
      senses: [{ gloss: { en: 'TEST other edition', zh: 'TEST other edition' }, examples: [] }],
    };
    for (const book of [unreviewed, reviewed]) {
      const status = book === unreviewed ? unreviewedLabel : reviewedLabel;
      const oldSnapshot: VocabularyJoined = {
        ...word,
        row: { ...word.row!, bookSource: otherSource },
      };
      expect(label(render(<VocabularyAnswer word={oldSnapshot} book={book} />))).toBe(status);
      const snapshot = render(<VocabularyAnswer word={oldSnapshot} book={book} snapshot />);
      expect(label(snapshot)).toBe(plainLabel);
      expect(builtInSection(snapshot)).toContain('TEST other edition');
      const oldLive: VocabularyJoined = { ...word, bookSource: otherSource };
      const live = render(<VocabularyAnswer word={oldLive} book={book} />);
      expect(label(live)).toBe(plainLabel);
      expect(builtInSection(live)).toContain('TEST other edition');
      const matchingSnapshot = render(<VocabularyAnswer word={oldLive} book={book} snapshot />);
      expect(label(matchingSnapshot)).toBe(status);
      expect(builtInSection(matchingSnapshot)).toContain(candidate.bookSource!.senses[0].gloss[language]);
      expect(builtInSection(matchingSnapshot)).not.toContain('TEST other edition');
    }
  });

  test(`${language}: status replaces the existing metadata line without adding or removing paragraphs`, async () => {
    await i18n.changeLanguage(language);
    const sections = [undefined, unreviewed, reviewed].map((book) =>
      builtInSection(render(<VocabularyAnswer word={word} book={book} />)),
    );
    const paragraphCounts = sections.map((section) => (section.match(/<p\b/g) ?? []).length);
    // One meaning paragraph and the existing built-in metadata paragraph.
    expect(paragraphCounts).toEqual([2, 2, 2]);
    expect(sections.map(label)).toEqual([plainLabel, unreviewedLabel, reviewedLabel]);
  });

  for (const subject of ['Flashcard', 'RunRevealedCard', 'VocabularyDetails'] as const) {
    test(`${language}: ${subject} passes the book to the real answer component`, async () => {
      await i18n.changeLanguage(language);
      // The reveal cards use the durable row; details uses the live source.
      const otherSource = { ...candidate.bookSource!, version: 'f'.repeat(64) };
      const answer: VocabularyJoined =
        subject === 'VocabularyDetails'
          ? { ...word, row: { ...word.row!, bookSource: otherSource } }
          : { ...word, bookSource: otherSource };
      for (const [book, expected] of [
        [undefined, plainLabel],
        [unreviewed, unreviewedLabel],
        [reviewed, reviewedLabel],
      ] as const) {
        const node =
          subject === 'Flashcard' ? (
            <Flashcard
              word={word.word}
              answer={answer}
              book={book}
              face="back"
              busy={false}
              onFlip={() => {}}
              onListen={() => {}}
            />
          ) : subject === 'RunRevealedCard' ? (
            <RunRevealedCard
              word={word.word}
              answer={answer}
              book={book}
              wordHeading={{ current: null }}
              onListen={() => {}}
            />
          ) : (
            <VocabularyDetails word={answer} book={book} onClose={() => {}} />
          );
        expect(label(render(node))).toBe(expected);
      }
    });
  }
}
