// Deterministic sentence splitter for Henry's prose.
//
// A boundary is a run of . ? or ! (plus any closing quotes or brackets) followed by whitespace,
// where the next word starts a sentence: an uppercase letter, an opening quote or bracket, or a
// digit. A paragraph break always ends a sentence. Periods after protected abbreviations never end
// one, except "&c." and "etc.", which do when a capitalized word follows.

const NEVER_FINAL = new Set([
  "ver",
  "vs",
  "v",
  "ch",
  "chap",
  "i.e",
  "e.g",
  "viz",
  "cf",
  "St",
  "Mr",
  "Mrs",
  "Dr",
  "ib",
  "ibid",
  // Book abbreviations Henry writes with a period before a chapter number.
  "Ps",
  "Psa",
  "Joh",
  "Gen",
  "Ex",
  "Isa",
  "Matt",
  "Rom",
  "Heb",
  "Rev",
]);

const SOMETIMES_FINAL = new Set(["&c", "etc"]);

const CLOSERS = `"'”’)\\]`;
const OPENERS = `"'“‘([`;

function startsSentence(next: string): boolean {
  const c = next[0] ?? "";
  if (c === "(" && /^\(\d/.test(next)) return false;
  return /[A-Z0-9]/.test(c) || OPENERS.includes(c);
}

/** The word immediately before a period at `end`, e.g. "ver" or "i.e" or "&c". */
function wordBefore(text: string, end: number): string {
  const m = text.slice(0, end).match(/(?:^|[\s(])([^\s(]+)$/);
  return m?.[1] ?? "";
}

function splitParagraph(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  const re = new RegExp(`[.?!]+[${CLOSERS}]*(?=\\s+(\\S+))`, "g");
  for (const m of text.matchAll(re)) {
    const next = m[1] ?? "";
    if (!startsSentence(next)) continue;
    if (m[0].startsWith(".")) {
      const word = wordBefore(text, m.index);
      if (NEVER_FINAL.has(word)) continue;
      // Single-letter initials such as "A. D. 97".
      if (/^[A-HJ-Z]$/.test(word)) continue;
      if (SOMETIMES_FINAL.has(word) && !/^[A-Z“"‘']/.test(next)) continue;
    }
    const end = m.index + m[0].length;
    sentences.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap(splitParagraph);
}
