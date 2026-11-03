// Home slider: fades between slides. Dots, counter, arrow keys, swipe and mouse drag. Wraps around.
export default function slider(): void {
  const root = document.querySelector<HTMLElement>('.js-hero');
  if (!root) return;

  const slides = Array.from(root.querySelectorAll<HTMLElement>('.hero-slide'));
  if (slides.length < 2) return;

  const dots = Array.from(root.querySelectorAll<HTMLElement>('.hero-dot'));
  const current = root.querySelector('.js-hero-current');
  let index = 0;

  const show = (next: number) => {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    if (current) current.textContent = String(index + 1);
  };

  dots.forEach((dot) => {
    dot.addEventListener('click', () => show(Number(dot.dataset.slide)));
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });

  // Swipe / drag: a horizontal move of 60px or more changes the slide.
  // A drag suppresses the click that would otherwise follow on a link.
  let startX: number | null = null;
  let moved = false;

  root.addEventListener('pointerdown', (event) => {
    const target = event.target as Element | null;
    if (event.button !== 0 || target?.closest('.hero-nav')) return;
    startX = event.clientX;
    moved = false;
  });

  root.addEventListener('pointermove', (event) => {
    if (startX === null) return;
    if (Math.abs(event.clientX - startX) > 10) {
      moved = true;
      root.classList.add('is-dragging');
    }
  });

  const end = (event: PointerEvent) => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    if (Math.abs(delta) >= 60) show(delta < 0 ? index + 1 : index - 1);
    startX = null;
    root.classList.remove('is-dragging');
  };

  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('pointerleave', end);

  root.addEventListener(
    'click',
    (event) => {
      if (moved) {
        event.preventDefault();
        moved = false;
      }
    },
    true,
  );

  root.addEventListener('dragstart', (event) => event.preventDefault());
}
