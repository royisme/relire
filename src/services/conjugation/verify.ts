/**
 * Verification statuses of a verb (Part 3 F4): the rule-suffix fit check, the
 * comparison of an AI answer with what the engine generates under the rule the
 * AI named, and the pack path where every cell is `reviewed`. Pure; returns
 * plain data with status codes only (the UI owns the words). `match` means two
 * derivations agree under the AI's own rule: evidence, not proof. Does not
 * build the view (assemble.ts) or call the AI.
 */
import type { ConjugationAnswer } from '../../types/conjugationAnswer';
import {
  TENSES,
  isCompoundTense,
  type Cell,
  type ImperativePerson,
  type Person,
  type RuleId,
  type Tense,
  type Verb,
} from '../../types/grammarPack';
import { assembleVerb, bareInfinitive, engineBase, withClitic, type VerbView } from './assemble';
import { generateVerb, type GeneratedVerb, type SimpleTense, type VerbSpec } from './generate';
import { composePresentParticiple, joinParts, type Parts, type PastParticiples } from './rules';

export type VerbStatus = 'pack-reviewed' | 'rule-checked' | 'partly-differs' | 'ai-only';
export type CellStatus = 'reviewed' | 'match' | 'differs' | 'ai-only';

/** A cell of the view; `ruleForms` is what the rule gives, present only when the status is `differs`. */
export interface CheckedCell {
  lead: string;
  forms: string[];
  status: CellStatus;
  ruleForms?: string[];
  /** Engine-produced splits, in the displayed forms' order; never inferred from spelling. */
  parts?: Parts[];
  ruleParts?: Parts[];
}
/** One participle; `ruleForm` is present only when the status is `differs`. */
export interface CheckedForm {
  form: string;
  status: CellStatus;
  ruleForm?: string;
}
export type FormKey = 'present' | keyof PastParticiples;

export interface VerifiedVerb {
  infinitive: string;
  pronominal: boolean;
  aux: Verb['aux'];
  /** The rule the AI named; undefined when it was discarded (a suffix misfit, or the engine could not apply it). */
  rule?: RuleId;
  defective?: Verb['defective'];
  hAspire?: true;
  pcInvariable?: true;
  /** Every person of every finite tense exists, but the verb has no imperative. */
  noImperative?: true;
  status: VerbStatus;
  /** Every tense of the view; imperatif is empty for a defective or noImperative verb. */
  tenses: Record<Tense, Partial<Record<Person, CheckedCell>>>;
  participles: Partial<Record<FormKey, CheckedForm>>;
}

// An `-ir` rule does not fit a verb in `-oir` (voir, pouvoir): they have no engine family.
const SUFFIX: Record<Exclude<RuleId, 'irregular'>, RegExp> = {
  'er-regular': /er$/,
  'er-cer': /cer$/,
  'er-ger': /ger$/,
  'er-yer-i': /yer$/,
  'er-e-grave': /er$/,
  'er-eacute-egrave': /er$/,
  'er-eler-double': /e[lt]er$/,
  'ir-issons': /[^o]ir$/,
  'ir-sortir': /[^o]ir$/,
  'ir-ouvrir': /[^o]ir$/,
  're-regular': /(d|p)re$/,
};

interface EngineRun {
  rule: RuleId | undefined;
  /** Absent when nothing independent exists to compare with. */
  generated?: GeneratedVerb;
}

/** Runs the engine under the AI's rule, or says why it was not run. */
function runEngine(answer: ConjugationAnswer): EngineRun {
  const { rule, infinitive } = answer;
  if (rule === 'irregular') return { rule };
  const base = engineBase(infinitive);
  if (base === undefined || !SUFFIX[rule].test(infinitive)) return { rule: undefined };
  // A defective flag from the AI would make a one-cell grid match itself, and the elision of the lead before an
  // h rests on the AI's hAspire: neither has an independent check outside the pack.
  if (answer.defective || bareInfinitive(infinitive).startsWith('h')) return { rule };
  const spec: VerbSpec = { id: infinitive, infinitive, base, rule, aux: answer.aux };
  // `ir-ouvrir` takes its past participle from the table; here that is the AI's own, so it stays unchecked.
  const irregulars =
    rule === 'ir-ouvrir' ? { [infinitive]: { participles: { past: answer.participles.past.ms } } } : {};
  try {
    return { rule, generated: generateVerb(spec, irregulars) };
  } catch {
    // The rule cannot apply to this verb (for example a stem change with no letter to change): a misfit.
    return { rule: undefined };
  }
}

const sameForms = (ai: string[], rule: string[]) =>
  ai[0] === rule[0] && ai.length === rule.length && ai.every((form) => rule.includes(form));

/** The forms the rule gives for one simple cell, shaped like the view's (clitic included). */
function ruleFormsOf(generated: GeneratedVerb, tense: SimpleTense, person: Person, pronominal: boolean): string[] {
  const forms = generated.parts.simple[tense][person]!.map(({ stem, ending }) => stem + ending);
  return tense === 'imperatif' ? withClitic(pronominal, person as ImperativePerson, forms) : forms;
}

type CellCheck = Pick<CheckedCell, 'status' | 'ruleForms' | 'parts' | 'ruleParts'>;
type FormCheck = Pick<CheckedForm, 'status' | 'ruleForm'>;

/** Pairs every cell and participle of the view with a check, without deciding the verb's status. */
function checkView(
  view: Omit<VerbView, 'rule'> & { rule?: RuleId },
  cellCheck: (tense: Tense, person: Person, cell: Cell) => CellCheck,
  formCheck: (key: FormKey, form: string) => FormCheck,
): Omit<VerifiedVerb, 'status'> {
  const tenses = Object.fromEntries(
    TENSES.map((tense) => [
      tense,
      Object.fromEntries(
        Object.entries(view.tenses[tense] ?? {}).map(([person, cell]) => [
          person,
          { ...cell, ...cellCheck(tense, person as Person, cell) },
        ]),
      ),
    ]),
  ) as VerifiedVerb['tenses'];
  const { present, past } = view.participles;
  const participles: VerifiedVerb['participles'] = {};
  for (const [key, form] of [['present', present], ...Object.entries(past)] as [FormKey, string | undefined][]) {
    if (form === undefined) continue;
    // Compare bare forms first; the same engine composition dresses both displayed lines.
    const check = formCheck(key, form);
    const display = (bare: string) => (key === 'present' ? composePresentParticiple(view, bare) : bare);
    participles[key] = {
      ...check,
      form: display(form),
      ...(check.ruleForm !== undefined && { ruleForm: display(check.ruleForm) }),
    };
  }
  return {
    infinitive: view.infinitive,
    pronominal: view.pronominal,
    aux: view.aux,
    rule: view.rule,
    ...(view.defective && { defective: view.defective }),
    ...(view.hAspire && { hAspire: view.hAspire }),
    ...(view.pcInvariable && { pcInvariable: view.pcInvariable }),
    ...(view.noImperative && { noImperative: view.noImperative }),
    tenses,
    participles,
  };
}

/** A verb in the pack: every cell is `reviewed`, nothing is compared and no AI is involved. */
export function verifyPackVerb(row: Verb): VerifiedVerb {
  const generated =
    row.rule === 'irregular'
      ? undefined
      : generateVerb(
          { ...row, base: engineBase(row.infinitive) },
          { [row.id]: { participles: { past: row.participles.past.ms } } },
        );
  return {
    ...checkView(
      row,
      (tense, person) => ({
        status: 'reviewed',
        ...(generated && !isCompoundTense(tense) && { parts: generated.parts.simple[tense][person] }),
      }),
      () => ({ status: 'reviewed' }),
    ),
    status: 'pack-reviewed',
  };
}

/** An AI answer outside the pack: assembled for any rule, then compared with the engine where it can be. */
export function verifyAnswer(answer: ConjugationAnswer): VerifiedVerb {
  const { rule, generated } = runEngine(answer);
  const ouvrir = rule === 'ir-ouvrir';
  const view = assembleVerb(answer);

  const checked = checkView(
    { ...view, rule },
    (tense, person, cell) => {
      // A compound tense rests on the AI's auxiliary and agreement claims, which the engine cannot check.
      if (!generated || isCompoundTense(tense)) return { status: 'ai-only' };
      const ruleForms = ruleFormsOf(generated, tense, person, view.pronominal);
      const parts = generated.parts.simple[tense][person]!;
      return sameForms(cell.forms, ruleForms)
        ? { status: 'match', parts: cell.forms.map((form) => parts.find((part) => joinParts(part) === form)!) }
        : { status: 'differs', ruleForms, ruleParts: parts };
    },
    (key, form) => {
      if (!generated || (ouvrir && key !== 'present')) return { status: 'ai-only' };
      const { present, past } = generated.verb.participles;
      const ruleForm = key === 'present' ? present : past[key];
      return form === ruleForm ? { status: 'match' } : { status: 'differs', ruleForm };
    },
  );

  const statuses = [
    ...Object.values(checked.tenses).flatMap((cells) => Object.values(cells).map((cell) => cell.status)),
    ...Object.values(checked.participles).map((participle) => participle.status),
  ];
  const status: VerbStatus = !generated ? 'ai-only' : statuses.includes('differs') ? 'partly-differs' : 'rule-checked';
  return { ...checked, status };
}
