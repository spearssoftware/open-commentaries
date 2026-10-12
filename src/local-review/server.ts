// Local review tool for Kevin: browse ingested sections and triage glossary candidates. Binds to
// 127.0.0.1 only; mutating requests need the X-Local-Review header (which a cross-site form cannot
// send without a preflight this server never answers) and a localhost Host header (DNS rebinding).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANDIDATES_PATH, type CandidatesFile } from "../glossary/candidates.ts";
import {
  candidateStatuses,
  checkGlossaries,
  type Glossaries,
  readGlossaries,
  unapproved,
} from "../glossary/check.ts";
import { DATA_DIR, readSections, sectionFileName } from "../ingest/ingest.ts";
import page from "./index.html";

const ROOT = join(import.meta.dir, "../..");
const GLOSSARY_DIR = join(ROOT, "glossary");
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

const readCandidates = (): CandidatesFile =>
  JSON.parse(readFileSync(CANDIDATES_PATH, "utf8")) as CandidatesFile;

function glossaryState(g: Glossaries = readGlossaries()) {
  const candidates = readCandidates();
  return {
    glossaries: g,
    statuses: candidateStatuses(g, candidates),
    problems: checkGlossaries(g, candidates),
    unapproved: unapproved(g),
  };
}

const FILES = ["locked", "drift", "strength"] as const;

/** Writes changed files; a changed file loses its approval date, since Kevin approved other content. */
function saveGlossaries(next: Glossaries): void {
  const current = readGlossaries();
  for (const name of FILES) {
    const strip = (f: { approved: string | null }) => JSON.stringify({ ...f, approved: null });
    if (strip(current[name]) === strip(next[name])) continue;
    const file = { ...next[name], approved: null };
    writeFileSync(join(GLOSSARY_DIR, `${name}.json`), `${JSON.stringify(file, null, 2)}\n`);
  }
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
  const fileFor = (id: string) => {
    const s = readSections(book).find((x) => x.id === id);
    return s ? join(DATA_DIR, book, sectionFileName(s)) : null;
  };
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    development: false,
    routes: {
      "/": page,
      "/api/sections": {
        GET: withGuard(() => json({ book, sections: readSections(book), notes: readNotes() })),
      },
      "/api/notes/:id": {
        PUT: withGuard(async (req) => {
          const id = decodeURIComponent((req as Request & { params: { id: string } }).params.id);
          if (!fileFor(id)) return json({ error: "unknown section" }, 404);
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
        GET: withGuard(() => json({ candidates: readCandidates().candidates, ...glossaryState() })),
        PUT: withGuard(async (req) => {
          const next = (await req.json()) as Glossaries;
          saveGlossaries(next);
          return json(glossaryState());
        }),
      },
      "/api/glossary/approve": {
        POST: withGuard(() => {
          const state = glossaryState();
          if (state.problems.length)
            return json({ error: "Resolve the problems first", ...state }, 409);
          const today = new Date().toISOString().slice(0, 10);
          for (const name of FILES) {
            const file = { ...state.glossaries[name], approved: today };
            writeFileSync(join(GLOSSARY_DIR, `${name}.json`), `${JSON.stringify(file, null, 2)}\n`);
          }
          return json(glossaryState());
        }),
      },
    },
    fetch: (req) => guard(req) ?? new Response("not found", { status: 404 }),
  });
}
