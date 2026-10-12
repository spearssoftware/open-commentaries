interface Quote {
  span: string;
  osis: string | null;
  kjv_text: string | null;
  bsb_text: string | null;
  bsb_note: string | null;
}

interface Decision {
  phase: Phase;
  decision: "approve" | "flag";
  type: FlagKind | null;
  dated_view: boolean;
  comment: string | null;
}

interface Section {
  id: string;
  kind: string;
  chapter: number;
  seq: number;
  osis_start: string;
  osis_end: string;
  heading: string | null;
  original_text: string;
  modern_heading: string | null;
  modern_text: string | null;
  quotes: Quote[];
  text_hash: string;
  decisions: Decision[];
}

interface Listing {
  reviewer: string;
  book: string;
  chapters: [number, number];
  sections: Section[];
}

interface Flag {
  type: string;
  detail: string;
  status: string;
}

interface Round {
  round: number;
  verdict: string;
  flags: Flag[];
}

interface RuleCheck {
  check: string;
  result: string;
  detail: string;
}

interface Claim {
  n: number;
  text: string;
  modality: string;
  strength: string;
  disputed: boolean;
}

interface Reveal {
  review_status: string;
  tags: string[];
  rounds: Round[];
  rule_checks: RuleCheck[];
  claims: Claim[];
}

type Phase = "blind" | "amended";
type FlagKind = "meaning" | "wording";

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const STORAGE_KEY = "review-token";
const app = document.getElementById("app") as HTMLElement;
let token = "";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readToken(): string {
  const match = /(?:^|[#&])t=([^&]+)/.exec(location.hash);
  if (match?.[1]) {
    const fromHash = decodeURIComponent(match[1]);
    try {
      sessionStorage.setItem(STORAGE_KEY, fromHash);
    } catch {
      // Storage may be blocked; the token then lives in memory only.
    }
    history.replaceState(null, "", location.pathname + location.search);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function clearToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

async function api<T>(path: string, init?: { method: "POST"; body: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      "X-Review-Token": token,
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

function showNotice(message: string): void {
  app.replaceChildren(el("p", "notice", message));
}

function paragraphs(text: string): HTMLElement {
  const box = el("div", "text");
  for (const part of text.split("\n\n")) {
    if (part.trim()) box.append(el("p", undefined, part));
  }
  return box;
}

function parseOsis(osis: string): { chapter: number; verse: number | null } | null {
  const m = /^[^.]+\.(\d+)(?:\.(\d+))?$/.exec(osis);
  if (!m) return null;
  return { chapter: Number(m[1]), verse: m[2] ? Number(m[2]) : null };
}

function sectionLabel(book: string, s: Section): string {
  if (s.kind === "intro") {
    return s.chapter === 0 ? `${book} — introduction` : `${book} ${s.chapter} — chapter outline`;
  }
  const start = parseOsis(s.osis_start);
  const end = parseOsis(s.osis_end);
  if (!start || !end || start.verse === null || end.verse === null) return `${book} ${s.chapter}`;
  const first = `${book} ${start.chapter}:${start.verse}`;
  if (start.chapter === end.chapter) {
    return start.verse === end.verse ? first : `${first}–${end.verse}`;
  }
  return `${first}–${end.chapter}:${end.verse}`;
}

function labelled(title: string, body: HTMLElement): HTMLElement {
  const box = el("div");
  box.append(el("h4", undefined, title), body);
  return box;
}

function quoteBlock(q: Quote): HTMLElement {
  const box = el("div", "quote");
  box.append(el("span", "ref", q.osis ? `${q.span} (${q.osis})` : q.span));
  if (q.kjv_text) {
    const p = el("p");
    p.append(el("span", "tag", "KJV"), document.createTextNode(q.kjv_text));
    box.append(p);
  }
  if (q.bsb_text) {
    const p = el("p");
    p.append(el("span", "tag", "BSB"), document.createTextNode(q.bsb_text));
    box.append(p);
  }
  if (q.bsb_note) box.append(el("p", "muted", q.bsb_note));
  return box;
}

function describeDecision(d: Decision): string {
  const what = d.decision === "approve" ? "Approved" : `Flagged (${d.type ?? "unspecified"})`;
  const parts = [`${d.phase === "blind" ? "Blind decision" : "Amended"}: ${what}`];
  if (d.dated_view) parts.push("dated view");
  if (d.comment) parts.push(`“${d.comment}”`);
  return parts.join(" — ");
}

function revealPanel(r: Reveal): HTMLElement {
  const box = el("div", "reveal");
  box.append(el("h4", undefined, "Machine review"));
  const status = el("p");
  status.textContent = `Status: ${r.review_status}${r.tags.length ? ` — tags: ${r.tags.join(", ")}` : ""}`;
  box.append(status);

  for (const round of r.rounds) {
    box.append(el("h4", undefined, `Round ${round.round}: ${round.verdict}`));
    if (!round.flags.length) continue;
    const ul = el("ul");
    for (const f of round.flags) ul.append(el("li", undefined, `${f.type} (${f.status}): ${f.detail}`));
    box.append(ul);
  }

  if (r.rule_checks.length) {
    box.append(el("h4", undefined, "Rule checks"));
    const ul = el("ul");
    for (const c of r.rule_checks) {
      const li = el("li");
      li.append(el("strong", c.result, c.result), document.createTextNode(` ${c.check}: ${c.detail}`));
      ul.append(li);
    }
    box.append(ul);
  }

  if (r.claims.length) {
    box.append(el("h4", undefined, "Claims"));
    const ul = el("ul");
    for (const c of r.claims) {
      const disputed = c.disputed ? " [disputed]" : "";
      ul.append(el("li", undefined, `${c.n}. ${c.text} (${c.modality}, ${c.strength})${disputed}`));
    }
    box.append(ul);
  }
  return box;
}

function decisionForm(
  section: Section,
  phase: Phase,
  decision: "approve" | "flag",
  onDone: () => void,
): HTMLFormElement {
  const form = el("form", "decide");
  form.noValidate = true;
  const error = el("p", "error");
  error.setAttribute("role", "alert");

  let kind: HTMLInputElement[] = [];
  let comment: HTMLTextAreaElement | null = null;
  if (decision === "flag") {
    const set = el("fieldset");
    set.append(el("legend", undefined, "What kind of problem?"));
    const options: [FlagKind, string][] = [
      ["meaning", "Meaning — a claim was changed, added, dropped, or weakened"],
      ["wording", "Wording — awkward, or Henry's voice is lost"],
    ];
    kind = options.map(([value, text]) => {
      const label = el("label");
      const input = el("input");
      input.type = "radio";
      input.name = "type";
      input.value = value;
      label.append(input, document.createTextNode(` ${text}`));
      set.append(label);
      return input;
    });
    form.append(set);
    const label = el("label", undefined, "Comment (required)");
    comment = el("textarea");
    comment.required = true;
    label.append(comment);
    form.append(label);
  }

  const dated = el("input");
  dated.type = "checkbox";
  const datedLabel = el("label");
  datedLabel.append(dated, document.createTextNode(" Dated view (Henry's era-bound opinion)"));
  const submit = el("button", "primary", decision === "approve" ? "Record approval" : "Record flag");
  submit.type = "submit";
  form.append(datedLabel, submit, error);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const type = kind.find((k) => k.checked)?.value;
    const text = comment?.value.trim() ?? "";
    if (decision === "flag" && !type) {
      error.textContent = "Choose Meaning or Wording.";
      return;
    }
    if (decision === "flag" && !text) {
      error.textContent = "Add a comment explaining the flag.";
      return;
    }
    submit.disabled = true;
    try {
      await api("/api/decisions", {
        method: "POST",
        body: {
          section_id: section.id,
          phase,
          decision,
          ...(decision === "flag" ? { type, comment: text } : {}),
          dated_view: dated.checked,
          text_hash: section.text_hash,
        },
      });
      section.decisions.push({
        phase,
        decision,
        type: decision === "flag" ? (type as FlagKind) : null,
        dated_view: dated.checked,
        comment: decision === "flag" ? text : null,
      });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        clearToken();
        showNotice("This link is not valid or has been revoked.");
        return;
      }
      error.textContent = e instanceof Error ? e.message : "Something went wrong; try again.";
      submit.disabled = false;
    }
  });
  return form;
}

function renderCard(book: string, section: Section, onChange: () => void): HTMLElement {
  const card = el("article", "card");
  const blind = section.decisions.find((d) => d.phase === "blind");
  const amended = section.decisions.find((d) => d.phase === "amended");
  if (blind) card.classList.add("done");

  card.append(el("h3", undefined, sectionLabel(book, section)));
  if (section.heading) card.append(el("p", "heading", section.heading));
  card.append(labelled("Original", paragraphs(section.original_text)));

  const modern = el("div");
  if (section.modern_heading) modern.append(el("p", "heading", section.modern_heading));
  modern.append(
    section.modern_text ? paragraphs(section.modern_text) : el("p", "muted", "Not yet modernized"),
  );
  card.append(labelled("Modern", modern));

  if (section.quotes.length) {
    const quotes = el("div");
    for (const q of section.quotes) quotes.append(quoteBlock(q));
    card.append(labelled("Henry's quotations", quotes));
  }

  const slot = el("div");
  card.append(slot);

  const refresh = () => {
    onChange();
    slot.replaceChildren(...buildSlot());
  };

  const buildSlot = (): HTMLElement[] => {
    const parts: HTMLElement[] = [];
    if (section.decisions.length) {
      const list = el("ul", "recorded");
      for (const d of section.decisions) list.append(el("li", undefined, describeDecision(d)));
      parts.push(list);
    }
    const formHost = el("div");

    const choices = (phase: Phase): HTMLElement => {
      const actions = el("div", "actions");
      for (const decision of ["approve", "flag"] as const) {
        const button = el("button", undefined, decision === "approve" ? "Approve" : "Flag");
        button.type = "button";
        button.addEventListener("click", () => {
          formHost.replaceChildren(decisionForm(section, phase, decision, refresh));
        });
        actions.append(button);
      }
      return actions;
    };

    if (!blind) {
      parts.push(choices("blind"), formHost);
      return parts;
    }

    const revealHost = el("div");
    parts.push(revealHost);
    api<Reveal>(`/api/sections/${encodeURIComponent(section.id)}/reveal`)
      .then((r) => revealHost.replaceChildren(revealPanel(r)))
      .catch((e: unknown) => {
        revealHost.replaceChildren(
          el("p", "error", e instanceof Error ? e.message : "Could not load the machine review."),
        );
      });
    if (!amended) {
      const actions = el("div", "actions");
      const amend = el("button", undefined, "Amend my decision");
      amend.type = "button";
      amend.addEventListener("click", () => actions.replaceChildren(choices("amended")));
      actions.append(amend);
      parts.push(actions, formHost);
    }
    return parts;
  };

  slot.replaceChildren(...buildSlot());
  return card;
}

function renderListing(listing: Listing): void {
  const { book, sections } = listing;
  const bar = el("progress");
  const progressText = el("p");
  const update = () => {
    const done = sections.filter((s) => s.decisions.some((d) => d.phase === "blind")).length;
    bar.max = sections.length;
    bar.value = done;
    progressText.textContent = `${done} of ${sections.length} sections decided`;
  };

  const header = el("header", "top");
  const [from, to] = listing.chapters;
  header.append(
    el("h1", undefined, `${book} ${from === to ? from : `${from}–${to}`}`),
    el("p", undefined, `Reviewing as ${listing.reviewer}`),
    progressText,
    bar,
  );
  update();

  const root = document.createDocumentFragment();
  root.append(header);
  let chapter: number | null = null;
  for (const s of sections) {
    if (s.chapter !== chapter) {
      chapter = s.chapter;
      root.append(el("h2", "chapter", chapter === 0 ? "Introduction" : `Chapter ${chapter}`));
    }
    root.append(renderCard(book, s, update));
  }
  if (!sections.length) root.append(el("p", "notice", "No sections have been uploaded for this link yet."));
  app.replaceChildren(root);
}

async function main(): Promise<void> {
  token = readToken();
  if (!token) {
    showNotice("This page needs a review link.");
    return;
  }
  try {
    renderListing(await api<Listing>("/api/sections"));
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      clearToken();
      showNotice("This link is not valid or has been revoked.");
      return;
    }
    showNotice("Could not load sections. Check your connection and reload.");
  }
}

void main();
