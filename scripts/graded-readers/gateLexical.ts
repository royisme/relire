/** Owns G2 attestation and G3 introduced lexical keys; never chooses among homographs. */
import { normalizeLookupToken as key } from '../../src/services/grammarPack/lookup';
import type { ReaderGlossaryEntry } from '../../src/types/gradedReader';
import type { ReaderDraft } from './drafts';
import { atomId, lexicalKey, type Report } from './diagnostics';
import type { GateContext } from './gateInputs';
import type { Atom, Tokenization } from './tokenize';
import type { LexiconCandidate } from './lexiconIndex';

export type Analysis = ReaderDraft['analyses'][number];
export interface SelectedAtom extends Atom {
  entry: ReaderGlossaryEntry;
  analysis: Analysis;
  candidates: readonly LexiconCandidate[];
}
export const verbSlot = (verb: NonNullable<Analysis['verb']>) => {
  switch (verb.kind) {
    case 'finite':
      return `tenses.${verb.tense}.${verb.person}`;
    case 'infinitive':
      return 'infinitive';
    case 'past-participle':
      return `participles.past.${verb.agreement}`;
    case 'present-participle':
      return 'participles.present';
  }
};
const coreEntries = (context: GateContext): ReaderGlossaryEntry[] =>
  context.core.map(({ headword, ...entry }) => ({ ...entry, lemma: headword, id: '' }));

export function lexicalGates(
  draft: ReaderDraft,
  context: GateContext,
  tokenizations: Map<string, Tokenization>,
  report: Report,
): SelectedAtom[] {
  const selected: SelectedAtom[] = [];
  const entries = new Map(draft.body.glossary.map((entry) => [entry.id, entry]));
  const atoms = [...tokenizations.values()].flatMap((result) => result.atoms);
  const used = new Set<string>();
  const canonical = coreEntries(context);
  const approved = [
    ...canonical,
    ...context.previous.flatMap((reader) => reader.body.glossary),
    ...context.candidates.entries,
  ];
  const known = new Set([...canonical, ...context.previous.flatMap((reader) => reader.body.glossary)].map(lexicalKey));
  for (const atom of atoms) {
    const location = { targetId: atom.targetId, ordinal: atom.ordinal, part: atom.part, spelling: atom.spelling };
    const analyses = draft.analyses.filter(
      (analysis) => atomId(analysis.targetId, analysis.ordinal, analysis.part) === atom.id,
    );
    if (analyses.length !== 1) {
      report('G1', 'unresolved-token: exactly one authored analysis is required for each expanded part', location);
      continue;
    }
    const analysis = analyses[0];
    const entry = entries.get(analysis.entryId);
    if (!entry) {
      report('G3', 'Every used key needs a local glossary entry', location);
      continue;
    }
    used.add(lexicalKey(entry));
    const readings = atom.readings.map(key);
    const forms = entry.forms.map(key);
    const candidates = readings.flatMap((form) => context.lexicon.candidates(form));
    const detail = { ...location, selected: { lemma: entry.lemma, sense: entry.sense }, candidates };
    if (
      !readings.some((reading) => forms.includes(reading)) ||
      (atom.role === 'elision' && !readings.includes(key(entry.lemma)))
    )
      report('G2', 'Selected reading/form is not an allowed expansion of the source', detail);
    const reused = context.previous
      .flatMap((reader) => reader.body.glossary)
      .find((candidate) => lexicalKey(candidate) === lexicalKey(entry));
    if (reused && (reused.id !== entry.id || reused.lemma !== entry.lemma))
      report('G3', 'Reused key must retain its glossary id and authored lemma', detail);
    const approvedEntry = approved.find((candidate) => lexicalKey(candidate) === lexicalKey(entry));
    if (!approvedEntry) {
      report('G3', 'Key is outside the reviewed core/previous glossaries/closed stage candidates', detail);
      if (!['noun', 'verb', 'adjective'].includes(entry.pos))
        report('G2', 'unresolved-token: no reviewed core/supplement reading', detail);
    } else {
      if (approvedEntry.gender !== entry.gender || contentDefinition(approvedEntry) !== contentDefinition(entry))
        report('G3', 'Reused/closed entry must retain its reviewed definition and gender', detail);
      if (
        !['noun', 'verb', 'adjective'].includes(entry.pos) &&
        !readings.some((reading) => approvedEntry.forms.map(key).includes(reading))
      )
        report('G2', 'Function/supplement reading needs an explicitly reviewed form', detail);
    }
    if ((entry.pos === 'verb') !== (analysis.verb !== undefined))
      report('G2', 'Verb analysis is required exactly for selected verb entries', detail);
    if (['noun', 'verb', 'adjective'].includes(entry.pos)) {
      let lemma = entry.lemma;
      if (/^(se |s’)/u.test(lemma)) {
        const mapping = context.evidence.pronominals.find((record) => key(record.lemma) === key(lemma));
        const previous = atoms[atoms.indexOf(atom) - 1];
        const clitic =
          previous && draft.analyses.find((item) => atomId(item.targetId, item.ordinal, item.part) === previous.id);
        const cliticEntry = clitic && entries.get(clitic.entryId);
        const tail = tokenizations
          .get(atom.targetId)
          ?.words.find((word) => word.ordinal === atom.ordinal)
          ?.atoms.at(-1);
        const command =
          tail?.role === 'command' ||
          (tail?.role === 'inversion' &&
            ['nous', 'vous'].includes(key(tail.spelling)) &&
            analysis.verb?.kind === 'finite' &&
            analysis.verb.tense === 'imperatif');
        if (
          !mapping ||
          !context.lexicon.reviewedVerb(lemma) ||
          (!(
            previous?.targetId === atom.targetId &&
            cliticEntry &&
            ['me', 'te', 'se', 'nous', 'vous'].includes(key(cliticEntry.lemma))
          ) &&
            !command)
        )
          report('G2', 'Pronominal verb needs reviewed base/clitic mapping and an explicit matching clitic', detail);
        if (mapping) lemma = mapping.base;
      }
      if (
        !candidates.some(
          (candidate) =>
            (key(candidate.lemma) === key(entry.lemma) || key(candidate.lemma) === key(lemma)) &&
            candidate.pos === entry.pos &&
            (!analysis.verb || candidate.slot === verbSlot(analysis.verb)),
        )
      )
        report('G2', 'unresolved-token: exact lemma/POS/selected slot is not attested', detail);
    }
    selected.push({
      ...atom,
      readings: atom.readings.filter(
        (reading) => forms.includes(key(reading)) && (atom.role !== 'elision' || key(reading) === key(entry.lemma)),
      ),
      entry,
      analysis,
      candidates,
    });
  }
  for (const analysis of draft.analyses)
    if (!atoms.some((atom) => atom.id === atomId(analysis.targetId, analysis.ordinal, analysis.part)))
      report('G1', 'Analysis has no deterministic expanded part', {
        targetId: analysis.targetId,
        ordinal: analysis.ordinal,
        part: analysis.part,
      });
  for (const sentence of draft.body.sentences) {
    for (const word of tokenizations.get(sentence.id)?.words ?? []) {
      const ids = [
        ...new Set(
          selected
            .filter((atom) => atom.targetId === sentence.id && atom.ordinal === word.ordinal)
            .map((atom) => atom.entry.id),
        ),
      ];
      if (word.phrase) {
        const phrase = draft.body.glossary.find(
          (entry) =>
            entry.id === sentence.tokens[word.ordinal]?.entryIds[0] &&
            entry.pos === 'phrase' &&
            entry.forms.map(key).includes(key(word.phrase!)),
        );
        if (phrase) {
          ids.unshift(phrase.id);
          used.add(lexicalKey(phrase));
        } else
          report('G3', 'Question phrase needs a local authored phrase definition', {
            targetId: sentence.id,
            ordinal: word.ordinal,
            spelling: word.text,
          });
      }
      if (JSON.stringify(sentence.tokens[word.ordinal]?.entryIds) !== JSON.stringify([...new Set(ids)]))
        report('G1', 'Whole-token binding must be the ordered union of part ids, phrase first', {
          targetId: sentence.id,
          ordinal: word.ordinal,
          spelling: word.text,
        });
    }
  }
  // Phrase definitions are required even when the occurrence is only in a checkpoint/title.
  for (const result of tokenizations.values())
    for (const word of result.words)
      if (word.phrase) {
        const candidates = draft.body.glossary.filter(
          (entry) => entry.pos === 'phrase' && entry.forms.map(key).includes(key(word.phrase!)),
        );
        const phrase = candidates.length === 1 ? candidates[0] : undefined;
        if (!phrase || !approved.some((candidate) => lexicalKey(candidate) === lexicalKey(phrase)))
          report('G2', 'Phrase needs reviewed closed-vocabulary evidence');
        else used.add(lexicalKey(phrase));
      }
  for (const entry of draft.body.glossary) {
    if (!used.has(lexicalKey(entry))) report('G3', `Unused gloss: ${entry.id}`);
    const encountered = selected.filter((atom) => atom.entry.id === entry.id).flatMap((atom) => atom.readings.map(key));
    const phraseForms = [...tokenizations.values()].flatMap((result) =>
      result.words.flatMap((word) => (word.phrase ? [key(word.phrase)] : [])),
    );
    for (const form of entry.forms)
      if (!encountered.includes(key(form)) && !(entry.pos === 'phrase' && phraseForms.includes(key(form))))
        report('G3', `Gloss form was not encountered: ${entry.id}/${form}`);
  }
  const introduced = [...used].filter((entryKey) => !known.has(entryKey));
  const budget = context.syllabus.stages[draft.body.order - 1].newWordBudget;
  if (introduced.length > budget) report('G3', `New lexical keys ${introduced.length} exceed budget ${budget}`);
  return selected;
}
function contentDefinition(entry: Pick<ReaderGlossaryEntry, 'gloss'>) {
  return JSON.stringify([entry.gloss.en, entry.gloss.zh]);
}
