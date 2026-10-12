// Reader for SWORD zCom commentary modules (ModDrv=zCom, CompressType=ZIP).
//
// Per testament the module has three files:
//   .bzs  12-byte block records: offset in .bzz, compressed size, uncompressed size (u32 LE)
//   .bzv  10-byte index records, one per versification slot: block, offset, size (u32, u32, u16)
//   .bzz  zlib-compressed blocks
// Slots follow KJV versification: 0 = module heading, 1 = testament heading, then for each book a
// book heading slot, and for each chapter a chapter heading slot followed by one slot per verse.
// A size of 0 means no entry. Consecutive verse slots holding the same pointer are linked: one
// entry covering a verse range.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

export interface BookVersification {
  osis: string;
  verses: number[];
}

export interface ZComSection {
  /** OSIS id of the first and last verse the entry is linked to, e.g. "John.1.1". */
  osisStart: string;
  osisEnd: string;
  /** Raw OSIS markup of the entry. */
  raw: string;
}

export function readConf(path: string): Record<string, string> {
  const conf: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m?.[1] && conf[m[1]] === undefined) conf[m[1]] = (m[2] ?? "").trim();
  }
  return conf;
}

interface Pointer {
  block: number;
  offset: number;
  size: number;
}

export class ZComTestament {
  private readonly index: Buffer;
  private readonly blocks: Buffer[] = [];
  /** Slot of each book's heading, keyed by OSIS book id. */
  private readonly bookSlots = new Map<string, number>();

  constructor(
    dir: string,
    testament: "ot" | "nt",
    private readonly books: BookVersification[],
  ) {
    this.index = readFileSync(join(dir, `${testament}.bzv`));
    const bzs = readFileSync(join(dir, `${testament}.bzs`));
    const bzz = readFileSync(join(dir, `${testament}.bzz`));
    for (let i = 0; i < bzs.length / 12; i++) {
      const offset = bzs.readUInt32LE(i * 12);
      const size = bzs.readUInt32LE(i * 12 + 4);
      const block = inflateSync(bzz.subarray(offset, offset + size));
      if (block.length !== bzs.readUInt32LE(i * 12 + 8)) {
        throw new Error(`${testament}.bzz block ${i}: inflated size does not match .bzs`);
      }
      this.blocks.push(block);
    }
    let slot = 2;
    for (const book of books) {
      this.bookSlots.set(book.osis, slot);
      slot += 1 + book.verses.reduce((sum, n) => sum + 1 + n, 0);
    }
    if (slot !== this.index.length / 10) {
      throw new Error(
        `${testament}.bzv has ${this.index.length / 10} slots but the versification implies ${slot}`,
      );
    }
  }

  private pointer(slot: number): Pointer {
    const at = slot * 10;
    return {
      block: this.index.readUInt32LE(at),
      offset: this.index.readUInt32LE(at + 4),
      size: this.index.readUInt16LE(at + 8),
    };
  }

  private text({ block, offset, size }: Pointer): string {
    const data = this.blocks[block];
    if (!data) throw new Error(`Index points at missing block ${block}`);
    return data.subarray(offset, offset + size).toString("utf8");
  }

  private versification(book: string): BookVersification {
    const found = this.books.find((b) => b.osis === book);
    if (!found) throw new Error(`Book "${book}" is not in this testament`);
    return found;
  }

  /** Raw text of a book or chapter heading slot (chapter 0 = the book heading). */
  heading(book: string, chapter = 0): string {
    const v = this.versification(book);
    let slot = this.bookSlots.get(book) as number;
    for (let c = 1; c <= chapter; c++) slot += c === 1 ? 1 : 1 + (v.verses[c - 2] ?? 0);
    return this.text(this.pointer(slot));
  }

  private verseSlots(book: string): { slot: number; chapter: number; verse: number }[] {
    const v = this.versification(book);
    const slots: { slot: number; chapter: number; verse: number }[] = [];
    let slot = (this.bookSlots.get(book) as number) + 1;
    v.verses.forEach((count, i) => {
      slot += 1;
      for (let verse = 1; verse <= count; verse++)
        slots.push({ slot: slot++, chapter: i + 1, verse });
    });
    return slots;
  }

  /**
   * Every entry of a book in index order. Runs of verse slots sharing one pointer become one
   * section; heading slots between them are skipped, so a run can cross chapters.
   */
  sections(book: string): ZComSection[] {
    const sections: ZComSection[] = [];
    let current: { key: string; section: ZComSection } | undefined;
    for (const { slot, chapter, verse } of this.verseSlots(book)) {
      const p = this.pointer(slot);
      const osis = `${book}.${chapter}.${verse}`;
      if (p.size === 0) {
        current = undefined;
        continue;
      }
      const key = `${p.block}:${p.offset}:${p.size}`;
      if (current?.key === key) {
        current.section.osisEnd = osis;
        continue;
      }
      current = { key, section: { osisStart: osis, osisEnd: osis, raw: this.text(p) } };
      sections.push(current.section);
    }
    return sections;
  }
}
