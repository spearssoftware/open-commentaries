// Converts one MHCC OSIS entry into plain text. The tag set is the one MHCC actually uses
// (inventoried from the module); any other tag throws so new markup is never silently lost.
//
// An entry's markup has two parts. A "preverse" div holds material printed before the verse
// comment: the book title and introduction (first entry of a book), then "Chapter N" and the
// chapter outline table (first entry of each chapter). After it come the "Verses N-M" label and
// the comment itself.

export interface RefSpan {
  start: number;
  end: number;
  osisRef: string;
}

export interface TextBlock {
  heading: string | null;
  text: string;
  refs: RefSpan[];
}

export interface ParsedEntry {
  bookIntro: TextBlock | null;
  chapterIntro: TextBlock | null;
  /** N from a "Chapter N" title in the preverse part. */
  chapterTitle: number | null;
  /** The "Verses N-M" label text without the word "Verses", e.g. "1-5". */
  label: string | null;
  body: TextBlock;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    const decoded = ENTITIES[name];
    if (decoded === undefined) throw new Error(`Unknown XML entity ${whole}`);
    return decoded;
  });
}

interface Tag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: Record<string, string>;
}

type Token = { tag: Tag } | { text: string };

export function tokenize(markup: string): Token[] {
  const tokens: Token[] = [];
  const re = /<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)|(<)/g;
  for (const m of markup.matchAll(re)) {
    if (m[6]) throw new Error(`Malformed markup near "${markup.slice(m.index, m.index + 40)}"`);
    if (m[5] !== undefined) {
      tokens.push({ text: decodeEntities(m[5]) });
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (m[3] ?? "").matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attrs[a[1] as string] = decodeEntities(a[2] ?? "");
    }
    tokens.push({
      tag: { name: m[2] as string, closing: m[1] === "/", selfClosing: m[4] === "/", attrs },
    });
  }
  return tokens;
}

// Sentinels let reference spans and paragraph breaks survive whitespace normalization.
const REF_OPEN = "\u0001";
const REF_SEP = "\u0002";
const REF_CLOSE = "\u0003";
const PARA = "\u0004";

/** Collapses whitespace per paragraph, joins paragraphs with a blank line, and extracts spans. */
export function finishText(raw: string): { text: string; refs: RefSpan[] } {
  const paragraphs = raw
    .split(PARA)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(
      (p) =>
        p
          .replace(new RegExp(`${REF_OPEN}[^${REF_SEP}]*${REF_SEP}|${REF_CLOSE}`, "g"), "")
          .trim() !== "",
    );
  const joined = paragraphs.join("\n\n");
  const refs: RefSpan[] = [];
  let text = "";
  const re = new RegExp(`${REF_OPEN}([^${REF_SEP}]*)${REF_SEP}([^${REF_CLOSE}]*)${REF_CLOSE}`, "g");
  let last = 0;
  for (const m of joined.matchAll(re)) {
    text += joined.slice(last, m.index);
    const inner = m[2] ?? "";
    refs.push({ start: text.length, end: text.length + inner.length, osisRef: m[1] ?? "" });
    text += inner;
    last = m.index + m[0].length;
  }
  text += joined.slice(last);
  if ([REF_OPEN, REF_SEP, REF_CLOSE, PARA].some((c) => text.includes(c)))
    throw new Error("Unbalanced reference markup");
  return { text, refs };
}

type Target = "bookIntro" | "chapterIntro" | "body";

/** Parses one entry. `where` (an OSIS id) is used only in error messages. */
export function parseEntry(markup: string, where: string): ParsedEntry {
  const raw: Record<Target, string> = { bookIntro: "", chapterIntro: "", body: "" };
  const headings: Record<Target, string | null> = {
    bookIntro: null,
    chapterIntro: null,
    body: null,
  };
  let target: Target = "body";
  let inPreverse = false;
  let chapterTitle: number | null = null;
  let label: string | null = null;
  let capture: { kind: "title" | "hi" | "reference"; type: string; text: string } | null = null;

  const fail = (detail: string): never => {
    throw new Error(`${where}: ${detail}`);
  };

  for (const token of tokenize(markup)) {
    if ("text" in token) {
      if (capture) capture.text += token.text;
      else raw[target] += token.text;
      continue;
    }
    const { name, closing, selfClosing, attrs } = token.tag;
    switch (name) {
      case "div": {
        if (attrs.subType === "x-preverse") {
          inPreverse = attrs.sID !== undefined;
          if (!inPreverse) target = "body";
        } else if (attrs.type === "x-p" || attrs.type === "introduction") {
          raw[target] += PARA;
        } else if (attrs.type !== "book") {
          fail(`unexpected div type "${attrs.type}"`);
        }
        break;
      }
      case "title":
      case "hi":
      case "reference": {
        if (selfClosing) fail(`unexpected empty <${name}>`);
        if (!closing) {
          if (capture) fail(`<${name}> nested inside <${capture.kind}>`);
          const type =
            name === "reference"
              ? (attrs.osisRef ?? fail("reference without osisRef"))
              : (attrs.type ?? "");
          capture = { kind: name, type, text: "" };
          break;
        }
        if (capture?.kind !== name) fail(`unbalanced </${name}>`);
        const { type, text } = capture as NonNullable<typeof capture>;
        capture = null;
        const trimmed = text.replace(/\s+/g, " ").trim();
        if (name === "reference") {
          raw[target] += `${REF_OPEN}${type}${REF_SEP}${text}${REF_CLOSE}`;
        } else if (name === "hi") {
          const m = trimmed.match(/^Verses? (.+)$/);
          if (type === "bold" && m && !inPreverse && label === null) label = m[1] as string;
          else if (type === "bold" || type === "italic") raw[target] += text;
          else fail(`unexpected hi type "${type}"`);
        } else if (!inPreverse) {
          fail(`title outside the preverse part: "${trimmed}"`);
        } else if (type === "x-ms") {
          target = "bookIntro";
          headings.bookIntro = trimmed;
        } else if (type === "x-s2") {
          const m =
            trimmed.match(/^Chapter (\d+)$/) ?? fail(`unexpected chapter title "${trimmed}"`);
          chapterTitle = Number(m[1]);
          target = "chapterIntro";
        } else if (type === "x-IS") {
          target = "chapterIntro";
          headings.chapterIntro = trimmed;
        } else {
          fail(`unexpected title type "${type}"`);
        }
        break;
      }
      case "table":
      case "cell":
        if (!inPreverse) fail(`<${name}> outside the preverse part`);
        if (name === "cell" && closing) raw[target] += " ";
        break;
      case "row":
        if (!inPreverse) fail("<row> outside the preverse part");
        raw[target] += PARA;
        break;
      case "chapter":
      case "milestone":
        break;
      default:
        fail(`unknown tag <${name}>`);
    }
  }
  if (capture) fail(`unclosed <${(capture as { kind: string }).kind}>`);

  const block = (t: Target): TextBlock | null => {
    const { text, refs } = finishText(raw[t]);
    if (t !== "body" && text === "" && headings[t] === null) return null;
    return { heading: headings[t], text, refs };
  };
  return {
    bookIntro: block("bookIntro"),
    chapterIntro: block("chapterIntro"),
    chapterTitle,
    label,
    body: block("body") as TextBlock,
  };
}

/** Parses a "Verses" label ("1-5", "25", "26, 27") into a verse range within one chapter. */
export function parseLabel(label: string): { start: number; end: number } {
  const m = label.match(/^(\d+)(?:\s*(?:-|,)\s*(\d+))?$/);
  if (!m) throw new Error(`Unrecognized verse label "Verses ${label}"`);
  const start = Number(m[1]);
  return { start, end: m[2] ? Number(m[2]) : start };
}
