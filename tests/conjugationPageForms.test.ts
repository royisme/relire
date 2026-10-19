/** Owns how the Conjugation page writes a cell: lead and forms joined, variants with ` / `, and the rule's own lead on a differing cell. Not layout or status wording. */
import { expect, test } from 'bun:test';
import { cellText, joinLead, ruleText } from '../src/components/study/grammar/forms';

test('lead and forms: one space, none after an elided lead, none for an empty lead', () => {
  expect(joinLead('nous', 'parlons')).toBe('nous parlons');
  expect(joinLead('j’', 'aime')).toBe('j’aime');
  expect(joinLead('qu’il/elle', 'aime')).toBe('qu’il/elle aime');
  expect(joinLead('', 'parle')).toBe('parle');
});

test('variants follow the primary form joined by a slash', () => {
  expect(cellText({ lead: 'je', forms: ['paie', 'paye'] })).toBe('je paie / paye');
  expect(cellText({ lead: 'je', forms: ['suis allé', 'suis allée'] })).toBe('je suis allé / suis allée');
});

test('the rule line composes its lead from the rule’s own first form', () => {
  const verb = { pronominal: false };
  expect(ruleText('present', '1sg', verb, ['aime'])).toBe('j’aime');
  expect(ruleText('present', '1sg', verb, ['parle'])).toBe('je parle');
  expect(ruleText('imperatif', '2sg', verb, ['parle'])).toBe('parle');
});
