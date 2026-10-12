// Canonical book list in KJV (SWORD) order: OSIS id, USFM id, and the abbreviations Henry's
// text uses (CCEL/SWORD short forms), matched case-sensitively without a trailing period.

export interface Book {
  osis: string;
  usfm: string;
  name: string;
  abbreviations: string[];
}

export const BOOKS: Book[] = [
  { osis: "Gen", usfm: "GEN", name: "Genesis", abbreviations: ["Ge", "Gen"] },
  { osis: "Exod", usfm: "EXO", name: "Exodus", abbreviations: ["Ex", "Exo", "Exod"] },
  { osis: "Lev", usfm: "LEV", name: "Leviticus", abbreviations: ["Le", "Lev"] },
  { osis: "Num", usfm: "NUM", name: "Numbers", abbreviations: ["Nu", "Num"] },
  { osis: "Deut", usfm: "DEU", name: "Deuteronomy", abbreviations: ["De", "Deu", "Deut"] },
  { osis: "Josh", usfm: "JOS", name: "Joshua", abbreviations: ["Jos", "Josh"] },
  { osis: "Judg", usfm: "JDG", name: "Judges", abbreviations: ["Jud", "Jdg", "Judg"] },
  { osis: "Ruth", usfm: "RUT", name: "Ruth", abbreviations: ["Ru", "Rut"] },
  { osis: "1Sam", usfm: "1SA", name: "1 Samuel", abbreviations: ["1Sa", "1Sam"] },
  { osis: "2Sam", usfm: "2SA", name: "2 Samuel", abbreviations: ["2Sa", "2Sam"] },
  { osis: "1Kgs", usfm: "1KI", name: "1 Kings", abbreviations: ["1Ki", "1Kgs"] },
  { osis: "2Kgs", usfm: "2KI", name: "2 Kings", abbreviations: ["2Ki", "2Kgs"] },
  { osis: "1Chr", usfm: "1CH", name: "1 Chronicles", abbreviations: ["1Ch", "1Chr"] },
  { osis: "2Chr", usfm: "2CH", name: "2 Chronicles", abbreviations: ["2Ch", "2Chr"] },
  { osis: "Ezra", usfm: "EZR", name: "Ezra", abbreviations: ["Ezr", "Ezra"] },
  { osis: "Neh", usfm: "NEH", name: "Nehemiah", abbreviations: ["Ne", "Neh"] },
  { osis: "Esth", usfm: "EST", name: "Esther", abbreviations: ["Es", "Est", "Esth"] },
  { osis: "Job", usfm: "JOB", name: "Job", abbreviations: ["Job"] },
  { osis: "Ps", usfm: "PSA", name: "Psalms", abbreviations: ["Ps", "Psa"] },
  { osis: "Prov", usfm: "PRO", name: "Proverbs", abbreviations: ["Pr", "Pro", "Prov"] },
  { osis: "Eccl", usfm: "ECC", name: "Ecclesiastes", abbreviations: ["Ec", "Ecc", "Eccl"] },
  { osis: "Song", usfm: "SNG", name: "Song of Solomon", abbreviations: ["So", "Song"] },
  { osis: "Isa", usfm: "ISA", name: "Isaiah", abbreviations: ["Is", "Isa"] },
  { osis: "Jer", usfm: "JER", name: "Jeremiah", abbreviations: ["Jer"] },
  { osis: "Lam", usfm: "LAM", name: "Lamentations", abbreviations: ["La", "Lam"] },
  { osis: "Ezek", usfm: "EZK", name: "Ezekiel", abbreviations: ["Eze", "Ezek"] },
  { osis: "Dan", usfm: "DAN", name: "Daniel", abbreviations: ["Da", "Dan"] },
  { osis: "Hos", usfm: "HOS", name: "Hosea", abbreviations: ["Ho", "Hos"] },
  { osis: "Joel", usfm: "JOL", name: "Joel", abbreviations: ["Joe", "Joel"] },
  { osis: "Amos", usfm: "AMO", name: "Amos", abbreviations: ["Am", "Amos"] },
  { osis: "Obad", usfm: "OBA", name: "Obadiah", abbreviations: ["Ob", "Obad"] },
  { osis: "Jonah", usfm: "JON", name: "Jonah", abbreviations: ["Jon", "Jonah"] },
  { osis: "Mic", usfm: "MIC", name: "Micah", abbreviations: ["Mic"] },
  { osis: "Nah", usfm: "NAM", name: "Nahum", abbreviations: ["Na", "Nah"] },
  { osis: "Hab", usfm: "HAB", name: "Habakkuk", abbreviations: ["Hab"] },
  { osis: "Zeph", usfm: "ZEP", name: "Zephaniah", abbreviations: ["Zep", "Zeph"] },
  { osis: "Hag", usfm: "HAG", name: "Haggai", abbreviations: ["Hag"] },
  { osis: "Zech", usfm: "ZEC", name: "Zechariah", abbreviations: ["Zec", "Zech"] },
  { osis: "Mal", usfm: "MAL", name: "Malachi", abbreviations: ["Mal"] },
  { osis: "Matt", usfm: "MAT", name: "Matthew", abbreviations: ["Mt", "Mat", "Matt"] },
  { osis: "Mark", usfm: "MRK", name: "Mark", abbreviations: ["Mr", "Mk", "Mark"] },
  { osis: "Luke", usfm: "LUK", name: "Luke", abbreviations: ["Lu", "Lk", "Luke"] },
  { osis: "John", usfm: "JHN", name: "John", abbreviations: ["Joh", "Jn", "John"] },
  { osis: "Acts", usfm: "ACT", name: "Acts", abbreviations: ["Ac", "Act", "Acts"] },
  { osis: "Rom", usfm: "ROM", name: "Romans", abbreviations: ["Ro", "Rom"] },
  { osis: "1Cor", usfm: "1CO", name: "1 Corinthians", abbreviations: ["1Co", "1Cor"] },
  { osis: "2Cor", usfm: "2CO", name: "2 Corinthians", abbreviations: ["2Co", "2Cor"] },
  { osis: "Gal", usfm: "GAL", name: "Galatians", abbreviations: ["Ga", "Gal"] },
  { osis: "Eph", usfm: "EPH", name: "Ephesians", abbreviations: ["Ep", "Eph"] },
  { osis: "Phil", usfm: "PHP", name: "Philippians", abbreviations: ["Php", "Phil"] },
  { osis: "Col", usfm: "COL", name: "Colossians", abbreviations: ["Col"] },
  { osis: "1Thess", usfm: "1TH", name: "1 Thessalonians", abbreviations: ["1Th", "1Thess"] },
  { osis: "2Thess", usfm: "2TH", name: "2 Thessalonians", abbreviations: ["2Th", "2Thess"] },
  { osis: "1Tim", usfm: "1TI", name: "1 Timothy", abbreviations: ["1Ti", "1Tim"] },
  { osis: "2Tim", usfm: "2TI", name: "2 Timothy", abbreviations: ["2Ti", "2Tim"] },
  { osis: "Titus", usfm: "TIT", name: "Titus", abbreviations: ["Tit", "Titus"] },
  { osis: "Phlm", usfm: "PHM", name: "Philemon", abbreviations: ["Phm", "Phlm"] },
  { osis: "Heb", usfm: "HEB", name: "Hebrews", abbreviations: ["Heb"] },
  { osis: "Jas", usfm: "JAS", name: "James", abbreviations: ["Jas", "Jam"] },
  { osis: "1Pet", usfm: "1PE", name: "1 Peter", abbreviations: ["1Pe", "1Pet"] },
  { osis: "2Pet", usfm: "2PE", name: "2 Peter", abbreviations: ["2Pe", "2Pet"] },
  { osis: "1John", usfm: "1JN", name: "1 John", abbreviations: ["1Jo", "1Jn", "1John"] },
  { osis: "2John", usfm: "2JN", name: "2 John", abbreviations: ["2Jo", "2Jn", "2John"] },
  { osis: "3John", usfm: "3JN", name: "3 John", abbreviations: ["3Jo", "3Jn", "3John"] },
  { osis: "Jude", usfm: "JUD", name: "Jude", abbreviations: ["Jude"] },
  { osis: "Rev", usfm: "REV", name: "Revelation", abbreviations: ["Re", "Rev"] },
];

export const NT_START = BOOKS.findIndex((b) => b.osis === "Matt");

export function bookByOsis(osis: string): Book {
  const book = BOOKS.find((b) => b.osis === osis);
  if (!book) throw new Error(`Unknown OSIS book "${osis}"`);
  return book;
}

export function bookByUsfm(usfm: string): Book | undefined {
  return BOOKS.find((b) => b.usfm === usfm);
}

const byAbbreviation = new Map(BOOKS.flatMap((b) => b.abbreviations.map((a) => [a, b] as const)));

export function bookByAbbreviation(abbreviation: string): Book | undefined {
  return byAbbreviation.get(abbreviation.replace(/\.$/, ""));
}

/** Parses "John.3.16" into its parts. */
export function parseOsisVerse(osis: string): { book: string; chapter: number; verse: number } {
  const m = osis.match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Not an OSIS verse reference: "${osis}"`);
  return { book: m[1] as string, chapter: Number(m[2]), verse: Number(m[3]) };
}
