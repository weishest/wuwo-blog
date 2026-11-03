// Subtle rise-in for story rows as they enter the viewport. Content stays visible without JS.
let observer: IntersectionObserver | null = null;

export function observe(elements: Iterable<Element>): void {
  if (!observer) return;
  for (const el of elements) {
    el.classList.add('reveal');
    observer.observe(el);
  }
}

export default function reveal(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer?.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -10% 0px' },
  );

  observe(document.querySelectorAll('.js-stories > .story'));
}
