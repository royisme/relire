/**
 * One valid sample item per exercise type, adapted from FrenchLab's seeded
 * curriculum (lessons 1-3) and re-tagged with the A1-C1 taxonomy.
 */
import type { ExerciseItem, ExerciseType, ExerciseUnit } from '../../src/types/exercises';

export const ITEMS = {
  WORD_TRANSFORM: {
    id: 'wt-1',
    itemNumber: 1,
    prompt: 'étudiante',
    expectedAnswer: 'étudiant',
    acceptableAnswers: ['etudiant'],
    explanation: 'Drop the feminine -e.',
    grammarTag: 'gender-number',
  },
  FILL_BLANKS: {
    id: 'fb-1',
    itemNumber: 1,
    prompt: 'Je [___] française.',
    expectedAnswer: 'suis',
    grammarTag: 'present',
  },
  FILL_BLANKS_MULTI: {
    id: 'fb-2',
    itemNumber: 2,
    prompt: 'Tu [___] polonais et elle [___] belge.',
    expectedAnswer: ['es', 'est'],
    grammarTag: 'present',
  },
  GENDER_CHECK: {
    id: 'gc-1',
    itemNumber: 1,
    prompt: 'Je suis polonaise.',
    expectedAnswer: 'F',
    options: ['M', 'F'],
    grammarTag: 'gender-number',
  },
  ODD_ONE_OUT: {
    id: 'oo-1',
    itemNumber: 1,
    prompt: 'Choisissez le mot différent.',
    options: ['autrichienne', 'polonaise', 'japonaise', 'assistante'],
    expectedAnswer: 'assistante',
    grammarTag: 'vocabulary-usage',
  },
  MATCH_PAIRS: {
    id: 'mp-1',
    itemNumber: 1,
    prompt: '1 – Il est français ?',
    options: ["a – C'est Audrey Tautou.", 'b – Non, il est italien.', 'c – Oui, je suis française.'],
    expectedAnswer: 'b',
    grammarTag: 'reading-comprehension',
  },
  DIALOGUE_ORDER: {
    id: 'do-1',
    itemNumber: 1,
    prompt: 'Remettez le dialogue dans l’ordre.',
    options: ['a – Elle est française ?', "b – C'est Julie Dominique.", 'c – Qui est-ce ?', 'd – Non, elle est belge.'],
    expectedAnswer: ['c', 'b', 'a', 'd'],
    grammarTag: 'reading-comprehension',
  },
  CHOICE_SELECT: {
    id: 'cs-1',
    itemNumber: 1,
    prompt: "– Bonjour. Vous {êtes|s'appelle} madame Latour ? – Oui, {c'est|je} m'appelle Pauline.",
    expectedAnswer: ['êtes', 'je'],
    grammarTag: 'subject-object-pronouns',
  },
  SENTENCE_BUILD: {
    id: 'sb-1',
    itemNumber: 1,
    prompt: 'Autriche',
    expectedAnswer: "C'est une Autrichienne. Son mari est autrichien.",
    acceptableAnswers: ["C'est une Autrichienne. Son mari est autrichien."],
    grammarTag: 'adjective-agreement',
  },
  READING_CLOZE: {
    id: 'rc-1',
    itemNumber: 1,
    prompt: 'Léa [___] à Paris. Elle [___] étudiante.',
    expectedAnswer: ['habite', 'est'],
    grammarTag: 'reading-comprehension',
  },
  NUMBER_DICTATION: {
    id: 'nd-1',
    itemNumber: 'a',
    prompt: '18',
    audioText: 'dix-huit',
    expectedAnswer: 'dix-huit',
    acceptableAnswers: ['dix huit'],
    grammarTag: 'numbers-time',
  },
  OPEN_QA: {
    id: 'qa-1',
    itemNumber: 1,
    prompt: "Comment demande-t-on l'âge ?",
    expectedAnswer: 'Vous avez quel âge ?',
    acceptableAnswers: ['Tu as quel âge ?', 'Quel âge avez-vous ?'],
    grammarTag: 'questions',
  },
} satisfies Record<string, ExerciseItem>;

export const ITEM_BY_TYPE: Record<ExerciseType, ExerciseItem> = {
  WORD_TRANSFORM: ITEMS.WORD_TRANSFORM,
  FILL_BLANKS: ITEMS.FILL_BLANKS,
  GENDER_CHECK: ITEMS.GENDER_CHECK,
  ODD_ONE_OUT: ITEMS.ODD_ONE_OUT,
  MATCH_PAIRS: ITEMS.MATCH_PAIRS,
  DIALOGUE_ORDER: ITEMS.DIALOGUE_ORDER,
  CHOICE_SELECT: ITEMS.CHOICE_SELECT,
  SENTENCE_BUILD: ITEMS.SENTENCE_BUILD,
  READING_CLOZE: ITEMS.READING_CLOZE,
  NUMBER_DICTATION: ITEMS.NUMBER_DICTATION,
  OPEN_QA: ITEMS.OPEN_QA,
};

/** A valid unit of the given type holding the given items (default: that type's sample). */
export function unitOf(type: ExerciseType, items: ExerciseItem[] = [ITEM_BY_TYPE[type]]): ExerciseUnit {
  return {
    id: `unit-${type.toLowerCase()}`,
    setId: 'set-1',
    level: 'A1',
    createdAt: 1_700_000_000_000,
    learningArea: 'grammar',
    section: 'GRAMMAIRE',
    unitNumber: 1,
    title: 'Exercice',
    instruction: 'Complete the exercise.',
    type,
    items,
    grammarTags: ['present'],
  };
}
