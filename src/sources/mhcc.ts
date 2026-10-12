import { join } from "node:path";
import { BOOKS, NT_START } from "../bible/books.ts";
import { SOURCES_DIR } from "./manifest.ts";
import { readConf, ZComTestament } from "./sword.ts";
import { kjvVersification } from "./usfm.ts";

const MODULE_DIR = join(SOURCES_DIR, "mhcc");

export const MHCC_EDITION = "SWORD MHCC 2.0 (2021-02-14), Moody Press 28th printing";

export function readMhccConf(): Record<string, string> {
  return readConf(join(MODULE_DIR, "mods.d/mhcc.conf"));
}

let nt: ZComTestament | undefined;

/** Opens the New Testament half of the MHCC module, checking the driver it was written for. */
export function openMhccNt(): ZComTestament {
  if (nt) return nt;
  const conf = readMhccConf();
  if (conf.ModDrv !== "zCom" || conf.CompressType !== "ZIP" || conf.Versification !== "KJV") {
    throw new Error(
      `mhcc.conf declares ModDrv=${conf.ModDrv}, CompressType=${conf.CompressType}, Versification=${conf.Versification}; the reader supports zCom/ZIP/KJV only`,
    );
  }
  const ntBooks = new Set(BOOKS.slice(NT_START).map((b) => b.osis));
  const versification = kjvVersification().filter((b) => ntBooks.has(b.osis));
  nt = new ZComTestament(join(MODULE_DIR, conf.DataPath ?? ""), "nt", versification);
  return nt;
}
