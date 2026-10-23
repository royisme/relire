/** Noun-pack whole-load validation, sharing, immutability and later-opening retry, with the committed reviewed pack. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import * as React from 'react';
import * as loader from '../src/services/nounGender/load';
import { renderToStaticMarkup } from 'react-dom/server';
import data from '../src/data/noun-gender/pack.json';
import { NounGenderPackSchema } from '../src/types/nounGender';
import { NounGenderRuleIdSchema, tendencyPercent } from '../src/types/nounGenderDrill';
import { loadNounGenderPack, loadedNounGenderPack, resetNounGenderPackForTests } from '../src/services/nounGender/load';
import { useNounGenderPack } from '../src/hooks/useNounGenderPack';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

beforeEach(resetNounGenderPackForTests);
afterEach(resetNounGenderPackForTests);

test('concurrent and later loads share one promise, parse and deeply frozen pack', async () => {
  void NounGenderPackSchema.safeParse;
  const parse = spyOn(NounGenderPackSchema, 'safeParse');
  try {
    const first = loadNounGenderPack(data);
    expect(loadNounGenderPack()).toBe(first);
    const pack = await first;
    expect(await loadNounGenderPack()).toBe(pack);
    expect(parse).toHaveBeenCalledTimes(1);
    for (const object of [
      pack,
      pack.nouns,
      pack.nouns[0],
      pack.nouns[0].prov.checkedAgainst,
      pack.rules,
      pack.rules[0],
      pack.rules[0].dictionary,
      pack.rules[0].examples,
    ])
      expect(Object.isFrozen(object)).toBe(true);
    expect(() => {
      pack.nouns[0].lemma = 'changed';
    }).toThrow();
    expect(data.nouns[0].lemma).not.toBe('changed');
  } finally {
    parse.mockRestore();
  }
});

test('invalid rows reject the whole load with their real reasons; failure is not retained', async () => {
  const bad = structuredClone(data);
  bad.nouns[0].prov.status = 'draft';
  bad.rules[0].a1.agree = 0;
  const first = loadNounGenderPack(bad);
  const message = await first.then(
    () => '',
    (error: Error) => error.message,
  );
  expect(message).toContain('The noun-gender pack was not usable:');
  expect(message).toContain('nouns.0.prov.status');
  expect(message).toContain('rules.0.a1');
  expect(loadedNounGenderPack()).toBeUndefined();
  const retry = loadNounGenderPack();
  expect(retry).not.toBe(first);
  expect((await retry).nouns).toHaveLength(337);
});

test('the hook starts ready after preload and the real pack retains all 17 rules, including ure', async () => {
  const probe = () => createElement(() => useNounGenderPack().status);
  expect(renderToStaticMarkup(probe())).toBe('loading');
  const pack = await loadNounGenderPack();
  expect(renderToStaticMarkup(probe())).toBe('ready');
  expect(pack.rules).toHaveLength(17);
  expect(pack.nouns).toHaveLength(337);
  expect(new Set(pack.rules.map((rule) => rule.id))).toEqual(new Set(NounGenderRuleIdSchema.options));
  expect(pack.rules.some((rule) => ['e', 'eur'].includes(rule.id))).toBe(false);
  const ure = pack.rules.find((rule) => rule.id === 'ure')!;
  expect(ure.dictionary).toEqual({ agree: 902, n: 1216 });
  expect(ure.a1).toEqual({ agree: 12, n: 12 });
  for (const rule of pack.rules) {
    expect(rule.prov.status).toBe('reviewed');
    for (const locale of [en, zh]) {
      expect(locale.nounGender.rules[rule.id as keyof typeof locale.nounGender.rules]).toBeTruthy();
    }
  }
});

test('hook preserves load errors, retries on a later mount and drops an unmounted reply', async () => {
  type State = ReturnType<typeof useNounGenderPack>;
  let state: State = { status: 'loading' };
  let effect: React.EffectCallback | undefined;
  const stateSpy = spyOn(React, 'useState').mockImplementation((() => [
    state,
    (next: State) => {
      state = next;
    },
  ]) as typeof React.useState);
  const effectSpy = spyOn(React, 'useEffect').mockImplementation((next) => {
    effect = next;
  });
  const loadSpy = spyOn(loader, 'loadNounGenderPack').mockRejectedValueOnce(new Error('TEST noun pack unavailable'));
  try {
    expect(useNounGenderPack()).toEqual({ status: 'loading' });
    const closeFailure = effect!();
    await Bun.sleep(0);
    expect(useNounGenderPack()).toEqual({ status: 'error', error: 'TEST noun pack unavailable' });
    if (typeof closeFailure === 'function') closeFailure();

    state = { status: 'loading' };
    const pack = NounGenderPackSchema.parse(data);
    let finish!: (value: typeof pack) => void;
    loadSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    expect(useNounGenderPack()).toEqual({ status: 'loading' });
    const close = effect!();
    if (typeof close === 'function') close();
    finish(pack);
    await Bun.sleep(0);
    expect(state).toEqual({ status: 'loading' });

    loadSpy.mockResolvedValueOnce(pack);
    useNounGenderPack();
    const closeSuccess = effect!();
    await Bun.sleep(0);
    expect(useNounGenderPack()).toEqual({ status: 'ready', pack });
    expect(loadSpy).toHaveBeenCalledTimes(3);
    if (typeof closeSuccess === 'function') closeSuccess();
  } finally {
    stateSpy.mockRestore();
    effectSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test('percentage formatting never rounds a non-perfect sample to 100', () => {
  expect(tendencyPercent(99.9999)).toBe(99.9);
  expect(tendencyPercent(100)).toBe(100);
  expect(tendencyPercent((100 * 902) / 1216)).toBe(74.1);
});
