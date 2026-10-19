/**
 * F6 sentence patterns, exactly as the author states them (unverified French).
 * Owns word order, elision and inversion, not conjugation, verification, UI or AI.
 * Goldens test the stated rules, not linguistic correctness.
 */
import type { CellParts } from './cellParts';
import { startsWithVowelSound } from './rules';

const join = (pieces: string[]) =>
  pieces.reduce((text, piece) => (!text || text.endsWith('’') ? text + piece : `${text} ${piece}`), '');
const variants = (forms: string[]) => forms.join(' / ');
const elide = (word: string, next: string, hAspire?: boolean) =>
  startsWithVowelSound(next, hAspire) && ['je', 'ne', 'me', 'te', 'se'].includes(word)
    ? `${word === 'je' ? 'j' : word[0]}’`
    : word;
const questionAllowed = ({ tense }: CellParts) => tense !== 'subjonctif' && tense !== 'imperatif';
// The engine's onset table explicitly leaves y out; F6 supplies no rule for it or æ.
const covered = (parts: CellParts) => !(parts.aux ? [parts.aux] : parts.verb).some((form) => /^[yæ]/.test(form));
const hOf = (parts: CellParts) => (parts.aux ? undefined : parts.hAspire);

export function negation(parts: CellParts): string | undefined {
  if (!covered(parts)) return undefined;
  const { tense, subject, reflexive, aux, verb, participle } = parts;
  const prefix = tense === 'imperatif' ? [] : [subject];
  if (tense === 'subjonctif') prefix.unshift(subject.startsWith('il') ? 'qu’' : 'que');
  const make = (finite: string) => {
    const ref = reflexive ? elide(reflexive, finite, hOf(parts)) : undefined;
    return join([
      ...prefix,
      elide('ne', ref ?? finite, ref ? undefined : hOf(parts)),
      ...(ref ? [ref] : []),
      finite,
      'pas',
      ...(participle ? [variants(participle)] : []),
    ]);
  };
  return aux ? make(aux) : variants(verb.map(make));
}

export function estCeQue(parts: CellParts): string | undefined {
  if (!questionAllowed(parts) || !covered(parts)) return undefined;
  const { subject, reflexive, aux, verb, participle } = parts;
  const make = (finite: string) => {
    const ref = reflexive ? elide(reflexive, finite, hOf(parts)) : undefined;
    return `${join([
      subject.startsWith('il') ? 'est-ce qu’' : 'est-ce que',
      ref ? subject : elide(subject, finite, hOf(parts)),
      ...(ref ? [ref] : []),
      finite,
      ...(participle ? [variants(participle)] : []),
    ])}\u00a0?`;
  };
  return aux ? make(aux) : variants(verb.map(make));
}

export function inversion(parts: CellParts): string | undefined {
  if (!questionAllowed(parts) || parts.person === '1sg' || !covered(parts)) return undefined;
  const { person, subject, reflexive, aux, verb, participle } = parts;
  const forms = aux ? [aux] : verb;
  // F6 gives no ending rule for y; do not silently decide whether to insert -t-.
  if (person === '3sg' && forms.some((form) => form.endsWith('y'))) return undefined;
  const subjects = subject.split('/');
  const make = (finite: string, pronoun: string, index: number) => {
    const t = person === '3sg' && /[aeiouàâäéèêëîïôöùûüœ]$/.test(finite) ? '-t' : '';
    // Pair each pronoun with its agreement; an invariable participle serves both.
    const agreement =
      participle && (subjects.length === 1 ? variants(participle) : participle[index % participle.length]);
    return `${join([
      ...(reflexive ? [elide(reflexive, finite, hOf(parts))] : []),
      `${finite}${t}-${pronoun}`,
      ...(agreement ? [agreement] : []),
    ])}\u00a0?`;
  };
  return variants(forms.flatMap((finite) => subjects.map((pronoun, index) => make(finite, pronoun, index))));
}
