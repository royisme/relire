-- Immutable staged reader artifacts; the catalogue, publication markers and current pointer use existing meta.
CREATE TABLE readers (
  id TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  body_version TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (id, artifact_hash)
);
