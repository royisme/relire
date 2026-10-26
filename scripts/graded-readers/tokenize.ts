/** Owns source-preserving G1 expansion and G0 target derivation; never selects a lexical reading. */
import { readerWords, type ReaderWordToken } from '../../src/utils/readerTokens';
import type { ReaderBody } from '../../src/types/gradedReader';
import { atomId, type Diagnostic } from './diagnostics';

export interface Target {
  id: string;
  text: string;
  // Subject frames in a scaffold can use its completed, authored prompt.
  completed?: string;
}
export interface Atom {
  id: string;
  targetId: string;
  ordinal: number;
  part: number;
  spelling: string;
  start: number;
  end: number;
  readings: string[];
  role?: 'elision' | 'inversion' | 'command';
}
export interface ExpandedWord extends ReaderWordToken {
  atoms: Atom[];
  phrase?: string;
  liaison?: true;
}
export interface Tokenization {
  words: ExpandedWord[];
  atoms: Atom[];
  diagnostics: Diagnostic[];
}
export interface ExpansionPolicy {
  // Only reviewed closed entries; est-ce is deliberately never opaque.
  compounds: readonly string[];
}

export function targetInventory(body: ReaderBody): Target[] {
  const targets: Target[] = [{ id: 'title', text: body.title.fr }];
  targets.push(...body.sentences.map((sentence) => ({ id: sentence.id, text: sentence.fr })));
  for (const checkpoint of body.learning.checkpoints) {
    for (const { question } of checkpoint.questions) {
      const prefix = `q-${question.id}`;
      const pattern = question.type === 'CHOICE_SELECT' ? /\{([^{}]+)\}/u : /\[___\]/u;
      targets.push({
        id: `${prefix}-scaffold`,
        text: question.prompt.replace(pattern, ''),
        completed: question.prompt.replace(pattern, question.expectedAnswer),
      });
      if (question.type === 'CHOICE_SELECT') {
        const options =
          question.prompt
            .match(pattern)?.[1]
            ?.split('|')
            .map((option) => option.trim()) ?? [];
        targets.push(
          ...options.map((text, i) => ({
            id: `${prefix}-option-${i}`,
            text,
            completed: question.prompt.replace(pattern, text),
          })),
        );
      }
      targets.push(
        ...[question.expectedAnswer, ...(question.acceptableAnswers ?? [])].map((text, i) => ({
          id: `${prefix}-answer-${i}`,
          text,
          completed: question.prompt.replace(pattern, text),
        })),
      );
    }
  }
  return targets;
}

const fixed: Record<string, string[]> = {
  j: ['je'],
  qu: ['que'],
  d: ['de'],
  n: ['ne'],
  c: ['ce'],
  m: ['me'],
  t: ['te'],
  l: ['le', 'la'],
  s: ['se', 'si'],
};
const subjects = /^(il|elle|on|ils|elles|tu|nous|vous)$/u;
const canonical = (text: string) => text.normalize('NFC').toLowerCase();

export function tokenize(target: Target, policy: ExpansionPolicy = { compounds: [] }, readerId = ''): Tokenization {
  const diagnostics: Diagnostic[] = [];
  const fail = (reason: string, spelling: string, ordinal: number | null = null, part: number | null = null) =>
    diagnostics.push({ gate: 'G1', severity: 'error', readerId, targetId: target.id, ordinal, part, spelling, reason });
  if (target.text !== target.text.normalize('NFC')) fail('French must be NFC', target.text);
  const words: ExpandedWord[] = [];
  let cursor = 0;
  for (const word of readerWords(target.text)) {
    const gap = target.text.slice(cursor, word.start);
    if (/[^\s.,!?;«»“”()]/u.test(gap))
      fail('Unconsumed character: digits, symbols and orphan connectors are forbidden', gap);
    cursor = word.end;
    const atoms: Atom[] = [];
    let phrase: string | undefined;
    let liaison: true | undefined;
    const add = (spelling: string, start: number, readings: string[], role?: Atom['role']) => {
      const part = atoms.length;
      atoms.push({
        id: atomId(target.id, word.ordinal, part),
        targetId: target.id,
        ordinal: word.ordinal,
        part,
        spelling,
        start,
        end: start + spelling.length,
        readings,
        ...(role && { role }),
      });
    };
    const expand = (spelling: string, start: number): boolean => {
      const key = canonical(spelling);
      if (key === 'est-ce') {
        phrase = key;
        add(spelling.slice(0, 3), start, ['est']);
        add(spelling.slice(4), start + 4, ['ce'], 'inversion');
        return true;
      }
      const elision = /^([\p{L}]+)’(.+)$/u.exec(spelling);
      if (elision && fixed[canonical(elision[1])]) {
        let readings = fixed[canonical(elision[1])];
        if (canonical(elision[1]) === 's' && /^(il|ils)$/u.test(canonical(elision[2]))) readings = ['si'];
        add(`${elision[1]}’`, start, readings, 'elision');
        return expand(elision[2], start + elision[1].length + 1);
      }
      if (policy.compounds.some((compound) => canonical(compound) === key)) {
        add(spelling, start, [key]);
        return true;
      }
      if (key.includes('-')) {
        const pieces = spelling.split('-');
        const last = canonical(pieces.at(-1)!);
        if (subjects.test(last) && (pieces.length === 2 || (pieces.length === 3 && canonical(pieces[1]) === 't'))) {
          if (!/^[\p{L}\p{M}]+$/u.test(pieces[0])) return false;
          add(pieces[0], start, [canonical(pieces[0])]);
          liaison = pieces.length === 3 ? true : undefined;
          add(pieces.at(-1)!, start + spelling.length - last.length, [last], 'inversion');
          return true;
        }
        if (pieces.length === 2 && /^(toi|nous|vous)$/u.test(last)) {
          add(pieces[0], start, [canonical(pieces[0])]);
          add(pieces[1], start + pieces[0].length + 1, [last], 'command');
          return true;
        }
        return false;
      }
      if (!/^[\p{L}\p{M}]+$/u.test(spelling)) return false;
      add(spelling, start, [key]);
      return true;
    };
    if (/['‘`‐‑‒–—―]/u.test(word.text)) fail('Unsupported apostrophe or dash', word.text, word.ordinal);
    else if (!expand(word.text, word.start))
      fail('unresolved-token: expansion needs a reviewed entry or simpler text', word.text, word.ordinal);
    words.push({ ...word, atoms, ...(phrase && { phrase }), ...(liaison && { liaison }) });
  }
  const tail = target.text.slice(cursor);
  if (/[^\s.,!?;«»“”()]/u.test(tail))
    fail('Unconsumed character: digits, symbols and orphan connectors are forbidden', tail);
  return { words, atoms: words.flatMap((word) => word.atoms), diagnostics };
}
