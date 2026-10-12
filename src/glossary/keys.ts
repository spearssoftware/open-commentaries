// Term normalization shared by the glossary checks and the browser review page (no Node imports).

/** Lowercase key used to merge the same term reported by different calls. */
export function termKey(term: string): string {
  return term
    .toLowerCase()
    .replace(/[“”"'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Coverage key: termKey without a leading article or possessive, so "the gospel" matches "gospel". */
export function coverKey(term: string): string {
  return termKey(term).replace(/^(the|a|an|our|his|their) /, "");
}
