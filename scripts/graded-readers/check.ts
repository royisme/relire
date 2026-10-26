/** Owns the offline draft-check CLI only; never marks reviews or publishes. */
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { z } from 'zod';
import { ReaderReviewsSchema, ReaderSyllabusSchema } from '../../src/types/gradedReader';
import { NounGenderPackSchema } from '../../src/types/nounGender';
import { repositoryRoot } from '../grammar-topics/reference';
import { privateDraftDirectory, readCandidates, readCore, readDraft } from './drafts';
import { GateEvidenceSchema } from './gateInputs';
import { offlineLexicon } from './lexiconOffline';
import { checkDraft } from './gates';

export async function runCheck(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { stage: { type: 'string' } }, strict: true });
  const order = z.coerce.number().int().min(1).max(12).parse(values.stage);
  const draft = await readDraft(privateDraftDirectory, order);
  if (!draft) throw new Error(`Missing private draft: drafts-${order}.json`);
  const syllabus = ReaderSyllabusSchema.parse(
    await Bun.file(join(repositoryRoot, 'data/graded-readers/syllabus.json')).json(),
  );
  const reviews = ReaderReviewsSchema.parse(
    await Bun.file(join(repositoryRoot, 'data/graded-readers/reviews.json')).json(),
  );
  const manifest = z
    .object({ topics: z.array(z.object({ id: z.string() })) })
    .parse(await Bun.file(join(repositoryRoot, 'data/grammar-topics/manifest.json')).json());
  const nounPack = NounGenderPackSchema.parse(
    await Bun.file(join(repositoryRoot, 'src/data/noun-gender/pack.json')).json(),
  );
  const previous = [];
  for (const stage of syllabus.stages.slice(0, order - 1)) {
    if (!stage.include) continue;
    const predecessor = await readDraft(privateDraftDirectory, stage.order);
    if (!predecessor) throw new Error(`Missing private predecessor: drafts-${stage.order}.json`);
    previous.push(predecessor);
  }
  const diagnostics = checkDraft(draft, {
    syllabus,
    reviews,
    previous,
    topicIds: manifest.topics.map((topic) => topic.id),
    core: await readCore(privateDraftDirectory),
    candidates: await readCandidates(privateDraftDirectory, order),
    evidence: GateEvidenceSchema.parse(
      await Bun.file(join(privateDraftDirectory, `gate-evidence-${order}.json`)).json(),
    ),
    reviewedNouns: nounPack.nouns
      .filter((noun) => noun.prov.status === 'reviewed')
      .map((noun) => ({
        lemma: noun.lemma,
        gender: noun.gender === 'f' ? ('feminine' as const) : ('masculine' as const),
      })),
    lexicon: await offlineLexicon(repositoryRoot),
  });
  console.log(JSON.stringify(diagnostics, null, 2));
  if (!diagnostics.length) console.log('G0–G5 gates passed; this is not French verification or review approval.');
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0;
}
if (import.meta.main) {
  try {
    process.exitCode = await runCheck(process.argv.slice(2));
  } catch (error) {
    console.error(`Graded-reader tooling error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
