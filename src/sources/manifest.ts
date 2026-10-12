import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const SOURCES_DIR = join(import.meta.dir, "../../sources");
export const MANIFEST_PATH = join(SOURCES_DIR, "manifest.json");

export interface SourceSpec {
  name: string;
  url: string;
}

export const SOURCE_SPECS: SourceSpec[] = [
  { name: "mhcc", url: "https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHCC.zip" },
  { name: "kjv", url: "https://ebible.org/Scriptures/eng-kjv_usfm.zip" },
  { name: "bsb", url: "https://bereanbible.com/bsb_usfm.zip" },
];

export interface SourceEntry {
  url: string;
  retrieved: string;
  version: string;
  zip_sha256: string;
  files: Record<string, string>;
}

export type Manifest = Record<string, SourceEntry>;

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashTree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path)] = sha256(readFileSync(path));
    }
  };
  walk(dir);
  return files;
}

/** The manifest, or {} when none exists yet. A corrupt manifest throws rather than look empty. */
export function readManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

/** Re-hashes the committed source files and returns a list of mismatches (empty when clean). */
export function verifySources(manifest: Manifest = readManifest()): string[] {
  const problems: string[] = [];
  for (const { name } of SOURCE_SPECS) {
    const entry = manifest[name];
    if (!entry) {
      problems.push(`${name}: missing from sources/manifest.json; run \`just fetch-sources\``);
      continue;
    }
    const actual = hashTree(join(SOURCES_DIR, name));
    for (const [file, hash] of Object.entries(entry.files)) {
      if (actual[file] === undefined) problems.push(`${name}/${file}: missing`);
      else if (actual[file] !== hash) problems.push(`${name}/${file}: hash mismatch`);
    }
    for (const file of Object.keys(actual)) {
      if (entry.files[file] === undefined) problems.push(`${name}/${file}: not in manifest`);
    }
  }
  return problems;
}
