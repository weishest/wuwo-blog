import { siteConfig } from '../site.config';

export function formatDate(date: Date): string {
  return date.toLocaleDateString(siteConfig.lang, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
