import { expect, test } from 'bun:test';
import { areaOf, parseRoute, routeHref, type Route } from '../src/utils/routes';

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
