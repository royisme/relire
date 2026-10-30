/** Static DOM contracts and real component-handler probes, like nounGenderRound; no browser/layout engine. */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import React, { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import {
  currentTurn,
  roundReducer,
  startRound,
  summaryOf,
  turnOutcome,
  type RoundAction,
} from '../src/services/atelier/roundState';
import type { AtelierSource } from '../src/services/atelier/source';
import { atelierChoice, devRound } from './fixtures/atelier';
import { readerTestWindow } from './fixtures/readerTestWindow';

const hooks = await import('react');
const restoreImportWindow = readerTestWindow();
const { RoundView } = await import('../src/components/atelier/RoundView');
const { Brick } = await import('../src/components/atelier/Brick');
const { Bin } = await import('../src/components/atelier/Bin');
const { Baseplate } = await import('../src/components/atelier/Baseplate');
const { Booklet } = await import('../src/components/atelier/Booklet');
const { Hud } = await import('../src/components/atelier/Hud');
const { Button } = await import('../src/components/ui/button');
const { useMotion } = await import('../src/components/atelier/Stage');
const { playCue, setGameEffects, setGameSound } = await import('../src/utils/gameCues');
restoreImportWindow();
const brickRender = (
  Brick as unknown as {
    render: (props: ComponentProps<typeof Brick>, ref: null) => ReactElement;
  }
).render;

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
function render(node: ReactNode) {
  const snapshot: typeof hooks.useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot();
  const named = spyOn(hooks, 'useSyncExternalStore').mockImplementation(snapshot);
  const defaultExport = spyOn(React, 'useSyncExternalStore').mockImplementation(snapshot);
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    defaultExport.mockRestore();
    named.mockRestore();
  }
}
const noop = () => {};

// Capture a component's actual JSX/handlers while React supplies its ordinary SSR hooks/context.
// Only external-store reads use the client snapshot (useMediaQuery has no server snapshot).
function capture(component: () => ReactElement) {
  let tree!: ReactElement;
  function Probe() {
    tree = component();
    return tree;
  }
  return {
    html: render(<Probe />),
    get tree() {
      return tree;
    },
  };
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node as ReactElement<Record<string, unknown>>, ...elements(node.props.children)];
}
function propsOf<P>(tree: ReactNode, type: unknown): P {
  const element = elements(tree).find((candidate) => candidate.type === type);
  if (!element) throw new Error('Expected component missing from tree');
  return element.props as P;
}
const click = (props: ComponentProps<typeof Button>) => props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
const keyEvent = (key: string) => ({
  key,
  repeat: false,
  nativeEvent: { isComposing: false },
  preventDefault: mock(noop),
});

function round() {
  let state = startRound(devRound.items);
  const grade = mock<AtelierSource['grade']>(async () => ({ isCorrect: false, feedback: 'TEST wrong order' }));
  const source: AtelierSource = { grade, loadRound: async () => ({ items: devRound.items, dropped: 0 }) };
  const dispatch = (action: RoundAction) => {
    state = roundReducer(state, action);
  };
  const view = () =>
    capture(() => {
      const reducer = spyOn(hooks, 'useReducer').mockImplementation((() => [
        state,
        dispatch,
      ]) as unknown as typeof hooks.useReducer);
      try {
        return RoundView({
          items: devRound.items,
          choice: atelierChoice,
          dropped: 0,
          source,
          onAgain: noop,
          onThemes: noop,
          onLeave: noop,
        });
      } finally {
        reducer.mockRestore();
      }
    });
  const place = (id: string) => propsOf<ComponentProps<typeof Bin>>(view().tree, Bin).onPlace(id);
  const build = () => devRound.items[currentTurn(state).itemIndex].bricks.forEach((_, index) => place(`b${index}`));
  const primary = () => {
    const element = elements(view().tree).find((candidate) => candidate.props.className === 'game-cta');
    if (!element) throw new Error('Check/Next missing');
    return element.props as ComponentProps<typeof Button>;
  };
  return { view, place, build, primary, grade, state: () => state };
}

let restoreWindow: () => void;
let reduced = false;
let restoreDocument: PropertyDescriptor | undefined;
beforeEach(async () => {
  restoreWindow = readerTestWindow();
  restoreDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => null } });
  Object.assign(window, { matchMedia: () => ({ matches: reduced }) });
  reduced = false;
  setGameSound(false);
  setGameEffects(true);
  await i18n.changeLanguage('en');
});
afterEach(() => {
  setGameSound(true);
  setGameEffects(true);
  if (restoreDocument) Object.defineProperty(globalThis, 'document', restoreDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  restoreWindow();
});

test('the three-item dev round passes the boundary and renders the real row, bin, ticket and Check', () => {
  expect(devRound.dropped).toEqual([]);
  expect(devRound.items).toHaveLength(3);
  const game = round();
  const html = game.view().html;
  expect(html).toContain('We are going to the beach.');
  expect(html).toContain(`aria-label="${t('atelier.round.row')}"`);
  expect(html).toContain(`aria-label="${t('atelier.round.tray')}"`);
  expect(html).toContain(t('atelier.round.check'));
  expect(game.primary().disabled).toBe(true);
  expect(game.grade).not.toHaveBeenCalled();
});

test('sockets and grammar terms are absent from the bin, present on the row verb, and in the right-answer booklet', () => {
  const game = round();
  expect(game.view().html).not.toContain('brick-socket');
  expect(game.view().html).not.toContain('à + nom');
  game.place('b1');
  const tree = game.view().tree;
  const bin = propsOf<ComponentProps<typeof Bin>>(tree, Bin);
  const plate = propsOf<ComponentProps<typeof Baseplate>>(tree, Baseplate);
  expect(render(<Bin {...bin} />)).not.toContain('brick-socket');
  expect(render(<Bin {...bin} />)).not.toContain('à + nom');
  const row = render(<Baseplate {...plate} />);
  expect(row.match(/class="brick-socket"/g)).toHaveLength(1);
  expect(row).toContain('à + nom');
  plate.onRemove('b1');
  expect(game.view().html).not.toContain('brick-socket');
  game.build();
  click(game.primary());
  expect(currentTurn(game.state()).right).toBe(true);
  const booklet = render(
    <Booklet
      item={devRound.items[0]}
      turn={currentTurn(game.state())}
      language="en"
      lastTurn={false}
      onClose={noop}
      onNext={noop}
    />,
  );
  expect(booklet).toContain('role="dialog"');
  expect(booklet).toContain('brick-socket');
  expect(booklet).toContain('à + nom');
  expect(booklet).toContain(devRound.items[0].explanation.en);
  expect(game.grade).not.toHaveBeenCalled();
});

test('native Enter/Space brick buttons place, Backspace removes last, and Enter on Check submits', () => {
  const game = round();
  // Native button activation is browser-owned; exercise its real onClick, not a synthetic keyboard implementation.
  for (const [key, id] of [
    ['Enter', 'b0'],
    [' ', 'b1'],
  ] as const) {
    const turn = currentTurn(game.state());
    const piece = turn.pieces.find((candidate) => candidate.id === id)!;
    const bin = propsOf<ComponentProps<typeof Bin>>(game.view().tree, Bin);
    const brick = render(<Brick piece={piece} mode="tray" motion={false} onPress={() => bin.onPlace(id)} />);
    expect(brick).toContain('<button type="button"');
    expect(brick).not.toContain('tabindex="-1"');
    const button = capture(() =>
      brickRender({ piece, mode: 'tray', motion: false, onPress: () => bin.onPlace(id) }, null),
    );
    const native = propsOf<React.ButtonHTMLAttributes<HTMLButtonElement>>(button.tree, 'button');
    expect(native.onKeyDown, key).toBeUndefined();
    click(native);
  }
  expect(currentTurn(game.state()).placed).toEqual(['b0', 'b1']);
  const backspace = keyEvent('Backspace');
  propsOf<React.HTMLAttributes<HTMLDivElement>>(game.view().tree, 'div').onKeyDown!(
    backspace as unknown as React.KeyboardEvent<HTMLDivElement>,
  );
  expect(backspace.preventDefault).toHaveBeenCalledTimes(1);
  expect(currentTurn(game.state()).placed).toEqual(['b0']);
  for (const id of ['b1', 'b2', 'b3', 'b4', 'b5']) game.place(id);
  const check = game.primary();
  const enter = keyEvent('Enter');
  check.onKeyDown!(enter as unknown as React.KeyboardEvent<HTMLButtonElement>);
  expect(enter.preventDefault).not.toHaveBeenCalled();
  click(check);
  expect(currentTurn(game.state())).toMatchObject({ checks: 1, right: true });
  expect(game.grade).not.toHaveBeenCalled();
  const held = { ...keyEvent('Enter'), repeat: true };
  game.primary().onKeyDown!(held as unknown as React.KeyboardEvent<HTMLButtonElement>);
  expect(held.preventDefault).toHaveBeenCalledTimes(1);
});

test('Check keeps the same page structure and its own pending state until grade settles', async () => {
  const game = round();
  let release!: (result: { isCorrect: boolean; feedback: string }) => void;
  game.grade.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  for (const id of ['b1', 'b0', 'b2', 'b3', 'b4', 'b5']) game.place(id);
  const before = game.view();
  const structural = (html: string) => html.match(/<(?:header|footer|section|div)\b[^>]*>/g);
  click(game.primary());
  const pending = game.view();
  expect(game.grade).toHaveBeenCalledWith(devRound.items[0], 'allons Nous à la plage.');
  expect(game.primary()).toMatchObject({ 'aria-busy': true, 'aria-disabled': true });
  expect(pending.html).toContain('animate-spin');
  expect(structural(pending.html)).toEqual(structural(before.html));
  expect(pending.html.match(/aria-busy="true"/g)).toHaveLength(1);
  expect(pending.html).not.toContain('role="dialog"');
  const placed = [...currentTurn(game.state()).placed];
  game.place('d0');
  expect(currentTurn(game.state()).placed).toEqual(placed);
  click(game.primary());
  expect(game.grade).toHaveBeenCalledTimes(1);
  release({ isCorrect: false, feedback: 'TEST word order feedback' });
  await Promise.resolve();
  await Promise.resolve();
  expect(game.primary()['aria-busy']).toBe(false);
  expect(game.view().html).toContain('TEST word order feedback');
  expect(currentTurn(game.state()).checks).toBe(1);
});

test('RoundView judges a distractor and a gap locally without calling grade', () => {
  for (const ids of [['b0'], ['b0', 'b1', 'd0', 'b3', 'b4', 'b5']]) {
    const game = round();
    ids.forEach(game.place);
    click(game.primary());
    expect(game.grade).not.toHaveBeenCalled();
    expect(currentTurn(game.state())).toMatchObject({ checks: 1, right: false, pending: false });
  }
});

for (const language of ['en', 'zh'] as const) {
  test(`${language}: summary counts and progress pips agree with first, missed and retried turns`, async () => {
    await i18n.changeLanguage(language);
    const game = round();
    game.place('d0');
    propsOf<ComponentProps<typeof Baseplate>>(game.view().tree, Baseplate).onRemove('d0');
    for (const expected of ['missed', 'first', 'first', 'retried'] as const) {
      game.build();
      click(game.primary());
      expect(turnOutcome(currentTurn(game.state()))).toBe(expected);
      click(game.primary());
      if (expected === 'missed') {
        const pips = propsOf<ComponentProps<typeof Hud>>(game.view().tree, Hud).pips;
        expect(pips).toEqual(['missed', 'current', 'todo', 'todo']);
      }
    }
    expect(summaryOf(game.state())).toEqual({ total: 3, rightFirstTime: 2 });
    const html = game.view().html;
    expect(html).toContain(t('atelier.summary.count', { count: 3, right: 2 }));
    expect(html.match(/data-hue="green"/g)).toHaveLength(2);
    expect(html.match(/data-hue="red"/g)).toHaveLength(1);
    expect(html.match(/data-hue="yellow"/g)).toHaveLength(1);
    for (const outcome of ['first', 'missed', 'retried']) expect(html).toContain(t(`atelier.summary.${outcome}`));
    expect(game.grade).not.toHaveBeenCalled();
  });
}

// No DOM package is installed: only the Web Animations host surface is stubbed, never the effect implementation.
for (const mode of ['enabled', 'reduced motion', 'Effects off'] as const) {
  test(`${mode}: Web Animations obey the real motion preference and Effects switch`, () => {
    const originalElement = Object.getOwnPropertyDescriptor(globalThis, 'Element');
    class AnimationHost {
      getBoundingClientRect() {
        return { left: 0, top: 0 };
      }
      animate() {
        return { finished: Promise.resolve() };
      }
    }
    Object.defineProperty(globalThis, 'Element', { configurable: true, value: AnimationHost });
    const animate = spyOn(Element.prototype, 'animate');
    try {
      reduced = mode === 'reduced motion';
      if (mode === 'Effects off') {
        const hud = capture(() => Hud({ onExit: noop }));
        const switches = elements(hud.tree).filter((element) => typeof element.props.onToggle === 'function');
        const effects = switches.find((element) => element.props.label === t('atelier.round.effects'))!;
        (effects.props.onToggle as () => void)();
      }
      let motion = false;
      capture(() => {
        motion = useMotion();
        return <span />;
      });
      expect(motion).toBe(mode === 'enabled');
      const host = new Element();
      const piece = currentTurn(startRound(devRound.items)).pieces.find((candidate) => candidate.id === 'b1')!;
      for (const kind of ['snap', 'fuse', 'bounce', 'shake', 'settle', 'reappear'] as const) {
        const effects: React.EffectCallback[] = [];
        const layout = spyOn(hooks, 'useLayoutEffect').mockImplementation((effect) => {
          effects.push(effect);
        });
        try {
          const brick = capture(() =>
            brickRender(
              {
                piece,
                mode: 'row',
                motion,
                onPress: noop,
                fx: { n: 1, kind, ...(!motion && kind === 'fuse' ? { parts: ['à', 'le'] as [string, string] } : {}) },
              },
              null,
            ),
          );
          expect(brick.html).not.toContain('data-half');
          for (const element of elements(brick.tree)) {
            const ref = element.props.ref as React.RefObject<Element | null> | undefined;
            if (ref && typeof ref === 'object') ref.current = host;
          }
          expect(effects).toHaveLength(1);
          effects.forEach((effect) => effect());
        } finally {
          layout.mockRestore();
        }
      }
      expect(animate).toHaveBeenCalledTimes(mode === 'enabled' ? 6 : 0);
    } finally {
      animate.mockRestore();
      if (originalElement) Object.defineProperty(globalThis, 'Element', originalElement);
      else Reflect.deleteProperty(globalThis, 'Element');
    }
  });
}

test('Sound switch off creates no AudioContext for any game cue', () => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const audio = mock(() => {
    throw new Error('Audio must not start with Sound off');
  });
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: audio });
  try {
    setGameSound(true);
    const hud = capture(() => Hud({ onExit: noop }));
    const sound = elements(hud.tree).find((element) => element.props.label === t('atelier.round.sound'))!;
    (sound.props.onToggle as () => void)();
    expect(capture(() => Hud({ onExit: noop })).html).toContain('aria-pressed="false"');
    for (const cue of ['snap', 'fuse', 'wrong', 'right', 'finish'] as const) playCue(cue);
    expect(audio).not.toHaveBeenCalled();
  } finally {
    if (originalAudio) Object.defineProperty(globalThis, 'AudioContext', originalAudio);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
});
