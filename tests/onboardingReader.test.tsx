/** The guide reaches a graded reader without any key: the bundled first reader, the free step flow, and the
 * banner that stays off the graded routes. TEST content only. */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { firstBundledReaderId } from '../src/services/gradedReaders/firstReader';
import { parseRoute, worksWithoutKey } from '../src/utils/routes';
import { OnboardingDialog } from '../src/components/OnboardingDialog';
import * as api from '../src/services/api';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { dialogBody } from './fixtures/dialogBody';

const syllabus = (bundledCount: number) => ({
  stages: [1, 2, 3].map((order) => ({
    order,
    readerId: `test-book-${order}`,
    bundled: order <= bundledCount,
  })),
});

const storage = new Map<string, string>();
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('first bundled reader', () => {
  test('returns the first bundled stage of the committed syllabus', () => {
    expect(firstBundledReaderId()).toBe('a1-01');
  });

  test('follows the bundled prefix and returns undefined when nothing is bundled', () => {
    expect(firstBundledReaderId(syllabus(3))).toBe('test-book-1');
    expect(firstBundledReaderId(syllabus(0))).toBeUndefined();
  });
});

describe('the key banner leaves the graded routes alone', () => {
  test('the graded list and one reader work without a key', () => {
    expect(worksWithoutKey(parseRoute('#/read/graded').route)).toBe(true);
    expect(worksWithoutKey(parseRoute('#/read/graded/a1-01').route)).toBe(true);
  });

  test('every other place keeps the banner', () => {
    for (const hash of ['#/read', '#/read/test-article', '#/words', '#/speaking', '#/grammar'])
      expect(worksWithoutKey(parseRoute(hash).route)).toBe(false);
  });
});

test.each([
  '#/words',
  '#/words/all',
  '#/words/review',
  '#/words/play',
  '#/words/map',
  '#/mistakes',
  '#/speaking/recordings',
])('the missing-key banner decision stays on for %s', (hash) => {
  const route = parseRoute(hash).route;
  expect(route.name).not.toBe('notFound');
  expect(worksWithoutKey(route)).toBe(false);
});

// The dialog is rendered with React's state hooks stepped by slot, so no DOM test environment is needed.
function renderSteps(props: Parameters<typeof OnboardingDialog>[0] = { onClose: () => {}, onKeySaved: () => {} }) {
  const step = { value: 0 };
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const slot = initial === 0 ? step : { value: initial };
    return [
      slot.value,
      (next: unknown) => {
        slot.value = typeof next === 'function' ? (next as (v: unknown) => unknown)(slot.value) : next;
      },
    ];
  }) as typeof React.useState);
  const instance = i18n.createInstance();
  void instance.init({
    lng: 'en',
    resources: { en: { translation: en }, zh: { translation: zh } },
    initAsync: false,
  });
  // The Dialog portals on the client only, so its content is rendered without the wrapper.
  const Body = dialogBody(OnboardingDialog, props);
  const html = () =>
    renderToStaticMarkup(
      <I18nextProvider i18n={instance}>
        <Body />
      </I18nextProvider>,
    );
  return { step, html, restore: () => state.mockRestore() };
}

test('step 1 promises a keyless start and step 2 continues to step 3 without a key', () => {
  const check = spyOn(api, 'checkTextKey').mockImplementation(() => Promise.resolve());
  const { step, html, restore } = renderSteps({ onClose: () => {}, onKeySaved: () => {}, onOpenReader: () => {} });
  try {
    expect(html()).toContain(en.onboarding.welcomeNoKey);
    step.value = 1;
    const stepTwo = html();
    expect(stepTwo).toContain(en.onboarding.keyOptional);
    expect(stepTwo).toContain(en.onboarding.continueWithoutKey);
    // Continuing is a plain step change: no key verification and no remote call.
    step.value = 2;
    expect(html()).toContain(en.onboarding.openReader);
    expect(check).toHaveBeenCalledTimes(0);
  } finally {
    restore();
    check.mockRestore();
  }
});

test('without a bundled reader step 3 offers no reader action instead of an invented one', () => {
  const { step, html, restore } = renderSteps({ onClose: () => {}, onKeySaved: () => {} });
  try {
    step.value = 2;
    expect(html()).not.toContain(en.onboarding.openReader);
    expect(html()).toContain(en.onboarding.toToday);
  } finally {
    restore();
  }
});
