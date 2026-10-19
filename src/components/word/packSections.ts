/**
 * The word sheet's pack-backed sections, the loader behind them and the lexicon's verb lines, as one module for one dynamic import, so
 * the sheet (useWordSheetPack) can wait for all of it before drawing anything. Owns that seam only; it has no
 * logic of its own and none of it is in the main bundle.
 */
export { loadedGrammarPack, loadGrammarPack } from '../../services/grammarPack/load';
export { lexiconVerbLines } from '../../services/lexicon/verbs';
export { VerbForms } from './VerbForms';
export { WordConjugation } from './WordConjugation';
