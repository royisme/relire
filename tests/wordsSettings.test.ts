/**
 * Settings → Words: the daily limit accepts only a whole number 0..100 and saves through the shared model,
 * and a save that finishes after a newer edit never discards that edit.
 */
import { expect, test } from 'bun:test';
import { draftAfterSave, parseNewPerDay } from '../src/components/settings/WordsSection';

test('the new-word limit accepts 0..100 whole numbers and rejects everything else without clamping', () => {
  for (const value of ['0', '1', '20', '99', '100']) expect(parseNewPerDay(value)).toBe(Number(value));
  for (const value of ['', ' ', '-1', '101', '1.5', '1e2', ' 20', '20 ', '20a', 'abc'])
    expect(parseNewPerDay(value)).toBeNull();
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
