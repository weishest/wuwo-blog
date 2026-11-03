/**
 * Relative date like Ghost's {{date timeago="true"}} (moment.js fromNow):
 * "a few seconds ago", "39 minutes ago", "a month ago", "7 years ago".
 * Used at build time and again in the browser so the text stays current.
 */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.valueOf() - date.valueOf()) / 1000);
  const future = seconds < 0;
  const s = Math.abs(seconds);
  const m = s / 60;
  const h = m / 60;
  const d = h / 24;

  let text: string;
  if (s < 45) text = 'a few seconds';
  else if (s < 90) text = 'a minute';
  else if (m < 45) text = `${Math.round(m)} minutes`;
  else if (m < 90) text = 'an hour';
  else if (h < 22) text = `${Math.round(h)} hours`;
  else if (h < 36) text = 'a day';
  else if (d < 26) text = `${Math.round(d)} days`;
  else if (d < 45) text = 'a month';
  else if (d < 320) text = `${Math.round(d / 30.4375)} months`;
  else if (d < 548) text = 'a year';
  else text = `${Math.round(d / 365.25)} years`;

  return future ? `in ${text}` : `${text} ago`;
}
