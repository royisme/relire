/** Static composition contracts only: links, missing sources, actual-area retries and recorder ownership, not visual acceptance. */
import { afterAll, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '../src/i18n';
import { resolveReadAloud } from '../src/services/readAloud';
import { SAMPLE_ARTICLES } from '../src/data/sampleArticles';
import { unitOf } from './fixtures/units';
import { failure } from './fixtures/storage';
import * as unitHook from '../src/hooks/useExerciseUnit';
import * as mistakesHook from '../src/hooks/useMistakes';
import * as readerUnitsHook from '../src/hooks/useReaderUnits';
import * as recorderHook from '../src/hooks/useShadowingRecorder';
import * as contentService from '../src/services/grammarTopics/service';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    location: { hash: '' },
    relireHistory: { read: () => 0 },
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: 'TEST' },
  }),
});
const { SpeakingPage } = await import('../src/components/practice/SpeakingPage');
const { UnitView } = await import('../src/components/practice/UnitView');
const { MistakeNotebook } = await import('../src/components/study/MistakeNotebook');
const { UnitTable } = await import('../src/components/practice/UnitTable');
const { SetTable } = await import('../src/components/practice/SetTable');
const { NavTree } = await import('../src/components/shell/NavTree');
const { LearningNavigation } = await import('../src/components/shell/LearningNavigation');
const { aggregateSets } = await import('../src/services/exercises/sets');
const { createUnitSaver } = await import('../src/hooks/useUnitSaver');
afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});
const render = (node: ReactNode) => {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, snapshot, server) =>
    useStore(subscribe, snapshot, server ?? snapshot),
  );
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    store.mockRestore();
  }
};
const article = {
  ...SAMPLE_ARTICLES[0],
  id: 'TEST é/%?#',
  title: 'TEST source',
  content: 'TEST premier. TEST deuxième.',
};

test('Read aloud has honest empty/missing selection, encoded article links, and durable sentence resolution', () => {
  const onAssessed = () => {};
  expect(render(<SpeakingPage articles={[]} workspace onAssessed={onAssessed} />)).toContain(
    i18n.t('learning.speakingEmpty'),
  );
  const entry = render(<SpeakingPage articles={[article]} workspace onAssessed={onAssessed} />);
  expect(entry).toContain(`href="#/speaking/read-aloud/${encodeURIComponent(article.id)}"`);
  const missing = render(<SpeakingPage articles={[article]} workspace articleId="gone" onAssessed={onAssessed} />);
  expect(missing).toContain(i18n.t('learning.sourceUnavailable'));
  expect(missing).not.toContain('TEST premier');
  expect(resolveReadAloud([article], article.id, 'TEST deuxième.')?.index).toBe(1);
  expect(resolveReadAloud([article], article.id, 'removed sentence')).toBeUndefined();
  expect(resolveReadAloud([], article.id)).toBeUndefined();
  const home = render(<SpeakingPage articles={[article]} workspace={false} onAssessed={onAssessed} />);
  expect(home).toContain('href="#/speaking/read-aloud"');
  expect(home).toContain(i18n.t('learning.shadowingContext'));
});

test('Read aloud mounts exactly one existing recorder with the original assessment callback and selected reference', () => {
  const callback = () => {};
  const recorder = spyOn(recorderHook, 'useShadowingRecorder').mockImplementation(((
    reference: string,
    assessed: Parameters<typeof recorderHook.useShadowingRecorder>[1],
  ) => {
    expect(reference).toBe('TEST deuxième.');
    expect(assessed).toBe(callback);
    return {
      phase: 'idle',
      seconds: 0,
      isEvaluating: false,
      error: null,
      assessment: null,
      start: () => {},
      stop: () => {},
    };
  }) as never);
  try {
    const html = render(
      <SpeakingPage
        articles={[article]}
        workspace
        articleId={article.id}
        sentence="TEST deuxième."
        onAssessed={callback}
      />,
    );
    expect(recorder).toHaveBeenCalledTimes(1);
    expect(html).toContain('TEST deuxième.');
    expect(html).not.toContain('TEST premier.');
    expect(html).toContain(i18n.t('shadowing.record'));
  } finally {
    recorder.mockRestore();
  }
});

test('wrong-area unit is not rendered and never adopts its stored area', () => {
  const unit = unitOf('FILL_BLANKS');
  const hook = spyOn(unitHook, 'useExerciseUnit').mockReturnValue({ status: 'ready', unit } as never);
  try {
    const html = render(<UnitView area="reading" unitId={unit.id} onMissingKey={() => {}} onWord={() => {}} />);
    expect(html).toContain(i18n.t('notFound.unit'));
    expect(html).toContain('href="#/read/exercises"');
    expect(html).not.toContain('unit-title');
  } finally {
    hook.mockRestore();
  }
});

test('complete tables label each real area and link units individually; scoped rows cannot delete hidden areas', () => {
  const rows = ['grammar', 'writing'].map((area, index) => ({
    unit: { ...unitOf('OPEN_QA'), id: `u${index}`, learningArea: area as 'grammar' | 'writing' },
    progress: { total: 1, checked: index, correct: index },
  }));
  const table = render(<UnitTable rows={rows} onDelete={() => {}} />);
  for (const [index, area] of ['grammar', 'writing'].entries()) {
    expect(table).toContain(`href="#/${area}/exercises/unit/u${index}"`);
    expect(table).toContain(i18n.t(`learning.areas.${area}`));
  }
  const list = render(<SetTable area="grammar" sets={aggregateSets(rows.slice(0, 1), i18n.t.bind(i18n))} />);
  expect(list).not.toContain('lucide-trash');
  expect(list).not.toContain(i18n.t('practice.deleteSet'));
  for (const language of ['en', 'zh']) {
    const text = i18n.getFixedT(language)('practice.deleteSetBody', { title: 'TEST mixed', count: 2 });
    expect(text).toContain('TEST mixed');
    expect(text).toContain('2');
    if (language === 'en') expect(text).toContain('all learning areas');
  }
});

test('notebook retains area identity after source deletion and only retries in the surviving actual area', () => {
  const unit = { ...unitOf('OPEN_QA'), learningArea: 'writing' as const };
  const attempt = {
    id: 'TEST',
    unitId: unit.id,
    itemId: unit.items[0].id,
    learningArea: 'writing' as const,
    grammarTag: 'questions' as const,
    prompt: 'TEST prompt',
    userAnswer: 'x',
    expectedAnswer: 'y',
    correct: false,
    timestamp: 1,
  };
  const hook = spyOn(mistakesHook, 'useMistakes').mockReturnValue({
    rows: [{ unit, attempt, resolved: false }],
    loading: false,
    error: null,
    retry: () => {},
  });
  try {
    const html = render(<MistakeNotebook onMissingKey={() => {}} onWord={() => {}} />);
    expect(html).toContain(i18n.t('learning.areas.writing'));
    expect(html).toContain(`href="#/writing/exercises/unit/${unit.id}"`);
    hook.mockReturnValue({ rows: [{ attempt, resolved: false }], loading: false, error: null, retry: () => {} });
    const deleted = render(<MistakeNotebook onMissingKey={() => {}} onWord={() => {}} />);
    expect(deleted).toContain(i18n.t('learning.areas.writing'));
    expect(deleted.replace(/<[^>]+>/g, '')).toContain('TEST prompt');
    expect(deleted).not.toContain('/exercises/unit/');
  } finally {
    hook.mockRestore();
  }
});

test('learning-first sidebar has no generic Practice or study Grammar; Writing requires a saved writing unit', () => {
  const units = spyOn(readerUnitsHook, 'useReaderUnits').mockReturnValue({ units: [], error: null });
  const mistakes = spyOn(mistakesHook, 'useMistakes').mockReturnValue({
    rows: [],
    loading: false,
    error: null,
    retry: () => {},
  });
  try {
    const html = render(<NavTree route={{ name: 'study', tab: 'words' }} dueCount={0} />);
    for (const href of ['#/read', '#/grammar', '#/listening', '#/speaking', '#/study/words'])
      expect(html).toContain(`href="${href}"`);
    expect(html.indexOf('href="#/speaking"')).toBeLessThan(html.indexOf('href="#/study/words"'));
    expect(html).not.toContain('href="#/practice');
    expect(html).not.toContain('href="#/study/grammar');
    expect(html).not.toContain('href="#/writing"');
    units.mockReturnValue({ units: [{ ...unitOf('OPEN_QA'), learningArea: 'writing' }], error: null });
    expect(render(<NavTree route={{ name: 'practice', area: 'writing' }} dueCount={0} rail />)).toContain(
      'aria-label="Writing"',
    );
  } finally {
    units.mockRestore();
    mistakes.mockRestore();
  }
});

test('Graded readers is linked from the Reading destinations and stays current on the reader route', () => {
  const units = spyOn(readerUnitsHook, 'useReaderUnits').mockReturnValue({ units: null, error: null });
  const mistakes = spyOn(mistakesHook, 'useMistakes').mockReturnValue({
    rows: [],
    loading: false,
    error: null,
    retry: () => {},
  });
  try {
    const nav = render(<LearningNavigation area="read" current={{ name: 'gradedReader', readerId: 'r' }} />);
    expect(nav).toContain('href="#/read/graded" aria-current="page"');
    // NavTree puts the classes between href and aria-current, so match the current graded link loosely.
    const gradedCurrent = /href="#\/read\/graded"[^>]*aria-current/;
    expect(gradedCurrent.test(render(<NavTree route={{ name: 'gradedReader', readerId: 'r' }} dueCount={0} />))).toBe(
      true,
    );
    expect(gradedCurrent.test(render(<NavTree route={{ name: 'gradedReaders' }} dueCount={0} />))).toBe(true);
    expect(gradedCurrent.test(render(<NavTree route={{ name: 'library' }} dueCount={0} />))).toBe(false);
    expect(render(<LearningNavigation area="read" current={{ name: 'library' }} />)).not.toContain(
      'href="#/read/graded" aria-current',
    );
  } finally {
    units.mockRestore();
    mistakes.mockRestore();
  }
});

test('exercise import is not repeated in the sidebar while the reading article import stays', () => {
  const units = spyOn(readerUnitsHook, 'useReaderUnits').mockReturnValue({
    units: [{ ...unitOf('OPEN_QA'), learningArea: 'writing' }],
    error: null,
  });
  const mistakes = spyOn(mistakesHook, 'useMistakes').mockReturnValue({
    rows: [],
    loading: false,
    error: null,
    retry: () => {},
  });
  try {
    expect(render(<NavTree route={{ name: 'library' }} dueCount={0} />)).toContain('href="#/import/article"');
    for (const route of [
      { name: 'library' },
      { name: 'grammar', section: 'gender' },
      { name: 'practice', area: 'listening' },
      { name: 'practice', area: 'writing' },
    ] as const)
      expect(render(<NavTree route={route} dueCount={0} />)).not.toContain('/import/exercises');
  } finally {
    units.mockRestore();
    mistakes.mockRestore();
  }
});

test('Grammar local references and exercises remain linked without a service; filters preserve current destination', () => {
  const service = spyOn(contentService, 'contentServiceUrl').mockReturnValue(undefined);
  try {
    const html = render(
      <LearningNavigation area="grammar" current={{ name: 'grammar', section: 'conjugation', verb: 'parler' }} />,
    );
    for (const href of ['#/grammar/conjugation', '#/grammar/gender', '#/grammar/exercises'])
      expect(html).toContain(`href="${href}"`);
    expect(html).toContain('href="#/grammar/conjugation" aria-current="page"');
    expect(html).not.toContain('role="radio"');
    service.mockReturnValue('https://TEST.invalid');
    const filtered = render(<LearningNavigation area="grammar" current={{ name: 'grammar', tag: 'present' }} />);
    expect(filtered).toContain('href="#/grammar" aria-current="page"');
  } finally {
    service.mockRestore();
  }
});

test('async producer retry retains the first confirmed area and every prepared identity without another AI call', async () => {
  let calls = 0;
  const writes: unknown[] = [];
  const saver = createUnitSaver(async (units) => {
    writes.push(structuredClone(units));
    if (writes.length === 1) throw new Error('TEST storage refused');
  });
  const prepare = async () => {
    calls++;
    return [{ ...unitOf('OPEN_QA'), learningArea: 'writing' as const }];
  };
  expect(((await failure(saver.run(prepare))) as Error).message).toBe('TEST storage refused');
  const result = await saver.run(async () => {
    throw new Error('must not regenerate or change selected area');
  });
  expect(calls).toBe(1);
  expect(result?.[0].learningArea).toBe('writing');
  expect(writes[1]).toEqual(writes[0]);
});
