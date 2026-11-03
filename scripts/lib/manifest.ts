/** src/data/image-manifest.json: sizes of published images, keyed by URL. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Manifest } from '../../src/lib/cdn-images-core.ts';

export type { Manifest, ManifestEntry } from '../../src/lib/cdn-images-core.ts';

export function readManifest(file: string): Manifest {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8').trim();
  return text ? (JSON.parse(text) as Manifest) : {};
}

/** Writes with sorted keys so diffs stay small. */
export function writeManifest(file: string, manifest: Manifest): void {
  const sorted: Manifest = {};
  for (const key of Object.keys(manifest).sort()) sorted[key] = manifest[key]!;
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
}
