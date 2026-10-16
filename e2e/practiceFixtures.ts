/**
 * Default model answers for the exercise tasks (exercises from an article, hint,
 * explanation, open-answer grade). The units are written from the sample
 * article "Le Petit Prince et le Secret du Renard": every `articleQuote` really
 * occurs in it, so the answerability check keeps them all. The full 11-type
 * catalogue in tests/fixtures/exerciseCatalog.ts is meant to replace
 * `sampleExercises`; nothing else in the e2e suite reads its contents.
 */

const unit = (
  id: string,
  unitNumber: number,
  type: string,
  title: string,
  instruction: string,
  items: Record<string, unknown>[],
) => ({
  id,
  section: 'COMPRENDRE',
  unitNumber,
  title,
  instruction,
  type,
  grammarTags: [...new Set(items.map((item) => item.grammarTag))],
  items,
});

export const sampleExercises = {
  units: [
    unit('u1', 1, 'FILL_BLANKS', 'Les mots du renard', 'Type the missing word in each blank.', [
      {
        id: 'fb1',
        itemNumber: 1,
        prompt: "Je ne [___] pour toi qu'un renard semblable à cent mille renards.",
        expectedAnswer: 'suis',
        explanation: 'Être with je: je suis.',
        grammarTag: 'present',
        articleQuote: "Je ne suis pour toi qu'un renard semblable à cent mille renards",
      },
      {
        id: 'fb2',
        itemNumber: 2,
        prompt: "L'essentiel [___] invisible [___] les yeux.",
        expectedAnswer: ['est', 'pour'],
        grammarTag: 'present',
        articleQuote: "L'essentiel est invisible pour les yeux",
      },
      {
        id: 'fb3',
        itemNumber: 3,
        prompt: "On ne [___] bien qu'avec le cœur.",
        expectedAnswer: 'voit',
        grammarTag: 'present',
        articleQuote: "on ne voit bien qu'avec le cœur",
      },
    ]),
    unit('u2', 2, 'CHOICE_SELECT', 'Choisir la bonne forme', 'Choose the correct option in each sentence.', [
      {
        id: 'cs1',
        itemNumber: 1,
        prompt: 'Le petit prince {commença|commençait} à comprendre.',
        expectedAnswer: 'commença',
        grammarTag: 'tense-choice-past',
        articleQuote: 'Le petit prince commença à comprendre',
      },
      {
        id: 'cs2',
        itemNumber: 2,
        prompt: "Si tu m'apprivoises, nous {aurons|avons} besoin {l'un|l'une} de l'autre.",
        expectedAnswer: ['aurons', "l'un"],
        grammarTag: 'future',
        articleQuote: "si tu m'apprivoises, nous aurons besoin l'un de l'autre",
      },
    ]),
    unit('u3', 3, 'WORD_TRANSFORM', 'Accorder le mot', 'Change each word as asked.', [
      {
        id: 'wt1',
        itemNumber: 1,
        prompt: 'ensoleillée',
        secondaryPrompt: 'masculin',
        expectedAnswer: 'ensoleillé',
        grammarTag: 'adjective-agreement',
        articleQuote: 'ma vie sera comme ensoleillée',
      },
      {
        id: 'wt2',
        itemNumber: 2,
        prompt: 'doré',
        secondaryPrompt: 'féminin',
        expectedAnswer: 'dorée',
        grammarTag: 'gender-number',
        articleQuote: 'Le blé, qui est doré',
      },
    ]),
    unit('u4', 4, 'OPEN_QA', 'Questions ouvertes', 'Answer in a full French sentence.', [
      {
        id: 'qa1',
        itemNumber: 1,
        prompt: "Que veut le renard quand il demande au petit prince de l'apprivoiser ?",
        expectedAnswer: 'Il veut créer des liens avec le petit prince.',
        grammarTag: 'reading-comprehension',
        articleQuote: 'Si tu veux un ami, apprivoise-moi',
      },
    ]),
  ],
};

export const sampleHint = {
  hint: 'Look at the **subject** of the sentence and the verb that goes with it.',
  grammarRule: '`je` + `suis`',
  clueWord: 's',
};

export const sampleExplanation = {
  summary: 'The verb **être** is irregular.',
  details: 'With **je** the form is `suis`.\nCheck the subject first, then pick the form.',
  tip: 'je suis, tu es, il est',
};

/** The open-answer verdict: words only, never a score. */
export const sampleGrade = {
  isCorrect: false,
  feedback: 'The idea is right, but the answer is not a full sentence with **il veut**.',
  correctedVersion: 'Il veut créer des liens avec le petit prince.',
};
