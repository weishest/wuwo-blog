/**
 * Shared, dependency-free pieces of the image pipeline. Used by the build
 * (hast plugin, PostImage), by the publish script under plain Node, and by
 * tests, so it must stay free of Astro/Vite imports and use only erasable
 * TypeScript syntax.
 *
 * Published objects (see scripts/publish-images.ts):
 *   https://<domain>/blog/<slug>/<name>-<hash8>.webp        largest version
 *   https://<domain>/blog/<slug>/<name>-<hash8>-<w>.webp    smaller variants
 *   https://<domain>/blog/<slug>/<name>-<hash8>.gif|svg     kept as-is, no variants
 */

export interface ManifestEntry {
  width: number;
  height: number;
  /** Available variant widths, ascending. The largest is the suffix-less URL. */
  widths: number[];
  /** Full-resolution download copy, when published with `images.originals`. */
  original?: OriginalInfo;
}

export interface OriginalInfo {
  url: string;
  width: number;
  height: number;
  /** File size in bytes. */
  bytes: number;
}

/** src/data/image-manifest.json: keyed by the suffix-less CloudFront URL. */
export type Manifest = Record<string, ManifestEntry>;

export function cdnOrigin(domain: string): string {
  return `https://${domain}/`;
}

export function isCdnUrl(src: string, domain: string): boolean {
  return domain !== '' && src.startsWith(cdnOrigin(domain));
}

/** URL of one variant. The largest width is the suffix-less URL itself. */
export function variantUrl(url: string, width: number, entry: ManifestEntry): string {
  const largest = Math.max(...entry.widths);
  return width === largest ? url : url.replace(/\.webp$/, `-${width}.webp`);
}

/** `srcset` for a WebP entry; undefined for GIF/SVG, which have no variants. */
export function cdnSrcset(url: string, entry: ManifestEntry): string | undefined {
  if (!url.endsWith('.webp') || entry.widths.length === 0) return undefined;
  return [...entry.widths]
    .sort((a, b) => a - b)
    .map((w) => `${variantUrl(url, w, entry)} ${w}w`)
    .join(', ');
}

export interface ImgAttrs {
  src: string;
  width?: number;
  height?: number;
  srcset?: string;
  sizes?: string;
  loading: 'lazy' | 'eager';
  decoding: 'async';
}

/** Attributes for a plain <img> showing a published image. */
export function imgAttrs(
  url: string,
  entry: ManifestEntry | undefined,
  opts: { sizes?: string | undefined; loading?: 'lazy' | 'eager' | undefined } = {},
): ImgAttrs {
  const attrs: ImgAttrs = { src: url, loading: opts.loading ?? 'lazy', decoding: 'async' };
  if (!entry) return attrs;
  attrs.width = entry.width;
  attrs.height = entry.height;
  const srcset = cdnSrcset(url, entry);
  if (srcset) {
    attrs.srcset = srcset;
    if (opts.sizes) attrs.sizes = opts.sizes;
  }
  return attrs;
}
