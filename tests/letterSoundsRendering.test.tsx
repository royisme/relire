/** Spelling-first section and sheet contracts in both locales; no browser or real device speech. */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import * as translations from 'react-i18next';
import type { SpellingSoundsPack } from '../src/types/spellingSounds';
import { SpeakButton } from '../src/components/ui/speak-button';
import { Collapsible } from '../src/components/ui/collapsible';
import { OverlayHeader, Sheet } from '../src/components/ui/overlay';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

// The section's practice button imports the router, which reads window at module load.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { LetterSounds } = await import('../src/components/speaking/LetterSounds');
const { LetterSoundSheet } = await import('../src/components/speaking/LetterSoundSheet');
const packHook = await import('../src/hooks/useSpellingSounds');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');

const i18n = createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  initAsync: false,
  interpolation: { escapeValue: false },
});
const noop = () => {};
const review = { kind: 'human', by: 'Human review: TEST ONLY', at: '2026-10-24' } as const;
// Deliberately unsorted so the view, not the fixture, must supply the group order.
const pack: SpellingSoundsPack = {
  schemaVersion: 1,
  packVersion: 'TEST ONLY',
  patterns: [
    { id: 'h', spelling: 'h', group: 'silent', sound: [], examples: ['homme', 'hôtel', 'hiver'], review },
    { id: 'ch', spelling: 'ch', group: 'consonants', sound: ['ʃ'], examples: ['chat', 'cher', 'chef'], review },
    { id: 'oi', spelling: 'oi', group: 'vowels', sound: ['w', 'a'], examples: ['moi', 'toi', 'soir'], review },
    { id: 'on', spelling: 'on', group: 'nasals', sound: ['ɔ̃'], examples: ['bon', 'pont', 'rond'], review },
    { id: 'ou', spelling: 'ou', group: 'vowels', sound: ['u'], examples: ['vous', 'jour', 'rouge'], review },
  ],
};

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

function render(node: React.ReactNode) {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, snapshot, server) =>
    useStore(subscribe, snapshot, server ?? snapshot),
  );
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    store.mockRestore();
  }
}

for (const language of ['en', 'zh']) {
  test(`${language}: grouped spelling tiles, not IPA, and an honest conditional AI notice`, async () => {
    await i18n.changeLanguage(language);
    const hook = spyOn(packHook, 'useSpellingSounds').mockReturnValue({ status: 'ready', pack, retry: noop });
    try {
      const html = render(<LetterSounds />);
      expect(html).toContain('aria-labelledby="letter-sounds-title"');
      expect(html).toContain(i18n.t('spellingSounds.title'));
      expect(html).toContain(i18n.t('spellingSounds.intro'));
      const groups = ['vowels', 'nasals', 'consonants', 'silent'] as const;
      let previous = -1;
      for (let index = 0; index < groups.length; index++) {
        const group = groups[index];
        const start = html.indexOf(i18n.t(`spellingSounds.groups.${group}`));
        expect(start).toBeGreaterThan(previous);
        previous = start;
        const end =
          index + 1 < groups.length ? html.indexOf(i18n.t(`spellingSounds.groups.${groups[index + 1]}`)) : html.length;
        const tiles = [...html.slice(start, end).matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map((match) => match[1]);
        expect(tiles).toEqual(
          pack.patterns.filter((pattern) => pattern.group === group).map((pattern) => pattern.spelling),
        );
      }
      expect(html).toContain('min-h-11');
      expect(html).toContain('grid-cols-3');
      for (const symbol of pack.patterns.flatMap((pattern) => pattern.sound)) {
        expect(html).not.toContain(`[${symbol}]`);
        if (/[^a-z]/.test(symbol)) expect(html).not.toContain(symbol);
      }
      expect(html).not.toContain(i18n.t('spellingSounds.showIpa'));
      // The practice button appears only with a ready pack; it is a separate outline control below the notice.
      expect(html).toContain(i18n.t('spellingSounds.practise'));
      expect(html).not.toContain(i18n.t('spellingSounds.reviewNotice'));
      hook.mockReturnValue({
        status: 'ready',
        pack: {
          ...pack,
          patterns: pack.patterns.map((pattern, index) =>
            index === 1 ? { ...pattern, review: { ...review, kind: 'ai', by: 'AI review: TEST ONLY' } } : pattern,
          ),
        },
        retry: noop,
      });
      expect(render(<LetterSounds />)).toContain(i18n.t('spellingSounds.reviewNotice'));
    } finally {
      hook.mockRestore();
    }
  });

  test(`${language}: sheet note, every serif word and accessible device Listen control; IPA is opt-in`, async () => {
    await i18n.changeLanguage(language);
    const pattern = pack.patterns[2];
    const html = render(<LetterSoundSheet pattern={pattern} onClose={noop} />);
    expect(html).toContain(`aria-label="${pattern.spelling}"`);
    const note = renderToStaticMarkup(<span>{i18n.t(`spellingSounds.notes.${pattern.id}`)}</span>).replace(
      /<[^>]*>/g,
      '',
    );
    expect(html.replace(/<[^>]*>/g, '')).toContain(note);
    expect(html).toContain(i18n.t('spellingSounds.examples'));
    for (const word of pattern.examples) {
      expect(html).toContain(`aria-label="${i18n.t('spellingSounds.listenWord', { word })}"`);
      expect(html).toMatch(new RegExp(`class="[^"]*font-serif[^"]*">${word}</span>`));
    }
    expect(html).toContain(i18n.t('spellingSounds.sheetClose'));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(i18n.t('spellingSounds.showIpa'));
    expect(html).not.toContain('[w]');
    expect(html).not.toContain('[a]');
    let open = false;
    const state = spyOn(React, 'useState').mockImplementation((() => [
      open,
      (next: boolean) => {
        open = next;
      },
    ]) as typeof React.useState);
    const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: i18n.getFixedT(language) } as never);
    try {
      const tree = () => elements(LetterSoundSheet({ pattern, onClose: noop }));
      const listens = tree().filter((node) => node.type === SpeakButton);
      expect(listens.map((node) => node.props.text)).toEqual(pattern.examples);
      for (const node of listens) {
        expect(node.props.engine).toBe('device');
        expect(node.props.size).toBe('icon');
        expect(node.props.showLabel).not.toBe(true);
        expect(node.props.label).toBe(i18n.t('spellingSounds.listenWord', { word: node.props.text }));
      }
      expect(tree().find((node) => node.type === OverlayHeader)?.props.title).toBe(pattern.spelling);
      expect(tree().find((node) => node.type === OverlayHeader)?.props.onClose).toBe(noop);
      expect(tree().find((node) => node.type === Sheet)?.props.onClose).toBe(noop);
      const fold = tree().find((node) => node.type === Collapsible)!;
      expect(fold.props.open).toBe(false);
      (fold.props.onOpenChange as (value: boolean) => void)(true);
    } finally {
      state.mockRestore();
      translation.mockRestore();
    }
    const useState = React.useState;
    const opened = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
      const pair = useState(initial);
      return initial === false ? [open, noop] : pair;
    }) as typeof React.useState);
    try {
      const expanded = render(<LetterSoundSheet pattern={pattern} onClose={noop} />);
      expect(expanded).toContain('aria-expanded="true"');
      expect(expanded).toContain(i18n.t('spellingSounds.hideIpa'));
      expect(expanded).toContain('[w] [a]');
    } finally {
      opened.mockRestore();
    }
    const silent = render(<LetterSoundSheet pattern={pack.patterns[0]} onClose={noop} />);
    expect(silent).not.toContain('collapsible');
    expect(silent).not.toContain(i18n.t('spellingSounds.showIpa'));
    for (const word of pack.patterns[0].examples)
      expect(silent).toContain(i18n.t('spellingSounds.listenWord', { word }));
  });
}

test('loading reserves space; failure shows the real reason and Retry invokes the load hook', () => {
  let retried = false;
  const retry = () => {
    retried = true;
  };
  const hook = spyOn(packHook, 'useSpellingSounds').mockReturnValue({ status: 'loading', retry });
  try {
    const loading = render(<LetterSounds />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('min-h-[34rem]');
    expect(loading).toContain(i18n.t('common.loading'));
    expect(loading).not.toContain(i18n.t('spellingSounds.practise'));
    hook.mockReturnValue({ status: 'error', error: 'TEST chunk refused', retry });
    const failed = render(<LetterSounds />);
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('TEST chunk refused');
    expect(failed).toContain(i18n.t('common.retry'));
    expect(failed).toContain('min-h-[34rem]');
    expect(failed).not.toContain(i18n.t('spellingSounds.practise'));
    const state = spyOn(React, 'useState').mockReturnValue([null, noop]);
    const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: (key: string) => key } as never);
    try {
      const button = elements(LetterSounds()).find((node) => node.props.children === 'common.retry')!;
      (button.props.onClick as () => void)();
      expect(retried).toBe(true);
    } finally {
      state.mockRestore();
      translation.mockRestore();
    }
  } finally {
    hook.mockRestore();
  }
});

test('a tile selects its own pattern; closing the sheet clears it', () => {
  let selected: SpellingSoundsPack['patterns'][number] | null = null;
  const hook = spyOn(packHook, 'useSpellingSounds').mockReturnValue({ status: 'ready', pack, retry: noop });
  const state = spyOn(React, 'useState').mockImplementation((() => [
    selected,
    (next: typeof selected) => {
      selected = next;
    },
  ]) as typeof React.useState);
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: (key: string) => key } as never);
  try {
    const tree = () => elements(LetterSounds());
    const tile = tree().find((node) => node.props.children === 'ch')!;
    (tile.props.onClick as () => void)();
    const sheet = tree().find((node) => node.type === LetterSoundSheet)!;
    expect(sheet.props.pattern).toBe(pack.patterns[1]);
    (sheet.props.onClose as () => void)();
    expect(tree().some((node) => node.type === LetterSoundSheet)).toBe(false);
  } finally {
    hook.mockRestore();
    state.mockRestore();
    translation.mockRestore();
  }
});
