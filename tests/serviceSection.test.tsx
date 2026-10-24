/** The Content service section: fields, a live Test of the draft values, the Test-gated switch, and its own save. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import { createInstance } from 'i18next';
import { getAppSettings } from '../src/utils/appSettings';
import { withSlice } from '../src/components/settings/slices';
import { ServiceSection } from '../src/components/settings/ServiceSection';
import { SaveBar } from '../src/components/settings/SaveBar';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';
import { bookList } from './fixtures/grammarTopics';
import * as statusHook from '../src/hooks/useSaveStatus';
import { Button } from '../src/components/ui/button';
import { readerHookProbe } from './fixtures/readerHookProbe';
import en from '../src/i18n/locales/en.json';

const i18n = createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  initAsync: false,
  interpolation: { escapeValue: false },
});

let draft = getAppSettings();
let saved = getAppSettings();
let probe: ReturnType<typeof readerHookProbe>;
let translation: ReturnType<typeof spyOn<typeof translations, 'useTranslation'>>;
let saveStatus: ReturnType<typeof spyOn<typeof statusHook, 'useSaveStatus'>>;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
beforeEach(() => {
  freshSettingsStorage();
  draft = getAppSettings();
  saved = draft;
  probe = readerHookProbe();
  translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: i18n.t } as never);
  saveStatus = spyOn(statusHook, 'useSaveStatus').mockReturnValue({
    status: { phase: 'idle' },
    run: (save) => {
      save();
      return true;
    },
    clear() {},
    fail() {},
  });
  fetchSpy = spyOn(globalThis, 'fetch');
});
afterEach(() => {
  probe.restore();
  translation.mockRestore();
  saveStatus.mockRestore();
  fetchSpy.mockRestore();
  restoreSettingsStorage();
});

type Node = React.ReactElement<Record<string, unknown>>;

/** The section's elements in document order; the probe keeps the section's state between renders. */
function render(): Node[] {
  return probe.render(() => {
    const tree = ServiceSection({
      draft,
      saved,
      onChange: (next) => {
        draft = next;
      },
      onSaved: (next) => {
        saved = next;
        draft = withSlice(draft, next, 'service');
      },
    });
    const found: Node[] = [];
    const visit = (node: React.ReactNode) => {
      if (!React.isValidElement<Record<string, unknown>>(node)) return;
      found.push(node);
      // The Save bar is a component of its own; the walk looks inside it because the test presses its Save.
      if (node.type === SaveBar) visit(SaveBar(node.props as unknown as Parameters<typeof SaveBar>[0]));
      React.Children.forEach(node.props.children as React.ReactNode, visit);
    };
    visit(tree);
    return found;
  });
}

const elementOf = (elements: Node[], match: (element: Node) => boolean) => {
  const found = elements.find(match);
  if (!found) throw new Error('expected element not found');
  return found;
};
const field = (elements: Node[], id: string) => elementOf(elements, (element) => element.props.id === id);
const buttonOf = (elements: Node[], label: string) =>
  elementOf(elements, (element) => element.type === Button && element.props.children === label);
const enableSwitch = (elements: Node[]) => elementOf(elements, (element) => element.props.role === 'switch');
const resultText = (elements: Node[]) => {
  const slot = elementOf(elements, (element) => element.props['data-service-test-result'] === true);
  const paragraph = slot.props.children as Node | undefined;
  return paragraph ? (paragraph.props.children as string) : undefined;
};

const change = (elements: Node[], id: string, value: string) =>
  (field(elements, id).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });

const fillDraft = (url: string, key: string) => {
  change(render(), 'service-url', url);
  change(render(), 'service-key', key);
};

test('an empty section offers no Test, keeps the switch off and disabled, and promises nothing', () => {
  const elements = render();
  expect(buttonOf(elements, 'Test').props.disabled).toBe(true);
  expect(enableSwitch(elements).props.disabled).toBe(true);
  expect(enableSwitch(elements).props['aria-checked']).toBe(false);
  expect(resultText(elements)).toBeUndefined();
});

test('Test probes the draft values with no store and the draft key, and a pass unlocks the switch', async () => {
  fetchSpy.mockResolvedValue(Response.json(bookList));
  fillDraft('http://content.test/', ' TEST-key ');
  const elements = render();
  expect(buttonOf(elements, 'Test').props.disabled).toBe(false);
  (buttonOf(elements, 'Test').props.onClick as () => void)();
  await Bun.sleep(0);
  const settled = render();
  expect(fetchSpy).toHaveBeenCalledWith('http://content.test/v1/topics', {
    credentials: 'omit',
    cache: 'no-store',
    headers: { Authorization: 'Bearer TEST-key' },
    signal: expect.any(AbortSignal),
  });
  expect(resultText(settled)).toBe(i18n.t('serviceSettings.testSuccess'));
  expect(enableSwitch(settled).props.disabled).toBe(false);
});

for (const [name, respond, key, expected] of [
  ['a rejected key', () => Response.json({ error: 'unauthorized' }, { status: 401 }), 'testRejected', ''],
  ['a rate-limited probe', () => Response.json({ error: 'limited' }, { status: 429 }), 'testLimited', ''],
  [
    'another HTTP status',
    () => Response.json({ error: 'unavailable' }, { status: 500 }),
    'testStatus',
    'HTTP 500: unavailable',
  ],
  ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'testNetwork', ''],
  ['an HTML 200', () => new Response('<html>TEST ONLY</html>'), 'testInvalidBody', ''],
  [
    'a JSON 200 that is not the topic list',
    () => Response.json({ unexpected: true }),
    'testInvalidBody',
    'Invalid input',
  ],
] as const) {
  test(`Test shows the real result for ${name} and keeps the switch locked`, async () => {
    fetchSpy.mockImplementation((async () => respond()) as unknown as typeof fetch);
    fillDraft('http://content.test', 'TEST-key');
    (buttonOf(render(), 'Test').props.onClick as () => void)();
    await Bun.sleep(0);
    const settled = render();
    const message = resultText(settled) ?? '';
    // Every result names its own case; where the case carries a real detail, that detail is on screen.
    expect(message).toContain(i18n.t(`serviceSettings.${key}`).split('{{msg}}')[0]);
    if (expected) expect(message).toContain(expected);
    expect(enableSwitch(settled).props.disabled).toBe(true);
  });
}

test('a Test that settles after the draft changed is ignored', async () => {
  let release!: (response: Response) => void;
  fetchSpy.mockReturnValue(
    new Promise<Response>((resolve) => {
      release = resolve;
    }),
  );
  fillDraft('http://content.test', 'TEST-key');
  (buttonOf(render(), 'Test').props.onClick as () => void)();
  // The learner edits the key while the probe is in flight.
  change(render(), 'service-key', 'TEST-other-key');
  release(Response.json(bookList));
  await Bun.sleep(0);
  const elements = render();
  expect(resultText(elements)).toBeUndefined();
  expect(buttonOf(elements, 'Test').props.disabled).toBe(false);
  expect(enableSwitch(elements).props.disabled).toBe(true);
});

test('the switch turns on after a pass, off needs no Test, and an edit resets both', async () => {
  fetchSpy.mockResolvedValue(Response.json(bookList));
  fillDraft('http://content.test', 'TEST-key');
  (buttonOf(render(), 'Test').props.onClick as () => void)();
  await Bun.sleep(0);
  let elements = render();
  (enableSwitch(elements).props.onClick as () => void)();
  expect(draft.contentService.enabled).toBe(true);
  elements = render();
  expect(enableSwitch(elements).props['aria-checked']).toBe(true);
  // Off needs no pass; the pass is kept, so the switch can be turned back on.
  (enableSwitch(elements).props.onClick as () => void)();
  expect(draft.contentService.enabled).toBe(false);
  (enableSwitch(render()).props.onClick as () => void)();
  expect(draft.contentService.enabled).toBe(true);
  // Editing either field turns the service off and clears the pass.
  change(render(), 'service-url', 'http://other.test');
  expect(draft.contentService.enabled).toBe(false);
  elements = render();
  expect(enableSwitch(elements).props.disabled).toBe(true);
  expect(resultText(elements)).toBeUndefined();
});

test('Save stores the section alone once the switch is on, and the page draft follows the stored block', async () => {
  fetchSpy.mockResolvedValue(Response.json(bookList));
  fillDraft('http://content.test/', ' TEST-key ');
  (buttonOf(render(), 'Test').props.onClick as () => void)();
  await Bun.sleep(0);
  (enableSwitch(render()).props.onClick as () => void)();
  const elements = render();
  (buttonOf(elements, 'Save').props.onClick as () => void)();
  expect(getAppSettings().contentService).toEqual({ enabled: true, url: 'http://content.test', key: 'TEST-key' });
  // The page draft takes the stored block while its other slices keep their unsaved values.
  expect(draft.contentService).toEqual(getAppSettings().contentService);
  expect(draft.practiceStrictAccents).toBe(saved.practiceStrictAccents);
  expect(enableSwitch(render()).props['aria-checked']).toBe(true);
});
