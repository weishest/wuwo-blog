// Relative dates are rendered at build time; refresh them so a static page
// does not keep saying "a day ago" for a week.
import { timeAgo } from '../lib/time-ago';

export function refreshTimes(root: Iterable<Element> | Document = document): void {
  const scopes = root instanceof Document ? [root] : Array.from(root);
  for (const scope of scopes) {
    scope.querySelectorAll<HTMLTimeElement>('time[data-timeago]').forEach((el) => {
      const date = new Date(el.dateTime);
      if (!Number.isNaN(date.valueOf())) el.textContent = timeAgo(date);
    });
  }
}

export default function timeago(): void {
  refreshTimes(document);
}
