/**
 * Publishes post images to S3/CloudFront and rewrites the posts.
 *
 *   npm run images:publish            upload, rewrite, archive originals
 *   npm run images:publish -- --dry-run      show the plan, change nothing
 *   npm run images:publish -- --post <slug>  one post only
 *   npm run images:publish -- --delete       delete originals instead of archiving
 *   npm run images:publish -- --originals    upload full-size download copies for images
 *                                            published earlier, from .image-archive/
 *   npm run images:check              scan only; exit 1 if anything is unpublished (no AWS needed)
 *
 * Settings: .env (AWS_PROFILE, AWS_REGION, S3_BUCKET, CLOUDFRONT_DOMAIN) and
 * images.cdnDomain in src/site.config.ts. See docs/IMAGES.md.
 *
 * Runs on plain Node (>= 22.18 strips types): `node scripts/publish-images.ts`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from './lib/config.ts';
import { readManifest, writeManifest } from './lib/manifest.ts';
import { findImportHazards, findReferences, IMAGE_EXT, postKey, rewrite, type ImageRef } from './lib/references.ts';
import { createLocalStore, createS3Store, type ObjectStore } from './lib/store.ts';
import type { ProcessedImage } from './lib/process.ts';
import type { Manifest } from './lib/manifest.ts';

export interface Options {
  /** Project root (contains src/content). */
  root: string;
  mode: 'publish' | 'dry-run' | 'check';
  /** Only the post with this slug (or `<collection>/<slug>`). */
  post?: string | undefined;
  /** Delete originals after publishing instead of moving them to .image-archive/. */
  deleteOriginals?: boolean;
  /**
   * Instead of publishing posts: add full-resolution download copies for
   * images already in the manifest, taken from .image-archive/ (matched by
   * the content hash in the URL). Posts are not touched.
   */
  backfillOriginals?: boolean;
  /** Override images.originals from src/site.config.ts (tests). */
  originals?: boolean;
  log?: (line: string) => void;
}

export interface Summary {
  /** Files whose references could not be resolved, plus failed images/uploads. */
  problems: string[];
  uploaded: number;
  alreadyPresent: number;
  rewritten: string[];
  archived: string[];
  /** Check mode: posts with local references and loose image files. */
  unpublished: { file: string; refs: string[] }[];
  looseImages: string[];
  /** --originals: published images whose original is not in .image-archive/. */
  missingOriginals: string[];
}

interface ResolvedRef extends ImageRef {
  abs: string;
}

interface Scan {
  file: string;
  rel: string;
  key: ReturnType<typeof postKey>;
  text: string;
  refs: ResolvedRef[];
  problems: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function isInside(parent: string, p: string): boolean {
  const r = relative(parent, p);
  return r !== '' && !r.startsWith('..') && !isAbsolute(r);
}

function scanFile(file: string, contentDir: string): Scan {
  const rel = relative(contentDir, file);
  const text = readFileSync(file, 'utf8');
  const problems: string[] = [];
  const refs: ResolvedRef[] = [];
  for (const ref of findReferences(text)) {
    const abs = resolve(dirname(file), ref.path);
    if (!isInside(contentDir, abs)) {
      problems.push(`${ref.path} is outside src/content/`);
    } else if (!existsSync(abs)) {
      problems.push(`${ref.path} does not exist`);
    }
    refs.push({ ...ref, abs });
  }
  problems.push(...findImportHazards(text, refs));
  return { file, rel, key: postKey(rel), text, refs, problems };
}

export async function run(options: Options): Promise<Summary> {
  const log = options.log ?? ((line: string) => console.log(line));
  const root = resolve(options.root);
  const contentDir = join(root, 'src', 'content');
  const manifestPath = join(root, 'src', 'data', 'image-manifest.json');
  const archiveDir = join(root, '.image-archive');
  const summary: Summary = { problems: [], uploaded: 0, alreadyPresent: 0, rewritten: [], archived: [], unpublished: [], looseImages: [], missingOriginals: [] };

  const all = walk(contentDir).sort();
  const docs = all.filter((f) => /\.(md|mdx)$/i.test(f));
  const scans = docs.map((f) => scanFile(f, contentDir));
  const selected = options.post
    ? scans.filter((s) => s.key.slug === options.post || s.key.key === options.post)
    : scans;
  if (options.post && selected.length === 0) {
    throw new ConfigError(`No post with slug "${options.post}" under src/content/.`);
  }

  // ---- check mode: no AWS, no sharp ----------------------------------------
  if (options.mode === 'check') {
    for (const s of selected) {
      if (s.refs.length) summary.unpublished.push({ file: s.rel, refs: s.refs.map((r) => r.path) });
    }
    summary.looseImages = all.filter((f) => IMAGE_EXT.test(f)).map((f) => relative(contentDir, f));
    for (const u of summary.unpublished) log(`unpublished  src/content/${u.file}  →  ${u.refs.join(', ')}`);
    for (const f of summary.looseImages) log(`image file   src/content/${f}`);
    if (!summary.unpublished.length && !summary.looseImages.length) log('No local images under src/content/.');
    return summary;
  }

  // ---- publish / dry-run ---------------------------------------------------
  const dryRun = options.mode === 'dry-run';
  const config = loadConfig(root, !dryRun);
  const domain = config.cdnDomain || '<CLOUDFRONT_DOMAIN>';
  const urlOf = (key: string) => `https://${domain}/${key}`;

  let store: ObjectStore | undefined;
  if (!dryRun) {
    store = config.localStoreDir ? createLocalStore(resolve(root, config.localStoreDir)) : await createS3Store(config);
    log(`Publishing to ${store.describe()} as https://${domain}/…`);
  } else {
    log('Dry run: nothing is uploaded, written or moved.');
  }

  const { processImage } = await import('./lib/process.ts');
  const manifest = readManifest(manifestPath);

  if (options.backfillOriginals) {
    await backfillOriginals({ archiveDir, manifest, manifestPath, domain, store, dryRun, post: options.post, summary, log });
    if (!config.originals) log('Note: images.originals is off in src/site.config.ts, so the site will not show the download links.');
    return summary;
  }
  const processed = new Map<string, Promise<ProcessedImage>>();
  const seenObjects = new Set<string>();
  const archiveCandidates = new Map<string, Scan>();

  for (const s of selected) {
    if (s.problems.length) {
      summary.problems.push(...s.problems.map((p) => `src/content/${s.rel}: ${p}`));
      continue;
    }
    if (!s.refs.length) continue;

    const urls = new Map<string, ProcessedImage>();
    try {
      for (const ref of s.refs) {
        const memoKey = `${s.key.key}|${ref.abs}`;
        if (!processed.has(memoKey)) {
          processed.set(memoKey, processImage(readFileSync(ref.abs), basename(ref.abs), s.key.key, { originals: options.originals ?? config.originals }));
        }
        urls.set(ref.abs, await processed.get(memoKey)!);
      }
      for (const image of new Set(urls.values())) {
        for (const object of image.objects) {
          if (seenObjects.has(object.key)) continue;
          seenObjects.add(object.key);
          if (store && (await store.exists(object.key))) {
            summary.alreadyPresent++;
            log(`  present   ${object.key}`);
            continue;
          }
          if (store) await store.put(object.key, object.body, object.contentType, object.contentDisposition);
          summary.uploaded++;
          log(`  ${dryRun ? 'upload   ' : 'uploaded '} ${object.key}  (${(object.body.length / 1024).toFixed(0)} kB)`);
        }
        manifest[urlOf(image.key)] = {
          width: image.width,
          height: image.height,
          widths: image.widths,
          ...(image.original && {
            original: { url: urlOf(image.original.key), width: image.original.width, height: image.original.height, bytes: image.original.bytes },
          }),
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.problems.push(`src/content/${s.rel}: ${msg}`);
      log(`  failed    src/content/${s.rel}: ${msg}`);
      continue;
    }

    const text = rewrite(s.text, s.refs, (ref) => urlOf(urls.get((ref as ResolvedRef).abs)!.key));
    if (!dryRun) {
      // Manifest first: the dev server re-renders the post when its text changes.
      writeManifest(manifestPath, manifest);
      writeFileSync(s.file, text);
    }
    summary.rewritten.push(s.rel);
    log(`  ${dryRun ? 'rewrite  ' : 'rewrote  '} src/content/${s.rel}`);
    for (const ref of s.refs) if (!archiveCandidates.has(ref.abs)) archiveCandidates.set(ref.abs, s);
  }

  // ---- originals: archive (or delete) unless another post still needs them --
  const stillReferenced = new Set<string>();
  for (const s of scans) {
    let text = s.text;
    if (summary.rewritten.includes(s.rel)) {
      if (dryRun) continue; // would be rewritten
      text = readFileSync(s.file, 'utf8');
    }
    for (const ref of findReferences(text)) stillReferenced.add(resolve(dirname(s.file), ref.path));
  }
  for (const [abs, scan] of archiveCandidates) {
    if (stillReferenced.has(abs)) {
      log(`  kept      ${relative(root, abs)} (another post still references it)`);
      continue;
    }
    if (options.deleteOriginals) {
      if (!dryRun) rmSync(abs);
      log(`  ${dryRun ? 'delete   ' : 'deleted  '} ${relative(root, abs)}`);
    } else {
      const postDir = dirname(scan.file);
      let inside = relative(postDir, abs);
      if (inside.startsWith('..')) inside = basename(abs);
      let dest = join(archiveDir, scan.key.slug || scan.key.collection, inside);
      if (existsSync(dest)) {
        const ext = extname(dest);
        dest = dest.slice(0, -ext.length) + `-${Date.now()}` + ext;
      }
      if (!dryRun) {
        mkdirSync(dirname(dest), { recursive: true });
        renameSync(abs, dest);
      }
      log(`  ${dryRun ? 'archive  ' : 'archived '} ${relative(root, abs)}  →  ${relative(root, dest)}`);
    }
    summary.archived.push(relative(root, abs));
  }

  log('');
  log(
    `${dryRun ? 'Would upload' : 'Uploaded'} ${summary.uploaded} object(s), ${summary.alreadyPresent} already present, ` +
      `${summary.rewritten.length} file(s) ${dryRun ? 'to rewrite' : 'rewritten'}, ${summary.archived.length} original(s) ${options.deleteOriginals ? 'deleted' : 'archived'}.`,
  );
  if (summary.problems.length) {
    log('');
    log(`${summary.problems.length} problem(s); those files were left unchanged:`);
    for (const p of summary.problems) log(`  - ${p}`);
  }
  return summary;
}

interface BackfillContext {
  archiveDir: string;
  manifest: Manifest;
  manifestPath: string;
  domain: string;
  store: ObjectStore | undefined;
  dryRun: boolean;
  post: string | undefined;
  summary: Summary;
  log: (line: string) => void;
}

/** Full-size download copies for already published images, from .image-archive/. */
async function backfillOriginals(ctx: BackfillContext): Promise<void> {
  const { hashOf, slugName, originalObject } = await import('./lib/process.ts');
  const { manifest, summary, log } = ctx;
  const archived = new Map<string, string>(); // "<name>-<hash8>" -> file
  for (const file of walk(ctx.archiveDir)) {
    if (!/\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file)) continue;
    archived.set(`${slugName(basename(file))}-${hashOf(readFileSync(file))}`, file);
  }
  const origin = `https://${ctx.domain}/`;
  let changed = false;
  for (const [url, entry] of Object.entries(manifest)) {
    if (entry.original || !url.startsWith(origin) || !url.endsWith('.webp')) continue;
    const m = /^(.*)\/([a-z0-9-]+-[0-9a-f]{8})\.webp$/.exec(url.slice(origin.length));
    if (!m) continue;
    const [, prefix, base] = m as unknown as [string, string, string];
    if (ctx.post && !(prefix === ctx.post || prefix.endsWith(`/${ctx.post}`))) continue;
    const file = archived.get(base);
    if (!file) {
      summary.missingOriginals.push(url);
      log(`  missing   ${url} (no matching file in .image-archive/)`);
      continue;
    }
    try {
      const { object, info } = await originalObject(readFileSync(file), basename(file), `${prefix}/${base}`);
      if (ctx.store && (await ctx.store.exists(object.key))) {
        summary.alreadyPresent++;
        log(`  present   ${object.key}`);
      } else {
        if (ctx.store) await ctx.store.put(object.key, object.body, object.contentType, object.contentDisposition);
        summary.uploaded++;
        log(`  ${ctx.dryRun ? 'upload   ' : 'uploaded '} ${object.key}  (${(object.body.length / 1024 / 1024).toFixed(1)} MB, ${info.width} × ${info.height})`);
      }
      entry.original = { url: `${origin}${info.key}`, width: info.width, height: info.height, bytes: info.bytes };
      changed = true;
    } catch (err) {
      summary.problems.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (changed && !ctx.dryRun) writeManifest(ctx.manifestPath, manifest);
  log('');
  log(
    `${ctx.dryRun ? 'Would upload' : 'Uploaded'} ${summary.uploaded} original(s), ${summary.alreadyPresent} already present` +
      `${summary.missingOriginals.length ? `, ${summary.missingOriginals.length} without an archived original` : ''}.`,
  );
  if (changed && !ctx.dryRun) log('Updated src/data/image-manifest.json; commit it. Posts are unchanged.');
  for (const p of summary.problems) log(`  - ${p}`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = { root: process.cwd(), mode: 'publish' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') options.mode = 'dry-run';
    else if (a === '--check') options.mode = 'check';
    else if (a === '--delete') options.deleteOriginals = true;
    else if (a === '--originals') options.backfillOriginals = true;
    else if (a === '--post') options.post = argv[++i];
    else if (a.startsWith('--post=')) options.post = a.slice('--post='.length);
    else if (a === '--help' || a === '-h') {
      console.log('usage: node scripts/publish-images.ts [--dry-run | --check] [--post <slug>] [--delete | --originals]');
      process.exit(0);
    } else throw new ConfigError(`Unknown argument: ${a}`);
  }
  if (options.post === undefined && argv.includes('--post')) throw new ConfigError('--post needs a slug');
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await run(parseArgs(process.argv.slice(2)));
    const failed = summary.problems.length > 0 || summary.unpublished.length > 0 || summary.looseImages.length > 0;
    process.exit(failed ? 1 : 0);
  } catch (err) {
    console.error(err instanceof ConfigError ? `Error: ${err.message}` : err);
    process.exit(2);
  }
}
