/** Owns the lexicon bundle checks on an invented CSV: selection, mapping, determinism and the source-free consistency rules. */
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBundle, buildLexicon, CHANGES, validateBundle } from '../scripts/lexicon/build';
import { entryRow, loadLexicon, parseAllowlist, sourceVersion, type Lexicon } from '../scripts/lexicon/lexicon';
import { LexiconEntrySchema, type LexiconBundle } from '../src/types/lexicon';
import { ALLOWLIST, writeMorphalouFixture } from './fixtures/morphalouCsv';

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
  test('gender is Morphalou own value', () => {
    expect(entry('testmaison', 'noun').gender).toBe('feminine');
    expect(entry('testinvar', 'noun').gender).toBe('invariable');
    expect(entry('testnogender', 'noun').gender).toBe('-');
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

describe('bundle', () => {
  const bundle = () => buildBundle(lexicon, 'morphalou-3.1+test0000', '2026-10-24');
  const allowlist = () => parseAllowlist(ALLOWLIST);
  const counts = (b: LexiconBundle) => ({ entries: b.entries.length, forms: Object.keys(b.forms).length });
  const checked = (b: LexiconBundle) => ({ allowed: allowlist(), counts: counts(b) });

  test('entries, form keys and pairs are sorted; each entry is its entryRow; the check passes', () => {
    const b = bundle();
    const id = (item: { lemma: string; pos: string }) => `${item.lemma}\0${item.pos}`;
    const pairId = ([lemma, pos]: [string, string]) => `${lemma}\0${pos}`;
    expect(b.entries.map(id)).toEqual([...b.entries.map(id)].sort());
    expect(Object.keys(b.forms)).toEqual([...Object.keys(b.forms)].sort());
    for (const pairs of Object.values(b.forms)) expect(pairs.map(pairId)).toEqual([...pairs.map(pairId)].sort());
    for (const item of b.entries) {
      const row = entryRow(lexicon.get(`${item.lemma}\0${item.pos}`)!);
      expect(item.data).toEqual(JSON.parse(row.data));
      expect(row.gender).toBe('gender' in item ? item.gender : null);
    }
    expect(b.source).toEqual({
      name: 'Morphalou 3.1',
      maintainer: 'ATILF (CNRS / Université de Lorraine)',
      licence: 'LGPL-LR',
      url: 'http://www.cnrtl.fr/lexiques/morphalou/',
      sourceVersion: 'morphalou-3.1+test0000',
      changes: CHANGES,
      modified: '2026-10-24',
    });
    expect(validateBundle(b, checked(b))).toEqual(b);
    // A pronominal lemma keeps its lemma spelling, and its bare infinitive is a form key.
    expect(b.forms['testlaver']).toEqual([['se testlaver', 'verb']]);
  });

  test('a bundle field that breaks the schema fails naming the field', () => {
    expect(() =>
      validateBundle({ ...bundle(), source: { ...bundle().source, modified: 'yesterday' } }, checked(bundle())),
    ).toThrow('source.modified');
  });

  test('a form naming an entry that does not exist fails by name', () => {
    const b = bundle();
    b.forms['testmarche'].push(['testghost', 'verb']);
    expect(() => validateBundle(b, checked(b))).toThrow(
      'form testmarche names an entry that does not exist: verb testghost',
    );
  });

  test('an entry missing from its own forms fails by name', () => {
    const b = bundle();
    delete b.forms['testrouge'];
    expect(() => validateBundle(b, checked(b))).toThrow('adjective testrouge is missing from its own form testrouge');
  });

  test('an entry set that differs from the allowlist fails naming both sides', () => {
    const b = bundle();
    expect(() => validateBundle(b, { allowed: [...allowlist(), 'testghost\0verb'], counts: counts(b) })).toThrow(
      'allowlisted, not in the bundle: verb:testghost',
    );
    expect(() =>
      validateBundle(b, { allowed: allowlist().filter((id) => id !== 'testbeau\0adjective'), counts: counts(b) }),
    ).toThrow('in the bundle, not the allowlist: adjective:testbeau');
  });

  test('counts that differ from the stated ones fail with both numbers', () => {
    const b = bundle();
    const stated = counts(b);
    expect(() =>
      validateBundle(b, { allowed: allowlist(), counts: { ...stated, entries: stated.entries + 1 } }),
    ).toThrow(`bundle has ${stated.entries} entries; data/lexicon/README.md states ${stated.entries + 1}`);
    expect(() => validateBundle(b, { allowed: allowlist(), counts: { ...stated, forms: stated.forms - 1 } })).toThrow(
      `bundle has ${stated.forms} forms; data/lexicon/README.md states ${stated.forms - 1}`,
    );
  });
});

describe('determinism and version', () => {
  test('the same source gives the same bundle and version; file order does not matter', async () => {
    const other = join(root, 'csv-reversed');
    await writeMorphalouFixture(other, true);
    const wanted = new Set(parseAllowlist(ALLOWLIST));
    const a = JSON.stringify(buildBundle(await loadLexicon(dir, wanted), 'v', '2026-10-24'));
    const b = JSON.stringify(buildBundle(await loadLexicon(other, wanted), 'v', '2026-10-24'));
    expect(b).toBe(a);
    expect(await sourceVersion(dir)).toBe(await sourceVersion(dir));
    expect(await sourceVersion(dir)).toMatch(/^morphalou-3\.1\+[0-9a-f]{8}$/);
  });

  test('the version changes when one byte of a source file changes', async () => {
    const changed = join(root, 'csv-changed');
    await writeMorphalouFixture(changed, false, ';;;;;;;;;');
    expect(await sourceVersion(changed)).not.toBe(await sourceVersion(dir));
  });
});

describe('the --check entrypoint', () => {
  const log = spyOn(console, 'log');
  beforeAll(() => {
    log.mockImplementation(() => {});
  });
  afterAll(() => log.mockRestore());
  const project = async () => {
    const directory = await mkdtemp(join(root, 'check-'));
    await mkdir(join(directory, 'data/lexicon'), { recursive: true });
    const b = buildBundle(lexicon, 'morphalou-3.1+test0000', '2026-10-24');
    await writeFile(join(directory, 'data/lexicon/lexicon.json'), JSON.stringify(b) + '\n');
    await writeFile(join(directory, 'data/lexicon/lemmas.txt'), ALLOWLIST + '\n');
    await writeFile(
      join(directory, 'data/lexicon/README.md'),
      `${b.entries.length} entries and ${Object.keys(b.forms).length} forms.\n`,
    );
    await writeFile(join(directory, 'data/lexicon/NOTICE.md'), 'notice\n');
    await writeFile(join(directory, 'data/lexicon/LGPL-LR.txt'), 'licence\n');
    return directory;
  };

  test('a consistent project passes with no Morphalou source', async () => {
    await buildLexicon(['--check'], {}, pathToFileURL(`${await project()}/`));
  });

  test('no committed data file fails with the rebuild recipe', async () => {
    const directory = await project();
    await rm(join(directory, 'data/lexicon/lexicon.json'));
    expect(await rejection(buildLexicon(['--check'], {}, pathToFileURL(`${directory}/`)))).toBe(
      'no committed data/lexicon/lexicon.json to check against; generate it with MORPHALOU_DIR=<dir> bun scripts/lexicon/build.ts',
    );
  });

  test('a missing notice file fails by name', async () => {
    const directory = await project();
    await rm(join(directory, 'data/lexicon/NOTICE.md'));
    expect(await rejection(buildLexicon(['--check'], {}, pathToFileURL(`${directory}/`)))).toBe(
      'data/lexicon/NOTICE.md is missing; it travels with the data file',
    );
  });

  test('unknown arguments are refused', async () => {
    expect(await rejection(buildLexicon(['--apply-local']))).toBe('Usage: build.ts [--check]');
  });
});

describe('allowlist', () => {
  // The build reports counts on stdout; keep the test output clean.
  const log = spyOn(console, 'log');
  beforeAll(() => {
    log.mockImplementation(() => {});
  });
  afterAll(() => log.mockRestore());
  const buildWith = async (list: string) => {
    const project = await mkdtemp(join(root, 'project-'));
    await mkdir(join(project, 'data/lexicon'), { recursive: true });
    await writeFile(join(project, 'data/lexicon/lemmas.txt'), list);
    await buildLexicon([], { MORPHALOU_DIR: dir }, pathToFileURL(`${project}/`));
    return readFile(join(project, 'data/lexicon/lexicon.json'), 'utf8');
  };

  test('builds only the listed lemmas', async () => {
    const bundle = JSON.parse(await buildWith('verb:testmarcher\nnoun:testmaison\n'));
    expect(bundle.entries.map((entry: { lemma: string }) => entry.lemma).sort()).toEqual(['testmaison', 'testmarcher']);
    expect(bundle.forms['testmaison']).toEqual([['testmaison', 'noun']]);
    expect(JSON.stringify(bundle)).not.toContain('testnonlisted');
    expect(JSON.stringify(bundle)).not.toContain('testbeau');
    expect(bundle.source.sourceVersion).toMatch(/^morphalou-3\.1\+[0-9a-f]{8}$/);
  });

  test('a listed lemma that Morphalou does not have fails loudly', async () => {
    expect(await rejection(buildWith('verb:testmarcher\nnoun:testabsent\nverb:testabsent2\n'))).toBe(
      'Allowlisted but not in Morphalou: noun:testabsent, verb:testabsent2',
    );
  });

  test('a listed noun that Morphalou gives two genders fails by name; unlisted, it never matters', async () => {
    expect(await rejection(buildWith('noun:testmaison\nnoun:testambigu\n'))).toBe(
      'Conflicting Morphalou genders for testambigu: feminine, masculine',
    );
    expect(await buildWith('noun:testmaison\n')).not.toContain('testambigu');
  });

  test('a malformed line is refused', async () => {
    expect(await rejection(buildWith('verb:testmarcher\nadverb:test\n'))).toBe('Bad allowlist line: adverb:test');
  });
});
