/**
 * Owns the bundled lexicon: one form or one lemma from the data file the app ships (`data/lexicon/lexicon.json`),
 * fetched once, validated whole and kept for the session, so later lookups are in-memory. The file carries a richer
 * `source` than the response contract, so responses project its four fields. A word the file does not hold is
 * `undefined`; a fetch, timeout or schema failure is a real error that keeps its text. Does not own the matching or
 * what the word sheet draws.
 */
import {
  LexiconBundleSchema,
  type LexiconBundle,
  type LexiconFormResponse,
  type LexiconLemmaResponse,
} from '../../types/lexicon';
import { normalizeLookupToken } from '../grammarPack/lookup';

// Resolved by Vite to the emitted asset (served by the dev server, hashed in the build) and by Bun to the file on disk,
// so no `?url` import is needed in the tests.
const BUNDLE_URL = new URL('../../../data/lexicon/lexicon.json', import.meta.url);
// The word sheet waits for the lexicon before it draws, so a stalled download must not hold a core screen.
const LOAD_TIMEOUT_MS = 10_000;

interface BundledLexicon {
  source: LexiconFormResponse['source'];
  byLemma: Map<string, LexiconLemmaResponse['entries']>;
  /** The file's compact `[lemma, pos]` pairs; a response expands them for its contract. */
  byForm: Map<string, LexiconBundle['forms'][string]>;
}

/** The file's own keys are already folded (`scripts/lexicon/build.ts`), so a folded token is the stored key. */
function indexBundle(bundle: LexiconBundle): BundledLexicon {
  const { name, maintainer, licence, url } = bundle.source;
  const byLemma = new Map<string, LexiconLemmaResponse['entries']>();
  for (const { lemma, ...entry } of bundle.entries) {
    const entries = byLemma.get(lemma) ?? [];
    entries.push(entry);
    byLemma.set(lemma, entries);
  }
  return {
    source: { name, maintainer, licence, url },
    byLemma,
    byForm: new Map(Object.entries(bundle.forms)),
  };
}

let loaded: Promise<BundledLexicon> | undefined;
/** The form map read the other way (lemma → its forms), inverted once per session beside the bundle it came from. */
let inverted: Promise<Map<string, ReadonlySet<string>>> | undefined;

/** The whole file, fetched and validated once per session; one shared in-flight promise, and a failure does not stick. */
function bundledLexicon(): Promise<BundledLexicon> {
  if (!loaded) {
    loaded = (async () => {
      const response = await fetch(BUNDLE_URL, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`The lexicon data file answered HTTP ${response.status}`);
      return indexBundle(LexiconBundleSchema.parse(await response.json()));
    })();
    // This handler runs before any caller's continuation, so it can only clear the attempt that failed.
    void loaded.then(undefined, () => {
      loaded = undefined;
    });
  }
  return loaded;
}

/** Only for isolated loader tests; application callers share the session's copy. */
export function resetLexiconForTests(): void {
  loaded = undefined;
  inverted = undefined;
}

/** The lemmas a written form belongs to; the token is folded like the pack lookup's keys. */
export async function lexiconForm(token: string): Promise<LexiconFormResponse | undefined> {
  const form = normalizeLookupToken(token);
  const bundle = await bundledLexicon();
  const lemmas = bundle.byForm.get(form);
  if (!lemmas) return undefined;
  return { form, lemmas: lemmas.map(([lemma, pos]) => ({ lemma, pos })), source: bundle.source };
}

/** The entries of one lemma, folded the same way (a lemma the caller has is already as stored). */
export async function lexiconLemma(lemma: string): Promise<LexiconLemmaResponse | undefined> {
  const key = normalizeLookupToken(lemma);
  const bundle = await bundledLexicon();
  const entries = bundle.byLemma.get(key);
  if (!entries) return undefined;
  return { lemma: key, entries, source: bundle.source };
}

/**
 * Every written form of one lemma (the key folded like the file's own), or undefined for a lemma the lexicon does
 * not hold. The answer the cloze finder wants (`findSurfaceForm`'s `formsOf`); the inversion is built once per
 * session, and a load failure drops it together with the loader's own state so the next call retries both.
 */
export async function lexiconFormsOf(lemma: string): Promise<ReadonlySet<string> | undefined> {
  if (!inverted) {
    inverted = bundledLexicon().then(({ byForm }) => {
      const formsByLemma = new Map<string, Set<string>>();
      for (const [form, lemmas] of byForm)
        for (const [entry] of lemmas) {
          const forms = formsByLemma.get(entry);
          if (forms) forms.add(form);
          else formsByLemma.set(entry, new Set([form]));
        }
      return formsByLemma;
    });
    // A failed fetch never installs a half-built index; the next caller re-inverts after the retry.
    void inverted.then(undefined, () => {
      inverted = undefined;
    });
  }
  return (await inverted).get(normalizeLookupToken(lemma));
}
