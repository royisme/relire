/**
 * Exercise catalogue fixture: one generated set of units about the sample
 * article "Le Petit Prince et le Secret du Renard", covering all 11 exercise
 * types, a right and a wrong answer for every item, and one mock AI answer per
 * exercise task. E2e specs and unit tests share it, so a change here changes
 * both. Owns test data only; the schemas, grading and answerability live in src/.
 */
import { SAMPLE_ARTICLES } from '../../src/data/sampleArticles';
import { emptyAnswer } from '../../src/services/exercises/answer';
import type { Explanation, GeneratedExercises, GeneratedItem, Hint, OpenGrade } from '../../src/types/exerciseAi';
import type { ExerciseAnswer } from '../../src/types/exercises';

const petitPrince = SAMPLE_ARTICLES.find((article) => article.title === 'Le Petit Prince et le Secret du Renard');
if (!petitPrince) throw new Error('The sample article "Le Petit Prince et le Secret du Renard" is missing');

/** The article the catalogue is written about: the sample's exact content. */
export const CATALOG_ARTICLE: string = petitPrince.content;

/**
 * Every item carries an `articleQuote` copied from CATALOG_ARTICLE, except the
 * dictation item nd-2, which is a numeral lesson rather than a passage item.
 */
export const CATALOG_EXERCISES: GeneratedExercises = {
  units: [
    {
      id: 'unit-word-transform',
      section: 'VOCABULAIRE',
      unitNumber: 1,
      title: 'Le féminin des adjectifs',
      instruction: "Donnez la forme féminine de l'adjectif.",
      type: 'WORD_TRANSFORM',
      items: [
        {
          id: 'wt-1',
          itemNumber: 1,
          prompt: 'intrigué',
          expectedAnswer: 'intriguée',
          grammarTag: 'adjective-agreement',
          articleQuote: 'Le renard parut très intrigué',
        },
      ],
      grammarTags: ['adjective-agreement'],
    },
    {
      id: 'unit-fill-blanks',
      section: 'CONJUGAISON',
      unitNumber: 2,
      title: 'Conjuguer au présent et au futur',
      instruction: 'Conjuguez le verbe entre parenthèses.',
      type: 'FILL_BLANKS',
      items: [
        {
          id: 'fb-1',
          itemNumber: 1,
          prompt: 'Je ne [___] pas de pain (manger).',
          expectedAnswer: 'mange',
          grammarTag: 'present',
          articleQuote: 'Je ne mange pas de pain',
        },
        {
          id: 'fb-2',
          itemNumber: 2,
          prompt: "Si tu m'[___] (apprivoiser), nous [___] (avoir) besoin l'un de l'autre.",
          expectedAnswer: ['apprivoises', 'aurons'],
          grammarTag: 'hypothesis-si',
          articleQuote: "si tu m'apprivoises, nous aurons besoin l'un de l'autre",
        },
      ],
      grammarTags: ['present', 'hypothesis-si'],
    },
    {
      id: 'unit-gender-check',
      section: 'GRAMMAIRE',
      unitNumber: 3,
      title: 'Le genre des noms',
      instruction: 'Indiquez le genre du mot.',
      type: 'GENDER_CHECK',
      items: [
        {
          id: 'gc-1',
          itemNumber: 1,
          prompt: 'Dans « ta rose », le mot « rose » est-il masculin (M) ou féminin (F) ?',
          expectedAnswer: 'F',
          grammarTag: 'gender-number',
          articleQuote: 'pour ta rose qui fait ta rose si importante',
        },
        {
          id: 'gc-2',
          itemNumber: 2,
          prompt: 'Le mot « fleur » est-il masculin ou féminin ?',
          expectedAnswer: 'F',
          options: ['M', 'F'],
          grammarTag: 'gender-number',
          articleQuote: 'Il y a une fleur',
        },
      ],
      grammarTags: ['gender-number'],
    },
    {
      id: 'unit-odd-one-out',
      section: 'VOCABULAIRE',
      unitNumber: 4,
      title: 'Le vocabulaire du texte',
      instruction: 'Trouvez le mot qui ne va pas avec les autres.',
      type: 'ODD_ONE_OUT',
      items: [
        {
          id: 'oo-1',
          itemNumber: 1,
          prompt: "Quel mot n'est pas une plante ?",
          options: ['blé', 'fleur', 'rose', 'renard'],
          expectedAnswer: 'renard',
          grammarTag: 'vocabulary-usage',
          articleQuote: 'Le blé pour moi est inutile',
        },
      ],
      grammarTags: ['vocabulary-usage'],
    },
    {
      id: 'unit-match-pairs',
      section: 'COMPRENDRE',
      unitNumber: 5,
      title: 'Associer la question et la réponse',
      instruction: 'Associez la question à la bonne réponse.',
      type: 'MATCH_PAIRS',
      items: [
        {
          id: 'mp-1',
          itemNumber: 1,
          prompt: 'Que dit le renard de sa vie ?',
          options: ['a – Elle est très intéressante.', 'b – Ma vie est monotone.', 'c – Elle est pleine de voyages.'],
          expectedAnswer: 'b',
          grammarTag: 'reading-comprehension',
          articleQuote: 'Ma vie est monotone',
        },
      ],
      grammarTags: ['reading-comprehension'],
    },
    {
      id: 'unit-dialogue-order',
      section: 'COMPRENDRE',
      unitNumber: 6,
      title: 'Remettre le dialogue dans l’ordre',
      instruction: 'Remettez les répliques dans le bon ordre.',
      type: 'DIALOGUE_ORDER',
      items: [
        {
          id: 'do-1',
          itemNumber: 1,
          prompt: 'Le dialogue entre le renard et le petit prince.',
          options: [
            'a – Il y a des chasseurs, sur cette planète-là ?',
            'b – Oui.',
            'c – Sur une autre planète ?',
            'd – Non.',
          ],
          expectedAnswer: ['c', 'b', 'a', 'd'],
          grammarTag: 'reading-comprehension',
          articleQuote: 'Sur une autre planète ? … Il y a des chasseurs, sur cette planète-là ?',
        },
      ],
      grammarTags: ['reading-comprehension'],
    },
    {
      id: 'unit-choice-select',
      section: 'GRAMMAIRE',
      unitNumber: 7,
      title: 'Les pronoms personnels',
      instruction: 'Choisissez la forme qui convient.',
      type: 'CHOICE_SELECT',
      items: [
        {
          id: 'cs-1',
          itemNumber: 1,
          prompt: 'Le blé pour {moi|toi} est inutile. Les champs de blé ne {me|te} rappellent rien.',
          expectedAnswer: ['moi', 'me'],
          grammarTag: 'subject-object-pronouns',
          articleQuote: 'Le blé pour moi est inutile. Les champs de blé ne me rappellent rien',
        },
      ],
      grammarTags: ['subject-object-pronouns'],
    },
    {
      id: 'unit-sentence-build',
      section: 'EXTRA',
      unitNumber: 8,
      title: 'Reformuler une idée',
      instruction: 'Écrivez une phrase complète en français.',
      type: 'SENTENCE_BUILD',
      items: [
        {
          id: 'sb-1',
          itemNumber: 1,
          prompt: 'Le renard parle de lui. Dites que le blé est inutile pour lui.',
          expectedAnswer: 'Le blé pour moi est inutile.',
          // A second correct wording: the fox's own sentence is not the only natural answer.
          acceptableAnswers: ['Le blé est inutile pour moi.'],
          grammarTag: 'word-order',
          articleQuote: 'Le blé pour moi est inutile.',
        },
      ],
      grammarTags: ['word-order'],
    },
    {
      id: 'unit-reading-cloze',
      section: 'COMPRENDRE',
      unitNumber: 9,
      title: 'Compléter le passage',
      instruction: 'Complétez le texte avec le verbe qui convient.',
      type: 'READING_CLOZE',
      readingPassage: {
        title: 'Le renard et les poules',
        content:
          "Ma vie est monotone. Je chasse les poules, les hommes me chassent. Toutes les poules se ressemblent, et tous les hommes se ressemblent. Je m'y ennuie donc un peu.",
      },
      items: [
        {
          id: 'rc-1',
          itemNumber: 1,
          prompt: 'Le renard dit : « Je [___] les poules, les hommes me [___]. »',
          expectedAnswer: ['chasse', 'chassent'],
          grammarTag: 'reading-comprehension',
          articleQuote: 'Je chasse les poules, les hommes me chassent',
        },
        {
          id: 'rc-2',
          itemNumber: 2,
          prompt: "Je m'y [___] donc un peu.",
          expectedAnswer: 'ennuie',
          grammarTag: 'pronominal-verbs',
          articleQuote: "Je m'y ennuie donc un peu",
        },
      ],
      grammarTags: ['reading-comprehension', 'pronominal-verbs'],
    },
    {
      id: 'unit-number-dictation',
      section: 'VOCABULAIRE',
      unitNumber: 10,
      title: 'Les nombres',
      instruction: 'Écoutez et écrivez le nombre en lettres.',
      type: 'NUMBER_DICTATION',
      items: [
        {
          id: 'nd-1',
          itemNumber: 1,
          prompt: 'Écoutez et écrivez le nombre en lettres.',
          audioText: 'cent mille',
          expectedAnswer: 'cent mille',
          grammarTag: 'numbers-time',
          articleQuote: 'semblable à cent mille petits garçons',
        },
        {
          // Not from the article: a hyphenated numeral, to check the spelling with hyphens.
          id: 'nd-2',
          itemNumber: 2,
          prompt: 'Écoutez et écrivez le nombre en lettres.',
          audioText: 'dix-huit',
          expectedAnswer: 'dix-huit',
          acceptableAnswers: ['dix huit'],
          grammarTag: 'numbers-time',
        },
      ],
      grammarTags: ['numbers-time'],
    },
    {
      id: 'unit-open-qa',
      section: 'COMPRENDRE',
      unitNumber: 11,
      title: 'Questions sur le texte',
      instruction: 'Répondez à la question.',
      type: 'OPEN_QA',
      items: [
        {
          id: 'qa-1',
          itemNumber: 1,
          prompt: 'Quel est le secret du renard ?',
          expectedAnswer: "On ne voit bien qu'avec le cœur.",
          acceptableAnswers: ["L'essentiel est invisible pour les yeux."],
          grammarTag: 'reading-comprehension',
          articleQuote: "on ne voit bien qu'avec le cœur",
        },
      ],
      grammarTags: ['reading-comprehension'],
    },
  ],
};

/** The catalogue item with this id; throws so a typo in the answers fails loudly. */
function itemOf(id: string): GeneratedItem {
  for (const unit of CATALOG_EXERCISES.units) for (const item of unit.items) if (item.id === id) return item;
  throw new Error(`Unknown catalogue item: ${id}`);
}

export interface CatalogAnswerPair {
  right: ExerciseAnswer;
  wrong: ExerciseAnswer;
}

/**
 * Starts from `emptyAnswer(item)`, so every field is present, then fills the
 * field the item's type reads. Any field not given keeps its empty value.
 */
function answerPair(
  id: string,
  right: Partial<ExerciseAnswer>,
  wrong: Partial<ExerciseAnswer>,
): [string, CatalogAnswerPair] {
  const base = emptyAnswer(itemOf(id));
  return [id, { right: { ...base, ...right }, wrong: { ...base, ...wrong } }];
}

/**
 * Answers by item id. `right` grades correct and `wrong` grades incorrect under
 * `gradeItem`. Free-text items (OPEN_QA, SENTENCE_BUILD) use an exact reference
 * for `right` and an answer under three characters for `wrong`, so neither needs AI.
 */
export const CATALOG_ANSWERS: Record<string, CatalogAnswerPair> = Object.fromEntries([
  answerPair('wt-1', { singleAnswer: 'intriguée' }, { singleAnswer: 'intrigué' }),
  answerPair('fb-1', { singleAnswer: 'mange' }, { singleAnswer: 'mangez' }),
  answerPair('fb-2', { multiAnswers: ['apprivoises', 'aurons'] }, { multiAnswers: ['apprivoise', 'aurons'] }),
  answerPair('gc-1', { singleAnswer: 'F' }, { singleAnswer: 'M' }),
  answerPair('gc-2', { singleAnswer: 'F' }, { singleAnswer: 'M' }),
  answerPair('oo-1', { selectedOdd: 'renard' }, { selectedOdd: 'blé' }),
  answerPair('mp-1', { matchSelection: 'b' }, { matchSelection: 'c' }),
  // The printed order is the empty answer, and it is not the right order, so `wrong` is left empty.
  answerPair(
    'do-1',
    {
      dialogueOrder: [
        'c – Sur une autre planète ?',
        'b – Oui.',
        'a – Il y a des chasseurs, sur cette planète-là ?',
        'd – Non.',
      ],
    },
    {},
  ),
  answerPair('cs-1', { choiceSelections: ['moi', 'me'] }, { choiceSelections: ['moi', 'te'] }),
  answerPair('sb-1', { singleAnswer: 'Le blé pour moi est inutile.' }, { singleAnswer: 'Ok' }),
  answerPair('rc-1', { multiAnswers: ['chasse', 'chassent'] }, { multiAnswers: ['chasse', 'chasse'] }),
  answerPair('rc-2', { singleAnswer: 'ennuie' }, { singleAnswer: 'ennuies' }),
  answerPair('nd-1', { singleAnswer: 'cent mille' }, { singleAnswer: 'cent mile' }),
  answerPair('nd-2', { singleAnswer: 'dix-huit' }, { singleAnswer: 'dix-neuf' }),
  answerPair('qa-1', { singleAnswer: "On ne voit bien qu'avec le cœur." }, { singleAnswer: 'Ah' }),
]);

/** Mock hint for fb-1 (the learner has not answered yet). */
export const CATALOG_HINT: Hint = {
  hint: "Look at the subject 'je' and the ending a regular -er verb takes with it.",
  grammarRule: "Regular -er verbs such as manger take -e with 'je' in the present tense.",
  clueWord: 'Je',
};

/** Mock explanation for fb-1 after the learner wrote "mangez". */
export const CATALOG_EXPLANATION: Explanation = {
  summary: "With 'je', an -er verb ends in -e, not -ez.",
  details:
    'Manger is a regular -er verb. Its stem is mang-, and the je form adds -e, giving je mange. The -ez ending belongs to vous.',
  tip: 'Check the subject first, then choose the ending.',
};

/** Mock open-answer grade for qa-1 with a paraphrased answer. No numeric score. */
export const CATALOG_OPEN_GRADE: OpenGrade = {
  isCorrect: true,
  feedback: "Accepted. The answer gives the fox's secret with the same meaning as the article, in other words.",
  correctedVersion: "On ne voit bien qu'avec le cœur.",
};
