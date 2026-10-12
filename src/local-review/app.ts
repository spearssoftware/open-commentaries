/// <reference lib="dom" />
import type { Candidate } from "../glossary/candidates.ts";
import type { CandidateStatus, Glossaries, LockedEntry } from "../glossary/check.ts";
import type { Quote, SectionState } from "../types.ts";
import type { SectionNote } from "./server.ts";

interface GlossaryState {
  glossaries: Glossaries;
  statuses: CandidateStatus[];
  problems: string[];
  unapproved: string[];
}

const app = document.getElementById("app") as HTMLElement;
const hint = document.getElementById("hint") as HTMLElement;

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      "X-Local-Review": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok && res.status !== 409)
    throw new Error(data.error ?? `${method} ${path} failed (${res.status})`);
  return data;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
}

function button(label: string, onClick: () => void, cls = ""): HTMLButtonElement {
  const b = el("button", { class: cls, type: "button" }, label);
  b.addEventListener("click", onClick);
  return b;
}

let toastTimer = 0;
function toast(message: string): void {
  let t = document.querySelector(".toast");
  if (!t) {
    t = el("div", { class: "toast" });
    document.body.append(t);
  }
  t.textContent = message;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t?.classList.remove("on"), 1800);
}

const typing = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  e.target instanceof HTMLSelectElement;

// ---------- Sections ----------

let sections: SectionState[] = [];
let notes: Record<string, SectionNote> = {};
let book = "";
let current = 0;

function rangeLabel(s: SectionState): string {
  if (s.kind === "intro") return s.chapter === 0 ? "Book introduction" : `Ch. ${s.chapter} outline`;
  const [, c1, v1] = s.osis_start.split(".");
  const [, c2, v2] = s.osis_end.split(".");
  if (c1 === c2) return v1 === v2 ? `${c1}:${v1}` : `${c1}:${v1}–${v2}`;
  return `${c1}:${v1}–${c2}:${v2}`;
}

/** Original text as paragraphs, with each quotation span highlighted in source order. */
function highlightedText(text: string, quotes: Quote[]): HTMLElement {
  const marks: { start: number; end: number; q: Quote }[] = [];
  let from = 0;
  for (const q of quotes) {
    const at = text.indexOf(q.span, from);
    if (at < 0) continue;
    marks.push({ start: at, end: at + q.span.length, q });
    from = at + q.span.length;
  }
  const box = el("div", { class: "text" });
  let offset = 0;
  for (const para of text.split("\n\n")) {
    const p = el("p");
    const pStart = text.indexOf(para, offset);
    const pEnd = pStart + para.length;
    let cursor = pStart;
    for (const m of marks) {
      if (m.start < pStart || m.start >= pEnd) continue;
      p.append(text.slice(cursor, m.start));
      const title = `${m.q.osis ?? "no reference"} · ${m.q.kjv_match}`;
      p.append(el("mark", { class: m.q.kjv_match, title }, text.slice(m.start, m.end)));
      cursor = m.end;
    }
    p.append(text.slice(cursor, pEnd));
    box.append(p);
    offset = pEnd;
  }
  return box;
}

function quoteCard(q: Quote): HTMLElement {
  return el(
    "div",
    { class: "quote" },
    el(
      "div",
      { class: "head" },
      el("span", { class: `badge ${q.kjv_match}` }, q.kjv_match),
      el("strong", {}, q.osis ?? "no reference"),
    ),
    el("div", { class: "span" }, `“${q.span}”`),
    el(
      "dl",
      {},
      el("dt", {}, "KJV"),
      el("dd", {}, q.kjv_text ?? "—"),
      el("dt", {}, "BSB"),
      el("dd", {}, q.bsb_text ?? "— (not in the BSB)"),
      ...(q.bsb_note ? [el("dt", {}, "Note"), el("dd", {}, q.bsb_note)] : []),
    ),
  );
}

async function saveNote(
  id: string,
  status: SectionNote["status"] | null,
  note: string,
): Promise<void> {
  const res = await api<{ notes: Record<string, SectionNote> }>(
    `/api/notes/${encodeURIComponent(id)}`,
    "PUT",
    { status, note },
  );
  notes = res.notes;
}

function sectionDetail(s: SectionState): HTMLElement {
  const note = notes[s.id];
  const detail = el("div", { class: "detail" });
  detail.append(
    el("h2", {}, `${book} ${rangeLabel(s)}`),
    el(
      "div",
      { class: "meta" },
      `${s.kind} · seq ${s.seq} · ${s.original_sentences.length} sentences · ${s.references.length} references · ${s.quotes.length} quotations`,
    ),
  );
  if (s.heading) detail.append(el("p", { class: "muted" }, `Heading: ${s.heading}`));
  detail.append(
    el(
      "div",
      { class: "legend" },
      "Quotations:",
      el("span", { class: "badge exact" }, "exact KJV"),
      el("span", { class: "badge loose" }, "loose / ambiguous"),
      el("span", { class: "badge none" }, "quoted, no KJV match"),
    ),
    highlightedText(s.original_text, s.quotes),
  );

  if (s.references.length) {
    const chips = el("div", { class: "chips" });
    for (const r of s.references) chips.append(el("span", { class: "chip" }, r.osis));
    detail.append(el("section", { class: "block" }, el("h4", {}, "References"), chips));
  }
  if (s.quotes.length) {
    const block = el("section", { class: "block" }, el("h4", {}, "Quotations"));
    for (const q of s.quotes) block.append(quoteCard(q));
    detail.append(block);
  }
  const ol = el("ol", { class: "sentences", start: "0" });
  for (const sentence of s.original_sentences) ol.append(el("li", {}, sentence));
  detail.append(
    el("section", { class: "block" }, el("h4", {}, "Sentence split (indices start at 0)"), ol),
  );

  const text = el("textarea", {
    placeholder:
      "What's wrong? (sentence split, a missed or false quotation, a wrong reference, text…)",
  });
  text.value = note?.note ?? "";
  const ok = button(
    "✓ Looks right",
    async () => {
      await saveNote(s.id, note?.status === "ok" ? null : "ok", text.value);
      renderSections();
    },
    `ok ${note?.status === "ok" ? "on" : ""}`,
  );
  const problem = button(
    "! Problem",
    async () => {
      if (!text.value.trim()) {
        text.focus();
        toast("Describe the problem first");
        return;
      }
      await saveNote(s.id, "problem", text.value);
      renderSections();
    },
    `problem ${note?.status === "problem" ? "on" : ""}`,
  );
  detail.append(el("div", { class: "verdict" }, ok, problem, text));
  return detail;
}

function renderSections(): void {
  const list = el("div", { class: "list" });
  let chapter = -1;
  sections.forEach((s, i) => {
    if (s.chapter !== chapter) {
      chapter = s.chapter;
      list.append(el("h3", {}, chapter === 0 ? "Introduction" : `Chapter ${chapter}`));
    }
    const status = notes[s.id]?.status ?? "";
    const item = el(
      "div",
      { class: `item ${i === current ? "sel" : ""}` },
      el("span", { class: `dot ${status}` }),
      el("span", { class: "range" }, rangeLabel(s)),
      el("span", { class: "count" }, s.quotes.length ? `${s.quotes.length}q` : ""),
    );
    item.addEventListener("click", () => {
      current = i;
      renderSections();
    });
    list.append(item);
  });
  const s = sections[current];
  app.replaceChildren(
    el(
      "div",
      { class: "split" },
      list,
      s ? sectionDetail(s) : el("p", { class: "pad" }, "No sections"),
    ),
  );
  list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  const done = sections.filter((x) => notes[x.id]).length;
  const problems = sections.filter((x) => notes[x.id]?.status === "problem").length;
  hint.textContent = `${done}/${sections.length} reviewed · ${problems} problems · keys: j/k next/prev, o = looks right`;
}

// ---------- Glossary ----------

let candidates: Candidate[] = [];
let gstate: GlossaryState | null = null;
let gtab: "candidates" | "locked" | "drift" | "strength" = "candidates";
const filter = { category: "theological_terms", status: "all", search: "", both: false };
let selected = 0;
let expanded = -1;

function coverKey(term: string): string {
  return term
    .toLowerCase()
    .replace(/[“”"'’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an|our|his|their) /, "");
}

async function saveGlossaries(next: Glossaries, message: string): Promise<void> {
  gstate = await api<GlossaryState>("/api/glossary", "PUT", next);
  toast(message);
  renderGlossary();
}

const clone = (g: Glossaries): Glossaries => structuredClone(g);

function withoutTerm(g: Glossaries, term: string): Glossaries {
  const key = coverKey(term);
  g.locked.entries = g.locked.entries.filter(
    (e) => e.kind === "protected" || ![e.term, ...e.forms].some((f) => coverKey(f) === key),
  );
  g.locked.allowed_to_change = g.locked.allowed_to_change.filter((e) => coverKey(e.term) !== key);
  return g;
}

const actions = {
  lock(term: string) {
    if (!gstate) return;
    const g = withoutTerm(clone(gstate.glossaries), term);
    g.locked.entries.push({ term, kind: "theological", forms: [term] });
    void saveGlossaries(g, `Locked “${term}”`);
  },
  allow(term: string) {
    if (!gstate) return;
    const g = withoutTerm(clone(gstate.glossaries), term);
    g.locked.allowed_to_change.push({
      term,
      reason:
        "Not count-locked. The general wording rule still applies: keep Henry's word unless archaic or shifted.",
    });
    void saveGlossaries(g, `Allowed “${term}” to change`);
  },
  clear(term: string) {
    if (!gstate) return;
    void saveGlossaries(withoutTerm(clone(gstate.glossaries), term), `Removed “${term}”`);
  },
  drift(term: string) {
    if (!gstate) return;
    const sense = prompt(`Sense of “${term}” in Henry's text (e.g. "conduct"):`);
    if (!sense) return;
    const replacements = prompt("Approved replacements, comma-separated:", sense);
    if (!replacements) return;
    const g = clone(gstate.glossaries);
    g.drift.entries.push({
      word: term,
      forms: [term],
      sense,
      replacements: splitList(replacements),
    });
    void saveGlossaries(g, `Added “${term}” to drift`);
  },
  strength(term: string) {
    if (!gstate) return;
    const eq = prompt(`Approved equivalents for “${term}”, comma-separated:`, term);
    if (!eq) return;
    const g = clone(gstate.glossaries);
    g.strength.entries.push({ word: term, equivalents: splitList(eq) });
    void saveGlossaries(g, `Added “${term}” to strength`);
  },
};

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function filteredCandidates(): { c: Candidate; i: number }[] {
  if (!gstate) return [];
  const statuses = gstate.statuses;
  const q = filter.search.toLowerCase();
  return candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => {
      if (filter.category !== "all" && c.category !== filter.category) return false;
      if (filter.status !== "all" && statuses[i] !== filter.status) return false;
      if (filter.both && !(c.found_by.claude && c.found_by.gpt)) return false;
      return !q || c.term.toLowerCase().includes(q);
    })
    .sort((a, b) => total(b.c) - total(a.c) || a.c.term.localeCompare(b.c.term));
}

const total = (c: Candidate) => (c.found_by.claude ?? 0) + (c.found_by.gpt ?? 0);

function candidateActions(c: Candidate, status: CandidateStatus): HTMLElement {
  const td = el("td", { class: "actions" });
  const key = coverKey(c.term);
  const isProtected = gstate?.glossaries.locked.entries.some(
    (e) => e.kind === "protected" && [e.term, ...e.forms].some((f) => coverKey(f) === key),
  );
  if (isProtected) {
    td.append(el("span", { class: "muted" }, "protected"));
    return td;
  }
  if (c.category === "theological_terms") {
    if (status !== "locked")
      td.append(
        button("Lock", () => actions.lock(c.term), "small"),
        " ",
      );
    if (status !== "allowed")
      td.append(
        button("Allow", () => actions.allow(c.term), "small"),
        " ",
      );
  } else if (c.category === "drift_words" && status === "open") {
    td.append(
      button("Add to drift", () => actions.drift(c.term), "small"),
      " ",
    );
  } else if (c.category === "strength_words" && status === "open") {
    td.append(
      button("Add to strength", () => actions.strength(c.term), "small"),
      " ",
    );
  }
  if (status === "locked" || status === "allowed")
    td.append(button("Remove", () => actions.clear(c.term), "small"));
  return td;
}

function candidatesView(): HTMLElement {
  const wrap = el("div");
  const category = el("select");
  for (const [v, label] of [
    ["theological_terms", "Theological terms"],
    ["drift_words", "Drift words"],
    ["strength_words", "Strength words"],
    ["all", "All categories"],
  ])
    category.append(el("option", { value: v as string }, label as string));
  category.value = filter.category;
  const status = el("select");
  for (const v of ["all", "open", "locked", "allowed", "drift", "strength"])
    status.append(el("option", { value: v }, v === "all" ? "Any status" : v));
  status.value = filter.status;
  const search = el("input", { type: "search", placeholder: "Search terms" });
  search.value = filter.search;
  const both = el("input", { type: "checkbox" });
  both.checked = filter.both;
  const refilter = () => {
    filter.category = category.value;
    filter.status = status.value;
    filter.search = search.value;
    filter.both = both.checked;
    selected = 0;
    expanded = -1;
    renderGlossary();
  };
  category.addEventListener("change", refilter);
  status.addEventListener("change", refilter);
  both.addEventListener("change", refilter);
  search.addEventListener("change", refilter);
  const rows = filteredCandidates();
  wrap.append(
    el(
      "div",
      { class: "filters" },
      category,
      status,
      search,
      el("label", {}, both, " found by both models"),
      el("span", { class: "muted" }, `${rows.length} shown`),
    ),
  );
  const table = el("table");
  table.append(
    el(
      "tr",
      {},
      el("th", {}, "Term"),
      el("th", {}, "Status"),
      el("th", {}, "Claude / GPT"),
      el("th", {}, "Chapters"),
      el("th", {}, ""),
    ),
  );
  rows.forEach(({ c, i }, n) => {
    const st = gstate?.statuses[i] ?? "open";
    const tr = el(
      "tr",
      { class: n === selected ? "sel" : "" },
      el("td", { class: "term" }, c.term),
      el("td", {}, el("span", { class: `st ${st}` }, st)),
      el("td", {}, `${c.found_by.claude ?? 0} / ${c.found_by.gpt ?? 0}`),
      el("td", { class: "muted" }, c.chapters.join(", ")),
      candidateActions(c, st),
    );
    tr.addEventListener("click", (e) => {
      if (e.target instanceof HTMLButtonElement) return;
      selected = n;
      expanded = expanded === n ? -1 : n;
      renderGlossary();
    });
    table.append(tr);
    if (expanded === n) {
      const td = el("td", { colspan: "5" });
      for (const line of c.notes) td.append(el("div", {}, line));
      table.append(el("tr", { class: "notes" }, td));
    }
  });
  wrap.append(table);
  hint.textContent = "keys: j/k move · Enter notes · l lock · a allow · x remove · / search";
  return wrap;
}

function editableCell(value: string, onCommit: (v: string) => void): HTMLElement {
  const input = el("input");
  input.value = value;
  input.addEventListener("change", () => onCommit(input.value));
  return el("td", {}, input);
}

function lockedView(g: Glossaries): HTMLElement {
  const wrap = el("div");
  const table = el("table");
  table.append(
    el(
      "tr",
      {},
      el("th", {}, "Term"),
      el("th", {}, "Kind"),
      el("th", {}, "Forms (comma-separated)"),
      el("th", {}, "Note"),
      el("th", {}, ""),
    ),
  );
  g.locked.entries.forEach((e: LockedEntry, i) => {
    const edit = (patch: Partial<LockedEntry>, msg: string) => {
      const next = clone(g);
      next.locked.entries[i] = { ...e, ...patch };
      void saveGlossaries(next, msg);
    };
    const kind = el("select");
    for (const k of ["protected", "theological"]) kind.append(el("option", { value: k }, k));
    kind.value = e.kind;
    kind.addEventListener("change", () =>
      edit({ kind: kind.value as LockedEntry["kind"] }, "Saved"),
    );
    table.append(
      el(
        "tr",
        {},
        editableCell(e.term, (v) => edit({ term: v }, "Saved")),
        el("td", {}, kind),
        editableCell(e.forms.join(", "), (v) => edit({ forms: splitList(v) }, "Saved")),
        editableCell(e.note ?? "", (v) => edit({ note: v || undefined }, "Saved")),
        el(
          "td",
          { class: "actions" },
          e.kind === "protected"
            ? el("span", { class: "muted" }, "required")
            : button("Allow instead", () => actions.allow(e.term), "small"),
        ),
      ),
    );
  });
  wrap.append(el("h3", {}, `Locked (${g.locked.entries.length})`), table);

  const allowed = el("table");
  allowed.append(el("tr", {}, el("th", {}, "Term"), el("th", {}, "Reason"), el("th", {}, "")));
  g.locked.allowed_to_change.forEach((e, i) => {
    allowed.append(
      el(
        "tr",
        {},
        el("td", { class: "term" }, e.term),
        editableCell(e.reason, (v) => {
          const next = clone(g);
          next.locked.allowed_to_change[i] = { ...e, reason: v };
          void saveGlossaries(next, "Saved");
        }),
        el(
          "td",
          { class: "actions" },
          button("Lock", () => actions.lock(e.term), "small"),
        ),
      ),
    );
  });
  wrap.append(
    el("h3", {}, `Allowed to change (${g.locked.allowed_to_change.length})`),
    el(
      "p",
      { class: "muted" },
      "Tip: triage these in Candidates → status “allowed”, sorted by how often the models found them.",
    ),
    allowed,
  );
  hint.textContent = "Edits save when a field loses focus";
  return wrap;
}

function driftView(g: Glossaries): HTMLElement {
  const table = el("table");
  table.append(
    el(
      "tr",
      {},
      el("th", {}, "Word"),
      el("th", {}, "Forms"),
      el("th", {}, "Sense"),
      el("th", {}, "Replacements"),
      el("th", {}, ""),
    ),
  );
  g.drift.entries.forEach((e, i) => {
    const edit = (patch: Partial<typeof e>) => {
      const next = clone(g);
      next.drift.entries[i] = { ...e, ...patch };
      void saveGlossaries(next, "Saved");
    };
    table.append(
      el(
        "tr",
        {},
        editableCell(e.word, (v) => edit({ word: v })),
        editableCell(e.forms.join(", "), (v) => edit({ forms: splitList(v) })),
        editableCell(e.sense, (v) => edit({ sense: v })),
        editableCell(e.replacements.join(", "), (v) => edit({ replacements: splitList(v) })),
        el(
          "td",
          { class: "actions" },
          button(
            "Delete",
            () => {
              const next = clone(g);
              next.drift.entries.splice(i, 1);
              void saveGlossaries(next, `Deleted “${e.word}”`);
            },
            "small",
          ),
        ),
      ),
    );
  });
  hint.textContent = "Edits save when a field loses focus";
  return el("div", {}, el("h3", {}, `Drift words (${g.drift.entries.length})`), table);
}

function sensesText(s: Record<string, string[]> | undefined): string {
  return s
    ? Object.entries(s)
        .map(([k, v]) => `${k}: ${v.join(", ")}`)
        .join(" | ")
    : "";
}

function parseSenses(text: string): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {};
  for (const part of text.split("|")) {
    const [k, v] = part.split(":");
    if (k?.trim() && v) out[k.trim()] = splitList(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function strengthView(g: Glossaries): HTMLElement {
  const table = el("table");
  table.append(
    el(
      "tr",
      {},
      el("th", {}, "Word"),
      el("th", {}, "Equivalents"),
      el("th", {}, "Senses (sense: words | …)"),
      el("th", {}, "Note"),
      el("th", {}, ""),
    ),
  );
  g.strength.entries.forEach((e, i) => {
    const edit = (patch: Partial<typeof e>) => {
      const next = clone(g);
      next.strength.entries[i] = { ...e, ...patch };
      void saveGlossaries(next, "Saved");
    };
    table.append(
      el(
        "tr",
        {},
        editableCell(e.word, (v) => edit({ word: v })),
        editableCell((e.equivalents ?? []).join(", "), (v) =>
          edit({ equivalents: v ? splitList(v) : undefined }),
        ),
        editableCell(sensesText(e.senses), (v) => edit({ senses: parseSenses(v) })),
        editableCell(e.note ?? "", (v) => edit({ note: v || undefined })),
        el(
          "td",
          { class: "actions" },
          button(
            "Delete",
            () => {
              const next = clone(g);
              next.strength.entries.splice(i, 1);
              void saveGlossaries(next, `Deleted “${e.word}”`);
            },
            "small",
          ),
        ),
      ),
    );
  });
  hint.textContent = "Edits save when a field loses focus";
  return el("div", {}, el("h3", {}, `Strength words (${g.strength.entries.length})`), table);
}

function statusBar(state: GlossaryState): HTMLElement {
  const good = state.problems.length === 0;
  const bar = el("div", { class: `status ${good ? "good" : "bad"}` });
  bar.append(
    el("strong", {}, good ? "Coverage check passes" : `${state.problems.length} problems`),
    el(
      "span",
      {},
      state.unapproved.length
        ? `Not approved: ${state.unapproved.join(", ")}`
        : "All three glossaries approved",
    ),
  );
  if (good && state.unapproved.length) {
    bar.append(
      button(
        "Approve glossaries",
        async () => {
          if (!confirm("Stamp today's date as your approval in locked, drift, and strength?"))
            return;
          gstate = await api<GlossaryState>("/api/glossary/approve", "POST");
          toast("Approved");
          renderGlossary();
        },
        "primary",
      ),
    );
  }
  if (!good) {
    const details = el("details", {}, el("summary", {}, "Show"));
    for (const p of state.problems.slice(0, 200)) details.append(el("div", {}, p));
    bar.append(details);
  }
  return bar;
}

function renderGlossary(): void {
  if (!gstate) return;
  const sub = el("div", { class: "subtabs" });
  for (const [k, label] of [
    ["candidates", "Candidates"],
    ["locked", "Locked & allowed"],
    ["drift", "Drift"],
    ["strength", "Strength"],
  ] as const) {
    sub.append(
      button(
        label,
        () => {
          gtab = k;
          renderGlossary();
        },
        gtab === k ? "active" : "",
      ),
    );
  }
  const g = gstate.glossaries;
  const body =
    gtab === "candidates"
      ? candidatesView()
      : gtab === "locked"
        ? lockedView(g)
        : gtab === "drift"
          ? driftView(g)
          : strengthView(g);
  app.replaceChildren(el("div", { class: "gloss" }, statusBar(gstate), sub, body));
  app.querySelector("tr.sel")?.scrollIntoView({ block: "nearest" });
}

// ---------- Shell ----------

let tab: "sections" | "glossary" = "sections";

async function show(next: typeof tab): Promise<void> {
  tab = next;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#tabs button")) {
    b.classList.toggle("active", b.dataset.tab === next);
  }
  if (next === "sections") {
    if (!sections.length) {
      const res = await api<{
        book: string;
        sections: SectionState[];
        notes: Record<string, SectionNote>;
      }>("/api/sections");
      ({ book, sections, notes } = res);
    }
    renderSections();
  } else {
    if (!gstate) {
      const res = await api<GlossaryState & { candidates: Candidate[] }>("/api/glossary");
      candidates = res.candidates;
      gstate = res;
    }
    renderGlossary();
  }
}

for (const b of document.querySelectorAll<HTMLButtonElement>("#tabs button")) {
  b.addEventListener("click", () => void show(b.dataset.tab as typeof tab));
}

document.addEventListener("keydown", (e) => {
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (tab === "sections") {
    if (e.key === "j" || e.key === "ArrowDown")
      current = Math.min(sections.length - 1, current + 1);
    else if (e.key === "k" || e.key === "ArrowUp") current = Math.max(0, current - 1);
    else if (e.key === "o") {
      const s = sections[current];
      if (!s) return;
      void saveNote(s.id, "ok", notes[s.id]?.note ?? "").then(() => {
        current = Math.min(sections.length - 1, current + 1);
        renderSections();
      });
      return;
    } else return;
    e.preventDefault();
    renderSections();
    return;
  }
  if (gtab !== "candidates") return;
  const rows = filteredCandidates();
  const row = rows[selected];
  if (e.key === "j" || e.key === "ArrowDown") selected = Math.min(rows.length - 1, selected + 1);
  else if (e.key === "k" || e.key === "ArrowUp") selected = Math.max(0, selected - 1);
  else if (e.key === "Enter") expanded = expanded === selected ? -1 : selected;
  else if (e.key === "/") {
    e.preventDefault();
    app.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    return;
  } else if (row && e.key === "l" && row.c.category === "theological_terms")
    return actions.lock(row.c.term);
  else if (row && e.key === "a" && row.c.category === "theological_terms")
    return actions.allow(row.c.term);
  else if (row && e.key === "x") return actions.clear(row.c.term);
  else return;
  e.preventDefault();
  renderGlossary();
});

const initial = location.hash.match(/^#(glossary|s=(\d+))$/);
if (initial?.[2]) current = Number(initial[2]);
void show(initial?.[1] === "glossary" ? "glossary" : "sections");
