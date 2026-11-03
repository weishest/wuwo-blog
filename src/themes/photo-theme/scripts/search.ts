// Search overlay: loads /search.json on first open and filters posts by
// title, description and tag names.
interface Entry {
  title: string;
  description: string;
  url: string;
  date: string;
  tags: { name: string; url: string }[];
}

export default function search(): void {
  const overlay = document.querySelector<HTMLElement>('.js-search');
  const field = overlay?.querySelector<HTMLInputElement>('.search-field');
  const results = overlay?.querySelector<HTMLElement>('.search-results');
  const hint = overlay?.querySelector<HTMLElement>('.search-hint');
  if (!overlay || !field || !results || !hint) return;

  const defaultHint = hint.textContent ?? '';
  let index: Entry[] | null = null;
  let opener: HTMLElement | null = null;

  const load = async () => {
    if (index) return index;
    const res = await fetch(overlay.dataset.index ?? '');
    index = (await res.json()) as Entry[];
    return index;
  };

  const render = (entries: Entry[], query: string) => {
    results.replaceChildren();
    if (!query) {
      hint.textContent = defaultHint;
      return;
    }
    hint.textContent = entries.length === 0 ? 'No results' : `${entries.length} ${entries.length === 1 ? 'result' : 'results'}`;
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'search-result';

      const h3 = document.createElement('h3');
      const a = document.createElement('a');
      a.className = 'mark';
      a.href = entry.url;
      a.textContent = entry.title;
      h3.append(a);

      const p = document.createElement('p');
      p.textContent = entry.description;

      const tags = document.createElement('div');
      tags.className = 'taglinks';
      for (const tag of entry.tags.slice(0, 4)) {
        const t = document.createElement('a');
        t.href = tag.url;
        t.textContent = tag.name;
        tags.append(t);
      }

      li.append(h3, p, tags);
      results.append(li);
    }
  };

  const run = async () => {
    const query = field.value.trim().toLowerCase();
    const entries = await load();
    const words = query.split(/\s+/).filter(Boolean);
    const matches = entries.filter((e) => {
      const haystack = [e.title, e.description, ...e.tags.map((t) => t.name)].join(' ').toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    render(matches, query);
  };

  const setOpen = (open: boolean) => {
    overlay.classList.toggle('is-open', open);
    overlay.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('search-is-open', open);
    if (open) {
      void load();
      setTimeout(() => field.focus(), 50);
    } else {
      opener?.focus();
    }
  };

  document.querySelectorAll<HTMLElement>('[data-search-open]').forEach((el) => {
    el.addEventListener('click', () => {
      opener = document.querySelector<HTMLElement>('.js-menu-toggle') ?? el;
      setOpen(true);
    });
  });
  overlay.querySelectorAll('.js-search-close').forEach((el) => el.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) setOpen(false);
  });
  field.addEventListener('input', () => void run());
}
