// Downloads the pinned sources. First run extracts them and records hashes in
// sources/manifest.json; later runs only report whether upstream has drifted.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hashTree,
  MANIFEST_PATH,
  readManifest,
  SOURCE_SPECS,
  SOURCES_DIR,
  sha256,
} from "../src/sources/manifest.ts";

function unzip(zipPath: string, dest: string): void {
  const result = Bun.spawnSync(["unzip", "-oq", zipPath, "-d", dest]);
  if (result.exitCode !== 0) throw new Error(`unzip ${zipPath} failed: ${result.stderr}`);
}

function readVersion(name: string, dir: string, lastModified: string): string {
  if (name !== "mhcc") return `Last-Modified ${lastModified}`;
  const conf = readFileSync(join(dir, "mods.d/mhcc.conf"), "utf8");
  const version = conf.match(/^Version=(.+)$/m)?.[1];
  const date = conf.match(/^SwordVersionDate=(.+)$/m)?.[1];
  return `${version} (${date})`;
}

const manifest = readManifest();
const work = mkdtempSync(join(tmpdir(), "oc-sources-"));
let drift = false;
try {
  for (const { name, url } of SOURCE_SPECS) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
    const zip = new Uint8Array(await response.arrayBuffer());
    const zipHash = sha256(zip);
    const existing = manifest[name];
    if (existing) {
      if (existing.zip_sha256 === zipHash) {
        console.log(`${name}: unchanged`);
        continue;
      }
      drift = true;
      const fresh = join(work, name);
      const zipPath = join(work, `${name}.zip`);
      writeFileSync(zipPath, zip);
      unzip(zipPath, fresh);
      const freshFiles = hashTree(fresh);
      const changed = Object.keys({ ...freshFiles, ...existing.files }).filter(
        (f) => freshFiles[f] !== existing.files[f],
      );
      console.log(
        `${name}: DRIFT (zip ${existing.zip_sha256.slice(0, 12)} -> ${zipHash.slice(0, 12)})`,
      );
      for (const f of changed) console.log(`  changed: ${f}`);
      continue;
    }
    const dest = join(SOURCES_DIR, name);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    const zipPath = join(work, `${name}.zip`);
    writeFileSync(zipPath, zip);
    unzip(zipPath, dest);
    manifest[name] = {
      url,
      retrieved: new Date().toISOString().slice(0, 10),
      version: readVersion(name, dest, response.headers.get("last-modified") ?? "unknown"),
      zip_sha256: zipHash,
      files: hashTree(dest),
    };
    console.log(`${name}: fetched ${Object.keys(manifest[name].files).length} files`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
if (drift) {
  console.log("Upstream drift detected. Committed sources were not replaced.");
  process.exit(1);
}
