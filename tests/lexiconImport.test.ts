/** Owns the lexicon importer checks on an invented CSV: selection, mapping, SQL shape, determinism and the allowlist. */
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importLexicon, lexiconStatements, sourceVersion, STATEMENT_CAP } from '../scripts/lexicon/import';
import { entryRow, loadLexicon, parseAllowlist, type Lexicon } from '../scripts/lexicon/lexicon';
import { LexiconEntrySchema } from '../src/types/lexicon';
import { ALLOWLIST, writeMorphalouFixture } from './fixtures/morphalouCsv';
import { createWorkerDb } from './fixtures/workerDb';

/** The message a promise rejects with, or `resolved`. */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: Error) => error.message,
  );

let root: string;
let dir: string;
let lexicon: Lexicon;
const entry = (lemma: string, pos: string) => {
  const found = lexicon.get(`${lemma}\0${pos}`);
  if (!found) throw new Error(`no ${pos} ${lemma}`);
  return { ...entryRow(found), forms: [...found.forms].sort(), data: JSON.parse(entryRow(found).data) };
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'relire-lexicon-'));
  dir = join(root, 'csv');
  await writeMorphalouFixture(dir);
  lexicon = await loadLexicon(dir, new Set(parseAllowlist(ALLOWLIST)));
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('verbs', () => {
  test('maps the app tenses, persons, variants and participles; nothing else', () => {
    const verb = entry('testmarcher', 'verb');
    expect(verb.gender).toBeNull();
    expect(verb.data).toEqual({
      tenses: {
        present: {
          '1sg': ['testmarche', 'testmarche2', 'testmarcheb'],
          '2sg': ['testmarches'],
          '3sg': ['testmarche'],
          '1pl': ['testmarchons'],
          '2pl': ['testmarchez'],
          '3pl': ['testmarchent'],
        },
        imparfait: { '1sg': ['testmarchais'] },
        futur: { '1sg': ['testmarcherai'] },
        conditionnel: { '1sg': ['testmarcherais'] },
        subjonctif: { '1sg': ['testmarchesub'] },
        imperatif: { '2sg': ['testmarche'], '1pl': ['testmarchons'], '2pl': ['testmarchez'] },
      },
      participles: {
        present: ['testmarchant'],
        past: { ms: ['testmarché'], fs: ['testmarchée'], mp: ['testmarchés'], fp: ['testmarchées'] },
      },
    });
    expect(LexiconEntrySchema.parse({ pos: 'verb', data: verb.data })).toBeTruthy();
    // The infinitive is a form of the lemma; the passé simple and the subjunctive imperfect are not stored.
    expect(verb.forms).toContain('testmarcher');
    expect(verb.forms).not.toContain('testmarchai');
    expect(verb.forms).not.toContain('testmarchasse');
  });

  test('NFC keys, an invariable participle fills all four agreements', () => {
    const verb = entry('testirrégulier', 'verb');
    expect(verb.data).toEqual({
      tenses: { present: { '3sg': ['testvá'] } },
      participles: { past: { ms: ['testallé'], fs: ['testallé'], mp: ['testallé'], fp: ['testallé'] } },
    });
    expect(verb.forms).toEqual(['testallé', 'testvá']);
  });

  test('a pronominal verb is kept; its infinitive with a space is not a form', () => {
    expect(entry('se testlaver', 'verb').forms).toEqual(['testlave', 'testlaver']);
    expect(entry('se testgominer', 'verb').forms).toEqual(['testgomine']);
  });
});

describe('nouns and adjectives', () => {
  test('gender is Morphalou own value; blocks of one lemma keep each value', () => {
    expect(entry('testmaison', 'noun').gender).toBe('feminine');
    expect(entry('testinvar', 'noun').gender).toBe('invariable');
    expect(entry('testnogender', 'noun').gender).toBe('-');
    expect(entry('testambigu', 'noun').gender).toBe('feminine,masculine');
    expect(entry('testambigu', 'noun').data).toEqual({ singular: ['testambigu', 'testambigue'] });
  });

  test('forms by number; an invariable number fills both; the entity row parses', () => {
    expect(entry('testmaison', 'noun').data).toEqual({ singular: ['testmaison'], plural: ['testmaisons'] });
    expect(entry('testinvar', 'noun').data).toEqual({ singular: ['testinvar'], plural: ['testinvar'] });
    expect(entry('testamp', 'noun').data).toEqual({ singular: ['test&x'] });
  });

  test('an uppercase form keeps its spelling in data and is a lowercase lookup key', () => {
    const noun = entry('testsigle', 'noun');
    expect(noun.data.singular).toEqual(['Testsigle']);
    expect(noun.forms).toEqual(['testsigle', 'testsigles']);
  });

  test('forms by agreement; invariable gender and number fill the slots', () => {
    expect(entry('testbeau', 'adjective').data).toEqual({
      ms: ['testbeau'],
      fs: ['testbelle'],
      mp: ['testbeaux'],
      fp: ['testbelles'],
    });
    expect(entry('testrouge', 'adjective').data).toEqual({
      ms: ['testrouge'],
      fs: ['testrouge'],
      mp: ['testrouges'],
      fp: ['testrouges'],
    });
    expect(entry('testchic', 'adjective').data).toEqual({
      ms: ['testchic'],
      fs: ['testchic'],
      mp: ['testchic'],
      fp: ['testchic'],
    });
    expect(entry('testbeau', 'adjective').gender).toBeNull();
  });
});

describe('what is skipped', () => {
  test('locutions, a verb not on the allowlist and capitalised lemmas never enter', async () => {
    const everything = await loadLexicon(dir);
    expect([...everything.keys()].some((id) => id.startsWith('test ad libitum'))).toBe(false);
    expect([...everything.keys()].some((id) => id.startsWith('test rock'))).toBe(false);
    expect([...everything.keys()].some((id) => id.startsWith('test à priori'))).toBe(false);
    expect([...everything.keys()].some((id) => id.startsWith('Testangle') || id.startsWith('testangle'))).toBe(true);
    expect(entry('testangle', 'noun').gender).toBe('masculine');
    expect(everything.has('testnonlisted\0verb')).toBe(true);
    expect(lexicon.has('testnonlisted\0verb')).toBe(false);
    expect(lexicon.size).toBe(parseAllowlist(ALLOWLIST).length);
  });
});

/** Applies the statements to SQLite built from the real migrations. */
async function load(data: Lexicon, cap?: number) {
  const { db } = await createWorkerDb();
  const statements = [...lexiconStatements(data, 'morphalou-3.1+test0000', cap)];
  for (const statement of statements) db.exec(statement);
  return { db, statements };
}

describe('SQL', () => {
  test('rows equal the model, forms are deduplicated lowercase keys, the version is last', async () => {
    const { db, statements } = await load(lexicon);
    expect(statements[0]).toBe('DELETE FROM lexicon_forms;');
    expect(statements[1]).toBe('DELETE FROM lexicon_entries;');
    expect(statements.at(-1)).toContain("'lexiconVersion', 'morphalou-3.1+test0000'");
    expect(db.query("SELECT value FROM meta WHERE key = 'lexiconVersion'").get()).toEqual({
      value: 'morphalou-3.1+test0000',
    });
    const entries = db.query('SELECT lemma, pos, gender, data FROM lexicon_entries ORDER BY lemma, pos').all() as {
      lemma: string;
      pos: string;
      gender: string | null;
      data: string;
    }[];
    expect(entries.length).toBe(lexicon.size);
    for (const row of entries) {
      expect({ gender: row.gender, data: row.data }).toEqual(entryRow(lexicon.get(`${row.lemma}\0${row.pos}`)!));
    }
    const forms = db.query('SELECT form, lemma, pos FROM lexicon_forms').all() as {
      form: string;
      lemma: string;
      pos: string;
    }[];
    expect(forms.length).toBe(new Set(forms.map((row) => `${row.form}\0${row.lemma}\0${row.pos}`)).size);
    expect(forms.every((row) => row.form === row.form.toLowerCase())).toBe(true);
    expect(forms.filter((row) => row.form === 'testmarche').map((row) => row.lemma)).toEqual(['testmarcher']);
    // One form of several lemmas keeps one row per lemma.
    expect(forms.filter((row) => row.form === 'testinvar')).toEqual([
      { form: 'testinvar', lemma: 'testinvar', pos: 'noun' },
    ]);
  });

  test('every statement stays under the cap in UTF-8 bytes, and a small cap splits the inserts', async () => {
    for (const cap of [STATEMENT_CAP, 700]) {
      const { statements, db } = await load(lexicon, cap);
      for (const statement of statements.filter((s) => s.startsWith('INSERT INTO'))) {
        expect(Buffer.byteLength(statement)).toBeLessThanOrEqual(cap);
      }
      expect((db.query('SELECT COUNT(*) AS n FROM lexicon_entries').get() as { n: number }).n).toBe(lexicon.size);
    }
    const { statements } = await load(lexicon, 700);
    expect(statements.filter((s) => s.startsWith('INSERT INTO lexicon_forms')).length).toBeGreaterThan(1);
    // The fixture has multi-byte characters, so bytes and characters differ.
    expect(statements.some((s) => Buffer.byteLength(s) > s.length)).toBe(true);
  });

  test('a replacement load leaves no stale rows', async () => {
    const { db, statements } = await load(lexicon);
    const smaller: Lexicon = new Map([...lexicon].slice(0, 2));
    for (const statement of lexiconStatements(smaller, 'morphalou-3.1+test0001')) db.exec(statement);
    expect((db.query('SELECT COUNT(*) AS n FROM lexicon_entries').get() as { n: number }).n).toBe(2);
    expect(statements.length).toBeGreaterThan(3);
    expect(
      (
        db
          .query('SELECT COUNT(*) AS n FROM lexicon_forms WHERE lemma NOT IN (SELECT lemma FROM lexicon_entries)')
          .get() as { n: number }
      ).n,
    ).toBe(0);
  });
});

describe('determinism and version', () => {
  test('the same source gives the same SQL and version; file order does not matter', async () => {
    const other = join(root, 'csv-reversed');
    await writeMorphalouFixture(other, true);
    const wanted = new Set(parseAllowlist(ALLOWLIST));
    const a = [...lexiconStatements(await loadLexicon(dir, wanted), 'v')];
    const b = [...lexiconStatements(await loadLexicon(other, wanted), 'v')];
    expect(b).toEqual(a);
    expect(await sourceVersion(dir)).toBe(await sourceVersion(dir));
    expect(await sourceVersion(dir)).toMatch(/^morphalou-3\.1\+[0-9a-f]{8}$/);
  });

  test('the version changes when one byte of a source file changes', async () => {
    const changed = join(root, 'csv-changed');
    await writeMorphalouFixture(changed, false, ';;;;;;;;;');
    expect(await sourceVersion(changed)).not.toBe(await sourceVersion(dir));
  });
});

describe('allowlist', () => {
  // The importer reports counts on stdout; keep the test output clean.
  const log = spyOn(console, 'log');
  beforeAll(() => {
    log.mockImplementation(() => {});
  });
  afterAll(() => log.mockRestore());
  const importWith = async (list: string) => {
    const project = await mkdtemp(join(root, 'project-'));
    await mkdir(join(project, 'data/lexicon'), { recursive: true });
    await writeFile(join(project, 'data/lexicon/lemmas.txt'), list);
    await importLexicon([], { MORPHALOU_DIR: dir }, pathToFileURL(`${project}/`));
    return readFile(join(project, '.local/lexicon/import.sql'), 'utf8');
  };

  test('imports only the listed lemmas', async () => {
    const sql = await importWith('verb:testmarcher\nnoun:testmaison\n');
    expect(sql).toContain("'testmarcher', 'verb'");
    expect(sql).toContain("'testmaison', 'noun'");
    expect(sql).not.toContain('testnonlisted');
    expect(sql).not.toContain('testbeau');
    expect(sql).toMatch(/'lexiconVersion', 'morphalou-3\.1\+[0-9a-f]{8}'/);
  });

  test('a listed lemma that Morphalou does not have fails loudly', async () => {
    expect(await rejection(importWith('verb:testmarcher\nnoun:testabsent\nverb:testabsent2\n'))).toBe(
      'Allowlisted but not in Morphalou: noun:testabsent, verb:testabsent2',
    );
  });

  test('a malformed line is refused; unknown arguments are refused', async () => {
    expect(await rejection(importWith('verb:testmarcher\nadverb:test\n'))).toBe('Bad allowlist line: adverb:test');
    expect(await rejection(importLexicon(['--remote']))).toBe('Usage: import.ts [--apply-local]');
  });
});
