/**
 * Drafted by the worker from knowledge. UNVERIFIED until the owner confirms.
 * Checks the generator only, not the forms.
 *
 * Golden tables of the 15 LC1 verbs added in #40: every tense and participle,
 * typed by the worker from knowledge of French conjugation before any engine
 * output for these verbs was read. This file holds the 12 avoir-aux verbs; the
 * être-aux verbs (venir, partir, sortir), whose compound tenses carry agreement
 * variants, are in grammarPackGoldenLc1Etre.ts. Cell literals are
 * `lead|form|variant` (the pipe never occurs in a form) and a tense literal is
 * six cells joined by `; ` in FINITE_PERSONS order, so every lead and form
 * stays literal: a bug common to the generator and its checks cannot hide here.
 */
import {
  FINITE_PERSONS,
  IMPERATIVE_PERSONS,
  type Cell,
  type ImperativePerson,
  type Person,
  type Tense,
  type Verb,
} from '../../src/types/grammarPack';

export type GoldenVerb = Omit<Verb, 'prov'>;

const cell = (literal: string): Cell => {
  const [lead, ...forms] = literal.split('|');
  return { lead, forms };
};

const rows = (tense: string) => {
  const literals = tense.split('; ');
  if (literals.length !== FINITE_PERSONS.length) throw new Error(`six persons expected in "${tense}"`);
  return Object.fromEntries(FINITE_PERSONS.map((person, i) => [person, cell(literals[i]!)])) as Record<Person, Cell>;
};

const imperatifCells = (tense: string) => {
  const literals = tense.split('; ');
  if (literals.length !== IMPERATIVE_PERSONS.length) throw new Error(`three persons expected in "${tense}"`);
  return Object.fromEntries(IMPERATIVE_PERSONS.map((person, i) => [person, cell(literals[i]!)])) as Record<
    ImperativePerson,
    Cell
  >;
};

/**
 * `head` is `id|infinitive|aux|rule|present|ms|fs|mp|fp` of the participles,
 * plus a trailing `noImperative` for the one verb without an imperative.
 */
export const golden = (
  head: string,
  tenses: { [T in Exclude<Tense, 'imperatif'>]: string } & { imperatif?: string },
): GoldenVerb => {
  const [id, infinitive, aux, rule, present, ms, fs, mp, fp, noImperative] = head.split('|');
  const { imperatif, ...finite } = tenses;
  return {
    id,
    infinitive,
    pronominal: false,
    aux: aux as Verb['aux'],
    rule: rule as GoldenVerb['rule'],
    ...(noImperative !== undefined && { noImperative: true }),
    tenses: {
      ...(Object.fromEntries(Object.entries(finite).map(([tense, literal]) => [tense, rows(literal)])) as Omit<
        Verb['tenses'],
        'imperatif'
      >),
      ...(imperatif !== undefined && { imperatif: imperatifCells(imperatif) }),
    },
    participles: { present: present!, past: { ms: ms!, fs: fs!, mp: mp!, fp: fp! } },
  };
};

export const GOLDEN_LC1_AVOIR: Record<string, GoldenVerb> = {
  faire: golden('faire|faire|avoir|irregular|faisant|fait|faite|faits|faites', {
    present: 'je|fais; tu|fais; il/elle|fait; nous|faisons; vous|faites; ils/elles|font',
    passeCompose: 'j’|ai fait; tu|as fait; il/elle|a fait; nous|avons fait; vous|avez fait; ils/elles|ont fait',
    imparfait: 'je|faisais; tu|faisais; il/elle|faisait; nous|faisions; vous|faisiez; ils/elles|faisaient',
    plusQueParfait:
      'j’|avais fait; tu|avais fait; il/elle|avait fait; nous|avions fait; vous|aviez fait; ils/elles|avaient fait',
    futur: 'je|ferai; tu|feras; il/elle|fera; nous|ferons; vous|ferez; ils/elles|feront',
    futurAnterieur:
      'j’|aurai fait; tu|auras fait; il/elle|aura fait; nous|aurons fait; vous|aurez fait; ils/elles|auront fait',
    conditionnel: 'je|ferais; tu|ferais; il/elle|ferait; nous|ferions; vous|feriez; ils/elles|feraient',
    conditionnelPasse:
      'j’|aurais fait; tu|aurais fait; il/elle|aurait fait; nous|aurions fait; vous|auriez fait; ils/elles|auraient fait',
    subjonctif:
      'que je|fasse; que tu|fasses; qu’il/elle|fasse; que nous|fassions; que vous|fassiez; qu’ils/elles|fassent',
    subjonctifPasse:
      'que j’|aie fait; que tu|aies fait; qu’il/elle|ait fait; que nous|ayons fait; que vous|ayez fait; qu’ils/elles|aient fait',
    imperatif: '|fais; |faisons; |faites',
  }),
  prendre: golden('prendre|prendre|avoir|irregular|prenant|pris|prise|pris|prises', {
    present: 'je|prends; tu|prends; il/elle|prend; nous|prenons; vous|prenez; ils/elles|prennent',
    passeCompose: 'j’|ai pris; tu|as pris; il/elle|a pris; nous|avons pris; vous|avez pris; ils/elles|ont pris',
    imparfait: 'je|prenais; tu|prenais; il/elle|prenait; nous|prenions; vous|preniez; ils/elles|prenaient',
    plusQueParfait:
      'j’|avais pris; tu|avais pris; il/elle|avait pris; nous|avions pris; vous|aviez pris; ils/elles|avaient pris',
    futur: 'je|prendrai; tu|prendras; il/elle|prendra; nous|prendrons; vous|prendrez; ils/elles|prendront',
    futurAnterieur:
      'j’|aurai pris; tu|auras pris; il/elle|aura pris; nous|aurons pris; vous|aurez pris; ils/elles|auront pris',
    conditionnel:
      'je|prendrais; tu|prendrais; il/elle|prendrait; nous|prendrions; vous|prendriez; ils/elles|prendraient',
    conditionnelPasse:
      'j’|aurais pris; tu|aurais pris; il/elle|aurait pris; nous|aurions pris; vous|auriez pris; ils/elles|auraient pris',
    subjonctif:
      'que je|prenne; que tu|prennes; qu’il/elle|prenne; que nous|prenions; que vous|preniez; qu’ils/elles|prennent',
    subjonctifPasse:
      'que j’|aie pris; que tu|aies pris; qu’il/elle|ait pris; que nous|ayons pris; que vous|ayez pris; qu’ils/elles|aient pris',
    imperatif: '|prends; |prenons; |prenez',
  }),
  pouvoir: golden('pouvoir|pouvoir|avoir|irregular|pouvant|pu|pu|pu|pu|noImperative', {
    present: 'je|peux; tu|peux; il/elle|peut; nous|pouvons; vous|pouvez; ils/elles|peuvent',
    passeCompose: 'j’|ai pu; tu|as pu; il/elle|a pu; nous|avons pu; vous|avez pu; ils/elles|ont pu',
    imparfait: 'je|pouvais; tu|pouvais; il/elle|pouvait; nous|pouvions; vous|pouviez; ils/elles|pouvaient',
    plusQueParfait: 'j’|avais pu; tu|avais pu; il/elle|avait pu; nous|avions pu; vous|aviez pu; ils/elles|avaient pu',
    futur: 'je|pourrai; tu|pourras; il/elle|pourra; nous|pourrons; vous|pourrez; ils/elles|pourront',
    futurAnterieur: 'j’|aurai pu; tu|auras pu; il/elle|aura pu; nous|aurons pu; vous|aurez pu; ils/elles|auront pu',
    conditionnel: 'je|pourrais; tu|pourrais; il/elle|pourrait; nous|pourrions; vous|pourriez; ils/elles|pourraient',
    conditionnelPasse:
      'j’|aurais pu; tu|aurais pu; il/elle|aurait pu; nous|aurions pu; vous|auriez pu; ils/elles|auraient pu',
    subjonctif:
      'que je|puisse; que tu|puisses; qu’il/elle|puisse; que nous|puissions; que vous|puissiez; qu’ils/elles|puissent',
    subjonctifPasse:
      'que j’|aie pu; que tu|aies pu; qu’il/elle|ait pu; que nous|ayons pu; que vous|ayez pu; qu’ils/elles|aient pu',
  }),
  vouloir: golden('vouloir|vouloir|avoir|irregular|voulant|voulu|voulue|voulus|voulues', {
    present: 'je|veux; tu|veux; il/elle|veut; nous|voulons; vous|voulez; ils/elles|veulent',
    passeCompose: 'j’|ai voulu; tu|as voulu; il/elle|a voulu; nous|avons voulu; vous|avez voulu; ils/elles|ont voulu',
    imparfait: 'je|voulais; tu|voulais; il/elle|voulait; nous|voulions; vous|vouliez; ils/elles|voulaient',
    plusQueParfait:
      'j’|avais voulu; tu|avais voulu; il/elle|avait voulu; nous|avions voulu; vous|aviez voulu; ils/elles|avaient voulu',
    futur: 'je|voudrai; tu|voudras; il/elle|voudra; nous|voudrons; vous|voudrez; ils/elles|voudront',
    futurAnterieur:
      'j’|aurai voulu; tu|auras voulu; il/elle|aura voulu; nous|aurons voulu; vous|aurez voulu; ils/elles|auront voulu',
    conditionnel: 'je|voudrais; tu|voudrais; il/elle|voudrait; nous|voudrions; vous|voudriez; ils/elles|voudraient',
    conditionnelPasse:
      'j’|aurais voulu; tu|aurais voulu; il/elle|aurait voulu; nous|aurions voulu; vous|auriez voulu; ils/elles|auraient voulu',
    subjonctif:
      'que je|veuille; que tu|veuilles; qu’il/elle|veuille; que nous|voulions; que vous|vouliez; qu’ils/elles|veuillent',
    subjonctifPasse:
      'que j’|aie voulu; que tu|aies voulu; qu’il/elle|ait voulu; que nous|ayons voulu; que vous|ayez voulu; qu’ils/elles|aient voulu',
    imperatif: '|veuille; |veuillons; |veuillez',
  }),
  savoir: golden('savoir|savoir|avoir|irregular|sachant|su|sue|sus|sues', {
    present: 'je|sais; tu|sais; il/elle|sait; nous|savons; vous|savez; ils/elles|savent',
    passeCompose: 'j’|ai su; tu|as su; il/elle|a su; nous|avons su; vous|avez su; ils/elles|ont su',
    imparfait: 'je|savais; tu|savais; il/elle|savait; nous|savions; vous|saviez; ils/elles|savaient',
    plusQueParfait: 'j’|avais su; tu|avais su; il/elle|avait su; nous|avions su; vous|aviez su; ils/elles|avaient su',
    futur: 'je|saurai; tu|sauras; il/elle|saura; nous|saurons; vous|saurez; ils/elles|sauront',
    futurAnterieur: 'j’|aurai su; tu|auras su; il/elle|aura su; nous|aurons su; vous|aurez su; ils/elles|auront su',
    conditionnel: 'je|saurais; tu|saurais; il/elle|saurait; nous|saurions; vous|sauriez; ils/elles|sauraient',
    conditionnelPasse:
      'j’|aurais su; tu|aurais su; il/elle|aurait su; nous|aurions su; vous|auriez su; ils/elles|auraient su',
    subjonctif:
      'que je|sache; que tu|saches; qu’il/elle|sache; que nous|sachions; que vous|sachiez; qu’ils/elles|sachent',
    subjonctifPasse:
      'que j’|aie su; que tu|aies su; qu’il/elle|ait su; que nous|ayons su; que vous|ayez su; qu’ils/elles|aient su',
    imperatif: '|sache; |sachons; |sachez',
  }),
  voir: golden('voir|voir|avoir|irregular|voyant|vu|vue|vus|vues', {
    present: 'je|vois; tu|vois; il/elle|voit; nous|voyons; vous|voyez; ils/elles|voient',
    passeCompose: 'j’|ai vu; tu|as vu; il/elle|a vu; nous|avons vu; vous|avez vu; ils/elles|ont vu',
    imparfait: 'je|voyais; tu|voyais; il/elle|voyait; nous|voyions; vous|voyiez; ils/elles|voyaient',
    plusQueParfait: 'j’|avais vu; tu|avais vu; il/elle|avait vu; nous|avions vu; vous|aviez vu; ils/elles|avaient vu',
    futur: 'je|verrai; tu|verras; il/elle|verra; nous|verrons; vous|verrez; ils/elles|verront',
    futurAnterieur: 'j’|aurai vu; tu|auras vu; il/elle|aura vu; nous|aurons vu; vous|aurez vu; ils/elles|auront vu',
    conditionnel: 'je|verrais; tu|verrais; il/elle|verrait; nous|verrions; vous|verriez; ils/elles|verraient',
    conditionnelPasse:
      'j’|aurais vu; tu|aurais vu; il/elle|aurait vu; nous|aurions vu; vous|auriez vu; ils/elles|auraient vu',
    subjonctif: 'que je|voie; que tu|voies; qu’il/elle|voie; que nous|voyions; que vous|voyiez; qu’ils/elles|voient',
    subjonctifPasse:
      'que j’|aie vu; que tu|aies vu; qu’il/elle|ait vu; que nous|ayons vu; que vous|ayez vu; qu’ils/elles|aient vu',
    imperatif: '|vois; |voyons; |voyez',
  }),
  dire: golden('dire|dire|avoir|irregular|disant|dit|dite|dits|dites', {
    present: 'je|dis; tu|dis; il/elle|dit; nous|disons; vous|dites; ils/elles|disent',
    passeCompose: 'j’|ai dit; tu|as dit; il/elle|a dit; nous|avons dit; vous|avez dit; ils/elles|ont dit',
    imparfait: 'je|disais; tu|disais; il/elle|disait; nous|disions; vous|disiez; ils/elles|disaient',
    plusQueParfait:
      'j’|avais dit; tu|avais dit; il/elle|avait dit; nous|avions dit; vous|aviez dit; ils/elles|avaient dit',
    futur: 'je|dirai; tu|diras; il/elle|dira; nous|dirons; vous|direz; ils/elles|diront',
    futurAnterieur:
      'j’|aurai dit; tu|auras dit; il/elle|aura dit; nous|aurons dit; vous|aurez dit; ils/elles|auront dit',
    conditionnel: 'je|dirais; tu|dirais; il/elle|dirait; nous|dirions; vous|diriez; ils/elles|diraient',
    conditionnelPasse:
      'j’|aurais dit; tu|aurais dit; il/elle|aurait dit; nous|aurions dit; vous|auriez dit; ils/elles|auraient dit',
    subjonctif: 'que je|dise; que tu|dises; qu’il/elle|dise; que nous|disions; que vous|disiez; qu’ils/elles|disent',
    subjonctifPasse:
      'que j’|aie dit; que tu|aies dit; qu’il/elle|ait dit; que nous|ayons dit; que vous|ayez dit; qu’ils/elles|aient dit',
    imperatif: '|dis; |disons; |dites',
  }),
  mettre: golden('mettre|mettre|avoir|irregular|mettant|mis|mise|mis|mises', {
    present: 'je|mets; tu|mets; il/elle|met; nous|mettons; vous|mettez; ils/elles|mettent',
    passeCompose: 'j’|ai mis; tu|as mis; il/elle|a mis; nous|avons mis; vous|avez mis; ils/elles|ont mis',
    imparfait: 'je|mettais; tu|mettais; il/elle|mettait; nous|mettions; vous|mettiez; ils/elles|mettaient',
    plusQueParfait:
      'j’|avais mis; tu|avais mis; il/elle|avait mis; nous|avions mis; vous|aviez mis; ils/elles|avaient mis',
    futur: 'je|mettrai; tu|mettras; il/elle|mettra; nous|mettrons; vous|mettrez; ils/elles|mettront',
    futurAnterieur:
      'j’|aurai mis; tu|auras mis; il/elle|aura mis; nous|aurons mis; vous|aurez mis; ils/elles|auront mis',
    conditionnel: 'je|mettrais; tu|mettrais; il/elle|mettrait; nous|mettrions; vous|mettriez; ils/elles|mettraient',
    conditionnelPasse:
      'j’|aurais mis; tu|aurais mis; il/elle|aurait mis; nous|aurions mis; vous|auriez mis; ils/elles|auraient mis',
    subjonctif:
      'que je|mette; que tu|mettes; qu’il/elle|mette; que nous|mettions; que vous|mettiez; qu’ils/elles|mettent',
    subjonctifPasse:
      'que j’|aie mis; que tu|aies mis; qu’il/elle|ait mis; que nous|ayons mis; que vous|ayez mis; qu’ils/elles|aient mis',
    imperatif: '|mets; |mettons; |mettez',
  }),
  lire: golden('lire|lire|avoir|irregular|lisant|lu|lue|lus|lues', {
    present: 'je|lis; tu|lis; il/elle|lit; nous|lisons; vous|lisez; ils/elles|lisent',
    passeCompose: 'j’|ai lu; tu|as lu; il/elle|a lu; nous|avons lu; vous|avez lu; ils/elles|ont lu',
    imparfait: 'je|lisais; tu|lisais; il/elle|lisait; nous|lisions; vous|lisiez; ils/elles|lisaient',
    plusQueParfait: 'j’|avais lu; tu|avais lu; il/elle|avait lu; nous|avions lu; vous|aviez lu; ils/elles|avaient lu',
    futur: 'je|lirai; tu|liras; il/elle|lira; nous|lirons; vous|lirez; ils/elles|liront',
    futurAnterieur: 'j’|aurai lu; tu|auras lu; il/elle|aura lu; nous|aurons lu; vous|aurez lu; ils/elles|auront lu',
    conditionnel: 'je|lirais; tu|lirais; il/elle|lirait; nous|lirions; vous|liriez; ils/elles|liraient',
    conditionnelPasse:
      'j’|aurais lu; tu|aurais lu; il/elle|aurait lu; nous|aurions lu; vous|auriez lu; ils/elles|auraient lu',
    subjonctif: 'que je|lise; que tu|lises; qu’il/elle|lise; que nous|lisions; que vous|lisiez; qu’ils/elles|lisent',
    subjonctifPasse:
      'que j’|aie lu; que tu|aies lu; qu’il/elle|ait lu; que nous|ayons lu; que vous|ayez lu; qu’ils/elles|aient lu',
    imperatif: '|lis; |lisons; |lisez',
  }),
  ecrire: golden('ecrire|écrire|avoir|irregular|écrivant|écrit|écrite|écrits|écrites', {
    present: 'j’|écris; tu|écris; il/elle|écrit; nous|écrivons; vous|écrivez; ils/elles|écrivent',
    passeCompose: 'j’|ai écrit; tu|as écrit; il/elle|a écrit; nous|avons écrit; vous|avez écrit; ils/elles|ont écrit',
    imparfait: 'j’|écrivais; tu|écrivais; il/elle|écrivait; nous|écrivions; vous|écriviez; ils/elles|écrivaient',
    plusQueParfait:
      'j’|avais écrit; tu|avais écrit; il/elle|avait écrit; nous|avions écrit; vous|aviez écrit; ils/elles|avaient écrit',
    futur: 'j’|écrirai; tu|écriras; il/elle|écrira; nous|écrirons; vous|écrirez; ils/elles|écriront',
    futurAnterieur:
      'j’|aurai écrit; tu|auras écrit; il/elle|aura écrit; nous|aurons écrit; vous|aurez écrit; ils/elles|auront écrit',
    conditionnel: 'j’|écrirais; tu|écrirais; il/elle|écrirait; nous|écririons; vous|écririez; ils/elles|écriraient',
    conditionnelPasse:
      'j’|aurais écrit; tu|aurais écrit; il/elle|aurait écrit; nous|aurions écrit; vous|auriez écrit; ils/elles|auraient écrit',
    subjonctif:
      'que j’|écrive; que tu|écrives; qu’il/elle|écrive; que nous|écrivions; que vous|écriviez; qu’ils/elles|écrivent',
    subjonctifPasse:
      'que j’|aie écrit; que tu|aies écrit; qu’il/elle|ait écrit; que nous|ayons écrit; que vous|ayez écrit; qu’ils/elles|aient écrit',
    imperatif: '|écris; |écrivons; |écrivez',
  }),
  boire: golden('boire|boire|avoir|irregular|buvant|bu|bue|bus|bues', {
    present: 'je|bois; tu|bois; il/elle|boit; nous|buvons; vous|buvez; ils/elles|boivent',
    passeCompose: 'j’|ai bu; tu|as bu; il/elle|a bu; nous|avons bu; vous|avez bu; ils/elles|ont bu',
    imparfait: 'je|buvais; tu|buvais; il/elle|buvait; nous|buvions; vous|buviez; ils/elles|buvaient',
    plusQueParfait: 'j’|avais bu; tu|avais bu; il/elle|avait bu; nous|avions bu; vous|aviez bu; ils/elles|avaient bu',
    futur: 'je|boirai; tu|boiras; il/elle|boira; nous|boirons; vous|boirez; ils/elles|boiront',
    futurAnterieur: 'j’|aurai bu; tu|auras bu; il/elle|aura bu; nous|aurons bu; vous|aurez bu; ils/elles|auront bu',
    conditionnel: 'je|boirais; tu|boirais; il/elle|boirait; nous|boirions; vous|boiriez; ils/elles|boiraient',
    conditionnelPasse:
      'j’|aurais bu; tu|aurais bu; il/elle|aurait bu; nous|aurions bu; vous|auriez bu; ils/elles|auraient bu',
    subjonctif:
      'que je|boive; que tu|boives; qu’il/elle|boive; que nous|buvions; que vous|buviez; qu’ils/elles|boivent',
    subjonctifPasse:
      'que j’|aie bu; que tu|aies bu; qu’il/elle|ait bu; que nous|ayons bu; que vous|ayez bu; qu’ils/elles|aient bu',
    imperatif: '|bois; |buvons; |buvez',
  }),
  croire: golden('croire|croire|avoir|irregular|croyant|cru|crue|crus|crues', {
    present: 'je|crois; tu|crois; il/elle|croit; nous|croyons; vous|croyez; ils/elles|croient',
    passeCompose: 'j’|ai cru; tu|as cru; il/elle|a cru; nous|avons cru; vous|avez cru; ils/elles|ont cru',
    imparfait: 'je|croyais; tu|croyais; il/elle|croyait; nous|croyions; vous|croyiez; ils/elles|croyaient',
    plusQueParfait:
      'j’|avais cru; tu|avais cru; il/elle|avait cru; nous|avions cru; vous|aviez cru; ils/elles|avaient cru',
    futur: 'je|croirai; tu|croiras; il/elle|croira; nous|croirons; vous|croirez; ils/elles|croiront',
    futurAnterieur:
      'j’|aurai cru; tu|auras cru; il/elle|aura cru; nous|aurons cru; vous|aurez cru; ils/elles|auront cru',
    conditionnel: 'je|croirais; tu|croirais; il/elle|croirait; nous|croirions; vous|croiriez; ils/elles|croiraient',
    conditionnelPasse:
      'j’|aurais cru; tu|aurais cru; il/elle|aurait cru; nous|aurions cru; vous|auriez cru; ils/elles|auraient cru',
    subjonctif:
      'que je|croie; que tu|croies; qu’il/elle|croie; que nous|croyions; que vous|croyiez; qu’ils/elles|croient',
    subjonctifPasse:
      'que j’|aie cru; que tu|aies cru; qu’il/elle|ait cru; que nous|ayons cru; que vous|ayez cru; qu’ils/elles|aient cru',
    imperatif: '|crois; |croyons; |croyez',
  }),
};
