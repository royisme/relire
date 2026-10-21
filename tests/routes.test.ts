/** Canonical learning destinations and strict rejection of removed addresses; pure, no browser. */
import { expect, test } from 'bun:test';
import { LEARNING_AREAS, learningAreaPath } from '../src/types/learningArea';
import { areaOf, parseRoute, routeHref, SETTINGS_SECTIONS, STUDY_TABS, type Route } from '../src/utils/routes';
const parse = (hash: string) => parseRoute(hash, true);
const roundTrip = (route: Route) => expect(parse(routeHref(route))).toEqual({ route, canonical: null });

test('each domain has scoped list, unit, complete-set and import roundtrips with encoded ids', () => {
  for (const area of LEARNING_AREAS) {
    roundTrip({ name: 'practice', area });
    roundTrip({ name: 'importExercises', area });
    expect(areaOf({ name: 'practice', area })).toBe(learningAreaPath(area));
    for (const id of ['u1', 'a b', 'é/ü?&=', 'x#y', '100%', 'set', 'exercises']) {
      roundTrip({ name: 'unit', area, unitId: id });
      roundTrip({ name: 'practiceSet', area, setId: id });
    }
  }
  expect(routeHref({ name: 'practice', area: 'reading' })).toBe('#/read/exercises');
  expect(routeHref({ name: 'practice', area: 'grammar' })).toBe('#/grammar/exercises');
  expect(routeHref({ name: 'practice', area: 'listening' })).toBe('#/listening');
  expect(routeHref({ name: 'practice', area: 'writing' })).toBe('#/writing');
  expect(parse('#/read/exercises').route).toEqual({ name: 'practice', area: 'reading' });
  expect(parse('#/read/import').route).toEqual({ name: 'reader', articleId: 'import' });
  expect(parse('#/read/exercises/').canonical).toBe('#/read/exercises');
});

test('removed routes, bare imports, invalid areas, reserved paths and broken encodings have no alias', () => {
  for (const hash of [
    '#/practice',
    '#/practice/set/a',
    '#/practice/unit-a',
    '#/study/grammar',
    '#/study/grammar/conjugation',
    '#/study/grammar/gender',
    '#/study/grammar/topic',
    '#/import',
    '#/import/exercises',
    '#/import/exercises?area=speaking',
    '#/import/exercises?area=',
    '#/grammar/topics',
    '#/grammar/%67ender',
    '#/read/%65xercises',
    '#/read/exercises/unit',
    '#/read/exercises/set/a/b',
    '#/grammar/exercises/unit/%E0%A4%A',
    '#/read/exercises/unit/u?x=1',
    '#/passage',
    '#/passage/a/b',
    '#/passage/%E0%A4%A',
    '#/read//',
    '#/speaking/read-aloud/%E0%A4%A',
    '#/grammar/topics/%E0%A4%A',
    '#/settings/about',
    '#/settings/missing',
    '#/about/x',
    '#/import/article/x',
  ])
    expect(parse(hash).route.name).toBe('notFound');
});

test('reader, distinct passage and speaking preserve source and sentence values', () => {
  const sentence = 'L’oiseau chante ? Oui, près du café & du jardin.';
  for (const id of ['a b', 'é/ü?&=', 'x#y', '100%']) {
    roundTrip({ name: 'reader', articleId: id, sentence });
    roundTrip({ name: 'passage', unitId: id, sentence });
    roundTrip({ name: 'readAloud', articleId: id, sentence });
  }
  roundTrip({ name: 'speaking' });
  roundTrip({ name: 'readAloud' });
  expect(areaOf({ name: 'readAloud' })).toBe('speaking');
  expect(areaOf({ name: 'passage', unitId: 'u' })).toBe('read');
  for (const value of ['', '   ', 'a'.repeat(4001)]) {
    const result = parse(`#/passage/u?sentence=${encodeURIComponent(value)}`);
    expect(result.route).toEqual({ name: 'passage', unitId: 'u' });
    expect(result.canonical).toBe('#/passage/u');
  }
});

test('Grammar is separate from My study and local references/exercises survive service absence', () => {
  expect(STUDY_TABS).toEqual(['words', 'shadowing', 'mistakes']);
  for (const tab of STUDY_TABS) roundTrip({ name: 'study', tab });
  roundTrip({ name: 'wordsAll' });
  roundTrip({ name: 'wordsReview' });
  expect(parse('#/study').canonical).toBe('#/study/words');
  roundTrip({ name: 'grammar' });
  roundTrip({ name: 'grammar', tag: 'articles' });
  expect(areaOf({ name: 'grammarTopic', topicId: 'topic' })).toBe('grammar');
  for (const verb of ['s’habiller', 'se lever', "s'appeler", 'éternuer'])
    roundTrip({ name: 'grammar', section: 'conjugation', verb });
  for (const service of [true, false]) {
    for (const section of ['gender', 'conjugation'] as const) {
      const route: Route = { name: 'grammar', section };
      expect(parseRoute(routeHref(route), service)).toEqual({ route, canonical: null });
    }
    expect(parseRoute('#/grammar/exercises', service).route).toEqual({ name: 'practice', area: 'grammar' });
  }
  expect(parseRoute('#/grammar', false)).toEqual({
    route: { name: 'grammar', section: 'conjugation' },
    canonical: '#/grammar/conjugation',
  });
  expect(parseRoute('#/grammar/topics/topic', false).route.name).toBe('notFound');
  for (const topicId of ['test-only', 'a b', 'é/ü?&=', 'x#y', '100%', 'gender'])
    roundTrip({ name: 'grammarTopic', topicId });
  for (const query of ['tag=unknown', 'tag=', 'verb=parler'])
    expect(parse(`#/grammar?${query}`).canonical).toBe('#/grammar');
  expect(parse('#/grammar/conjugation?verb=%20').canonical).toBe('#/grammar/conjugation');
});

test('Settings preferences, About, AI purpose and return addresses remain intact', () => {
  expect(SETTINGS_SECTIONS).toEqual(['ai', 'practice', 'words', 'prompts', 'data']);
  for (const section of SETTINGS_SECTIONS)
    roundTrip({ name: 'settings', section, ...(section === 'ai' ? { purpose: 'text' as const } : {}) });
  for (const purpose of ['text', 'ocr', 'speech'] as const) roundTrip({ name: 'settings', section: 'ai', purpose });
  roundTrip({ name: 'settings', section: null });
  roundTrip({ name: 'about' });
  roundTrip({ name: 'progress' });
  expect(parse('#/settings/ai').canonical).toBe('#/settings/ai/text');
  const route: Route = {
    name: 'settings',
    section: 'ai',
    purpose: 'ocr',
    focusKey: true,
    returnTo: '#/import/exercises?area=grammar',
  };
  roundTrip(route);
  for (const query of ['return=https%3A%2F%2Fexample.com', 'return=%23%2Fread%3Freturn%3D%23%2Fimport%2Farticle'])
    expect(parse(`#/settings/ai/speech?key=1&${query}`).route).toEqual({
      name: 'settings',
      section: 'ai',
      purpose: 'speech',
      focusKey: true,
    });
  expect(parse('').canonical).toBe('#/read');
});
