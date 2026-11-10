/** Owns disk loading for review tools; never writes content or review records. */
import { join } from 'node:path';
import { z } from 'zod';
import {
  ReaderReviewsSchema,
  ReaderSyllabusSchema,
  type ReaderSyllabus,
  type Stage,
} from '../../src/types/gradedReader';
import { NounGenderPackSchema } from '../../src/types/nounGender';
import { readCore, readCandidates, readDraft, type ReaderDraft } from './drafts';
import { GateEvidenceSchema, type GateContext } from './gateInputs';
import { offlineLexicon } from './lexiconOffline';

export type StageGateInputs = Omit<GateContext, 'syllabus' | 'reviews' | 'previous'>;
export type ReviewContext = (stage: Stage) => StageGateInputs;
export interface ReviewInputs {
  drafts: ReaderDraft[];
  context: ReviewContext;
}

export async function readReviewMetadata(root: string) {
  return {
    syllabus: ReaderSyllabusSchema.parse(await Bun.file(join(root, 'data/graded-readers/syllabus.json')).json()),
    reviews: ReaderReviewsSchema.parse(await Bun.file(join(root, 'data/graded-readers/reviews.json')).json()),
  };
}

export async function loadReviewInputs(
  root: string,
  syllabus: ReaderSyllabus,
  orders: number[],
): Promise<ReviewInputs> {
  const directory = join(root, '.local/graded-readers');
  const drafts: ReaderDraft[] = [];
  const through = Math.max(0, ...orders);
  for (const stage of syllabus.stages) {
    if (!orders.includes(stage.order) && !(stage.include && stage.order < through)) continue;
    const draft = await readDraft(directory, stage.order);
    if (draft) drafts.push(draft);
  }
  const contexts = new Map<number, StageGateInputs>();
  if (drafts.some((draft) => orders.includes(draft.body.order))) {
    const manifest = z
      .object({ topics: z.array(z.object({ id: z.string() })) })
      .parse(await Bun.file(join(root, 'data/grammar-topics/manifest.json')).json());
    const nounPack = NounGenderPackSchema.parse(await Bun.file(join(root, 'src/data/noun-gender/pack.json')).json());
    const common = {
      core: await readCore(directory),
      topicIds: manifest.topics.map((topic) => topic.id),
      lexicon: await offlineLexicon(root),
      reviewedNouns: nounPack.nouns
        .filter((noun) => noun.prov.status === 'reviewed')
        .map((noun) => ({
          lemma: noun.lemma,
          gender: noun.gender === 'f' ? ('feminine' as const) : ('masculine' as const),
        })),
    };
    for (const order of orders) {
      if (!drafts.some((draft) => draft.body.order === order)) continue;
      contexts.set(order, {
        ...common,
        candidates: await readCandidates(directory, order),
        evidence: GateEvidenceSchema.parse(await Bun.file(join(directory, `gate-evidence-${order}.json`)).json()),
      });
    }
  }
  return {
    drafts,
    context(stage) {
      const inputs = contexts.get(stage.order);
      if (!inputs) throw new Error(`${stage.readerId}: missing private gate inputs for stage ${stage.order}`);
      return inputs;
    },
  };
}

export function gateContext(
  stage: Stage,
  drafts: ReaderDraft[],
  syllabus: ReaderSyllabus,
  reviews: GateContext['reviews'],
  context: ReviewContext,
): GateContext {
  const earlier = syllabus.stages.filter((item) => item.include && item.order < stage.order);
  return {
    ...context(stage),
    syllabus,
    reviews,
    previous: drafts.filter((draft) => earlier.some((item) => item.readerId === draft.body.id)),
  };
}
