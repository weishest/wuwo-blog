/**
 * Client-side light/dark toggle behaviour, shared by every theme's
 * ThemeToggle component. Themes only decide how the button looks.
 *
 * Usage inside a theme component:
 *   <button data-color-scheme-toggle>…</button>
 *   <script>import { initColorSchemeToggles } from '../../../lib/color-scheme'; initColorSchemeToggles();</script>
 */
type Scheme = 'light' | 'dark';
const STORAGE_KEY = 'color-scheme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function currentScheme(): Scheme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return media().matches ? 'dark' : 'light';
}

function apply(scheme: Scheme, persist: boolean): void {
  document.documentElement.dataset.theme = scheme;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, scheme);
    } catch {
      /* ignore */
    }
  }
  syncButtons();
}

function syncButtons(): void {
  const scheme = currentScheme();
  for (const btn of document.querySelectorAll<HTMLElement>('[data-color-scheme-toggle]')) {
    btn.setAttribute('aria-pressed', String(scheme === 'dark'));
    btn.dataset.scheme = scheme;
    btn.setAttribute('aria-label', scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

export function initColorSchemeToggles(): void {
  for (const btn of document.querySelectorAll<HTMLElement>('[data-color-scheme-toggle]')) {
    btn.addEventListener('click', () => apply(currentScheme() === 'dark' ? 'light' : 'dark', true));
  }
  // Follow system changes while the user has not picked a scheme explicitly.
  media().addEventListener('change', () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (!saved) {
      delete document.documentElement.dataset.theme;
      syncButtons();
    }
  });
  syncButtons();
}
