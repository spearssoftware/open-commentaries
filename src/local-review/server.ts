// Local review tool for Kevin: browse ingested sections and triage glossary candidates. Binds to
// 127.0.0.1 only; mutating requests need the X-Local-Review header (which a cross-site form cannot
// send without a preflight this server never answers) and a localhost Host header (DNS rebinding).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CandidatesFile, loadCandidates } from "../glossary/candidates.ts";
import {
  approveGlossaries,
  candidateStatuses,
  checkGlossaries,
  GLOSSARY_FILES,
  type Glossaries,
  readGlossaries,
  unapproved,
  writeGlossary,
} from "../glossary/check.ts";
import { readSections } from "../ingest/ingest.ts";
import page from "./index.html";
import { sourceTexts } from "./source.ts";

const ROOT = join(import.meta.dir, "../..");
const NOTES_DIR = join(ROOT, ".local-review");
const NOTES_PATH = join(NOTES_DIR, "notes.json");

export interface SectionNote {
  status: "ok" | "problem";
  note: string;
  updated: string;
}

type Notes = Record<string, SectionNote>;

const readNotes = (): Notes =>
  existsSync(NOTES_PATH) ? (JSON.parse(readFileSync(NOTES_PATH, "utf8")) as Notes) : {};

function glossaryState(g: Glossaries, candidates: CandidatesFile) {
  return {
    glossaries: g,
    statuses: candidateStatuses(g, candidates),
    problems: checkGlossaries(g, candidates),
    unapproved: unapproved(g),
  };
}

/**
 * Writes changed files and returns what is now on disk. A changed file loses its approval date,
 * since Kevin approved other content.
 */
function saveGlossaries(next: Glossaries): Glossaries {
  const saved = readGlossaries();
  for (const name of GLOSSARY_FILES) {
    const strip = (f: { approved: string | null }) => JSON.stringify({ ...f, approved: null });
    if (strip(saved[name]) === strip(next[name])) continue;
    const file = { ...next[name], approved: null };
    writeGlossary(name, file);
    Object.assign(saved, { [name]: file });
  }
  return saved;
}

function guard(req: Request): Response | null {
  const host = new URL(req.url).hostname;
  const hostHeader = (req.headers.get("host") ?? "").split(":")[0];
  if (
    !["127.0.0.1", "localhost"].includes(host) ||
    !["127.0.0.1", "localhost"].includes(hostHeader ?? "")
  ) {
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "GET" && req.headers.get("x-local-review") !== "1") {
    return new Response("forbidden", { status: 403 });
  }
  return null;
}

const json = (data: unknown, status = 200) => Response.json(data, { status });

function withGuard(handler: (req: Request) => Response | Promise<Response>) {
  return (req: Request) => guard(req) ?? handler(req);
}

export function startServer(book: string, port: number) {
  // Ingest and candidate collection do not run while the page is open, so both load once.
  const candidates = loadCandidates();
  const sectionIds = new Set(readSections(book).map((s) => s.id));
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    development: false,
    routes: {
      "/": page,
      "/api/sections": {
        GET: withGuard(() => {
          const sections = readSections(book);
          return json({ book, sections, sources: sourceTexts(book, sections), notes: readNotes() });
        }),
      },
      "/api/notes/:id": {
        PUT: withGuard(async (req) => {
          const id = decodeURIComponent((req as Request & { params: { id: string } }).params.id);
          if (!sectionIds.has(id)) return json({ error: "unknown section" }, 404);
          const body = (await req.json()) as Partial<SectionNote> | null;
          const notes = readNotes();
          if (body?.status !== "ok" && body?.status !== "problem") {
            delete notes[id];
          } else {
            notes[id] = {
              status: body.status,
              note: String(body.note ?? ""),
              updated: new Date().toISOString(),
            };
          }
          mkdirSync(NOTES_DIR, { recursive: true });
          writeFileSync(NOTES_PATH, `${JSON.stringify(notes, null, 2)}\n`);
          return json({ notes });
        }),
      },
      "/api/glossary": {
        GET: withGuard(() =>
          json({
            candidates: candidates.candidates,
            ...glossaryState(readGlossaries(), candidates),
          }),
        ),
        PUT: withGuard(async (req) => {
          const saved = saveGlossaries((await req.json()) as Glossaries);
          return json(glossaryState(saved, candidates));
        }),
      },
      "/api/glossary/approve": {
        POST: withGuard(() => {
          const problems = approveGlossaries(readGlossaries(), candidates);
          const state = glossaryState(readGlossaries(), candidates);
          return problems.length
            ? json({ error: "Resolve the problems first", ...state }, 409)
            : json(state);
        }),
      },
    },
    fetch: (req) => guard(req) ?? new Response("not found", { status: 404 }),
  });
}
