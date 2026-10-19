CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  chapter TEXT NOT NULL,
  level TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  tags TEXT NOT NULL,
  body TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The empty pack has a version before the owner loads any content.
INSERT INTO meta (key, value) VALUES ('packVersion', '0.0.0');
