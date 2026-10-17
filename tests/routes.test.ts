import { expect, test } from 'bun:test';
import { areaOf, parseRoute, routeHref, SETTINGS_SECTIONS, STUDY_TABS, type Route } from '../src/utils/routes';

const roundTrip = (route: Route) => parseRoute(routeHref(route));

test('practice addresses: the list (with or without an article) and one unit', () => {
  expect(parseRoute('#/practice')).toEqual({ route: { name: 'practice' }, canonical: null });
  expect(parseRoute('#/practice?article=petit-prince')).toEqual({
    route: { name: 'practice', articleId: 'petit-prince' },
    canonical: null,
  });
  expect(parseRoute('#/practice/unit-1').route).toEqual({ name: 'unit', unitId: 'unit-1' });
  expect(parseRoute('#/practice/').canonical).toBe('#/practice');
  expect(areaOf({ name: 'unit', unitId: 'x' })).toBe('practice');
});

test('ids with odd characters survive the round trip', () => {
  for (const id of ['a b', 'é/ü?&=', 'x#y', '100%']) {
    expect(roundTrip({ name: 'unit', unitId: id }).route).toEqual({ name: 'unit', unitId: id });
    expect(roundTrip({ name: 'practice', articleId: id }).route).toEqual({ name: 'practice', articleId: id });
  }
});

test('addresses that are not practice places stay not found', () => {
  expect(parseRoute('#/practice/a/b').route.name).toBe('notFound');
  expect(parseRoute('#/practice/a?article=b').route.name).toBe('notFound');
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
  const route: Route = { name: 'passage', materialId: 'm|/é%', unitId: 'u|/é%', sentence };
  expect(roundTrip(route)).toEqual({ route, canonical: null });
  expect(areaOf(route)).toBe('read');
  const article: Route = { name: 'reader', articleId: 'passage', sentence };
  expect(roundTrip(article)).toEqual({ route: article, canonical: null });
  for (const hash of ['#/passage/m', '#/passage/m/u/extra', '#/passage//u', '#/passage/m/%E0%A4%A'])
    expect(parseRoute(hash).route.name).toBe('notFound');
  for (const value of ['', '   ', 'a'.repeat(4001)]) {
    const hash = `#/passage/m/u?sentence=${encodeURIComponent(value)}`;
    expect(parseRoute(hash).route).toEqual({ name: 'passage', materialId: 'm', unitId: 'u' });
    expect(parseRoute(hash).canonical).toBe('#/passage/m/u');
  }
});

test('About is independent and old Settings About deep links canonicalize to it', () => {
  const route: Route = { name: 'about' };
  expect(roundTrip(route)).toEqual({ route, canonical: null });
  expect(areaOf(route)).toBe('about');
  for (const hash of ['#/settings/about', '#/settings/about/', '#/about/']) {
    expect(parseRoute(hash)).toEqual({ route, canonical: '#/about' });
  }
  expect(SETTINGS_SECTIONS).toEqual(['text-ai', 'speech', 'practice', 'prompts', 'data']);
  for (const hash of ['#/about/extra', '#/settings/about/extra', '#/settings/missing']) {
    expect(parseRoute(hash).route.name).toBe('notFound');
  }
});

test('all study and remaining Settings sections keep canonical deep links', () => {
  for (const tab of STUDY_TABS) {
    const route: Route = { name: 'study', tab };
    expect(roundTrip(route)).toEqual({ route, canonical: null });
  }
  for (const section of SETTINGS_SECTIONS) {
    const route: Route = { name: 'settings', section };
    expect(roundTrip(route)).toEqual({ route, canonical: null });
    expect(areaOf(route)).toBe('settings');
  }
  expect(parseRoute('#/study')).toEqual({ route: { name: 'study', tab: 'words' }, canonical: '#/study/words' });
  expect(parseRoute('#/settings')).toEqual({ route: { name: 'settings', section: null }, canonical: null });
});
