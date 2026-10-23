# Notice: the lexicon data

The lexicon endpoints (`/v1/lexicon/:lemma`, `/v1/lexicon/form/:form`) serve forms and gender taken from **Morphalou 3.1** (version of 6/2016), a French morphological lexicon maintained by ATILF (CNRS / Université de Lorraine), distributed under the **LGPL-LR** (Lesser General Public License For Linguistic Resources). The source is described at <http://www.cnrtl.fr/lexiques/morphalou/>. The licence text is in `licences/LGPL-LR.txt`, copied unchanged from the Morphalou 3.1 download (`licenceLGPLLR.txt`). Every response carries the source name, maintainer, licence and URL.

The service holds only a selection of lemmas (`data/lexicon/lemmas.txt`, about the words a learner from A1 to B2 meets) and, for each, the simple-tense forms, participles, infinitive and noun and adjective forms Morphalou lists. It adds no forms of its own. A frequency list (Lexique) is used only offline to choose which words are on that list; none of its data (no frequency, no form) is stored, shipped or returned by any endpoint.

## Replacing or rebuilding the data

No lexicon data is committed to this repository. The database rows are generated from the original Morphalou download by `scripts/lexicon/import.ts`, which reads the `verb`, `commonNoun` and `adjective` CSV files and the allowlist, and writes SQL. Anyone with the original files can rebuild the rows, or load different or modified Morphalou data in their place, by running the same script against their copy; the load replaces all lexicon rows and records a version that changes whenever the source files change (`morphalou-3.1+` followed by the first 8 hex digits of the SHA-256 of the three CSV files).

Rebuild, from the repository root (the original download is not part of it; point `MORPHALOU_DIR` at the unpacked `Morphalou3.1_formatCSV` directory, default `.local/morphalou/csv/Morphalou3.1_formatCSV`):

```sh
cd worker && bunx wrangler d1 migrations apply DB --local && cd ..
MORPHALOU_DIR=/path/to/Morphalou3.1_formatCSV bun scripts/lexicon/import.ts --apply-local
```

Without `--apply-local` the script only writes `.local/lexicon/import.sql`, which can be inspected or loaded with `wrangler d1 execute` by hand. To change which lemmas are served, edit `data/lexicon/lemmas.txt` (or regenerate it with `scripts/lexicon/select.ts`) and import again.
