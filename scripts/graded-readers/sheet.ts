/** Owns complete terminal-only private review sheets; never marks reviews or certifies language. */
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { repositoryRoot } from '../grammar-topics/reference';
import { ReaderDraftSchema, type ReaderDraft } from './drafts';
import { lexicalKey } from './diagnostics';
import { contentHash, type GateContext } from './gateInputs';
import { checkDraft } from './gates';
import { gateContext, loadReviewInputs, readReviewMetadata } from './reviewInputs';
import { reviewStatus } from './reviewState';
import { targetInventory, tokenize } from './tokenize';

export function renderSheet(raw: ReaderDraft, context: GateContext): string {
  const draft = ReaderDraftSchema.parse(raw);
  const { body } = draft;
  const stage = context.syllabus.stages[body.order - 1];
  const targets = targetInventory(body).map((target) => ({
    ...target,
    tokens: tokenize(target, { compounds: context.evidence.compounds }, body.id),
  }));
  const known = new Set(
    [
      ...context.core.map(({ headword, ...entry }) => ({ ...entry, lemma: headword })),
      ...context.previous.flatMap((reader) => reader.body.glossary),
    ].map(lexicalKey),
  );
  const introduced = body.glossary.filter((entry) => !known.has(lexicalKey(entry)));
  const sentenceCounts = body.sentences.map((sentence) => ({
    sentenceId: sentence.id,
    atoms: targets.find((target) => target.id === sentence.id)!.tokens.atoms.length,
  }));
  const lines = [
    `${body.id} | stage ${body.order} | ${body.level} | Review: ${reviewStatus(draft, context)}`,
    'Private review sheet: gates are not French, English or Chinese language approval.',
    `Body hash: ${contentHash(body)}`,
    `Title FR | EN | ZH: ${body.title.fr} | ${body.title.en} | ${body.title.zh}`,
    `Stage caps and policy: ${JSON.stringify(stage)}`,
    `Counts (expanded atoms): ${JSON.stringify({
      title: targets[0].tokens.atoms.length,
      sentences: body.sentences.length,
      text: sentenceCounts.reduce((sum, sentence) => sum + sentence.atoms, 0),
      sentenceCounts,
      glossary: body.glossary.length,
      newEntries: introduced.length,
      newKeys: introduced.map(lexicalKey),
      knownKeys: body.glossary.filter((entry) => known.has(lexicalKey(entry))).map(lexicalKey),
    })}`,
    'Sentences: id | French | English | Chinese',
    ...body.sentences.map(
      (sentence) => `${sentence.id} | ${sentence.fr} | ${sentence.translation.en} | ${sentence.translation.zh}`,
    ),
    'Glossary (all EN/ZH glosses, gender and forms):',
    JSON.stringify(body.glossary, null, 2),
    'Authored parses of EVERY atom (including homographs and elisions; candidates are not selections):',
  ];
  for (const target of targets) {
    lines.push(`Target ${target.id}: ${target.text}`);
    for (const atom of target.tokens.atoms) {
      const analyses = draft.analyses.filter(
        (analysis) =>
          analysis.targetId === atom.targetId && analysis.ordinal === atom.ordinal && analysis.part === atom.part,
      );
      lines.push(
        JSON.stringify({
          atom,
          selections: analyses.map((analysis) => ({
            analysis,
            entry: body.glossary.find((entry) => entry.id === analysis.entryId),
          })),
          candidates: atom.readings.flatMap((form) => context.lexicon.candidates(form)),
        }),
      );
    }
  }
  lines.push(
    'All authored analyses (including unmatched annotations):',
    JSON.stringify(draft.analyses, null, 2),
    'Verb groups:',
    JSON.stringify(draft.verbGroups, null, 2),
    'Full learning payload (EVERY EN/ZH instruction, title, feedback summary/detail and by-answer message; answers and evidence):',
    JSON.stringify(body.learning, null, 2),
  );
  for (const checkpoint of body.learning.checkpoints)
    for (const { question } of checkpoint.questions)
      if (question.type === 'CHOICE_SELECT')
        lines.push(
          `Options ${question.id}: ${JSON.stringify(
            question.prompt
              .match(/\{([^{}]+)\}/u)![1]
              .split('|')
              .map((option) => option.trim()),
          )}`,
        );
  lines.push(
    'Gate evidence:',
    JSON.stringify(context.evidence, null, 2),
    'Provenance:',
    JSON.stringify(draft.provenance, null, 2),
    'Issues:',
    JSON.stringify(draft.issues),
    'Current checkDraft diagnostics:',
    JSON.stringify(checkDraft(draft, context), null, 2),
  );
  return lines.join('\n');
}

export async function sheet(args: string[], root = repositoryRoot, loadInputs = loadReviewInputs): Promise<string> {
  const { values } = parseArgs({ args, strict: true, options: { stage: { type: 'string' } } });
  const order = values.stage === undefined ? undefined : z.coerce.number().int().min(1).max(12).parse(values.stage);
  const { syllabus, reviews } = await readReviewMetadata(root);
  const stages = syllabus.stages.filter((stage) => order === undefined || stage.order === order);
  const inputs = await loadInputs(
    root,
    syllabus,
    stages.map((stage) => stage.order),
  );
  return stages
    .flatMap((stage) =>
      inputs.drafts
        .filter((draft) => draft.body.order === stage.order)
        .map((draft) => renderSheet(draft, gateContext(stage, inputs.drafts, syllabus, reviews, inputs.context))),
    )
    .join('\n\n');
}
if (import.meta.main) {
  try {
    console.log(await sheet(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
