/** The Sätteri hast plugin, rendered through the real processor. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { satteri } from '@astrojs/markdown-satteri';
import { cdnImages } from '../src/lib/satteri-cdn-images.ts';

const DOMAIN = 'cdn.test';
const URL_A = `https://${DOMAIN}/blog/trip/shot-abcd1234.webp`;
const URL_SVG = `https://${DOMAIN}/blog/trip/diagram-abcd1234.svg`;

async function renderer(manifestPath: string) {
  const processor = satteri({ hastPlugins: [cdnImages({ cdnDomain: DOMAIN, manifestPath, sizes: '(min-width: 960px) 740px, 100vw' })] });
  return processor.createRenderer({ syntaxHighlight: false });
}

test('adds width, height, srcset, sizes, loading and decoding from the manifest; re-reads it when it changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-'));
  const manifestPath = join(dir, 'image-manifest.json');
  const write = (width: number, time: number) => {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        [URL_A]: { width, height: 400, widths: [480, 960] },
        [URL_SVG]: { width: 120, height: 60, widths: [120] },
      }),
    );
    utimesSync(manifestPath, time, time);
  };
  write(960, 1_700_000_000);
  try {
    const r = await renderer(manifestPath);
    const md = `![A shot](${URL_A})\n\n![Diagram](${URL_SVG})\n\n![Other](https://elsewhere.test/x.jpg)\n\n![Local](./local.jpg)\n`;

    // with a cover in the frontmatter: everything lazy
    const withCover = (await r.render(md, { frontmatter: { title: 'T', cover: 'https://cdn.test/c.webp' } })).code;
    const shot = /<img[^>]*shot-abcd1234[^>]*>/.exec(withCover)![0];
    assert.match(shot, /width="960"/);
    assert.match(shot, /height="400"/);
    assert.match(shot, /srcset="https:\/\/cdn\.test\/blog\/trip\/shot-abcd1234-480\.webp 480w, https:\/\/cdn\.test\/blog\/trip\/shot-abcd1234\.webp 960w"/);
    assert.match(shot, /sizes="\(min-width: 960px\) 740px, 100vw"/);
    assert.match(shot, /loading="lazy"/);
    assert.match(shot, /decoding="async"/);
    const svg = /<img[^>]*diagram-abcd1234[^>]*>/.exec(withCover)![0];
    assert.match(svg, /width="120"/);
    assert.doesNotMatch(svg, /srcset|sizes/);
    const other = /<img[^>]*elsewhere\.test[^>]*>/.exec(withCover)![0];
    assert.doesNotMatch(other, /loading|width/);
    assert.doesNotMatch(withCover, /local\.jpg[^>]*(srcset|loading)/); // local images are Astro's business

    // without a cover: the first CDN image is eager, the next lazy
    const noCover = (await r.render(md, { frontmatter: { title: 'T' } })).code;
    assert.match(/<img[^>]*shot-abcd1234[^>]*>/.exec(noCover)![0], /loading="eager"/);
    assert.match(/<img[^>]*diagram-abcd1234[^>]*>/.exec(noCover)![0], /loading="lazy"/);

    // a changed manifest is picked up by the next render
    write(880, 1_700_000_100);
    const after = (await r.render(md, { frontmatter: { title: 'T' } })).code;
    assert.match(/<img[^>]*shot-abcd1234[^>]*>/.exec(after)![0], /width="880"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('is a no-op without a CDN domain', async () => {
  const processor = satteri({ hastPlugins: [cdnImages({ cdnDomain: '', manifestPath: '/nonexistent.json', sizes: '100vw' })] });
  const r = await processor.createRenderer({ syntaxHighlight: false });
  const html = (await r.render(`![x](${URL_A})`, { frontmatter: {} })).code;
  assert.match(html, /<img src="[^"]+" alt="x">/);
});
