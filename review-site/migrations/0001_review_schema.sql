-- Sections uploaded by `just review-deploy`. public_payload is what a reviewer sees before deciding;
-- reveal_payload (verdicts, rounds, status) is served only after a blind decision.
CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  text_hash TEXT NOT NULL,
  review_status TEXT NOT NULL,
  round INTEGER,
  public_payload TEXT NOT NULL,
  reveal_payload TEXT NOT NULL
);
CREATE INDEX idx_sections_book_chapter ON sections(book, chapter, seq);

-- One row per review link. Only the salted hash of the token is stored.
CREATE TABLE tokens (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  reviewer TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter_from INTEGER NOT NULL,
  chapter_to INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- text_hash, status_at_review, and round are copied from sections by the server, never the client.
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  token_id INTEGER NOT NULL REFERENCES tokens(id),
  section_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('blind', 'amended')),
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'flag')),
  type TEXT CHECK (type IN ('meaning', 'wording')),
  dated_view INTEGER NOT NULL DEFAULT 0,
  comment TEXT,
  text_hash TEXT NOT NULL,
  status_at_review TEXT NOT NULL,
  round INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (token_id, section_id, text_hash, phase)
);
