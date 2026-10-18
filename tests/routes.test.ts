import { expect, test } from 'bun:test';
import { areaOf, parseRoute, routeHref, SETTINGS_SECTIONS, STUDY_TABS, type Route } from '../src/utils/routes';

const roundTrip = (route: Route) => parseRoute(routeHref(route));

test('practice addresses: the list and one unit; a stray query is dropped', () => {
  expect(parseRoute('#/practice')).toEqual({ route: { name: 'practice' }, canonical: null });
  expect(parseRoute('#/practice?x=1')).toEqual({
    route: { name: 'practice' },
    canonical: '#/practice',
  });
  expect(parseRoute('#/practice/unit-1').route).toEqual({ name: 'unit', unitId: 'unit-1' });
  expect(parseRoute('#/practice/').canonical).toBe('#/practice');
  expect(areaOf({ name: 'unit', unitId: 'x' })).toBe('practice');
});

test('exercise sets have a distinct Practice route before unit matching', () => {
  const route: Route = { name: 'practiceSet', setId: 'set-1' };
  expect(roundTrip(route)).toEqual({ route, canonical: null });
  expect(areaOf(route)).toBe('practice');
  expect(parseRoute('#/practice/set/set-1/').canonical).toBe('#/practice/set/set-1');
  for (const id of ['a b', 'é/ü?&=', 'x#y', '100%', 'unit-1']) {
    expect(roundTrip({ name: 'practiceSet', setId: id }).route).toEqual({ name: 'practiceSet', setId: id });
  }
  for (const hash of [
    '#/practice/set',
    '#/practice/set/',
    '#/practice/set/a/b',
    '#/practice/set/%E0%A4%A',
    '#/practice/set/a?x=1',
  ]) {
    expect(parseRoute(hash).route.name).toBe('notFound');
  }
  expect(parseRoute('#/practice/unit-set').route).toEqual({ name: 'unit', unitId: 'unit-set' });
});

test('the two import pages have their own addresses and areas; the bare import address is not a place', () => {
  expect(parseRoute('#/import/article')).toEqual({ route: { name: 'importArticle' }, canonical: null });
  expect(parseRoute('#/import/exercises')).toEqual({ route: { name: 'importExercises' }, canonical: null });
  expect(parseRoute('#/import/exercises/').canonical).toBe('#/import/exercises');
  expect(areaOf({ name: 'importArticle' })).toBe('read');
  expect(areaOf({ name: 'importExercises' })).toBe('practice');
  for (const hash of ['#/import', '#/import/', '#/import/other', '#/import/article/x'])
    expect(parseRoute(hash).route.name).toBe('notFound');
  // The reader still owns every article id, including `import`.
  expect(parseRoute('#/read/import').route).toEqual({ name: 'reader', articleId: 'import' });
});

test('ids with odd characters survive the round trip', () => {
  for (const id of ['a b', 'é/ü?&=', 'x#y', '100%']) {
    expect(roundTrip({ name: 'unit', unitId: id }).route).toEqual({ name: 'unit', unitId: id });
  }
});

test('addresses that are not practice places stay not found', () => {
  expect(parseRoute('#/practice/a/b').route.name).toBe('notFound');
  expect(parseRoute('#/practice/a?x=1').route.name).toBe('notFound');
  expect(parseRoute('#/practice/%E0%A4%A').route.name).toBe('notFound');
  expect(parseRoute('#/read/abc').route).toEqual({ name: 'reader', articleId: 'abc' });
});

test('mistake notebook has a canonical study address', () => {
  const route: Route = { name: 'study', tab: 'mistakes' };
  expect(roundTrip(route)).toEqual({ route, canonical: null });
  expect(areaOf(route)).toBe('study');
});

test('passage routes and durable sentence focus roundtrip without taking article ids', () => {
  const sentence = 'L’oiseau chante ? Oui, près du café & du jardin.';
  const route: Route = { name: 'passage', unitId: 'u|/é%', sentence };
  expect(roundTrip(route)).toEqual({ route, canonical: null });
  expect(areaOf(route)).toBe('read');
  const article: Route = { name: 'reader', articleId: 'passage', sentence };
  expect(roundTrip(article)).toEqual({ route: article, canonical: null });
  for (const hash of ['#/passage', '#/passage/m/u', '#/passage/', '#/passage/%E0%A4%A'])
    expect(parseRoute(hash).route.name).toBe('notFound');
  for (const value of ['', '   ', 'a'.repeat(4001)]) {
    const hash = `#/passage/u?sentence=${encodeURIComponent(value)}`;
    expect(parseRoute(hash).route).toEqual({ name: 'passage', unitId: 'u' });
    expect(parseRoute(hash).canonical).toBe('#/passage/u');
  }
});

test('About is its own route', () => {
  const route: Route = { name: 'about' };
  expect(roundTrip(route)).toEqual({ route, canonical: null });
  expect(areaOf(route)).toBe('about');
  for (const hash of ['#/about/']) {
    expect(parseRoute(hash)).toEqual({ route, canonical: '#/about' });
  }
  expect(SETTINGS_SECTIONS).toEqual(['ai', 'practice', 'prompts', 'data']);
  for (const hash of ['#/about/extra', '#/settings/about', '#/settings/missing']) {
    expect(parseRoute(hash).route.name).toBe('notFound');
  }
});

test('all study and remaining Settings sections keep canonical deep links', () => {
  for (const tab of STUDY_TABS) {
    const route: Route = { name: 'study', tab };
    expect(roundTrip(route)).toEqual({ route, canonical: null });
  }
  for (const section of SETTINGS_SECTIONS) {
    const route: Route = { name: 'settings', section, ...(section === 'ai' ? { purpose: 'text' as const } : {}) };
    expect(roundTrip(route)).toEqual({ route, canonical: null });
    expect(areaOf(route)).toBe('settings');
  }
  expect(parseRoute('#/study')).toEqual({ route: { name: 'study', tab: 'words' }, canonical: '#/study/words' });
  expect(parseRoute('#/settings')).toEqual({ route: { name: 'settings', section: null }, canonical: null });
});

test('AI purpose routes are independent and old AI routes are not aliases', () => {
  for (const purpose of ['text', 'ocr', 'speech'] as const) {
    const route: Route = { name: 'settings', section: 'ai', purpose };
    expect(roundTrip(route)).toEqual({ route, canonical: null });
  }
  expect(parseRoute('#/settings/ai').canonical).toBe('#/settings/ai/text');
  for (const hash of ['#/settings/text-ai', '#/settings/speech', '#/settings/ai/nope'])
    expect(parseRoute(hash).route.name).toBe('notFound');
});

test('a missing-key request keeps its purpose and where to return', () => {
  const route: Route = {
    name: 'settings',
    section: 'ai',
    purpose: 'ocr',
    focusKey: true,
    returnTo: '#/import/article',
  };
  expect(roundTrip(route)).toEqual({ route, canonical: null });
  expect(routeHref(route)).toBe('#/settings/ai/ocr?key=1&return=%23%2Fimport%2Farticle');
  expect(parseRoute('#/settings/ai/text?key=1').route).toEqual({
    name: 'settings',
    section: 'ai',
    purpose: 'text',
    focusKey: true,
  });
  // A return address outside the app, or one that would nest another return, is dropped.
  for (const query of ['return=https%3A%2F%2Fexample.com', 'return=%23%2Fread%3Freturn%3D%23%2Fimport%2Farticle']) {
    expect(parseRoute(`#/settings/ai/speech?key=1&${query}`).route).toEqual({
      name: 'settings',
      section: 'ai',
      purpose: 'speech',
      focusKey: true,
    });
  }
});

test('the Grammar tab is the Conjugation page, with an optional verb that survives the round trip', () => {
  expect(STUDY_TABS).toEqual(['words', 'shadowing', 'mistakes', 'grammar']);
  const bare: Route = { name: 'study', tab: 'grammar' };
  expect(routeHref(bare)).toBe('#/study/grammar/conjugation');
  expect(roundTrip(bare)).toEqual({ route: bare, canonical: null });
  expect(areaOf(bare)).toBe('study');
  expect(parseRoute('#/study/grammar')).toEqual({ route: bare, canonical: '#/study/grammar/conjugation' });
  for (const verb of ['s’habiller', 'se lever', "s'appeler", 'éternuer']) {
    const route: Route = { name: 'study', tab: 'grammar', verb };
    expect(roundTrip(route)).toEqual({ route, canonical: null });
  }
  // The generic tab branch must not drop the verb, and an empty one is no verb.
  expect(parseRoute('#/study/grammar?verb=parler')).toEqual({
    route: { name: 'study', tab: 'grammar', verb: 'parler' },
    canonical: '#/study/grammar/conjugation?verb=parler',
  });
  expect(parseRoute('#/study/grammar/conjugation?verb=')).toEqual({
    route: bare,
    canonical: '#/study/grammar/conjugation',
  });
  expect(parseRoute('#/study/grammar/conjugation?verb=%20').route).toEqual(bare);
  for (const hash of ['#/study/grammar/x', '#/study/grammar/conjugation/y', '#/study/grammar//'])
    expect(parseRoute(hash).route.name).toBe('notFound');
});
