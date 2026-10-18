/** The batch label is built only from fields the unit has: its title, else the type and the start of the set id. */
import { expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import { setLabel } from '../src/services/exercises/setLabel';
import { unitOf } from './fixtures/units';

const t = ((key: string) => `<${key}>`) as unknown as TFunction;

test('the set title wins when there is one', () => {
  expect(setLabel(t, { ...unitOf('FILL_BLANKS'), setId: 'abcdef12', setTitle: 'Leçon 3' })).toBe('Leçon 3');
});

test('without a title it is the translated exercise type and the first four characters of the set id', () => {
  expect(setLabel(t, { ...unitOf('OPEN_QA'), setId: 'abcdef12' })).toBe('<exerciseTypes.OPEN_QA.name> · abcd');
});
