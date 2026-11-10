/** Invented TEST homograph selections, including deliberately nonsensical but attested strings. */
import type { ReaderGlossaryEntry } from '../../src/types/gradedReader';
import { gateFixture, refreshPolicy, setStage } from './gradedReaderGates';

export function ambiguityFixture(form: string, pos: ReaderGlossaryEntry['pos'], lemma = form) {
  const { draft, context } = gateFixture();
  const entry = draft.body.glossary.find((item) => item.id === 'petit-size')!;
  entry.lemma = lemma;
  entry.pos = pos;
  entry.forms = [form];
  entry.sense = pos === 'function' ? 'determiner' : 'test-meaning';
  if (pos === 'noun') entry.gender = 'masculine';
  for (const sentence of draft.body.sentences) sentence.fr = sentence.fr.replaceAll('petit', form);
  const typed = draft.body.learning.checkpoints[0].questions[1];
  typed.question.expectedAnswer = form;
  typed.evidence.quote = typed.evidence.quote.replaceAll('petit', form);
  context.candidates.entries = structuredClone(
    draft.body.glossary.filter((item) => item.pos !== 'function').map(({ id: _id, ...item }) => item),
  );
  if (pos === 'function')
    context.core.push({ headword: lemma, pos, sense: entry.sense, forms: [form], gloss: structuredClone(entry.gloss) });
  setStage(draft, context, 5);
  refreshPolicy(draft, context);
  return { draft, context };
}
