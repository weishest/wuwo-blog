// "Load more": fetches the next page and appends its story rows or cards.
import { observe } from './reveal';

async function fetchPage(url: string): Promise<{ items: Element[]; next: string | null }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);

  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  return {
    items: Array.from(doc.querySelectorAll('.js-stories > .story')),
    next: doc.querySelector('link[rel="next"]')?.getAttribute('href') ?? null,
  };
}

export default function loadMore(): void {
  const button = document.querySelector<HTMLButtonElement>('.js-load-more');
  const list = document.querySelector('.js-stories');
  let next = document.querySelector('link[rel="next"]')?.getAttribute('href') ?? null;

  if (!button || !list) return;
  const wrapper = button.parentElement;
  if (!next) {
    if (wrapper) wrapper.hidden = true;
    return;
  }

  button.addEventListener('click', async () => {
    if (!next || button.classList.contains('is-loading')) return;

    button.classList.add('is-loading');
    try {
      const page = await fetchPage(next);
      page.items.forEach((item) => list.append(item));
      observe(page.items);
      next = page.next;
      if (!next && wrapper) wrapper.hidden = true;
    } catch (error) {
      console.error(error);
    } finally {
      button.classList.remove('is-loading');
    }
  });
}
