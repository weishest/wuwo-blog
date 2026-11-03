/** End-to-end run against a temporary project with a local object store. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { siteConfig } from '../src/site.config.ts';
import { run, type Summary } from './publish-images.ts';

// The script insists that .env and site.config.ts agree, so follow the site config when it is set.
const DOMAIN = siteConfig.images.cdnDomain || 'cdn.test';
const CDN = `https://${DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
process.env.CLOUDFRONT_DOMAIN = DOMAIN;
delete process.env.S3_BUCKET;

const POST = `---
title: Trip
cover: ./cover.jpg
---
Shot: ![A shot](./shot.jpg "On the ridge")

See [the diagram](./diagram.svg).
`;

async function fixture(): Promise<{ root: string; post: string; manifest: string; logs: string[] }> {
  const root = mkdtempSync(join(tmpdir(), 'images-'));
  const dir = join(root, 'src', 'content', 'blog', 'trip');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, 'src', 'data'), { recursive: true });
  writeFileSync(join(dir, 'index.md'), POST);
  writeFileSync(join(dir, 'cover.jpg'), await sharp({ create: { width: 1000, height: 500, channels: 3, background: '#48a' } }).jpeg().toBuffer());
  writeFileSync(join(dir, 'shot.jpg'), await sharp({ create: { width: 640, height: 480, channels: 3, background: '#a84' } }).jpeg().toBuffer());
  writeFileSync(join(dir, 'diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  process.env.IMAGES_LOCAL_STORE = join(root, 'store');
  return { root, post: join(dir, 'index.md'), manifest: join(root, 'src', 'data', 'image-manifest.json'), logs: [] };
}

const publish = (root: string, logs: string[], extra: Partial<Parameters<typeof run>[0]> = {}): Promise<Summary> =>
  run({ root, mode: 'publish', originals: false, log: (l) => logs.push(l), ...extra });

test('publishes, rewrites, records the manifest and archives originals; a second run changes nothing', async () => {
  const f = await fixture();
  try {
    const first = await publish(f.root, f.logs);
    assert.deepEqual(first.problems, []);
    assert.equal(first.rewritten.length, 1);
    // cover 1000px → 480, 960, 1000 ; shot 640px → 480, 640 ; svg → 1
    assert.equal(first.uploaded, 6);
    assert.equal(first.alreadyPresent, 0);

    const text = readFileSync(f.post, 'utf8');
    assert.match(text, new RegExp(`^cover: ${CDN}\\/blog\\/trip\\/cover-[0-9a-f]{8}\\.webp$`, 'm'));
    assert.match(text, new RegExp(`!\\[A shot\\]\\(${CDN}\\/blog\\/trip\\/shot-[0-9a-f]{8}\\.webp "On the ridge"\\)`));
    assert.match(text, new RegExp(`\\[the diagram\\]\\(${CDN}\\/blog\\/trip\\/diagram-[0-9a-f]{8}\\.svg\\)`));

    const manifest = JSON.parse(readFileSync(f.manifest, 'utf8')) as Record<string, { width: number; height: number; widths: number[] }>;
    const coverUrl = /cover: (\S+)/.exec(text)![1]!;
    assert.deepEqual(manifest[coverUrl], { width: 1000, height: 500, widths: [480, 960, 1000] });
    assert.deepEqual(Object.keys(manifest).length, 3);

    const store = join(f.root, 'store', 'blog', 'trip');
    const objects = readdirSync(store).sort();
    assert.equal(objects.length, 6);
    assert.ok(objects.some((o) => /^cover-[0-9a-f]{8}-480\.webp$/.test(o)));
    assert.ok(objects.some((o) => /^cover-[0-9a-f]{8}\.webp$/.test(o)));

    const archive = join(f.root, '.image-archive', 'trip');
    assert.deepEqual(readdirSync(archive).sort(), ['cover.jpg', 'diagram.svg', 'shot.jpg']);
    assert.equal(existsSync(join(f.root, 'src', 'content', 'blog', 'trip', 'cover.jpg')), false);

    const second = await publish(f.root, f.logs);
    assert.equal(second.uploaded, 0);
    assert.equal(second.rewritten.length, 0);
    assert.equal(second.archived.length, 0);
    assert.equal(readFileSync(f.post, 'utf8'), text);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('download copies: published with the post, and backfilled from .image-archive/ for older images', async () => {
  const f = await fixture();
  try {
    // 1) as published before this feature: no download copies
    const first = await publish(f.root, f.logs, { originals: false });
    assert.deepEqual(first.problems, []);
    const before = JSON.parse(readFileSync(f.manifest, 'utf8')) as Record<string, { original?: unknown }>;
    assert.ok(Object.values(before).every((e) => e.original === undefined));

    // 2) backfill: matched by hash from the archive; posts untouched
    const postText = readFileSync(f.post, 'utf8');
    const backfill = await publish(f.root, f.logs, { backfillOriginals: true });
    assert.deepEqual(backfill.problems, []);
    assert.equal(backfill.uploaded, 2); // cover.jpg and shot.jpg; the svg has none
    assert.deepEqual(backfill.missingOriginals, []);
    assert.equal(readFileSync(f.post, 'utf8'), postText);
    const after = JSON.parse(readFileSync(f.manifest, 'utf8')) as Record<string, { original?: { url: string; width: number; height: number; bytes: number } }>;
    const coverUrl = /cover: (\S+)/.exec(postText)![1]!;
    const original = after[coverUrl]!.original!;
    assert.match(original.url, /-original\.jpg$/);
    assert.equal(original.width, 1000);
    assert.equal(original.height, 500);
    assert.ok(existsSync(join(f.root, 'store', original.url.replace(/^https:\/\/[^/]+\//, ''))));

    // 3) running it again uploads nothing
    const again = await publish(f.root, f.logs, { backfillOriginals: true });
    assert.equal(again.uploaded, 0);

    // 4) a new post published with originals on gets its copy right away
    const other = join(f.root, 'src', 'content', 'blog', 'later');
    mkdirSync(other);
    writeFileSync(join(other, 'index.md'), '---\ntitle: Later\n---\n![x](./x.png)\n');
    writeFileSync(join(other, 'x.png'), await sharp({ create: { width: 900, height: 600, channels: 3, background: '#555' } }).png().toBuffer());
    const later = await publish(f.root, f.logs, { originals: true });
    assert.deepEqual(later.problems, []);
    const m = JSON.parse(readFileSync(f.manifest, 'utf8')) as Record<string, { original?: { url: string; width: number } }>;
    const laterEntry = Object.entries(m).find(([u]) => u.includes('/blog/later/'))![1];
    assert.match(laterEntry.original!.url, /\/blog\/later\/x-[0-9a-f]{8}-original\.png$/);
    assert.equal(laterEntry.original!.width, 900);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('dry run changes nothing', async () => {
  const f = await fixture();
  try {
    const summary = await run({ root: f.root, mode: 'dry-run', originals: false, log: (l) => f.logs.push(l) });
    assert.equal(summary.uploaded, 6);
    assert.equal(summary.rewritten.length, 1);
    assert.equal(readFileSync(f.post, 'utf8'), POST);
    assert.equal(existsSync(f.manifest), false);
    assert.equal(existsSync(join(f.root, 'store')), false);
    assert.equal(existsSync(join(f.root, '.image-archive')), false);
    assert.ok(f.logs.some((l) => /upload\s+blog\/trip\/cover-[0-9a-f]{8}\.webp/.test(l)));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('a missing file leaves the post untouched and is reported', async () => {
  const f = await fixture();
  try {
    writeFileSync(f.post, POST.replace('./shot.jpg', './gone.jpg'));
    const summary = await publish(f.root, f.logs);
    assert.equal(summary.problems.length, 1);
    assert.match(summary.problems[0]!, /gone\.jpg does not exist/);
    assert.equal(summary.rewritten.length, 0);
    assert.equal(summary.uploaded, 0);
    assert.equal(readFileSync(f.post, 'utf8'), POST.replace('./shot.jpg', './gone.jpg'));
    assert.equal(existsSync(join(f.root, 'src', 'content', 'blog', 'trip', 'cover.jpg')), true);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('--post selects one post and shared images stay until every post is published', async () => {
  const f = await fixture();
  try {
    const other = join(f.root, 'src', 'content', 'blog', 'other');
    mkdirSync(other);
    writeFileSync(join(other, 'index.md'), '---\ntitle: Other\n---\n![shared](../trip/shot.jpg)\n');
    const summary = await publish(f.root, f.logs, { post: 'other' });
    assert.deepEqual(summary.rewritten, ['blog/other/index.md']);
    assert.match(readFileSync(join(other, 'index.md'), 'utf8'), new RegExp(`${CDN}\\/blog\\/other\\/shot-[0-9a-f]{8}\\.webp`));
    // trip/index.md still references shot.jpg, so it is kept
    assert.equal(existsSync(join(f.root, 'src', 'content', 'blog', 'trip', 'shot.jpg')), true);
    assert.deepEqual(summary.archived, []);
    assert.equal(readFileSync(f.post, 'utf8'), POST);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('check mode lists unpublished references and loose image files', async () => {
  const f = await fixture();
  try {
    const summary = await run({ root: f.root, mode: 'check', log: (l) => f.logs.push(l) });
    assert.deepEqual(summary.unpublished, [{ file: 'blog/trip/index.md', refs: ['./cover.jpg', './shot.jpg', './diagram.svg'] }]);
    assert.deepEqual(summary.looseImages.sort(), ['blog/trip/cover.jpg', 'blog/trip/diagram.svg', 'blog/trip/shot.jpg']);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
