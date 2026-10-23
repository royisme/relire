/** Resolves authored occurrences by sentence id and token ordinal; prepares frozen clicked-spelling bookmarks. */
import type { PublishedReader } from '../../types/gradedReader';
import type { VocabularyDefinition } from '../../types/vocabulary';
import { vocabularyReaderSourceId, type VocabularyLookup } from '../vocabulary/identity';

export function readerOccurrence(
  reader: PublishedReader,
  sentenceId: string,
  ordinal: number,
  spelling: string,
  language: string,
) {
  const sentence = reader.body.sentences.find((candidate) => candidate.id === sentenceId);
  const binding = sentence?.tokens[ordinal];
  const entries = binding?.entryIds.map((id) => reader.body.glossary.find((entry) => entry.id === id));
  if (!sentence || !binding || !entries?.length || entries.some((entry) => !entry))
    throw new Error(`Missing reader binding: ${sentenceId}:${ordinal}`);
  const resolved = entries.filter((entry) => entry !== undefined);
  const lookup: VocabularyLookup = {
    word: spelling,
    sentence: sentence.fr,
    binding,
    requestLanguage: language.startsWith('zh') ? 'zh' : 'en',
    source: {
      kind: 'reader',
      id: vocabularyReaderSourceId(reader.body.id, reader.version),
      title: reader.body.title.fr,
    },
  };
  const definition: VocabularyDefinition = {
    kind: 'reader',
    readerId: reader.body.id,
    version: reader.version,
    entry: resolved[0],
    sentenceTranslation: sentence.translation,
  };
  return { sentence, entries: resolved, lookup, definition };
}
export type ReaderOccurrence = ReturnType<typeof readerOccurrence>;
