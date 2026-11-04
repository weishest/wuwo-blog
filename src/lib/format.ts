import { siteConfig } from '../site.config';

/** "Jul 21, 2029" (`short`, default) or "July 21, 2029" (`long`), in `siteConfig.lang`. */
export function formatDate(date: Date, month: 'short' | 'long' = 'short'): string {
  return date.toLocaleDateString(siteConfig.lang, {
    year: 'numeric',
    month,
    day: 'numeric',
    timeZone: 'UTC',
  });
}
