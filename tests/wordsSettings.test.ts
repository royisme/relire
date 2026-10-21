/**
 * Settings → Words: the daily limit accepts only a whole number 0..100 and saves through the shared model,
 * and a save that finishes after a newer edit never discards that edit.
 */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import * as bookHook from '../src/hooks/useVocabularyBook';
import {
  WordsSection,
  draftAfterSave,
  parseNewPerDay,
  parseRetentionPercent,
} from '../src/components/settings/WordsSection';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import { Button } from '../src/components/ui/button';

test('the new-word limit accepts 0..100 whole numbers and rejects everything else without clamping', () => {
  for (const value of ['0', '1', '20', '99', '100']) expect(parseNewPerDay(value)).toBe(Number(value));
  for (const value of ['', ' ', '-1', '101', '1.5', '1e2', ' 20', '20 ', '20a', 'abc'])
    expect(parseNewPerDay(value)).toBeNull();
});

test('target retention accepts integer percentages 80..95, not fractions or exponent input', () => {
  for (const value of ['80', '90', '95']) expect(parseRetentionPercent(value)).toBe(Number(value));
  for (const value of ['', '79', '96', '90.5', '0.9', '9e1', ' 90', '90%', '-90'])
    expect(parseRetentionPercent(value)).toBeNull();
});

test('a finished save drops the draft only while it still holds the submitted text', () => {
  // Saved 20, nothing typed since: the draft goes back to showing the stored preference.
  expect(draftAfterSave('20', '20')).toBeNull();
  // The null case: the field showed the saved preference and that is what was saved.
  expect(draftAfterSave(null, null)).toBeNull();
  // The clobber path: save 20 was in flight while 30 was typed, so the newer 30 must survive.
  expect(draftAfterSave('30', '20')).toBe('30');
  // Typing and returning to the same text is still the submitted text, so it may be dropped.
  expect(draftAfterSave('20', '20')).toBeNull();
});

test('an older save completing after a newer edit leaves the newer edit as the draft', () => {
  // The page holds the draft across a Settings section switch; the section itself remounts.
  let draft: string | null = '20';
  const onSaved = (submitted: string | null) => {
    draft = draftAfterSave(draft, submitted);
  };
  // Each save captures the text it submits when it starts, like the section does.
  const saves: { submitted: string | null; finish: () => void }[] = [];
  const save = () => {
    const submitted = draft;
    saves.push({ submitted, finish: () => onSaved(submitted) });
  };
  save();
  draft = '30';
  save();
  // Save 20 was in flight while 30 was typed: its completion must not clear the newer text.
  saves[0].finish();
  expect(draft).toBe('30');
  saves[1].finish();
  expect(draft).toBeNull();
});

test('real Words fields follow late saved values, protect both page-owned drafts across remount/save completion, and block premature saves', async () => {
  let limit: string | null = null,
    retention: string | null = null;
  const saves: { newPerDay: number; retentionPercent: number }[] = [];
  let finish!: () => void;
  const model: VocabularyModel = {
    rows: [],
    preferences: { newPerDay: 20, retentionPercent: 90 },
    ready: false,
    day: { date: '', introducedKeys: [] },
    epoch: 0,
    now: 1,
    error: null,
    async refresh() {},
    async savePreferences(next) {
      saves.push(next);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  };
  // Shallow real-component render, like the existing hook harness: no browser or persistent module mocks.
  const state = spyOn(React, 'useState').mockImplementation(((initial?: unknown) => [
    initial,
    () => {},
  ]) as typeof React.useState);
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: (key: string) => key } as never);
  const book = spyOn(bookHook, 'useVocabularyBook').mockReturnValue({
    configured: false,
    book: undefined,
    busy: false,
    error: null,
    restart: false,
    progress: null,
    async download() {},
  } as ReturnType<typeof bookHook.useVocabularyBook>);
  function fields() {
    const tree = WordsSection({
      model,
      draft: {
        value: limit,
        retention,
        onChange: (text) => {
          limit = text;
        },
        onRetentionChange: (text) => {
          retention = text;
        },
        onSaved: (submitted) => {
          limit = draftAfterSave(limit, submitted.newPerDay);
          retention = draftAfterSave(retention, submitted.retentionPercent);
        },
      },
    });
    const elements: React.ReactElement<Record<string, unknown>>[] = [];
    function visit(node: React.ReactNode) {
      if (!React.isValidElement<Record<string, unknown>>(node)) return;
      elements.push(node);
      React.Children.forEach(node.props.children as React.ReactNode, visit);
    }
    visit(tree);
    return {
      limit: elements.find((e) => e.props.id === 'vocabulary-limit')!.props,
      retention: elements.find((e) => e.props.id === 'vocabulary-retention')!.props,
      save: elements.find((e) => e.type === Button && e.props.children === 'common.save')!.props,
    };
  }
  try {
    expect(fields().save.disabled).toBe(true);
    (fields().save.onClick as () => void)();
    expect(saves).toEqual([]);
    model.preferences = { newPerDay: 0, retentionPercent: 95 };
    model.ready = true;
    expect(fields().limit.value).toBe('0');
    expect(fields().retention.value).toBe('95');
    limit = '100';
    retention = '80';
    const submitted = fields();
    (submitted.save.onClick as () => void)();
    expect(saves).toEqual([{ newPerDay: 100, retentionPercent: 80 }]);
    // A section switch remounts Words; page drafts still hold newer edits while the older save finishes.
    limit = '0';
    retention = '94';
    expect(fields().limit.value).toBe('0');
    expect(fields().retention.value).toBe('94');
    finish();
    await Bun.sleep(0);
    expect(limit).toBe('0');
    expect(retention).toBe('94');
    (fields().save.onClick as () => void)();
    finish();
    await Bun.sleep(0);
    expect(limit).toBeNull();
    expect(retention).toBeNull();
    expect(saves[1]).toEqual({ newPerDay: 0, retentionPercent: 94 });
    model.error = 'TEST saved-preference read refused';
    expect(fields().save.disabled).toBe(true);
  } finally {
    book.mockRestore();
    translation.mockRestore();
    state.mockRestore();
  }
});
