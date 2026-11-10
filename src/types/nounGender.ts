/**
 * Noun-gender pack contract: the Zod schemas of the shipped ending-tendency
 * corpus (the A1 noun list, the measured rules, provenance) and the structural
 * invariants checked at load, including the re-derivation of every rule's A1
 * figures from the shipped nouns so stated numbers cannot disagree with the
 * list. Owns what a valid pack looks like. Does not own measurement or the
 * publish gate (scripts/noun-gender), nor loading. Rule captions are locale
 * keys `nounGender.rules.<id>`, never stored here.
 */
import { z } from 'zod';

const text = z.string().trim().min(1);
const count = z.number().int().nonnegative();
const slug = z.string().regex(/^[a-z]+(-[a-z]+)*$/);

export const GenderSchema = z.enum(['m', 'f']);
export type Gender = z.infer<typeof GenderSchema>;

export const NounProvenanceSchema = z
  .object({
    origin: z.enum(['clarte-seed', 'agy-drafted', 'human']),
    checkedAgainst: z.array(z.enum(['consistency', 'morphalou-3.1', 'human'])),
    checkedAt: z.iso.date().optional(), // required unless status is 'draft'
    status: z.enum(['draft', 'reviewed', 'rejected']),
    reviewedBy: text.optional(), // required when status is 'reviewed'
  })
  .superRefine((prov, ctx) => {
    if (prov.status !== 'draft' && prov.checkedAt === undefined) {
      ctx.addIssue({ code: 'custom', path: ['checkedAt'], message: 'checkedAt is required unless status is draft' });
    }
    if (prov.status === 'reviewed' && prov.reviewedBy === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reviewedBy'], message: 'reviewedBy is required when status is reviewed' });
    }
  });
export type NounProvenance = z.infer<typeof NounProvenanceSchema>;

export const NounSchema = z
  .object({
    /** Ascii slug of the lemma, unique. */
    id: slug,
    lemma: text,
    gender: GenderSchema,
    prov: NounProvenanceSchema,
  })
  .superRefine((noun, ctx) => {
    if (noun.lemma !== noun.lemma.normalize('NFC')) {
      ctx.addIssue({ code: 'custom', path: ['lemma'], message: 'string is not NFC' });
    }
  });
export type Noun = z.infer<typeof NounSchema>;

export const NounRuleSchema = z
  .object({
    id: slug,
    /** The ending without the leading hyphen: "tion", "ée". */
    ending: text,
    gender: GenderSchema,
    /** Dictionary figures from the offline Morphalou measurement. */
    dictionary: z.object({ n: count, agree: count }),
    /** A1 figures over the shipped nouns; re-derived at load. */
    a1: z.object({ n: count, agree: count }),
    /** Noun ids, list order, at most the first 5 agreeing nouns. */
    examples: z.array(slug).min(3).max(5),
    /** Every shipped noun with the ending that breaks the rule. */
    exceptions: z.array(slug),
    prov: NounProvenanceSchema,
  })
  .superRefine((rule, ctx) => {
    if (rule.ending !== rule.ending.normalize('NFC')) {
      ctx.addIssue({ code: 'custom', path: ['ending'], message: 'string is not NFC' });
    }
    if (rule.ending !== rule.ending.toLowerCase() || !/^\p{Ll}+$/u.test(rule.ending)) {
      ctx.addIssue({ code: 'custom', path: ['ending'], message: 'ending must be lowercase letters only' });
    }
    for (const [key, { n, agree }] of [
      ['dictionary', rule.dictionary],
      ['a1', rule.a1],
    ] as const) {
      if (agree > n) ctx.addIssue({ code: 'custom', path: [key, 'agree'], message: 'agree exceeds n' });
    }
  });
export type NounRule = z.infer<typeof NounRuleSchema>;

export const NounGenderPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    packVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    nouns: z.array(NounSchema).min(1),
    rules: z.array(NounRuleSchema),
  })
  .superRefine((pack, ctx) => {
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    const seen = new Set<string>();
    pack.nouns.forEach((noun, i) => {
      if (seen.has(noun.id)) fail(['nouns', i, 'id'], `duplicate id ${noun.id}`);
      seen.add(noun.id);
      // The publish gate: draft and rejected rows never ship.
      if (noun.prov.status !== 'reviewed') {
        fail(['nouns', i, 'prov', 'status'], `${noun.id} has status ${noun.prov.status}; only reviewed ships`);
      }
    });
    const byId = new Map(pack.nouns.map((noun) => [noun.id, noun]));

    const ruleIds = new Set<string>();
    pack.rules.forEach((rule, i) => {
      if (ruleIds.has(rule.id)) fail(['rules', i, 'id'], `duplicate id ${rule.id}`);
      ruleIds.add(rule.id);
      if (rule.prov.status !== 'reviewed') {
        fail(['rules', i, 'prov', 'status'], `${rule.id} has status ${rule.prov.status}; only reviewed ships`);
      }
      // A1 figures are recomputed from the shipped list, so they cannot disagree with it.
      const matching = pack.nouns.filter((noun) => noun.lemma.endsWith(rule.ending));
      const agree = matching.filter((noun) => noun.gender === rule.gender).length;
      if (rule.a1.n !== matching.length || rule.a1.agree !== agree) {
        fail(
          ['rules', i, 'a1'],
          `${rule.id} states a1 ${rule.a1.agree}/${rule.a1.n}; the noun list gives ${agree}/${matching.length}`,
        );
      }
      for (const [key, expected] of [
        ['examples', rule.gender],
        ['exceptions', rule.gender === 'm' ? 'f' : 'm'],
      ] as const) {
        rule[key].forEach((nounId, j) => {
          const noun = byId.get(nounId);
          if (!noun) fail(['rules', i, key, j], `${rule.id} ${key} names unknown noun ${nounId}`);
          else if (!noun.lemma.endsWith(rule.ending)) {
            fail(['rules', i, key, j], `${nounId} does not end in ${rule.ending}`);
          } else if (noun.gender !== expected) {
            fail(['rules', i, key, j], `${nounId} is ${noun.gender}, not ${expected}`);
          }
        });
      }
    });
  });
export type NounGenderPack = z.infer<typeof NounGenderPackSchema>;
