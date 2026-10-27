/**
 * Settings → Words, Wordbooks: the list, the effective radio, the study choice it saves and the deck
 * delete behind its confirmation. A shallow element tree (no DOM, no browser), like the other Settings
 * harnesses; the storage write is the only thing mocked.
 */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { ReactNode } from 'react';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { VocabularyRow } from '../src/types/vocabulary';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';
import { initialVocabularySchedule } from '../src/utils/srs';
import { testBook, testDefinition, testLookup, testRow } from './fixtures/vocabulary';

// The shared Dialog portals on the client only; the import still touches window.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const storage = await import('../src/storage/vocabulary');
const { WordbooksBlock } = await import('../src/components/settings/WordbooksBlock');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const now = new Date(2026, 9, 26, 12).getTime();

const ALPHA = 'TEST deck alpha';
const BETA = 'TEST deck beta';
const deckRow = (word: string, deck: string, scheduled = false): VocabularyRow => {
  const { bookSource: _book, ...base } = testRow(word);
  const noteId = `note-${word}`;
  return {
    ...base,
    bookmarked: true,
    bookmarkedAt: 1,
    contexts: [
      {
        id: vocabularyContextKey({
          source: { kind: 'import', id: deck, title: deck, noteId },
          sentence: '',
          requestLanguage: 'en',
        }),
        sentence: '',
        savedAt: 1,
        requestLanguage: 'en',
        source: { kind: 'import', id: deck, title: deck, noteId },
        definition: { kind: 'imported', front: word, back: 'TEST back', tags: [] },
      },
    ],
    ...(scheduled ? { schedule: initialVocabularySchedule(now - 60_000), introducedAt: now - 60_000 } : {}),
  };
};
const lookup = testLookup('perso');
/** A word saved from reading, so My words is not empty. */
const mine: VocabularyRow = {
  ...testRow('perso'),
  bookmarked: true,
  bookmarkedAt: 2,
  contexts: [
    {
      id: vocabularyContextKey(lookup),
      sentence: lookup.sentence,
      savedAt: 2,
      requestLanguage: 'en',
      definition: testDefinition('perso'),
    },
  ],
};
const rows = [deckRow('chat', ALPHA), deckRow('chien', ALPHA, true), deckRow('loup', BETA), mine];
const model: VocabularyModel = {
  rows: [mine],
  now,
  epoch: 0,
  ready: true,
  error: null,
  preferences: { newPerDay: 20, retentionPercent: 90, studyBook: 'mine' },
  day: { date: '2026-10-26', introducedKeys: [] },
  refresh: async () => {},
  savePreferences: async () => {},
};
const withDecks: VocabularyModel = { ...model, rows };
const book = await testBook(3);

type El = React.ReactElement<Record<string, unknown>>;
/** Calls a function or forwardRef component; host tags and Base UI roots stay opaque. */
function expand(node: ReactNode, found: El[] = []): El[] {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    const element = child as El;
    // The deck-delete dialog is called by hand below, inside a render, so its hooks have a dispatcher.
    if (element.props.deck !== undefined) {
      found.push(element);
      return;
    }
    const forward = element.type as { render?: (props: Record<string, unknown>) => ReactNode };
    const component =
      typeof element.type === 'function'
        ? (element.type as (props: Record<string, unknown>) => ReactNode)
        : typeof forward?.render === 'function'
          ? forward.render
          : null;
    if (component) expand(component(element.props), found);
    else {
      found.push(element);
      expand(element.props.children as ReactNode, found);
    }
  });
  return found;
}
interface Seen {
  elements: El[];
  deck?: unknown;
  body: El[];
}
/** The component's shallow tree, expanded inside a render so its hooks share the dispatcher. */
function inspect(seen: Seen, build: () => ReactNode) {
  function Probe() {
    return <>{build()}</>;
  }
  const html = render(<Probe />);
  return html;
}
const radios = (current: VocabularyModel, library: typeof book | undefined) => {
  const seen: Seen = { elements: [], body: [] };
  inspect(seen, () => {
    seen.elements = expand(WordbooksBlock({ model: current, book: library }));
    return null;
  });
  return seen.elements.filter((element) => element.type === 'input' && element.props.name === 'vocabulary-study-book');
};
const checked = (studyBook: string, library: typeof book | undefined) =>
  radios({ ...withDecks, preferences: { ...model.preferences, studyBook } }, library).map(
    (radio) => radio.props.checked as boolean,
  );

test('the list shows My words first, the built-in book only once downloaded, then decks by title with real counts', async () => {
  await i18n.changeLanguage('en');
  const withoutBook = render(<WordbooksBlock model={withDecks} book={undefined} />);
  expect(withoutBook).toContain(i18n.t('vocab.wordbooks.mine'));
  expect(withoutBook).not.toContain(i18n.t('vocab.book'));
  expect(withoutBook).not.toContain(i18n.t('vocab.wordbooks.mineEmpty'));
  const mineAt = withoutBook.indexOf(i18n.t('vocab.wordbooks.mine'));
  const alphaAt = withoutBook.indexOf(`title="${ALPHA}"`);
  const betaAt = withoutBook.indexOf(`title="${BETA}"`);
  expect(alphaAt).toBeGreaterThan(mineAt);
  expect(betaAt).toBeGreaterThan(alphaAt);
  // Two rows in the first deck (one reviewed), one in the second: rows, not notes.
  expect(withoutBook).toContain(i18n.t('vocab.wordbooks.words', { count: 2 }));
  expect(withoutBook).toContain(i18n.t('vocab.wordbooks.words', { count: 1 }));
  // My words is empty only when nothing was saved from reading or an AI lookup.
  expect(render(<WordbooksBlock model={{ ...model, rows: [] }} book={undefined} />)).toContain(
    i18n.t('vocab.wordbooks.mineEmpty'),
  );

  const withBook = render(<WordbooksBlock model={withDecks} book={book} />);
  expect(withBook).toContain(i18n.t('vocab.book'));
  expect(withBook).toContain(i18n.t('vocab.wordbooks.words', { count: book.manifest.entryCount }));
  const bookAt = withBook.indexOf(`title="${i18n.t('vocab.book')}"`);
  expect(bookAt).toBeGreaterThan(mineAt);
  expect(bookAt).toBeLessThan(withBook.indexOf(`title="${ALPHA}"`));
});

test('the selected radio is the effective study book, not the saved string', async () => {
  await i18n.changeLanguage('en');
  // My words first, then decks by title; the built-in row only when a book is downloaded.
  expect(checked('mine', undefined)).toEqual([true, false, false]);
  expect(checked(`deck:${ALPHA}`, undefined)).toEqual([false, true, false]);
  expect(checked(`deck:${BETA}`, undefined)).toEqual([false, false, true]);
  // A deck that was deleted, an unknown value and a built-in choice with no book all mean My words.
  expect(checked('deck:TEST deck gone', undefined)).toEqual([true, false, false]);
  expect(checked('garbage', undefined)).toEqual([true, false, false]);
  expect(checked('builtin', undefined)).toEqual([true, false, false]);
  expect(checked('builtin', book)).toEqual([false, true, false, false]);
  expect(checked('mine', book)).toEqual([true, false, false, false]);
  expect(checked(`deck:${BETA}`, book)).toEqual([false, false, false, true]);
});

test('choosing another radio saves that choice and keeps the other preferences', async () => {
  await i18n.changeLanguage('en');
  const saves: VocabularyModel['preferences'][] = [];
  const saving: VocabularyModel = {
    ...withDecks,
    savePreferences: async (next) => {
      saves.push(next);
    },
  };
  const deck = radios(saving, book)[2];
  expect(deck.props.checked).toBe(false);
  await (deck.props.onChange as () => Promise<void>)();
  expect(saves).toEqual([{ newPerDay: 20, retentionPercent: 90, studyBook: `deck:${ALPHA}` }]);
  // The radio already saved is not written again.
  await (radios(saving, book)[0].props.onChange as () => Promise<void>)();
  expect(saves).toHaveLength(1);
});

/** The text of the block's own fixed-height status slot: empty when nothing is saving and nothing failed. */
const statusText = (elements: El[]) => {
  const slot = elements.find((element) => element.type === 'p' && element.props.role === 'status');
  return render(<>{slot?.props.children}</>).replace(/<[^>]*>/g, '');
};
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * No DOM, so nothing re-renders by itself: a state setter writes a slot and the next `view` reads it back.
 * Only the block's three null-initialized states (pending choice, error, confirming deck) are intercepted;
 * every other hook keeps the real server dispatcher.
 */
function stateful() {
  const slots: unknown[] = [];
  let cursor = 0;
  const original = React.useState;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    if (initial !== null) return original(initial);
    const slot = cursor++;
    if (!(slot in slots)) slots[slot] = initial;
    const set = (next: unknown) => {
      slots[slot] = typeof next === 'function' ? (next as (current: unknown) => unknown)(slots[slot]) : next;
    };
    return [slots[slot], set];
  }) as unknown as typeof React.useState);
  const view = (current: VocabularyModel, library: typeof book | undefined = book) => {
    cursor = 0;
    const seen: Seen = { elements: [], body: [] };
    inspect(seen, () => {
      seen.elements = expand(WordbooksBlock({ model: current, book: library }));
      return null;
    });
    const inputs = seen.elements.filter(
      (element) => element.type === 'input' && element.props.name === 'vocabulary-study-book',
    );
    return {
      elements: seen.elements,
      radios: inputs,
      disabled: inputs.map((radio) => radio.props.disabled as boolean),
      status: statusText(seen.elements),
    };
  };
  return { view, restore: () => state.mockRestore() };
}

test('a resolved save clears the saving state: the radios unlock and the status slot empties', async () => {
  await i18n.changeLanguage('en');
  let release = () => {};
  const saved = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saves: VocabularyModel['preferences'][] = [];
  const saving: VocabularyModel = {
    ...withDecks,
    savePreferences: async (next) => {
      saves.push(next);
      await saved;
    },
  };
  const harness = stateful();
  try {
    const before = harness.view(saving);
    expect(before.disabled).toEqual([false, false, false, false]);
    expect(before.status).toBe('');
    // The deck radio is the learner's own control; drive it the way a click would.
    (before.radios[2].props.onChange as () => void)();
    const during = harness.view(saving);
    expect(saves).toEqual([{ newPerDay: 20, retentionPercent: 90, studyBook: `deck:${ALPHA}` }]);
    expect(during.disabled).toEqual([true, true, true, true]);
    expect(during.status).toBe(i18n.t('vocab.wordbooks.saving'));
    release();
    await flush();
    // The save resolved and the committed preferences hold the choice: nothing is pending any more.
    const after = harness.view({ ...saving, preferences: { ...saving.preferences, studyBook: `deck:${ALPHA}` } });
    expect(after.disabled).toEqual([false, false, false, false]);
    expect(after.status).toBe('');
    expect(after.radios.map((radio) => radio.props.checked as boolean)).toEqual([false, false, true, false]);
  } finally {
    harness.restore();
  }
});

test('after a save the deck can disappear: the radios stay unlocked and the status slot stays empty', async () => {
  await i18n.changeLanguage('en');
  const harness = stateful();
  try {
    const saving: VocabularyModel = { ...withDecks, savePreferences: async () => {} };
    (harness.view(saving).radios[2].props.onChange as () => void)();
    await flush();
    expect(
      harness.view({ ...saving, preferences: { ...saving.preferences, studyBook: `deck:${ALPHA}` } }).disabled,
    ).toEqual([false, false, false, false]);
    // The saved deck is deleted before the model reloaded it, so the stored choice falls back to My words.
    const gone = harness.view({ ...saving, rows: [mine] });
    expect(gone.radios).toHaveLength(2);
    expect(gone.disabled).toEqual([false, false]);
    expect(gone.radios[0].props.checked).toBe(true);
    expect(gone.status).toBe('');
  } finally {
    harness.restore();
  }
});

test('a rejected save shows the real error and unlocks the radios', async () => {
  await i18n.changeLanguage('en');
  const harness = stateful();
  try {
    const failing: VocabularyModel = {
      ...withDecks,
      savePreferences: async () => {
        throw new Error('TEST save failed');
      },
    };
    (harness.view(failing).radios[2].props.onChange as () => void)();
    await flush();
    const after = harness.view(failing);
    expect(after.disabled).toEqual([false, false, false, false]);
    expect(after.status).toContain('TEST save failed');
    expect(after.status).not.toBe(i18n.t('vocab.wordbooks.saving'));
  } finally {
    harness.restore();
  }
});

test('only imported decks carry a delete button', async () => {
  for (const language of ['en', 'zh'] as const) {
    await i18n.changeLanguage(language);
    const html = render(<WordbooksBlock model={withDecks} book={book} />);
    const labels = [...html.matchAll(/aria-label="([^"]*)"[^>]*title="([^"]*)"/g)].map((match) => match[1]);
    expect(labels).toEqual([
      i18n.t('vocab.wordbooks.deleteLabel', { name: ALPHA }),
      i18n.t('vocab.wordbooks.deleteLabel', { name: BETA }),
    ]);
    expect(html).not.toContain(i18n.t('vocab.wordbooks.deleteLabel', { name: i18n.t('vocab.wordbooks.mine') }));
    expect(html).not.toContain(i18n.t('vocab.wordbooks.deleteLabel', { name: i18n.t('vocab.book') }));
  }
});

test('the confirmation names the deck, its word count and its with-history count; confirming deletes, cancelling does not', async () => {
  await i18n.changeLanguage('en');
  const deleted: string[] = [];
  const removing = spyOn(storage, 'deleteVocabularyDeck').mockImplementation(async (deckId: string) => {
    deleted.push(deckId);
    return { deleted: 1, kept: 0 };
  });
  // WordbooksBlock holds three null-initialized states in order: the pending choice, the error, the confirming deck.
  const closings: unknown[] = [];
  let nulls = 0;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    if (initial === null && ++nulls === 3)
      return [{ id: ALPHA, title: ALPHA, words: 2, withHistory: 1 }, (next: unknown) => closings.push(next)];
    return [initial, () => {}];
  }) as unknown as typeof React.useState);
  const seen: Seen = { elements: [], body: [] };
  try {
    const html = inspect(seen, () => {
      const dialog = expand(WordbooksBlock({ model: withDecks, book })).find(
        (element) => element.props.deck !== undefined,
      )!;
      seen.deck = dialog.props.deck;
      // Call the dialog component itself here, so its hooks share this render's dispatcher; its root
      // Dialog portals on the client, so only the content it passes to the portal is expanded.
      const content = (dialog.type as (props: Record<string, unknown>) => El)(dialog.props);
      seen.body = expand(content.props.children as ReactNode);
      return content.props.children as ReactNode;
    });
    expect(seen.deck).toEqual({ id: ALPHA, title: ALPHA, words: 2, withHistory: 1 });
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(text).toContain(i18n.t('vocab.wordbooks.confirmTitle'));
    expect(text).toContain(i18n.t('vocab.wordbooks.confirmBody', { name: ALPHA, words: 2, history: 1 }));
    expect(text).toContain(ALPHA);
    expect(text).toContain('2 words');
    expect(text).toContain('1 of them with review history');
    const buttons = seen.body.filter((element) => element.type === 'button');
    const cancel = buttons.find((button) => render(<>{button.props.children}</>) === i18n.t('common.cancel'))!;
    const confirm = buttons.find((button) =>
      render(<>{button.props.children}</>).includes(i18n.t('vocab.wordbooks.confirmDelete')),
    )!;
    expect(cancel).toBeDefined();
    expect(confirm).toBeDefined();
    (cancel.props.onClick as () => void)();
    expect(closings).toEqual([null]);
    expect(deleted).toEqual([]);
    await (confirm.props.onClick as () => Promise<void>)();
    expect(deleted).toEqual([ALPHA]);
    expect(closings).toEqual([null, null]);
  } finally {
    state.mockRestore();
    removing.mockRestore();
  }
});
