// Slide-in menu: the header button toggles it; the overlay and Esc close it.
export default function menu(): void {
  const toggle = document.querySelector<HTMLElement>('.js-menu-toggle');
  const drawer = document.getElementById('site-menu');
  if (!toggle || !drawer) return;

  const setOpen = (open: boolean) => {
    document.body.classList.toggle('menu-is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  toggle.addEventListener('click', () => {
    setOpen(!document.body.classList.contains('menu-is-open'));
  });

  document.querySelectorAll('.js-menu-close').forEach((el) => {
    el.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('menu-is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  // The search overlay opens on top; close the panel first
  drawer.querySelectorAll('[data-search-open]').forEach((el) => {
    el.addEventListener('click', () => setOpen(false));
  });
}
