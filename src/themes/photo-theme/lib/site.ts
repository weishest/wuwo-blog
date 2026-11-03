import type { PostSummary } from '../../../lib/posts';
import { withBase } from '../../../lib/url';

/** Internal paths get the base; absolute URLs pass through. */
export function navHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : withBase(url);
}

/** Ghost marks the nav item for the current URL with `nav-current`. */
export function isCurrent(url: string, pathname: string): boolean {
  const href = navHref(url);
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  return norm(href) === norm(pathname);
}

/** `nav-home`, `nav-about`, … as Ghost generates. */
export function navSlug(label: string): string {
  return `nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** One image box the theme fills with `object-fit: cover`. */
interface CoverBox {
  /** Media condition, e.g. '(min-width: 960px)'. Omit for the last (default) box. */
  media?: string;
  /** Box width and height as CSS lengths. */
  w: string;
  h: string;
}

/**
 * `sizes` for an image that covers a box. With `object-fit: cover` a wide
 * image in a tall box renders wider than the box (height × aspect ratio), so
 * a plain `50vw` makes the browser pick a file that is then stretched and
 * blurry. Each box gets `max(width, height × ratio)`, followed by the plain
 * width as a fallback for browsers without math functions in `sizes`.
 * `image` is the intrinsic size, from `imageSize()` in src/lib/cdn-images.ts.
 */
export function coverSizes(image: { width: number; height: number }, boxes: CoverBox[]): string {
  const ratio = (image.width / image.height).toFixed(3);
  return boxes
    .flatMap(({ media, w, h }) => {
      const cond = media ? `${media} ` : '';
      return [`${cond}max(${w}, calc(${h} * ${ratio}))`, `${cond}${w}`];
    })
    .join(', ');
}

/** Image widths offered for cover images; 3000 is used only by sources that wide (Astro never upscales). */
export const coverWidths = [600, 1200, 2000, 3000];

/** Feature image alt, falling back to the title (as in the Ghost theme). */
export function coverAlt(post: PostSummary): string {
  return post.entry.data.coverAlt || post.entry.data.title;
}
