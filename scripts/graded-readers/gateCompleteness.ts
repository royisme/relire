/** Owns G5 atom caps, bounded syntax inventory, reviewed gender and extraction evidence; not language certification. */
import { normalizeLookupToken as key } from '../../src/services/grammarPack/lookup';
import { normalizeNounLemma } from '../../src/services/nounGender/match';
import type { ReaderDraft } from './drafts';
import type { GateContext } from './gateInputs';
import type { Report } from './diagnostics';
import type { SelectedAtom } from './gateLexical';
import { tokenize, type Tokenization } from './tokenize';

const subordinators = ['que', 'qui', 'si', 'quand', 'où', 'comme', 'parce', 'lorsque', 'puisque'];
const introduced: Record<string, number> = {
  je: 1,
  il: 1,
  elle: 1,
  ce: 1,
  un: 1,
  une: 1,
  le: 1,
  la: 1,
  tu: 2,
  nous: 2,
  vous: 2,
  ils: 2,
  elles: 2,
  les: 2,
  des: 2,
  mon: 2,
  ma: 2,
  mes: 2,
  ton: 2,
  ta: 2,
  tes: 2,
  son: 2,
  sa: 2,
  ses: 2,
  notre: 2,
  nos: 2,
  votre: 2,
  vos: 2,
  leur: 2,
  leurs: 2,
  // il y a is a stage 3 target pattern; the stressed pronoun is first met after a preposition (avec moi).
  y: 3,
  moi: 3,
  cet: 3,
  cette: 3,
  ces: 3,
  dans: 3,
  avec: 3,
  sur: 3,
  sous: 3,
  chez: 3,
  et: 3,
  mais: 3,
  me: 4,
  te: 4,
  se: 4,
  de: 4,
  à: 4,
  ne: 5,
  pas: 5,
  du: 5,
  plus: 5,
  que: 6,
  qui: 6,
  quoi: 6,
  où: 6,
  ou: 6,
  au: 7,
  aux: 7,
  toi: 7,
  pour: 8,
  quand: 10,
  en: 11,
  on: 12,
};

export function completenessGate(
  draft: ReaderDraft,
  context: GateContext,
  results: Map<string, Tokenization>,
  atoms: SelectedAtom[],
  report: Report,
) {
  const { body } = draft;
  const stage = context.syllabus.stages[body.order - 1];
  const count = (id: string) => results.get(id)?.atoms.length ?? 0;
  if (count('title') > 8)
    report('G5', 'Title exceeds eight expanded atoms', { targetId: 'title', spelling: body.title.fr });
  if (body.sentences.length < 3 || body.sentences.length > stage.maxSentences)
    report('G5', 'Sentence count outside stage cap');
  if (body.sentences.reduce((sum, sentence) => sum + count(sentence.id), 0) > stage.maxTextWords)
    report('G5', 'Story expanded atoms exceed text cap');
  const taughtTopics = context.syllabus.stages.slice(0, body.order).flatMap((entry) => entry.topicIds);
  for (const atom of atoms)
    if (atom.entry.pos === 'function' && (introduced[key(atom.entry.lemma)] ?? 13) > body.order)
      report('G5', 'Core function is not yet introduced in the stage inventory', atom);
  for (const sentence of body.sentences) {
    const location = { targetId: sentence.id, spelling: sentence.fr };
    if (count(sentence.id) > stage.maxSentenceWords)
      report('G5', 'Sentence expanded atoms exceed sentence cap', location);
    const sentenceAtoms = atoms.filter((atom) => atom.targetId === sentence.id);
    const finiteCount = sentenceAtoms.filter((atom) => atom.analysis.verb?.kind === 'finite').length;
    if (finiteCount > (body.order <= 2 ? 1 : 2)) report('G5', 'Too many finite clauses for stage', location);
    const links = sentenceAtoms.filter((atom) => ['et', 'mais'].includes(key(atom.entry.lemma)));
    if (body.order <= 2 && links.length) report('G5', 'Stages one/two permit one independent clause only', location);
    if (body.order <= 5 && finiteCount === 2 && links.length !== 1)
      report('G5', 'Early two-clause sentences require exactly one et/mais link', location);
    for (const atom of sentenceAtoms) {
      if (!subordinators.includes(key(atom.entry.lemma))) continue;
      const marker = context.evidence.clauseMarkers.find((entry) => key(entry.form) === key(atom.entry.lemma));
      if (body.order <= 5 || !marker || !taughtTopics.includes(marker.topicId))
        report('G5', 'Relative/subordinate/embedded marker is outside taught clause inventory', atom);
    }
  }
  for (const entry of body.glossary) {
    if (entry.pos !== 'noun') continue;
    const reviewed = context.reviewedNouns.find(
      (noun) => normalizeNounLemma(noun.lemma) === normalizeNounLemma(entry.lemma),
    );
    if (reviewed && reviewed.gender !== entry.gender)
      report('G5', `Noun gender conflicts with reviewed noun: ${entry.lemma}`);
  }
  for (const topicId of body.topics) {
    const mapping = context.evidence.topics.filter((entry) => entry.topicId === topicId);
    if (
      mapping.length !== 1 ||
      !mapping[0].sentenceIds.length ||
      mapping[0].sentenceIds.some((id) => !body.sentences.some((sentence) => sentence.id === id))
    )
      report('G5', `Missing valid sentence-to-topic review evidence: ${topicId}`);
  }
  if (context.evidence.topics.some((entry) => !body.topics.includes(entry.topicId)))
    report('G5', 'Topic evidence names an untargeted topic');
  const questionIds = body.learning.checkpoints.flatMap((checkpoint) =>
    checkpoint.questions.map(({ question }) => question.id),
  );
  if (
    new Set(context.evidence.extractionQuestions).size !== context.evidence.extractionQuestions.length ||
    context.evidence.extractionQuestions.some((id) => !questionIds.includes(id))
  )
    report('G5', 'Extraction review evidence has duplicate/extra question ids');
  for (const checkpoint of body.learning.checkpoints)
    for (const { question, evidence } of checkpoint.questions) {
      const location = { targetId: `q-${question.id}-answer-0`, spelling: question.expectedAnswer };
      if (!context.evidence.extractionQuestions.includes(question.id))
        report('G5', 'Checkpoint needs reviewed source-finding/extraction intent', location);
      const sentence = body.sentences.find((entry) => entry.id === evidence.sentenceId);
      const source = results.get(evidence.sentenceId)?.atoms ?? [];
      if (!sentence || !sentence.fr.includes(evidence.quote)) {
        report('G5', 'Evidence must be an exact quote of its linked sentence', location);
        continue;
      }
      for (const answer of [question.expectedAnswer, ...(question.acceptableAnswers ?? [])]) {
        const answerAtoms = tokenize({ id: 'answer', text: answer }, { compounds: context.evidence.compounds }).atoms;
        let contained = false;
        for (
          let offset = sentence.fr.indexOf(evidence.quote);
          offset !== -1;
          offset = sentence.fr.indexOf(evidence.quote, offset + 1)
        ) {
          for (const start of source)
            for (const end of source) {
              if (start.start < offset || end.end > offset + evidence.quote.length || end.end <= start.start) continue;
              if (
                sentence.fr.slice(start.start, end.end) === answer &&
                answerAtoms.length &&
                source.filter((atom) => atom.start >= start.start && atom.end <= end.end).length === answerAtoms.length
              )
                contained = true;
            }
        }
        if (!contained)
          report('G5', 'Checkpoint answer must occur at contiguous expanded-atom boundaries inside its own evidence', {
            ...location,
            spelling: answer,
          });
      }
    }
}
