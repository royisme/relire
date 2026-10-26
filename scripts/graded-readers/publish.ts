/** Owns the bundled starter export and its metadata-and-artifact check; gates, reviews and privacy scans stay in the reused pipeline. */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  ReaderReviewsSchema,
  ReaderSyllabusSchema,
  StarterFileSchema,
  type ReaderSyllabus,
} from '../../src/types/gradedReader';
import { repositoryRoot } from '../grammar-topics/reference';
import { assemble } from './assemble';
import { writeJson } from './drafts';
import { contentHash } from './gateInputs';
import { loadReviewInputs, readReviewMetadata } from './reviewInputs';
import { latestReview } from './reviewState';

const STARTER_BUDGET_BYTES = 100 * 1024;
export const starterFile = (root: string) => join(root, 'src/data/graded-readers/starter.json');

/**
 * Metadata-and-artifact only: the committed starter must parse as the strict public shape, carry exactly the bundled
 * syllabus stages in order under the committed syllabusVersion, and match the current review records and body hashes.
 * It never reads private drafts, candidates, evidence or Morphalou.
 */
export async function checkStarter(rawStarter: unknown, rawSyllabus: unknown, rawReviews: unknown, bytes: number) {
  const syllabus = ReaderSyllabusSchema.parse(rawSyllabus);
  const reviews = ReaderReviewsSchema.parse(rawReviews);
  const parsed = StarterFileSchema.safeParse(rawStarter);
  if (!parsed.success)
    throw new Error(
      `starter.json is not the strict public shape: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  const starter = parsed.data;
  if (starter.syllabusVersion !== syllabus.syllabusVersion)
    throw new Error(
      `Starter syllabusVersion ${starter.syllabusVersion} does not match the committed ${syllabus.syllabusVersion}`,
    );
  if (bytes > STARTER_BUDGET_BYTES)
    throw new Error(`starter.json is ${bytes} bytes, over the ${STARTER_BUDGET_BYTES}-byte budget`);
  const bundled = syllabus.stages.filter((stage) => stage.bundled).map((stage) => stage.readerId);
  const published = starter.readers.map((reader) => reader.body.id);
  if (published.join(',') !== bundled.join(','))
    throw new Error(
      `Starter readers [${published.join(', ')}] must be exactly the bundled stages [${bundled.join(', ')}] in syllabus order`,
    );
  for (const reader of starter.readers) {
    if (reader.version !== contentHash(reader.body))
      throw new Error(`${reader.body.id}: published version does not match its canonical body hash`);
    const record = latestReview(reviews, reader.body.id);
    if (
      !record ||
      record.contentHash !== reader.review.contentHash ||
      record.reviewedBy !== reader.review.reviewedBy ||
      record.reviewedAt !== reader.review.reviewedAt
    )
      throw new Error(`${reader.body.id}: the starter review does not match the current committed record`);
  }
  return starter.readers.length;
}

export async function runPublish(args: string[], root = repositoryRoot): Promise<number> {
  const { values } = parseArgs({ args, options: { check: { type: 'boolean' } }, strict: true });
  const { syllabus, reviews } = await readReviewMetadata(root);
  if (values.check) {
    const file = Bun.file(starterFile(root));
    const readers = await checkStarter(await file.json(), syllabus, reviews, file.size);
    console.log(`Starter artifact check passed: ${readers} bundled reader(s), ${file.size} bytes.`);
    return 0;
  }
  // The starter is exactly the bundled prefix; the service keeps publishing included-but-remote stages separately.
  const bundledSyllabus: ReaderSyllabus = {
    ...syllabus,
    stages: syllabus.stages.map((stage) => ({ ...stage, include: stage.include && stage.bundled })),
  };
  const orders = bundledSyllabus.stages.filter((stage) => stage.include).map((stage) => stage.order);
  const inputs = await loadReviewInputs(root, syllabus, orders);
  const readers = assemble(inputs.drafts, reviews, bundledSyllabus, inputs.context);
  await writeJson(starterFile(root), { schemaVersion: 1, syllabusVersion: syllabus.syllabusVersion, readers });
  // Read the artifact back: a written starter must survive its own committed-state check.
  const written = Bun.file(starterFile(root));
  await checkStarter(await written.json(), syllabus, reviews, written.size);
  console.log(`Wrote ${starterFile(root)}: ${readers.length} bundled reader(s), ${written.size} bytes.`);
  return 0;
}
if (import.meta.main) {
  try {
    process.exitCode = await runPublish(process.argv.slice(2));
  } catch (error) {
    console.error(`Graded-reader publish error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
