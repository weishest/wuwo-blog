/**
 * Finds and rewrites local image references in Markdown/MDX files. Pure
 * string work, no I/O, so it is easy to test. Runs under plain Node
 * (`node scripts/...ts`), so it must use erasable TypeScript syntax only.
 *
 * Reference forms (inside fenced code blocks and inline code are ignored):
 *   frontmatter   cover: ./cover.jpg          (quoted or bare; list items; inline arrays)
 *   markdown      ![alt](./a.jpg "title")     (also <./with space.jpg>)
 *   definition    [id]: ./a.jpg "title"       (reference-style images/links)
 *   link          [text](./a.jpg), href="./a.jpg"   (links to image files)
 *   attr          src="./a.jpg", poster=…, srcset="./a.jpg 1x, …"  on any HTML/JSX tag
 *   import        import photo from './a.jpg' (MDX; becomes `export const photo = '<url>';`)
 */

export const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|svg|heic)$/i;

export type RefKind = 'frontmatter' | 'markdown' | 'definition' | 'link' | 'attr' | 'import';

export interface ImageRef {
  kind: RefKind;
  /** Range in the file text that the rewrite replaces (the path, or the whole import statement). */
  start: number;
  end: number;
  /** The path as written, without query/hash, percent-decoded. */
  path: string;
  /** Import binding name (`import` only). */
  name?: string;
}

/** Relative path to an image file: no scheme, not site-absolute, not an anchor. */
export function isLocalImagePath(p: string): boolean {
  if (p === '' || p.startsWith('/') || p.startsWith('#') || p.startsWith('{')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  return IMAGE_EXT.test(stripQuery(p));
}

function stripQuery(p: string): string {
  return p.replace(/[?#].*$/, '');
}

function decodePath(p: string): string {
  try {
    return decodeURIComponent(stripQuery(p));
  } catch {
    return stripQuery(p);
  }
}

/**
 * Same length as `text`, with fenced code blocks and inline code replaced by
 * spaces, so matches found in it map to the same offsets in `text`.
 */
export function maskCode(text: string): string {
  const lines = text.split('\n');
  let fence: { char: string; len: number } | null = null;
  const out = lines.map((line) => {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const closes = m && m[1]![0] === fence.char && m[1]!.length >= fence.len && /^ {0,3}(`{3,}|~{3,})\s*$/.test(line);
      if (closes) fence = null;
      return ' '.repeat(line.length);
    }
    if (m) {
      fence = { char: m[1]![0]!, len: m[1]!.length };
      return ' '.repeat(line.length);
    }
    return line;
  });
  return out.join('\n').replace(/(`+)[^`]*?\1/g, (s) => ' '.repeat(s.length));
}

/** The leading `---` block: [start, end) of its inner text, or null. */
function frontmatterRange(masked: string): [number, number] | null {
  const open = /^---[ \t]*\r?\n/.exec(masked);
  if (!open) return null;
  const close = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(masked.slice(open[0].length));
  if (!close) return null;
  return [open[0].length, open[0].length + close.index];
}

const BARE = `[^"'\\s\\[\\],#]+`;

function findFrontmatter(masked: string, refs: ImageRef[]): void {
  const range = frontmatterRange(masked);
  if (!range) return;
  const [start, end] = range;
  const block = masked.slice(start, end);
  // `key: value`, `- value`
  const scalar = new RegExp(`^(\\s*(?:[\\w-]+:|-)\\s*)(["']?)(${BARE})\\2\\s*(?:#.*)?$`, 'gm');
  for (const m of block.matchAll(scalar)) {
    const p = m[3]!;
    if (!isLocalImagePath(p)) continue;
    const at = start + m.index + m[1]!.length + m[2]!.length;
    refs.push({ kind: 'frontmatter', start: at, end: at + p.length, path: decodePath(p) });
  }
  // `key: [a.jpg, "b.jpg"]`
  const arrays = /^\s*[\w-]+:\s*\[([^\]]*)\]/gm;
  for (const m of block.matchAll(arrays)) {
    const inner = m[1]!;
    const innerAt = start + m.index + m[0].indexOf('[') + 1;
    const item = new RegExp(`(["']?)(${BARE})\\1`, 'g');
    for (const im of inner.matchAll(item)) {
      const p = im[2]!;
      if (!isLocalImagePath(p)) continue;
      const at = innerAt + im.index + im[1]!.length;
      refs.push({ kind: 'frontmatter', start: at, end: at + p.length, path: decodePath(p) });
    }
  }
}

/**
 * Parses a link destination starting at `i` (just after `](`). Returns the
 * destination range or null when the construct is not a link.
 */
function parseDestination(s: string, i: number): { start: number; end: number; raw: string; close: number } | null {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n')) i++;
  let start = i;
  let end: number;
  if (s[i] === '<') {
    const gt = s.indexOf('>', i + 1);
    if (gt === -1) return null;
    start = i + 1;
    end = gt;
    i = gt + 1;
  } else {
    let depth = 0;
    while (i < s.length) {
      const c = s[i]!;
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (/\s/.test(c)) break;
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
      i++;
    }
    end = i;
  }
  // optional title
  while (i < s.length && /\s/.test(s[i]!)) i++;
  const t = s[i];
  if (t === '"' || t === "'" || t === '(') {
    const closer = t === '(' ? ')' : t;
    const j = s.indexOf(closer, i + 1);
    if (j === -1) return null;
    i = j + 1;
    while (i < s.length && /\s/.test(s[i]!)) i++;
  }
  if (s[i] !== ')') return null;
  return { start, end, raw: s.slice(start, end), close: i };
}

function findMarkdown(masked: string, refs: ImageRef[]): void {
  // label then `](`; labels may contain one level of nested brackets
  const label = /(!?)\[(?:[^\[\]\\]|\\.|\[[^\[\]]*\])*\]\(/g;
  for (const m of masked.matchAll(label)) {
    const dest = parseDestination(masked, m.index + m[0].length);
    if (!dest) continue;
    const p = dest.raw;
    if (!isLocalImagePath(p)) continue;
    refs.push({ kind: m[1] === '!' ? 'markdown' : 'link', start: dest.start, end: dest.end, path: decodePath(p) });
  }
}

function findDefinitions(masked: string, refs: ImageRef[]): void {
  const def = /^ {0,3}\[[^\]]+\]:[ \t]*(<?)(\S+?)>?(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/gm;
  for (const m of masked.matchAll(def)) {
    const p = m[2]!;
    if (!isLocalImagePath(p)) continue;
    const at = m.index + m[0].indexOf(m[1] + p) + m[1]!.length;
    refs.push({ kind: 'definition', start: at, end: at + p.length, path: decodePath(p) });
  }
}

function findAttributes(masked: string, refs: ImageRef[]): void {
  const attr = /\b(src|href|poster|srcset)\s*=\s*(["'])([^"'\n]*)\2/g;
  for (const m of masked.matchAll(attr)) {
    const valueAt = m.index + m[0].length - m[3]!.length - 1;
    if (m[1] === 'srcset') {
      let offset = 0;
      for (const candidate of m[3]!.split(',')) {
        const lead = candidate.length - candidate.trimStart().length;
        const url = candidate.trim().split(/\s+/)[0] ?? '';
        if (isLocalImagePath(url)) {
          const at = valueAt + offset + lead;
          refs.push({ kind: 'attr', start: at, end: at + url.length, path: decodePath(url) });
        }
        offset += candidate.length + 1;
      }
      continue;
    }
    const p = m[3]!;
    if (!isLocalImagePath(p)) continue;
    refs.push({ kind: m[1] === 'href' ? 'link' : 'attr', start: valueAt, end: valueAt + p.length, path: decodePath(p) });
  }
}

function findImports(masked: string, refs: ImageRef[]): void {
  const imp = /^[ \t]*(import\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])([^"'\n]+)\3\s*;?)[ \t]*$/gm;
  for (const m of masked.matchAll(imp)) {
    const p = m[4]!;
    if (!isLocalImagePath(p)) continue;
    const at = m.index + m[0].indexOf(m[1]!);
    refs.push({ kind: 'import', start: at, end: at + m[1]!.length, path: decodePath(p), name: m[2]! });
  }
}

/** All local image references in a Markdown/MDX file, sorted by position, without overlaps. */
export function findReferences(text: string): ImageRef[] {
  const masked = maskCode(text);
  const refs: ImageRef[] = [];
  findFrontmatter(masked, refs);
  findMarkdown(masked, refs);
  findDefinitions(masked, refs);
  findAttributes(masked, refs);
  findImports(masked, refs);
  refs.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: ImageRef[] = [];
  let last = -1;
  for (const ref of refs) {
    if (ref.start < last) continue;
    result.push(ref);
    last = ref.end;
  }
  return result;
}

/**
 * Uses of an imported image that break once the import becomes a URL string:
 * `photo.src` / `.width` / `.height` / `.format`, and `<Image src={photo}>`
 * from astro:assets, which needs width and height for a remote source.
 */
export function findImportHazards(text: string, refs: ImageRef[]): string[] {
  const masked = maskCode(text);
  const names = refs.filter((r) => r.kind === 'import' && r.name).map((r) => r.name!);
  const problems: string[] = [];
  const usesAstroImage = /from\s+["']astro:assets["']/.test(masked);
  for (const name of names) {
    const member = new RegExp(`\\b${name}\\.(src|width|height|format)\\b`);
    if (member.test(masked)) problems.push(`\`${name}.${member.exec(masked)![1]}\` is used; after publishing \`${name}\` is a URL string`);
    if (usesAstroImage && new RegExp(`<Image\\b[^>]*\\bsrc=\\{\\s*${name}\\s*\\}`).test(masked)) {
      problems.push(`<Image src={${name}}> from astro:assets cannot size a published URL; use <PostImage> or <Figure>`);
    }
  }
  return problems;
}

/** Replaces every reference; `urlFor` returns the published URL for a reference. */
export function rewrite(text: string, refs: ImageRef[], urlFor: (ref: ImageRef) => string): string {
  let out = text;
  for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
    const url = urlFor(ref);
    const replacement = ref.kind === 'import' ? `export const ${ref.name} = '${url}';` : url;
    out = out.slice(0, ref.start) + replacement + out.slice(ref.end);
  }
  return out;
}

/**
 * `blog/<slug>` for a content file: the folder name for `<slug>/index.md`,
 * the file stem for `<slug>.md`, nested folders joined with `/`.
 */
export function postKey(relativeToContent: string): { collection: string; slug: string; key: string } {
  const parts = relativeToContent.split(/[\\/]/);
  const collection = parts.shift() ?? '';
  const file = parts.pop() ?? '';
  const stem = file.replace(/\.(md|mdx)$/i, '');
  if (stem !== 'index') parts.push(stem);
  const slug = parts.join('/');
  return { collection, slug, key: slug ? `${collection}/${slug}` : collection };
}
