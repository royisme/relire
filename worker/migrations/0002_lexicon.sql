-- One row per (lemma, part of speech); `data` is the forms JSON the Worker returns as is.
CREATE TABLE lexicon_entries (
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  gender TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (lemma, pos)
);

-- Reverse lookup: a form can belong to several lemmas, so the index is not unique.
CREATE TABLE lexicon_forms (
  form TEXT NOT NULL,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL
);

CREATE INDEX lexicon_forms_form ON lexicon_forms (form);

-- The empty lexicon has a version before the owner loads any content.
INSERT INTO meta (key, value) VALUES ('lexiconVersion', '0.0.0');
