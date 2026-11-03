/**
 * Runtime helpers for published (CloudFront) images, for components and
 * themes. The manifest is imported as JSON so the dev server reloads it when
 * `npm run images:publish` writes it.
 */
import type { ImageMetadata } from 'astro';
import manifestJson from '../data/image-manifest.json';
import { siteConfig } from '../site.config';
import { cdnOrigin, imgAttrs, isCdnUrl, type ImgAttrs, type Manifest, type ManifestEntry, type OriginalInfo } from './cdn-images-core.ts';

/** A local image (while writing) or the URL of a published one. */
export type CoverSource = ImageMetadata | string;

const manifest = manifestJson as Manifest;
const warned = new Set<string>();

export function manifestEntry(url: string): ManifestEntry | undefined {
  const entry = manifest[url];
  if (!entry && !warned.has(url)) {
    warned.add(url);
    const hint = isCdnUrl(url, siteConfig.images.cdnDomain)
      ? 'it is missing from src/data/image-manifest.json (run `npm run images:publish`)'
      : 'it is not on the configured CDN domain';
    console.warn(`[images] ${url}: ${hint}; rendered without width, height and srcset.`);
  }
  return entry;
}

export function cdnImgAttrs(
  url: string,
  opts: { sizes?: string | undefined; loading?: 'lazy' | 'eager' | undefined } = {},
): ImgAttrs {
  return imgAttrs(url, manifestEntry(url), opts);
}

/**
 * Full-resolution download copies for the published images in `texts` (a
 * post's raw body, its cover URL, …), keyed by the image's suffix-less URL.
 * Rendered into each post page at build time, so it never depends on cached
 * Markdown output. Empty when `images.originals` is off.
 */
export function originalsFor(texts: (string | undefined)[]): Record<string, OriginalInfo> {
  const domain = siteConfig.images.cdnDomain;
  const result: Record<string, OriginalInfo> = {};
  if (!siteConfig.images.originals || !domain) return result;
  const origin = cdnOrigin(domain).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urls = new RegExp(`${origin}[^\\s"'()<>\\]]+`, 'g');
  for (const text of texts) {
    for (const [url] of (text ?? '').matchAll(urls)) {
      const original = manifest[url]?.original;
      if (original) result[url] = original;
    }
  }
  return result;
}

/** Intrinsic size of a local or published image, when known. */
export function imageSize(src: CoverSource): { width: number; height: number } | undefined {
  if (typeof src !== 'string') return { width: src.width, height: src.height };
  const entry = manifestEntry(src);
  return entry && { width: entry.width, height: entry.height };
}
