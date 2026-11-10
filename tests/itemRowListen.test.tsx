/** ItemRow's row-level Listen takes the device engine only when the item declares it; no browser or playback. */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import i18next from 'i18next';
import '../src/i18n';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { emptyItems } from '../src/hooks/exerciseUnit/model';
import { prepareSpellingDrill } from '../src/services/exercises/fromSpelling';
import type { ExerciseItem } from '../src/types/exercises';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { spellingPack } from './fixtures/spellingSounds';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { ItemRow } = await import('../src/components/practice/ItemRow');
const { SpeakButton } = await import('../src/components/ui/speak-button');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const [unit] = prepareSpellingDrill({
  pack: spellingPack(),
  rng: () => 0,
  makeId: () => 'TEST',
  now: () => 1,
  t: i18n.getFixedT('en'),
});

function elements(tree: React.ReactNode) {
  const found: React.ReactElement<Record<string, unknown>>[] = [];
  function visit(node: React.ReactNode) {
    if (!React.isValidElement<Record<string, unknown>>(node)) return;
    found.push(node);
    React.Children.forEach(node.props.children as React.ReactNode, visit);
  }
  visit(tree);
  return found;
}

test('a spelling-sounds item listens through the device engine; an ordinary item keeps the selected engine', () => {
  const probe = readerHookProbe();
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: i18n.t.bind(i18n) } as never);
  try {
    const listenOf = (item: ExerciseItem) => {
      const tree = probe.render(() =>
        ItemRow({
          unit,
          item,
          runtime: { ...emptyItems({ ...unit, items: [item] })[item.id], checked: null },
          onAnswer: () => {},
          onCheck: () => {},
          onHint: () => {},
          onExplain: () => {},
          onRedo: () => {},
          onBind: () => {},
          onWord: () => {},
        }),
      );
      const listen = elements(tree).find((node) => node.type === SpeakButton)!;
      return listen.props as unknown as React.ComponentProps<typeof SpeakButton>;
    };
    const drill = unit.items[0];
    const word = drill.audioText!;
    const spoken = listenOf(drill);
    expect(spoken.engine).toBe('device');
    expect(spoken.text).toBe(word);
    expect(spoken.variant).toBe('ghost');
    // The same row without the marker passes no engine, so Listen follows the selected speech engine.
    const ordinary = listenOf({ ...drill, meta: undefined });
    expect(ordinary.engine).toBeUndefined();
    expect(ordinary.text).toBe(word);
  } finally {
    translation.mockRestore();
    probe.restore();
  }
});
