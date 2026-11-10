/** Segmented filters keep radio semantics, one Tab stop and keyboard selection/focus together. */
import { expect, mock, test } from 'bun:test';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Segmented } from '../src/components/ui/segmented';

const options = ['all', 'due', 'new'].map((value) => ({ value, label: value }));

function control(value = 'due') {
  const onChange = mock((_value: string) => {});
  const element = Segmented({ options, value, label: 'Words', onChange });
  const buttons = element.props.children.props.children as ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>[];
  return { element, buttons, onChange };
}

test('Segmented exposes checked radios, one Tab stop and 40px targets', () => {
  const { element, buttons } = control();
  const html = renderToStaticMarkup(element);
  expect(html).toContain('role="radiogroup" aria-label="Words"');
  expect(buttons.map((button) => button.props['aria-checked'])).toEqual([false, true, false]);
  expect(buttons.map((button) => button.props.tabIndex)).toEqual([-1, 0, -1]);
  for (const button of buttons) {
    expect(button.props.role).toBe('radio');
    expect(button.props.className).toContain('h-10 min-w-10');
  }
  expect(control('removed').buttons.map((button) => button.props.tabIndex)).toEqual([0, -1, -1]);
});

test('Segmented arrows wrap, Home/End select endpoints, and focus follows the selection', () => {
  const cases = [
    [0, 'ArrowRight', 1],
    [2, 'ArrowRight', 0],
    [0, 'ArrowDown', 1],
    [0, 'ArrowLeft', 2],
    [2, 'ArrowUp', 1],
    [1, 'Home', 0],
    [0, 'End', 2],
  ] as const;
  for (const [from, key, to] of cases) {
    const { buttons, onChange } = control();
    const targets = options.map(() => ({ focus: mock(() => {}) }));
    const preventDefault = mock(() => {});
    buttons[from].props.onKeyDown!({
      key,
      preventDefault,
      currentTarget: { parentElement: { querySelectorAll: () => targets } },
    } as unknown as KeyboardEvent<HTMLButtonElement>);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(targets[to].focus).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(options[to].value);
  }
});

test('Segmented preserves click callbacks and leaves unrelated keys alone', () => {
  const { buttons, onChange } = control();
  buttons[0].props.onKeyDown!({ key: 'Tab' } as KeyboardEvent<HTMLButtonElement>);
  expect(onChange).not.toHaveBeenCalled();
  buttons[2].props.onClick!({} as Parameters<NonNullable<ButtonHTMLAttributes<HTMLButtonElement>['onClick']>>[0]);
  expect(onChange).toHaveBeenCalledWith('new');
});
