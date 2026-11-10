/** Explicit-source private preparation; reads one stable byte snapshot and never rewrites the source. */
import { isAbsolute } from 'node:path';
import { open } from 'node:fs/promises';
import { prepareVocabulary, EMPTY_VOCABULARY_DECISIONS } from './prepareBook';
import { PublicVocabularyManifestSchema, vocabularyRepository } from './metadata';
export async function prepare(args: string[], root = vocabularyRepository) {
  if (args.length !== 2 || args[0] !== '--source' || !isAbsolute(args[1]))
    throw new Error('Usage: prepare.ts --source <absolute words.json>');
  const file = await open(args[1], 'r');
  let bytes: Buffer;
  try {
    const before = await file.stat();
    bytes = await file.readFile();
    const after = await file.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      bytes.length !== after.size
    )
      throw new Error('Source changed during preparation');
  } finally {
    await file.close();
  }
  const manifest = PublicVocabularyManifestSchema.parse(
    await Bun.file(new URL('data/vocabulary/manifest.json', root)).json(),
  );
  const { contentHash: _prior, ...metadata } = manifest;
  const decisionsFile = Bun.file(new URL('.local/vocabulary/decisions.json', root));
  const decisions = (await decisionsFile.exists()) ? await decisionsFile.json() : EMPTY_VOCABULARY_DECISIONS;
  const artifact = await prepareVocabulary(JSON.parse(bytes.toString('utf8')), metadata, decisions);
  const sourceHash = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  await Bun.write(new URL('.local/vocabulary/normalized.json', root), JSON.stringify(artifact, null, 2) + '\n');
  await Bun.write(
    new URL('.local/vocabulary/report.json', root),
    JSON.stringify({ sourceHash, ...artifact.report }, null, 2) + '\n',
  );
  await Bun.write(
    new URL('.local/vocabulary/review-sheet.txt', root),
    JSON.stringify(
      {
        contentHash: artifact.contentHash,
        objectives: ['Check meanings, examples and POS', 'Apply owner-selected C1/Canadian usage policy'],
        entries: artifact.entries,
        issues: artifact.report.issues,
      },
      null,
      2,
    ) + '\n',
  );
  await Bun.write(
    new URL('data/vocabulary/manifest.json', root),
    JSON.stringify({ ...metadata, contentHash: artifact.contentHash }, null, 2) + '\n',
  );
  console.log(`Prepared ${artifact.entries.length} entries; private report and review sheet in .local/vocabulary/`);
}
if (import.meta.main) {
  try {
    await prepare(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
