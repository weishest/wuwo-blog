/**
 * Prefix an internal path with the configured `base` so links work both on
 * `username.github.io` and on `username.github.io/repo-name`.
 *
 *   withBase('/')             -> '/repo/'
 *   withBase('/posts/hello/') -> '/repo/posts/hello/'
 *   withBase('favicon.svg')   -> '/repo/favicon.svg'
 */
export function withBase(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//') || path.startsWith('#')) {
    return path; // external URL, protocol-relative or in-page anchor
  }
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}` || '/';
}

/** Absolute URL (for RSS, canonical, Open Graph). */
export function absoluteUrl(path: string, site: URL | undefined): string {
  return new URL(withBase(path), site ?? 'http://localhost').href;
}
