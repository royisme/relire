-- Immutable staged vocabulary pages; publication markers and current pointer use existing meta.
CREATE TABLE vocabulary_pages (
  book_id TEXT NOT NULL,
  version TEXT NOT NULL,
  page INTEGER NOT NULL CHECK (page >= 0),
  body TEXT NOT NULL,
  PRIMARY KEY (book_id, version, page)
);
