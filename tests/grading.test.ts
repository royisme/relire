import { describe, expect, test } from 'bun:test';
import {
  choiceGroups,
  countBlanks,
  emptyAnswer,
  expectedAnswerText,
  isAnswerFilled,
  recordedAnswerText,
  spokenPrompt,
} from '../src/services/exercises/answer';
import { buildAttempt, gradeItem, gradeUnitItem, normalizeFrench } from '../src/services/exercises/grading';
import type { ExerciseAnswer, ExerciseItem, ExerciseType } from '../src/types/exercises';
import { itemStateId } from '../src/types/exercises';
import { ITEM_BY_TYPE, ITEMS, unitOf } from './fixtures/units';

const strict = { strictAccents: true };
const lenient = { strictAccents: false };

function answer(item: ExerciseItem, patch: Partial<ExerciseAnswer>): ExerciseAnswer {
  return { ...emptyAnswer(item), ...patch };
}

function grade(type: ExerciseType, patch: Partial<ExerciseAnswer>, options = strict, item = ITEM_BY_TYPE[type]) {
  return gradeItem(type, item, answer(item, patch), options);
}

const verdict = (result: ReturnType<typeof gradeItem>) => (result.status === 'graded' ? result.correct : result.status);

describe('normalizeFrench', () => {
  test('keeps accents when strict, strips them otherwise', () => {
    expect(normalizeFrench('  Étudiant ', true)).toBe('étudiant');
    expect(normalizeFrench('  Étudiant ', false)).toBe('etudiant');
    expect(normalizeFrench('garçon', false)).toBe('garcon');
  });

  test('turns punctuation into apostrophes and collapses whitespace', () => {
    expect(normalizeFrench("C'est   une femme.", true)).toBe("c'est une femme'");
    expect(normalizeFrench('est-ce', true)).toBe("est'ce");
    expect(normalizeFrench('l’homme', true)).toBe("l'homme");
  });

  test('a trailing full stop is significant (FrenchLab behaviour kept)', () => {
    expect(normalizeFrench('bonjour', true)).not.toBe(normalizeFrench('bonjour.', true));
  });
});

describe('every type graded right and wrong', () => {
  test('WORD_TRANSFORM', () => {
    expect(verdict(grade('WORD_TRANSFORM', { singleAnswer: 'étudiant' }))).toBe(true);
    expect(verdict(grade('WORD_TRANSFORM', { singleAnswer: ' Étudiant ' }))).toBe(true);
    expect(verdict(grade('WORD_TRANSFORM', { singleAnswer: 'etudiant' }))).toBe(true); // acceptable alternative
    expect(verdict(grade('WORD_TRANSFORM', { singleAnswer: 'élève' }))).toBe(false);
    expect(verdict(grade('WORD_TRANSFORM', { singleAnswer: '' }))).toBe(false);
  });

  test('FILL_BLANKS, one blank', () => {
    expect(verdict(grade('FILL_BLANKS', { singleAnswer: 'suis' }))).toBe(true);
    expect(verdict(grade('FILL_BLANKS', { singleAnswer: 'es' }))).toBe(false);
  });

  test('FILL_BLANKS, several blanks need every slot', () => {
    const item = ITEMS.FILL_BLANKS_MULTI;
    expect(verdict(grade('FILL_BLANKS', { multiAnswers: ['es', 'est'] }, strict, item))).toBe(true);
    expect(verdict(grade('FILL_BLANKS', { multiAnswers: ['es', 'sont'] }, strict, item))).toBe(false);
    expect(verdict(grade('FILL_BLANKS', { multiAnswers: ['es', ''] }, strict, item))).toBe(false);
    expect(verdict(grade('FILL_BLANKS', { multiAnswers: ['es'] }, strict, item))).toBe(false);
  });

  test('GENDER_CHECK', () => {
    expect(verdict(grade('GENDER_CHECK', { singleAnswer: 'F' }))).toBe(true);
    expect(verdict(grade('GENDER_CHECK', { singleAnswer: 'f' }))).toBe(true);
    expect(verdict(grade('GENDER_CHECK', { singleAnswer: 'M' }))).toBe(false);
  });

  test('ODD_ONE_OUT compares the chosen option exactly', () => {
    expect(verdict(grade('ODD_ONE_OUT', { selectedOdd: 'assistante' }))).toBe(true);
    expect(verdict(grade('ODD_ONE_OUT', { selectedOdd: 'polonaise' }))).toBe(false);
    expect(verdict(grade('ODD_ONE_OUT', { selectedOdd: null }))).toBe(false);
    expect(verdict(grade('ODD_ONE_OUT', { selectedOdd: 'Assistante' }))).toBe(false);
  });

  test('MATCH_PAIRS compares the chosen option letter', () => {
    expect(verdict(grade('MATCH_PAIRS', { matchSelection: 'b' }))).toBe(true);
    expect(verdict(grade('MATCH_PAIRS', { matchSelection: 'B' }))).toBe(true);
    expect(verdict(grade('MATCH_PAIRS', { matchSelection: 'a' }))).toBe(false);
    expect(verdict(grade('MATCH_PAIRS', { matchSelection: '' }))).toBe(false);
  });

  test('DIALOGUE_ORDER compares the selected line order', () => {
    const lines = ITEMS.DIALOGUE_ORDER.options;
    const [a, b, c, d] = lines;
    expect(verdict(grade('DIALOGUE_ORDER', { dialogueOrder: [c, b, a, d] }))).toBe(true);
    expect(verdict(grade('DIALOGUE_ORDER', { dialogueOrder: [a, b, c, d] }))).toBe(false);
    expect(verdict(grade('DIALOGUE_ORDER', { dialogueOrder: [c, b, a] }))).toBe(false);
    expect(verdict(grade('DIALOGUE_ORDER', { dialogueOrder: [c, b, a, d, d] }))).toBe(false);
    expect(verdict(grade('DIALOGUE_ORDER', { dialogueOrder: [] }))).toBe(false);
    // The key is the first letter of each line, case-insensitively and ignoring leading space.
    expect(verdict(grade('DIALOGUE_ORDER', { dialogueOrder: [` ${c.toUpperCase()}`, b, a, d] }))).toBe(true);
  });

  test('the printed order of a dialogue is not the answer unless it is the answer', () => {
    const answerAsPrinted = emptyAnswer(ITEMS.DIALOGUE_ORDER);
    expect(answerAsPrinted.dialogueOrder).toEqual(ITEMS.DIALOGUE_ORDER.options);
    expect(verdict(gradeItem('DIALOGUE_ORDER', ITEMS.DIALOGUE_ORDER, answerAsPrinted, strict))).toBe(false);
  });

  test('CHOICE_SELECT needs every group right', () => {
    expect(verdict(grade('CHOICE_SELECT', { choiceSelections: ['êtes', 'je'] }))).toBe(true);
    expect(verdict(grade('CHOICE_SELECT', { choiceSelections: ['êtes', "c'est"] }))).toBe(false);
    expect(verdict(grade('CHOICE_SELECT', { choiceSelections: ['êtes', ''] }))).toBe(false);
    expect(verdict(grade('CHOICE_SELECT', { choiceSelections: ['êtes'] }))).toBe(false);
    expect(verdict(grade('CHOICE_SELECT', { choiceSelections: ['êtes', 'je', 'je'] }))).toBe(false);
  });

  test('SENTENCE_BUILD: a match is final, a miss goes to the AI grader', () => {
    const expected = "C'est une Autrichienne. Son mari est autrichien.";
    expect(verdict(grade('SENTENCE_BUILD', { singleAnswer: expected }))).toBe(true);
    expect(verdict(grade('SENTENCE_BUILD', { singleAnswer: expected.toLowerCase() }))).toBe(true);
    expect(verdict(grade('SENTENCE_BUILD', { singleAnswer: "C'est une Autrichienne." }))).toBe('needs-ai');
    expect(verdict(grade('SENTENCE_BUILD', { singleAnswer: 'ok' }))).toBe(false);
    expect(verdict(grade('SENTENCE_BUILD', { singleAnswer: '' }))).toBe(false);
  });

  test('READING_CLOZE, several blanks', () => {
    expect(verdict(grade('READING_CLOZE', { multiAnswers: ['habite', 'est'] }))).toBe(true);
    expect(verdict(grade('READING_CLOZE', { multiAnswers: ['habite', 'a'] }))).toBe(false);
  });

  test('READING_CLOZE, single blank', () => {
    const item = { ...ITEMS.READING_CLOZE, prompt: 'Léa [___] à Paris.', expectedAnswer: 'habite' };
    expect(verdict(grade('READING_CLOZE', { singleAnswer: 'habite' }, strict, item))).toBe(true);
    expect(verdict(grade('READING_CLOZE', { singleAnswer: 'habites' }, strict, item))).toBe(false);
  });

  test('NUMBER_DICTATION', () => {
    expect(verdict(grade('NUMBER_DICTATION', { singleAnswer: 'dix-huit' }))).toBe(true);
    expect(verdict(grade('NUMBER_DICTATION', { singleAnswer: 'dix huit' }))).toBe(true);
    expect(verdict(grade('NUMBER_DICTATION', { singleAnswer: 'dix-neuf' }))).toBe(false);
  });

  test('OPEN_QA: a reference match is final, anything else needs the AI grader', () => {
    expect(verdict(grade('OPEN_QA', { singleAnswer: 'Vous avez quel âge ?' }))).toBe(true);
    expect(verdict(grade('OPEN_QA', { singleAnswer: 'tu as quel âge ?' }))).toBe(true);
    expect(grade('OPEN_QA', { singleAnswer: 'Quel est votre âge ?' })).toEqual({
      status: 'needs-ai',
      recordedAnswer: 'Quel est votre âge ?',
    });
    // Too short to be worth a request: wrong without asking anyone.
    expect(verdict(grade('OPEN_QA', { singleAnswer: 'ok' }))).toBe(false);
    expect(verdict(grade('OPEN_QA', { singleAnswer: '   ' }))).toBe(false);
  });

  test('only free-text types ever need AI grading', () => {
    for (const type of Object.keys(ITEM_BY_TYPE) as ExerciseType[]) {
      const wrong = grade(type, { singleAnswer: 'réponse inattendue', selectedOdd: 'zzz', matchSelection: 'z' });
      expect(wrong.status === 'needs-ai').toBe(type === 'OPEN_QA' || type === 'SENTENCE_BUILD');
    }
  });
});

describe('accent strictness', () => {
  const item = ITEMS.WORD_TRANSFORM;
  test('strict accents reject a missing accent that is not an alternative', () => {
    const plain = { ...item, acceptableAnswers: undefined };
    expect(verdict(grade('WORD_TRANSFORM', { singleAnswer: 'etudiant' }, strict, plain))).toBe(false);
    expect(verdict(grade('WORD_TRANSFORM', { singleAnswer: 'etudiant' }, lenient, plain))).toBe(true);
  });

  test('slots and choices follow the same preference', () => {
    const multi = { ...ITEMS.READING_CLOZE, expectedAnswer: ['habité', 'été'] };
    expect(verdict(grade('READING_CLOZE', { multiAnswers: ['habite', 'ete'] }, strict, multi))).toBe(false);
    expect(verdict(grade('READING_CLOZE', { multiAnswers: ['habite', 'ete'] }, lenient, multi))).toBe(true);
    expect(verdict(grade('CHOICE_SELECT', { choiceSelections: ['etes', 'je'] }, strict))).toBe(false);
    expect(verdict(grade('CHOICE_SELECT', { choiceSelections: ['etes', 'je'] }, lenient))).toBe(true);
    // ODD_ONE_OUT is an exact pick of a displayed option, so accents never relax it.
    expect(verdict(grade('ODD_ONE_OUT', { selectedOdd: 'ASSISTANTE' }, lenient))).toBe(false);
  });
});

describe('per-item type override', () => {
  test('gradeUnitItem grades by the item type, not the unit type', () => {
    const unit = unitOf('DIALOGUE_ORDER', [{ ...ITEMS.GENDER_CHECK }]);
    const item = { ...ITEMS.GENDER_CHECK, type: 'GENDER_CHECK' as const };
    const result = gradeUnitItem(unit, item, answer(item, { singleAnswer: 'F' }), strict);
    expect(verdict(result)).toBe(true);
  });
});

describe('answer helpers', () => {
  test('counts blanks and choice groups', () => {
    expect(countBlanks('Un [___] et un [___].')).toBe(2);
    expect(countBlanks('Rien')).toBe(0);
    expect(choiceGroups('{a|b} et { c | d }')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  test('a prompt spoken aloud keeps its words and leaves out the markup', () => {
    expect(spokenPrompt('Je ne [___] pas de pain (manger).')).toBe('Je ne pas de pain (manger).');
    expect(spokenPrompt('Le blé pour {moi|me} est {inutile|utile}.')).toBe('Le blé pour est .');
    expect(spokenPrompt('  Tu [___]  polonais  et elle [___] belge. ')).toBe('Tu polonais et elle belge.');
    // Nothing to say: the sheet shows no Listen control rather than an empty clip.
    expect(spokenPrompt('{a|b}')).toBe('');
  });

  test('empty answers are sized to the prompt', () => {
    expect(emptyAnswer(ITEMS.FILL_BLANKS_MULTI).multiAnswers).toEqual(['', '']);
    expect(emptyAnswer(ITEMS.FILL_BLANKS).multiAnswers).toEqual([]);
    expect(emptyAnswer(ITEMS.CHOICE_SELECT).choiceSelections).toEqual(['', '']);
    expect(emptyAnswer(ITEMS.ODD_ONE_OUT).selectedOdd).toBeNull();
    expect(emptyAnswer(ITEMS.WORD_TRANSFORM).dialogueOrder).toEqual([]);
  });

  test('empty answers are not shared between calls', () => {
    const first = emptyAnswer(ITEMS.DIALOGUE_ORDER);
    first.dialogueOrder.reverse();
    expect(emptyAnswer(ITEMS.DIALOGUE_ORDER).dialogueOrder).toEqual(ITEMS.DIALOGUE_ORDER.options);
  });

  test('knows when an item has been touched', () => {
    expect(isAnswerFilled('WORD_TRANSFORM', emptyAnswer(ITEMS.WORD_TRANSFORM))).toBe(false);
    expect(isAnswerFilled('WORD_TRANSFORM', answer(ITEMS.WORD_TRANSFORM, { singleAnswer: ' x ' }))).toBe(true);
    expect(isAnswerFilled('WORD_TRANSFORM', answer(ITEMS.WORD_TRANSFORM, { singleAnswer: '  ' }))).toBe(false);
    expect(isAnswerFilled('FILL_BLANKS', answer(ITEMS.FILL_BLANKS_MULTI, { multiAnswers: ['', 'est'] }))).toBe(true);
    expect(isAnswerFilled('ODD_ONE_OUT', answer(ITEMS.ODD_ONE_OUT, { selectedOdd: 'x' }))).toBe(true);
    expect(isAnswerFilled('MATCH_PAIRS', answer(ITEMS.MATCH_PAIRS, { matchSelection: 'a' }))).toBe(true);
    expect(isAnswerFilled('CHOICE_SELECT', answer(ITEMS.CHOICE_SELECT, { choiceSelections: ['', 'je'] }))).toBe(true);
    expect(isAnswerFilled('DIALOGUE_ORDER', emptyAnswer(ITEMS.DIALOGUE_ORDER))).toBe(true);
  });

  test('writes answers as one line of text', () => {
    const dialogue = answer(ITEMS.DIALOGUE_ORDER, { dialogueOrder: ['c – Qui ?', 'a – Oui.'] });
    expect(recordedAnswerText('DIALOGUE_ORDER', ITEMS.DIALOGUE_ORDER, dialogue)).toBe('c – Qui ? / a – Oui.');
    expect(recordedAnswerText('ODD_ONE_OUT', ITEMS.ODD_ONE_OUT, emptyAnswer(ITEMS.ODD_ONE_OUT))).toBe('');
    expect(
      recordedAnswerText('MATCH_PAIRS', ITEMS.MATCH_PAIRS, answer(ITEMS.MATCH_PAIRS, { matchSelection: 'b' })),
    ).toBe('b');
    expect(
      recordedAnswerText(
        'CHOICE_SELECT',
        ITEMS.CHOICE_SELECT,
        answer(ITEMS.CHOICE_SELECT, { choiceSelections: ['êtes', 'je'] }),
      ),
    ).toBe('êtes / je');
    expect(
      recordedAnswerText(
        'FILL_BLANKS',
        ITEMS.FILL_BLANKS_MULTI,
        answer(ITEMS.FILL_BLANKS_MULTI, { multiAnswers: ['es', 'est'] }),
      ),
    ).toBe('es / est');
    expect(expectedAnswerText(ITEMS.FILL_BLANKS_MULTI)).toBe('es / est');
    expect(expectedAnswerText(ITEMS.FILL_BLANKS)).toBe('suis');
  });
});

describe('attempts', () => {
  test('carry their own prompt and answer text', () => {
    const unit = unitOf('FILL_BLANKS', [ITEMS.FILL_BLANKS_MULTI]);
    const result = grade('FILL_BLANKS', { multiAnswers: ['es', 'sont'] }, strict, ITEMS.FILL_BLANKS_MULTI);
    if (result.status !== 'graded') throw new Error('expected a final verdict');
    expect(
      buildAttempt(unit, ITEMS.FILL_BLANKS_MULTI, result.recordedAnswer, result.correct, { id: 'a1', timestamp: 7 }),
    ).toEqual({
      id: 'a1',
      unitId: unit.id,
      itemId: 'fb-2',
      materialId: 'material-1',
      grammarTag: 'present',
      prompt: 'Tu [___] polonais et elle [___] belge.',
      userAnswer: 'es / sont',
      expectedAnswer: 'es / est',
      correct: false,
      timestamp: 7,
    });
  });

  test('item state ids join unit and item', () => {
    expect(itemStateId('unit-1', 'item-2')).toBe('unit-1:item-2');
  });
});
