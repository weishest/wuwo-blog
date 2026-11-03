/**
 * Sätteri hast plugin: gives `<img>` tags that point at the CloudFront domain
 * their `width`, `height`, `srcset`, `sizes`, `loading` and `decoding` from
 * src/data/image-manifest.json. Markdown images in .md and .mdx files go
 * through it; JSX components do not (they use PostImage).
 *
 * Loaded by astro.config.mjs, so it runs in Node and reads the manifest
 * itself (re-read when its mtime changes, so `astro dev` sees a fresh
 * manifest after `npm run images:publish` without a restart).
 */
import { readFileSync, statSync } from 'node:fs';
import type { HastPluginEntry } from 'satteri';
// Explicit extension: this module also runs under plain Node (tests).
import { imgAttrs, isCdnUrl, type Manifest } from './cdn-images-core.ts';

export interface CdnImagesOptions {
  /** CloudFront domain without scheme. Empty disables the plugin. */
  cdnDomain: string;
  /** Absolute path of src/data/image-manifest.json. */
  manifestPath: string;
  /** `sizes` attribute for images inside the post body. */
  sizes: string;
}

/**
 * True when the document has a cover. Astro parses the frontmatter itself and
 * passes it in `data.astro.frontmatter` (the source no longer has it); the
 * regex is a fallback for a source that still carries its frontmatter.
 */
function hasCover(data: unknown, source: string): boolean {
  const fm = (data as { astro?: { frontmatter?: Record<string, unknown> } } | undefined)?.astro?.frontmatter;
  if (fm) return fm.cover !== undefined && fm.cover !== null && fm.cover !== '';
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  return block !== null && /^cover:\s*\S/m.test(block[1] ?? '');
}

export function cdnImages(opts: CdnImagesOptions): HastPluginEntry {
  if (!opts.cdnDomain) return null;

  let cached: { mtime: number; manifest: Manifest } = { mtime: -1, manifest: {} };
  const loadManifest = (): Manifest => {
    try {
      const mtime = statSync(opts.manifestPath).mtimeMs;
      if (mtime !== cached.mtime) {
        cached = { mtime, manifest: JSON.parse(readFileSync(opts.manifestPath, 'utf8')) as Manifest };
      }
    } catch {
      cached = { mtime: -1, manifest: {} };
    }
    return cached.manifest;
  };

  // Factory form: called once per document, so per-document state lives here.
  return (factoryCtx) => {
    const manifest = loadManifest();
    // The first body image is the likely LCP element only when no cover sits above it.
    let eagerNext = !hasCover(factoryCtx.data, factoryCtx.source);
    return {
      name: 'cdn-images',
      element: {
        filter: ['img'],
        visit(node, ctx) {
          const props = node.properties ?? {};
          const src = typeof props.src === 'string' ? props.src : undefined;
          if (!src || !isCdnUrl(src, opts.cdnDomain)) return;
          const attrs = imgAttrs(src, manifest[src], { sizes: opts.sizes, loading: eagerNext ? 'eager' : 'lazy' });
          eagerNext = false;
          for (const [key, value] of Object.entries(attrs)) {
            if (key === 'src' || value === undefined) continue;
            // Author-written loading/decoding win.
            if ((key === 'loading' || key === 'decoding') && props[key] != null) continue;
            ctx.setProperty(node, key, value);
          }
        },
      },
    };
  };
}
