import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { Env } from "./env";
import {
  checkUpload,
  publicPayload,
  revealPayload,
  UNMODERNIZED,
  type UploadedSection,
} from "./payload";
import { generateToken, hashToken, sameHash } from "./tokens";

interface TokenRow {
  id: number;
  reviewer: string;
  book: string;
  chapter_from: number;
  chapter_to: number;
}

interface SectionRow {
  id: string;
  book: string;
  chapter: number;
  text_hash: string;
  review_status: string;
  round: number | null;
  public_payload: string;
  reveal_payload: string;
}

type AppEnv = { Bindings: Env; Variables: { token: TokenRow } };

export const REVIEWERS = ["maintainer", "study-leader", "pastor"];

const app = new Hono<AppEnv>();

// Every authentication or authorization failure looks the same: missing, unknown, revoked, or
// out-of-range tokens all get 403, so a response reveals nothing about which check failed.
const forbidden = (c: Context) => c.json({ error: "forbidden" }, 403);

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
});

const reviewer: MiddlewareHandler<AppEnv> = async (c, next) => {
  const raw = c.req.header("X-Review-Token");
  if (!raw || !c.env.REVIEW_TOKEN_SALT) return forbidden(c);
  const hash = await hashToken(c.env.REVIEW_TOKEN_SALT, raw);
  const token = await c.env.DB.prepare(
    "SELECT id, reviewer, book, chapter_from, chapter_to FROM tokens WHERE hash = ? AND revoked = 0",
  )
    .bind(hash)
    .first<TokenRow>();
  if (!token) return forbidden(c);
  c.set("token", token);
  await next();
};

const maintainer: MiddlewareHandler<AppEnv> = async (c, next) => {
  const raw = c.req.header("X-Maintainer-Token");
  const { REVIEW_TOKEN_SALT: salt, MAINTAINER_TOKEN_HASH: expected } = c.env;
  if (!raw || !salt || !expected) return forbidden(c);
  if (!sameHash(await hashToken(salt, raw), expected)) return forbidden(c);
  await next();
};

app.use("/api/*", reviewer);
app.use("/admin/*", maintainer);

const inRange = (t: TokenRow, s: { book: string; chapter: number }) =>
  s.book === t.book && s.chapter >= t.chapter_from && s.chapter <= t.chapter_to;

async function sectionFor(c: Context<AppEnv>, id: string): Promise<SectionRow | null> {
  const row = await c.env.DB.prepare("SELECT * FROM sections WHERE id = ?").bind(id).first<SectionRow>();
  return row && inRange(c.get("token"), row) ? row : null;
}

app.get("/api/sections", async (c) => {
  const t = c.get("token");
  const { results: sections } = await c.env.DB.prepare(
    "SELECT * FROM sections WHERE book = ? AND chapter BETWEEN ? AND ? ORDER BY seq",
  )
    .bind(t.book, t.chapter_from, t.chapter_to)
    .all<SectionRow>();
  const { results: mine } = await c.env.DB.prepare(
    "SELECT section_id, text_hash, phase, decision, type, dated_view, comment FROM decisions WHERE token_id = ?",
  )
    .bind(t.id)
    .all<{ section_id: string; text_hash: string; phase: string; decision: string; type: string | null; dated_view: number; comment: string | null }>();
  return c.json({
    reviewer: t.reviewer,
    book: t.book,
    chapters: [t.chapter_from, t.chapter_to],
    sections: sections.map((s) => ({
      ...JSON.parse(s.public_payload),
      decisions: mine
        .filter((d) => d.section_id === s.id && d.text_hash === s.text_hash)
        .map(({ phase, decision, type, dated_view, comment }) => ({
          phase,
          decision,
          type,
          dated_view: dated_view === 1,
          comment,
        })),
    })),
  });
});

app.post("/api/decisions", async (c) => {
  const t = c.get("token");
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body.section_id !== "string") return c.json({ error: "section_id is required" }, 400);
  const section = await sectionFor(c, body.section_id);
  if (!section) return forbidden(c);
  const { phase, decision, type, comment, text_hash: clientHash } = body;
  if (phase !== "blind" && phase !== "amended") return c.json({ error: "phase must be blind or amended" }, 400);
  if (decision !== "approve" && decision !== "flag") return c.json({ error: "decision must be approve or flag" }, 400);
  if (decision === "flag") {
    if (type !== "meaning" && type !== "wording") return c.json({ error: "a flag needs type meaning or wording" }, 400);
    if (typeof comment !== "string" || !comment.trim()) return c.json({ error: "a flag needs a comment" }, 400);
  } else if (type !== undefined && type !== null) {
    return c.json({ error: "type applies only to flags" }, 400);
  }
  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    return c.json({ error: "comment must be a string" }, 400);
  }
  if (clientHash !== section.text_hash) {
    return c.json({ error: "this section changed since you loaded it; reload the page" }, 409);
  }
  if (phase === "amended") {
    const blind = await c.env.DB.prepare(
      "SELECT 1 FROM decisions WHERE token_id = ? AND section_id = ? AND text_hash = ? AND phase = 'blind'",
    )
      .bind(t.id, section.id, section.text_hash)
      .first();
    if (!blind) return c.json({ error: "record a blind decision first" }, 409);
  }
  const id = crypto.randomUUID();
  const result = await c.env.DB.prepare(
    `INSERT INTO decisions (id, token_id, section_id, reviewer, phase, decision, type, dated_view, comment,
       text_hash, status_at_review, round, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (token_id, section_id, text_hash, phase) DO NOTHING`,
  )
    .bind(
      id,
      t.id,
      section.id,
      t.reviewer,
      phase,
      decision,
      decision === "flag" ? type : null,
      body.dated_view === true ? 1 : 0,
      typeof comment === "string" && comment.trim() ? comment.trim() : null,
      section.text_hash,
      section.review_status,
      section.round,
      new Date().toISOString(),
    )
    .run();
  if (result.meta.changes === 0) return c.json({ error: `a ${phase} decision is already recorded` }, 409);
  return c.json({ id }, 201);
});

app.get("/api/sections/:id/reveal", async (c) => {
  const section = await sectionFor(c, c.req.param("id"));
  if (!section) return forbidden(c);
  const blind = await c.env.DB.prepare(
    "SELECT 1 FROM decisions WHERE token_id = ? AND section_id = ? AND text_hash = ? AND phase = 'blind'",
  )
    .bind(c.get("token").id, section.id, section.text_hash)
    .first();
  if (!blind) return c.json({ error: "record a blind decision first" }, 409);
  return c.json(JSON.parse(section.reveal_payload));
});

app.put("/admin/sections", async (c) => {
  const body = await c.req.json<{ sections?: unknown }>().catch(() => null);
  if (!body || !Array.isArray(body.sections)) return c.json({ error: "body must be { sections: [...] }" }, 400);
  for (const [i, s] of body.sections.entries()) {
    const problem = checkUpload(s);
    if (problem) return c.json({ error: `sections[${i}]: ${problem}` }, 400);
  }
  const sections = body.sections as UploadedSection[];
  const stmt = c.env.DB.prepare(
    `INSERT INTO sections (id, book, chapter, seq, text_hash, review_status, round, public_payload, reveal_payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET book = excluded.book, chapter = excluded.chapter, seq = excluded.seq,
       text_hash = excluded.text_hash, review_status = excluded.review_status, round = excluded.round,
       public_payload = excluded.public_payload, reveal_payload = excluded.reveal_payload`,
  );
  if (sections.length) {
    await c.env.DB.batch(
      sections.map((s) =>
        stmt.bind(
          s.id,
          s.book,
          s.chapter,
          s.seq,
          s.text_hash ?? UNMODERNIZED,
          s.review_status,
          s.rounds.at(-1)?.round ?? null,
          JSON.stringify(publicPayload(s)),
          JSON.stringify(revealPayload(s)),
        ),
      ),
    );
  }
  return c.json({ upserted: sections.length });
});

app.post("/admin/tokens", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const { reviewer: role, book, chapter_from: from, chapter_to: to } = body ?? {};
  if (typeof role !== "string" || !REVIEWERS.includes(role)) {
    return c.json({ error: `reviewer must be one of ${REVIEWERS.join(", ")}` }, 400);
  }
  if (typeof book !== "string" || !book) return c.json({ error: "book is required" }, 400);
  if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 1 || (from as number) > (to as number)) {
    return c.json({ error: "chapter_from and chapter_to must be integers with 1 <= from <= to" }, 400);
  }
  const token = generateToken("rv_");
  const hash = await hashToken(c.env.REVIEW_TOKEN_SALT, token);
  const row = await c.env.DB.prepare(
    "INSERT INTO tokens (hash, reviewer, book, chapter_from, chapter_to, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(hash, role, book, from, to, new Date().toISOString())
    .first<{ id: number }>();
  return c.json({ id: row?.id, token }, 201);
});

app.post("/admin/tokens/:id/revoke", async (c) => {
  const result = await c.env.DB.prepare("UPDATE tokens SET revoked = 1 WHERE id = ?")
    .bind(Number(c.req.param("id")))
    .run();
  if (result.meta.changes === 0) return c.json({ error: "no such token" }, 404);
  return c.json({ revoked: true });
});

app.get("/admin/export", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM decisions ORDER BY created_at, id").all();
  return c.json({ decisions: results });
});

app.delete("/admin/decisions", async (c) => {
  const section = c.req.query("section");
  if (!section) return c.json({ error: "section query parameter is required" }, 400);
  const result = await c.env.DB.prepare("DELETE FROM decisions WHERE section_id = ?").bind(section).run();
  return c.json({ deleted: result.meta.changes });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("/admin/*", (c) => c.json({ error: "not found" }, 404));

export default app;
