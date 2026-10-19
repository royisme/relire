/**
 * The word sheet's pack-backed sections and the loader behind them, as one module for one dynamic import, so
 * the sheet (useWordSheetPack) can wait for all of it before drawing anything. Owns that seam only; it has no
 * logic of its own and none of it is in the main bundle.
 */
export { loadedGrammarPack, loadGrammarPack } from '../../services/grammarPack/load';
export { VerbForms } from './VerbForms';
export { WordConjugation } from './WordConjugation';
