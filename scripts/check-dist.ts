/**
 * Post-build guard (CI): fails when dist/ contains an image that did not come
 * from public/ or from a theme asset under src/ (outside src/content/).
 * Post images live on CloudFront and must never end up in the Pages build.
 *
 *   node scripts/check-dist.ts [dist-dir]
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIST_IMAGE = /\.(jpe?g|png|webp|avif|gif|svg|heic)$/i;
/** Astro asset names: `<stem>.<hash8>.<ext>` (Vite) and `<stem>.<hash8>_<thash>.<ext>` (image service). */
export const ASTRO_ASSET = /^(?<stem>.+?)\.(?<hash>[A-Za-z0-9_-]{8})(?:_(?<thash>[A-Za-z0-9]+))?\.(?<ext>[a-z0-9]+)$/i;

export interface DistImage {
  /** Path relative to dist/, with `/` separators. */
  rel: string;
  /** The same path exists under public/. */
  inPublic: boolean;
}

/** True when the dist image is a public/ file or a processed theme asset. */
export function isAllowedDistImage(image: DistImage, allowedStems: Set<string>): boolean {
  if (image.inPublic) return true;
  if (!image.rel.startsWith('_astro/')) return false;
  const m = ASTRO_ASSET.exec(basename(image.rel));
  return m?.groups?.stem !== undefined && allowedStems.has(m.groups.stem);
}

function walk(dir: string, skip: string | undefined, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (skip && resolve(p) === resolve(skip)) continue;
    if (entry.isDirectory()) walk(p, skip, out);
    else out.push(p);
  }
  return out;
}

export function checkDist(root: string, distDir = join(root, 'dist')): string[] {
  const srcDir = join(root, 'src');
  const allowedStems = new Set(
    walk(srcDir, join(srcDir, 'content'))
      .filter((f) => DIST_IMAGE.test(f))
      .map((f) => basename(f, extname(f))),
  );
  const offenders: string[] = [];
  for (const file of walk(distDir, undefined)) {
    if (!DIST_IMAGE.test(file)) continue;
    const rel = relative(distDir, file).split('\\').join('/');
    const image: DistImage = { rel, inPublic: existsSync(join(root, 'public', rel)) };
    if (!isAllowedDistImage(image, allowedStems)) offenders.push(rel);
  }
  return offenders;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const distDir = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist');
  if (!existsSync(distDir)) {
    console.error(`No build output at ${distDir}`);
    process.exit(2);
  }
  const offenders = checkDist(root, distDir);
  if (offenders.length) {
    console.error(`${offenders.length} image(s) in ${relative(root, distDir)}/ did not come from public/ or a theme:`);
    for (const f of offenders) console.error(`  ${f}`);
    console.error('Post images must be published to CloudFront (npm run images:publish), never built into the site.');
    process.exit(1);
  }
  console.log(`OK: no post images in ${relative(root, distDir)}/.`);
}
