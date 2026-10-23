/** Owns G4 closed verb groups and limited subject frames; not a general French parser. */
import { normalizeLookupToken as key } from '../../src/services/grammarPack/lookup';
import { compoundForms } from '../../src/services/conjugation/rules';
import type { ReaderDraft } from './drafts';
import type { GateContext } from './gateInputs';
import type { Report } from './diagnostics';
import type { SelectedAtom } from './gateLexical';
import { tokenize, type Target } from './tokenize';

const persons: Record<string, string> = {
  je: '1sg',
  tu: '2sg',
  il: '3sg',
  elle: '3sg',
  on: '3sg',
  ce: '3sg',
  nous: '1pl',
  vous: '2pl',
  ils: '3pl',
  elles: '3pl',
};
const clitics = ['ne', 'me', 'te', 'se', 'le', 'la', 'les', 'lui', 'leur', 'y', 'en'];
const finite = (atom: SelectedAtom) => (atom.analysis.verb?.kind === 'finite' ? atom.analysis.verb : undefined);

export function verbGate(
  draft: ReaderDraft,
  context: GateContext,
  atoms: SelectedAtom[],
  targets: Target[],
  report: Report,
) {
  const stage = context.syllabus.stages[draft.body.order - 1];
  const verbs = atoms.filter((atom) => atom.entry.pos === 'verb');
  for (const atom of verbs) {
    const count = draft.verbGroups.filter((group) => group.atomIds.includes(atom.id)).length;
    if (count !== 1) report('G4', 'Every verb atom must belong to exactly one group', atom);
    if (
      atom.analysis.verb?.kind === 'present-participle' ||
      (atom.analysis.verb?.kind === 'finite' && ['conditionnel', 'subjonctif'].includes(atom.analysis.verb.tense))
    )
      report('G4', 'Conditional, subjunctive and present participle are forbidden', atom);
  }
  for (const group of draft.verbGroups) {
    const members = group.atomIds.map((id) => atoms.find((atom) => atom.id === id));
    const head = atoms.find((atom) => atom.id === group.finiteAtomId);
    const location = head ?? { targetId: group.targetId };
    const fail = (reason: string) => report('G4', reason, location);
    if (
      new Set(group.atomIds).size !== members.length ||
      members.some((atom) => !atom || atom.targetId !== group.targetId || atom.entry.pos !== 'verb') ||
      !head ||
      !group.atomIds.includes(head.id) ||
      head.targetId !== group.targetId ||
      !finite(head)
    ) {
      fail('Group must contain unique same-target verbs and its declared finite head');
      continue;
    }
    const groupAtoms = members as SelectedAtom[];
    const headVerb = finite(head)!;
    if (groupAtoms.filter((atom) => finite(atom)).length !== 1) fail('Group must have exactly one finite verb');
    const targetAtoms = atoms.filter((atom) => atom.targetId === group.targetId);
    const headIndex = targetAtoms.indexOf(head);
    const next = groupAtoms.find((atom) => atom !== head);
    const nextVerb = next?.analysis.verb;
    if (group.kind === 'simple') {
      if (groupAtoms.length !== 1 || !stage.allowedTenses.some((tense) => tense === headVerb.tense))
        fail('Simple group needs one finite verb in an allowed tense');
    } else {
      if (groupAtoms.length !== 2 || !next || targetAtoms.indexOf(next) <= headIndex || headVerb.tense !== 'present')
        fail('Construction needs a present finite head followed by exactly one nonfinite verb');
      const between = next ? targetAtoms.slice(headIndex + 1, targetAtoms.indexOf(next)) : [];
      const permitted = group.kind === 'recent-past' ? [...clitics, 'pas', 'de'] : [...clitics, 'pas'];
      if (between.some((atom) => atom.entry.pos !== 'function' || !permitted.includes(key(atom.entry.lemma))))
        fail('Unreviewed intervening construction pattern');
      if (group.kind === 'passeCompose') {
        if (
          !stage.allowedTenses.includes('passeCompose') ||
          !['avoir', 'être'].includes(key(head.entry.lemma)) ||
          nextVerb?.kind !== 'past-participle'
        )
          fail('Passé composé needs allowed tense, present avoir/être and a past participle');
        else if (next) checkCompound(head, next, context, targetAtoms, fail);
      } else {
        if (!stage.allowedConstructions.includes(group.kind) || nextVerb?.kind !== 'infinitive')
          fail('Construction is not allowed or lacks an attested infinitive');
        if (group.kind === 'modal-infinitive' && !context.evidence.modalLemmas.map(key).includes(key(head.entry.lemma)))
          fail('Modal lemma needs a reviewed closed construction entry');
        if (group.kind === 'near-future' && key(head.entry.lemma) !== 'aller')
          fail('Near future requires present aller');
        if (
          group.kind === 'recent-past' &&
          (key(head.entry.lemma) !== 'venir' || between.filter((atom) => key(atom.entry.lemma) === 'de').length !== 1)
        )
          fail('Recent past requires present venir + de/d’ + infinitive');
      }
    }
    const following = targetAtoms[headIndex + 1];
    const inversion = following?.role === 'inversion' && headVerb.tense !== 'imperatif';
    if (inversion && !context.evidence.inversions.map(key).includes(key(draftTargetWord(targets, head))))
      fail('Inversion/liaison needs reviewed exact spelling');
    let previousIndex = headIndex - 1;
    if (
      /^(se |s’)/u.test(head.entry.lemma) &&
      previousIndex > 0 &&
      ['nous', 'vous'].includes(key(targetAtoms[previousIndex].entry.lemma))
    )
      previousIndex--;
    while (
      previousIndex >= 0 &&
      targetAtoms[previousIndex].entry.pos === 'function' &&
      clitics.includes(key(targetAtoms[previousIndex].entry.lemma))
    )
      previousIndex--;
    const subject = inversion ? following : targetAtoms[previousIndex];
    const expected = subject && subject.entry.pos === 'function' ? persons[key(subject.entry.lemma)] : undefined;
    if (headVerb.tense === 'imperatif') {
      if (!['2sg', '1pl', '2pl'].includes(headVerb.person) || (expected && !inversion) || subject?.entry.pos === 'noun')
        fail('Imperative must be subjectless, with person 2sg/1pl/2pl');
      const command = following && ['toi', 'nous', 'vous'].includes(key(following.entry.lemma)) ? following : undefined;
      if (command) {
        const commandPerson: Record<string, string> = { toi: '2sg', nous: '1pl', vous: '2pl' };
        if (commandPerson[key(command.entry.lemma)] !== headVerb.person) fail('Imperative clitic/person mismatch');
        const reviewed = context.lexicon.reviewedVerb(head.entry.lemma);
        if (
          !reviewed?.tenses.imperatif?.[headVerb.person as '2sg' | '1pl' | '2pl']?.forms.some(
            (form) => key(form) === key(draftTargetWord(targets, head)),
          )
        )
          fail('Hyphenated command needs a matching reviewed command form');
      }
    } else if (expected) {
      if (headVerb.person !== expected) fail('Finite slot must agree with explicit subject person');
    } else if (subject?.entry.pos === 'noun') {
      const slots = new Set(
        subject.candidates
          .filter((candidate) => key(candidate.lemma) === key(subject.entry.lemma) && candidate.pos === 'noun')
          .map((candidate) => candidate.slot),
      );
      if (slots.size !== 1 || !['singular', 'plural'].includes([...slots][0]))
        report('G4', 'Ambiguous noun subject requires review or simplification', { ...head, severity: 'warning' });
      else if (headVerb.person !== (slots.has('plural') ? '3pl' : '3sg'))
        fail('Finite slot must agree with unambiguous noun number');
      // Pre-nominal adjectives may stand between the determiner and the noun (cette petite chambre).
      let beforeIndex = previousIndex - 1;
      while (targetAtoms[beforeIndex]?.entry.pos === 'adjective') beforeIndex -= 1;
      const beforeNoun = targetAtoms[beforeIndex];
      const number =
        beforeNoun &&
        (
          {
            le: 'singular',
            la: 'singular',
            un: 'singular',
            une: 'singular',
            les: 'plural',
            des: 'plural',
            ces: 'plural',
            ses: 'plural',
            // Possessives and demonstratives are determiners with an unambiguous number before a noun subject.
            mon: 'singular',
            ma: 'singular',
            ton: 'singular',
            ta: 'singular',
            son: 'singular',
            sa: 'singular',
            notre: 'singular',
            votre: 'singular',
            leur: 'singular',
            ce: 'singular',
            cet: 'singular',
            cette: 'singular',
            mes: 'plural',
            tes: 'plural',
            nos: 'plural',
            vos: 'plural',
            leurs: 'plural',
          } as Record<string, string>
        )[key(beforeNoun.entry.lemma)];
      if (!number || !slots.has(number)) fail('Noun subject needs an unambiguous matching determiner');
      if (targetAtoms.slice(0, previousIndex).some((atom) => ['et', 'ou'].includes(key(atom.entry.lemma))))
        report('G4', 'Coordinated subject needs review or simplification', { ...head, severity: 'warning' });
    } else {
      const target = targets.find((candidate) => candidate.id === head.targetId);
      // Extraction-only verb answers/scaffolds may recover a literal pronoun from the completed prompt.
      const completed = target?.completed
        ? tokenize({ id: target.id, text: target.completed }, { compounds: context.evidence.compounds }).atoms
        : undefined;
      const occurrences = completed?.filter((atom) => key(atom.spelling) === key(head.spelling)) ?? [];
      const index = occurrences.length === 1 ? completed!.indexOf(occurrences[0]) : -1;
      const pronoun = index > 0 ? completed![index - 1].readings[0] : undefined;
      if (!pronoun || persons[key(pronoun)] !== headVerb.person)
        fail('Missing supported subject-person frame; simplify or supply reviewed context');
    }
    if (/^(se |s’)/u.test(head.entry.lemma) && headVerb.tense !== 'imperatif') {
      const clitic = targetAtoms[headIndex - 1];
      const expectedClitic: Record<string, string> = {
        '1sg': 'me',
        '2sg': 'te',
        '3sg': 'se',
        '1pl': 'nous',
        '2pl': 'vous',
        '3pl': 'se',
      };
      if (!clitic || key(clitic.entry.lemma) !== expectedClitic[headVerb.person])
        fail('Pronominal clitic must agree with selected finite person');
    }
    if (context.lexicon.reviewedVerb(head.entry.lemma)?.defective === 'impersonal' && headVerb.person !== '3sg')
      fail('Impersonal verb requires 3sg');
  }
}
function draftTargetWord(targets: Target[], atom: SelectedAtom) {
  const target = targets.find((candidate) => candidate.id === atom.targetId)!;
  return tokenize(target).words[atom.ordinal]?.text ?? atom.spelling;
}
function checkCompound(
  head: SelectedAtom,
  main: SelectedAtom,
  context: GateContext,
  atoms: SelectedAtom[],
  fail: (reason: string) => void,
) {
  const person = finite(head)!.person;
  const verb = main.analysis.verb;
  if (verb?.kind !== 'past-participle') return;
  const reviewed = context.lexicon.reviewedVerb(main.entry.lemma);
  const record = context.evidence.compoundPast.find((entry) => key(entry.lemma) === key(main.entry.lemma));
  const precedingClitics: SelectedAtom[] = [];
  for (
    let i = atoms.indexOf(head) - 1;
    i >= 0 && atoms[i].entry.pos === 'function' && clitics.includes(key(atoms[i].entry.lemma));
    i--
  )
    precedingClitics.push(atoms[i]);
  if (
    /^(se |s’)/u.test(main.entry.lemma) ||
    precedingClitics.some((atom) => ['le', 'la', 'les', 'en'].includes(key(atom.entry.lemma)))
  )
    fail('Pronominal/preceding-object compound agreement is outside the supported subset');
  const aux = reviewed ? (reviewed.aux === 'etre' ? 'être' : 'avoir') : record?.aux;
  const participles = reviewed?.participles.past ?? record?.participles;
  if (!aux || !participles) {
    fail('Missing reviewed per-lemma auxiliary/participial evidence');
    return;
  }
  if (key(head.entry.lemma) !== key(aux) || key(main.spelling) !== key(participles[verb.agreement]))
    fail('Auxiliary or selected participial agreement contradicts reviewed record');
  if (aux === 'avoir' && verb.agreement !== 'ms')
    fail('Simple non-object avoir compound requires masculine singular participle');
  if (aux === 'être') {
    const before = atoms.slice(0, atoms.indexOf(head)).at(-1);
    const agreement =
      before?.entry.pos === 'noun'
        ? `${before.entry.gender === 'feminine' ? 'f' : 'm'}${person.endsWith('pl') ? 'p' : 's'}`
        : before &&
          ({ il: 'ms', elle: 'fs', ils: 'mp', elles: 'fp' } as Record<string, string>)[key(before.entry.lemma)];
    if (!agreement || agreement !== verb.agreement)
      fail('Être compound requires unambiguous subject gender/number evidence');
  }
  const forms = compoundForms({ aux: aux === 'être' ? 'etre' : 'avoir' }, 'present', person, participles);
  if (!forms.some((form) => key(form) === key(`${head.spelling} ${main.spelling}`)))
    fail('Compound does not match engine composition');
  if (
    reviewed &&
    !reviewed.tenses.passeCompose[person]?.forms.some((form) => key(form) === key(`${head.spelling} ${main.spelling}`))
  )
    fail('Compound does not match reviewed pack cell/variants');
}
