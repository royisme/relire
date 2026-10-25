# Notice: the bundled lexicon data

The file `lexicon.json` in this directory is a work based on **Morphalou 3.1** (version of 6/2016), a French morphological lexicon maintained by ATILF (CNRS / Université de Lorraine), distributed under the **LGPL-LR** (Lesser General Public License For Linguistic Resources). The source is described at <http://www.cnrtl.fr/lexiques/morphalou/>. The licence text is in `LGPL-LR.txt`, copied unchanged from the Morphalou 3.1 download (`licenceLGPLLR.txt`). The `changes` and `modified` fields inside the data file state what was changed and when (LGPL-LR section 2(b)). The app names this source in its About page and links from there to local copies of this notice and the licence, which are served and cached with the app.

The data file holds only a selection of lemmas (`lemmas.txt`, about the words a learner from A1 to B2 meets) and, for each, the simple-tense forms, participles, infinitive and noun and adjective forms Morphalou lists; it adds no forms of its own. A frequency list (Lexique) is used only offline to choose which words are on that list; none of its data (no frequency, no form) is stored or shipped.

The application code of this repository is MIT (`../LICENSE`); only the files in this directory carry the LGPL-LR terms stated above.

## Replacing or rebuilding the data file

`lexicon.json` is generated, never edited by hand. Rebuild it from the original download (which is not part of this repository), from the repository root:

```sh
MORPHALOU_DIR=/path/to/Morphalou3.1_formatCSV bun scripts/lexicon/build.ts
```

`MORPHALOU_DIR` points at the unpacked `Morphalou3.1_formatCSV` directory and defaults to `.local/morphalou/csv/Morphalou3.1_formatCSV`. To change which lemmas are included, edit `lemmas.txt` (or regenerate it with `scripts/lexicon/select.ts`) and rebuild.

To serve different or modified Morphalou data instead, replace `lexicon.json` with your own file of the same shape (`LexiconBundleSchema` in `src/types/lexicon.ts`) under LGPL-LR section 2: keep the licence, keep a change notice and date inside the data, and keep this notice file accurate. A source-free consistency check of the committed file is `bun scripts/lexicon/build.ts --check`.
