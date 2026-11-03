/**
 * Click-to-enlarge image viewer, shared by all themes. Themes only style it
 * (classes: .lightbox, .lightbox-figure, .lightbox-img, .lightbox-caption,
 * .lightbox-close, .lightbox-prev, .lightbox-next, .lightbox-count) and
 * decide which images take part:
 *
 *   <script>
 *     import { initLightbox } from '../../../lib/lightbox';
 *     initLightbox('.post-content img');
 *   </script>
 *
 * - Opens the largest version the page has (the biggest `srcset` candidate).
 * - Caption from the image's <figcaption>, falling back to its alt text.
 * - Arrow keys / buttons step through the page's images; Esc, the close
 *   button or a click outside the buttons closes it.
 * - Images inside links are left alone.
 * - "Download original" link (.lightbox-download) when the page lists a
 *   full-resolution copy for the image in #image-originals
 *   (src/components/ImageOriginals.astro).
 */

interface Original {
  url: string;
  width: number;
  height: number;
  bytes: number;
}

function readOriginals(): Record<string, Original> {
  const data = document.getElementById('image-originals')?.textContent;
  if (!data) return {};
  try {
    return JSON.parse(data) as Record<string, Original>;
  } catch {
    return {};
  }
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function largestSource(img: HTMLImageElement): string {
  let best = img.currentSrc || img.src;
  let bestWidth = 0;
  for (const candidate of img.srcset.split(',')) {
    const [url, descriptor = ''] = candidate.trim().split(/\s+/);
    const width = Number.parseFloat(descriptor);
    if (url && width > bestWidth) {
      bestWidth = width;
      best = url;
    }
  }
  return best;
}

function captionFor(img: HTMLImageElement): string {
  const figcaption = img.closest('figure')?.querySelector('figcaption');
  return (figcaption?.textContent ?? img.alt ?? '').trim();
}

export function initLightbox(selector: string): void {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(selector)).filter(
    (img) => !img.closest('a, button, .lightbox'),
  );
  if (images.length === 0) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-label', 'Image viewer');
  dialog.innerHTML = `
    <figure class="lightbox-figure">
      <img class="lightbox-img" alt="" />
      <figcaption class="lightbox-caption"></figcaption>
      <a class="lightbox-download" download hidden>Download original <span class="lightbox-download-size"></span></a>
    </figure>
    <button class="lightbox-close" type="button" aria-label="Close"><span></span><span></span></button>
    <button class="lightbox-prev" type="button" aria-label="Previous image">←</button>
    <button class="lightbox-next" type="button" aria-label="Next image">→</button>
    <p class="lightbox-count" aria-live="polite"></p>`;
  document.body.append(dialog);

  const view = dialog.querySelector<HTMLImageElement>('.lightbox-img')!;
  const caption = dialog.querySelector<HTMLElement>('.lightbox-caption')!;
  const download = dialog.querySelector<HTMLAnchorElement>('.lightbox-download')!;
  const downloadSize = dialog.querySelector<HTMLElement>('.lightbox-download-size')!;
  const originals = readOriginals();
  const count = dialog.querySelector<HTMLElement>('.lightbox-count')!;
  const prev = dialog.querySelector<HTMLButtonElement>('.lightbox-prev')!;
  const next = dialog.querySelector<HTMLButtonElement>('.lightbox-next')!;
  const many = images.length > 1;
  prev.hidden = !many;
  next.hidden = !many;
  count.hidden = !many;

  let index = 0;
  let opener: HTMLElement | null = null;

  const show = (i: number) => {
    index = (i + images.length) % images.length;
    const img = images[index]!;
    // Show the version already on screen at once, then swap in the large one.
    view.src = img.currentSrc || img.src;
    view.alt = img.alt;
    const large = largestSource(img);
    if (large !== view.src) {
      const loader = new Image();
      loader.onload = () => {
        if (images[index] === img) view.src = large;
      };
      loader.src = large;
    }
    const text = captionFor(img);
    caption.textContent = text;
    caption.hidden = !text;
    // The manifest key is the suffix-less URL, i.e. the largest srcset entry.
    const original = originals[large] ?? originals[img.currentSrc] ?? originals[img.src];
    download.hidden = !original;
    if (original) {
      download.href = original.url;
      downloadSize.textContent = `(${original.width} × ${original.height}, ${formatBytes(original.bytes)})`;
    } else {
      download.removeAttribute('href');
    }
    count.textContent = `${index + 1} — ${images.length}`;
  };

  const open = (i: number, from: HTMLElement) => {
    opener = from;
    show(i);
    document.documentElement.classList.add('lightbox-is-open');
    dialog.showModal();
  };

  const close = () => dialog.close();

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('lightbox-is-open');
    view.removeAttribute('src');
    opener?.focus();
  });

  images.forEach((img, i) => {
    img.classList.add('has-lightbox');
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `View larger: ${img.alt || 'image'}`);
    img.draggable = false;
    img.addEventListener('click', () => open(i, img));
    img.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(i, img);
      }
    });
  });

  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  dialog.querySelector('.lightbox-close')!.addEventListener('click', close);
  // A click anywhere except the controls and the download link closes the viewer.
  dialog.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('button, a')) close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (!many) return;
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
}
