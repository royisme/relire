/**
 * Drafted by the worker from knowledge. UNVERIFIED until the owner confirms.
 * Checks the generator only, not the forms.
 *
 * Golden tables of the three LC1 verbs conjugated with être (venir, partir,
 * sortir), typed from knowledge of French conjugation before any engine output
 * for these verbs was read. Their compound tenses carry the subject-agreement
 * variants (vous lists plural masculine, plural feminine, then the polite
 * singular pair, the order of the control goldens). Cell literals and the
 * shared `golden` builder are defined in grammarPackGoldenLc1.ts.
 */
import { golden, type GoldenVerb } from './grammarPackGoldenLc1';

export const GOLDEN_LC1_ETRE: Record<string, GoldenVerb> = {
  venir: golden('venir|venir|etre|irregular|venant|venu|venue|venus|venues', {
    present: 'je|viens; tu|viens; il/elle|vient; nous|venons; vous|venez; ils/elles|viennent',
    passeCompose:
      'je|suis venu|suis venue; tu|es venu|es venue; il/elle|est venu|est venue; ' +
      'nous|sommes venus|sommes venues; vous|êtes venus|êtes venues|êtes venu|êtes venue; ' +
      'ils/elles|sont venus|sont venues',
    imparfait: 'je|venais; tu|venais; il/elle|venait; nous|venions; vous|veniez; ils/elles|venaient',
    plusQueParfait:
      'j’|étais venu|étais venue; tu|étais venu|étais venue; il/elle|était venu|était venue; ' +
      'nous|étions venus|étions venues; vous|étiez venus|étiez venues|étiez venu|étiez venue; ' +
      'ils/elles|étaient venus|étaient venues',
    futur: 'je|viendrai; tu|viendras; il/elle|viendra; nous|viendrons; vous|viendrez; ils/elles|viendront',
    futurAnterieur:
      'je|serai venu|serai venue; tu|seras venu|seras venue; il/elle|sera venu|sera venue; ' +
      'nous|serons venus|serons venues; vous|serez venus|serez venues|serez venu|serez venue; ' +
      'ils/elles|seront venus|seront venues',
    conditionnel:
      'je|viendrais; tu|viendrais; il/elle|viendrait; nous|viendrions; vous|viendriez; ils/elles|viendraient',
    conditionnelPasse:
      'je|serais venu|serais venue; tu|serais venu|serais venue; il/elle|serait venu|serait venue; ' +
      'nous|serions venus|serions venues; vous|seriez venus|seriez venues|seriez venu|seriez venue; ' +
      'ils/elles|seraient venus|seraient venues',
    subjonctif:
      'que je|vienne; que tu|viennes; qu’il/elle|vienne; que nous|venions; que vous|veniez; qu’ils/elles|viennent',
    subjonctifPasse:
      'que je|sois venu|sois venue; que tu|sois venu|sois venue; qu’il/elle|soit venu|soit venue; ' +
      'que nous|soyons venus|soyons venues; que vous|soyez venus|soyez venues|soyez venu|soyez venue; ' +
      'qu’ils/elles|soient venus|soient venues',
    imperatif: '|viens; |venons; |venez',
  }),
  partir: golden('partir|partir|etre|ir-sortir|partant|parti|partie|partis|parties', {
    present: 'je|pars; tu|pars; il/elle|part; nous|partons; vous|partez; ils/elles|partent',
    passeCompose:
      'je|suis parti|suis partie; tu|es parti|es partie; il/elle|est parti|est partie; ' +
      'nous|sommes partis|sommes parties; vous|êtes partis|êtes parties|êtes parti|êtes partie; ' +
      'ils/elles|sont partis|sont parties',
    imparfait: 'je|partais; tu|partais; il/elle|partait; nous|partions; vous|partiez; ils/elles|partaient',
    plusQueParfait:
      'j’|étais parti|étais partie; tu|étais parti|étais partie; il/elle|était parti|était partie; ' +
      'nous|étions partis|étions parties; vous|étiez partis|étiez parties|étiez parti|étiez partie; ' +
      'ils/elles|étaient partis|étaient parties',
    futur: 'je|partirai; tu|partiras; il/elle|partira; nous|partirons; vous|partirez; ils/elles|partiront',
    futurAnterieur:
      'je|serai parti|serai partie; tu|seras parti|seras partie; il/elle|sera parti|sera partie; ' +
      'nous|serons partis|serons parties; vous|serez partis|serez parties|serez parti|serez partie; ' +
      'ils/elles|seront partis|seront parties',
    conditionnel:
      'je|partirais; tu|partirais; il/elle|partirait; nous|partirions; vous|partiriez; ils/elles|partiraient',
    conditionnelPasse:
      'je|serais parti|serais partie; tu|serais parti|serais partie; il/elle|serait parti|serait partie; ' +
      'nous|serions partis|serions parties; vous|seriez partis|seriez parties|seriez parti|seriez partie; ' +
      'ils/elles|seraient partis|seraient parties',
    subjonctif:
      'que je|parte; que tu|partes; qu’il/elle|parte; que nous|partions; que vous|partiez; qu’ils/elles|partent',
    subjonctifPasse:
      'que je|sois parti|sois partie; que tu|sois parti|sois partie; qu’il/elle|soit parti|soit partie; ' +
      'que nous|soyons partis|soyons parties; que vous|soyez partis|soyez parties|soyez parti|soyez partie; ' +
      'qu’ils/elles|soient partis|soient parties',
    imperatif: '|pars; |partons; |partez',
  }),
  sortir: golden('sortir|sortir|etre|ir-sortir|sortant|sorti|sortie|sortis|sorties', {
    present: 'je|sors; tu|sors; il/elle|sort; nous|sortons; vous|sortez; ils/elles|sortent',
    passeCompose:
      'je|suis sorti|suis sortie; tu|es sorti|es sortie; il/elle|est sorti|est sortie; ' +
      'nous|sommes sortis|sommes sorties; vous|êtes sortis|êtes sorties|êtes sorti|êtes sortie; ' +
      'ils/elles|sont sortis|sont sorties',
    imparfait: 'je|sortais; tu|sortais; il/elle|sortait; nous|sortions; vous|sortiez; ils/elles|sortaient',
    plusQueParfait:
      'j’|étais sorti|étais sortie; tu|étais sorti|étais sortie; il/elle|était sorti|était sortie; ' +
      'nous|étions sortis|étions sorties; vous|étiez sortis|étiez sorties|étiez sorti|étiez sortie; ' +
      'ils/elles|étaient sortis|étaient sorties',
    futur: 'je|sortirai; tu|sortiras; il/elle|sortira; nous|sortirons; vous|sortirez; ils/elles|sortiront',
    futurAnterieur:
      'je|serai sorti|serai sortie; tu|seras sorti|seras sortie; il/elle|sera sorti|sera sortie; ' +
      'nous|serons sortis|serons sorties; vous|serez sortis|serez sorties|serez sorti|serez sortie; ' +
      'ils/elles|seront sortis|seront sorties',
    conditionnel:
      'je|sortirais; tu|sortirais; il/elle|sortirait; nous|sortirions; vous|sortiriez; ils/elles|sortiraient',
    conditionnelPasse:
      'je|serais sorti|serais sortie; tu|serais sorti|serais sortie; il/elle|serait sorti|serait sortie; ' +
      'nous|serions sortis|serions sorties; vous|seriez sortis|seriez sorties|seriez sorti|seriez sortie; ' +
      'ils/elles|seraient sortis|seraient sorties',
    subjonctif:
      'que je|sorte; que tu|sortes; qu’il/elle|sorte; que nous|sortions; que vous|sortiez; qu’ils/elles|sortent',
    subjonctifPasse:
      'que je|sois sorti|sois sortie; que tu|sois sorti|sois sortie; qu’il/elle|soit sorti|soit sortie; ' +
      'que nous|soyons sortis|soyons sorties; que vous|soyez sortis|soyez sorties|soyez sorti|soyez sortie; ' +
      'qu’ils/elles|soient sortis|soient sorties',
    imperatif: '|sors; |sortons; |sortez',
  }),
};
