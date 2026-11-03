# Themes

The whole look of the site comes from one folder in `src/themes/`. Pages and posts
never change when you switch or add a theme.

```
src/themes/
├── contract.ts        # layouts + props every theme must provide
├── minimal/           # serif, narrow, text-only lists
├── photo-theme/       # editorial, photo-first (port of the Ghost photo-theme), light only
└── modern/            # sans-serif, wide, card grid with covers
    ├── index.ts       # exports the layouts (checked against contract.ts)
    ├── layouts/       # BaseLayout, HomeLayout, PostLayout, PostListLayout,
    │                  # TagLayout, TagIndexLayout, PageLayout, NotFoundLayout
    ├── components/    # Header, Footer, PostCard, PostList, Pagination, TagList, ThemeToggle
    └── styles/
        ├── tokens.css # design tokens (CSS custom properties)
        └── global.css # base element styles, prose, code blocks
```

## photo-theme

A port of the Ghost theme in `../photo-theme` (design spec: `../photo-theme/DESIGN.md`).

- **What carries over.** The CSS in `styles/` is the Ghost CSS with the same
  class names. The scripts in `scripts/` are the Ghost scripts in TypeScript
  (menu, slider, reveal, Load more). The components follow the Ghost
  partials one to one.
- **Settings** are in `theme.config.ts`: accent color, fonts, logo, slider
  on/off and source, footer text, and the menu and footer
  navigation.
- **Frontmatter fields it uses:**
  - `featured: true` puts a post in the home slider. If no post is featured,
    the slider shows the latest posts.
  - `fullWidth: true` gives the post the full-width row in story lists. This
    replaces Ghost's internal `#full-width` tag.
- **Wide and full-width images in MDX posts** use `src/components/mdx/Figure.astro`
  with `width="wide"` or `width="full"`. For the centered quote, use
  `<blockquote class="kg-blockquote-alt">`.
- **Covers** are rendered with the shared `src/components/PostImage.astro`,
  because a cover is either a local image or a published CloudFront URL
  (docs/IMAGES.md). `lib/site.ts` → `coverSizes()` takes the image's
  dimensions from `imageSize()` in `src/lib/cdn-images.ts`.
- **Left out on purpose**, because the blog is static and has one author: dark
  mode, the members box, the paywall, member pages, the newsletter, comments,
  author pages, author suggestions and the "Share this Story" buttons. The Ghost search is replaced by a small
  overlay that reads `/search.json`.
- **Two fixes compared with the Ghost CSS**, both commented in the files:
  - Wide and full-width images now get their wider width. In the Ghost CSS,
    `.post-content .kg-card` overrode it.
  - Story excerpts are 80% wide where they have 10% padding on both sides.
    At 90% wide, phone pages scrolled sideways.

## How switching works

1. `src/site.config.ts` has `theme: 'minimal'`.
2. `astro.config.mjs` reads that value and points the import alias `@theme` at
   `src/themes/<theme>/`.
3. Pages import layouts from the alias, e.g. `import { PostLayout } from '@theme'`.

Only the active theme is imported, so only its CSS and JS end up in the build.

> `tsconfig.json` also maps `@theme`, to `src/themes/minimal`. That mapping is for
> editor autocompletion and `astro check` only. Every theme has the same props,
> so it does not need to change when you switch themes.

## Create a new theme

1. **Copy an existing theme.**

   ```sh
   cp -R src/themes/minimal src/themes/my-theme
   ```

2. **Activate it.** In `src/site.config.ts`:

   ```ts
   theme: 'my-theme',
   ```

   Restart `npm run dev` after changing the theme, because the alias is set when
   the dev server starts.

3. **Change the tokens first.** Edit `styles/tokens.css`. Colors, fonts, spacing
   and max width are all CSS custom properties. Dark mode values appear twice
   in the file, and both copies must be kept the same:
   - `:root[data-theme='dark']` applies when the visitor uses the toggle.
   - `@media (prefers-color-scheme: dark)` applies when they follow the system setting.

4. **Restyle or restructure.** Edit anything in `layouts/`, `components/` and
   `styles/global.css`. Markup, structure and component names are up to the theme.
   The only requirements are below.

5. **Run `npm run check`.** It fails if the theme is missing a layout or a layout's
   props drift from `contract.ts`.

## What every theme must do

- **Export every layout in `contract.ts`** from `index.ts`, with matching props.
  `HomeLayout` receives `posts` (latest), `featured` and `firstPage` (page 1 of
  `/blog/`); `PostLayout` receives `post` / `prev` / `next` and the rendered post
  as its slot, and so on. A theme may ignore props it does not need.
- **Render the shared head pieces.** `BaseLayout` renders
  `src/components/SEO.astro` inside `<head>`. It provides the meta tags, Open
  Graph tags, RSS link, and `<link rel="prev|next">` when the layout passes
  `prev` / `next`. Themes with dark mode also render
  `src/components/ThemeInit.astro`, the no-flash dark mode script.
- **Provide the shared token names.** Components inside posts
  (`src/components/mdx/`) style themselves with them, so they fit any theme:
  `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`,
  `--color-border`, `--color-accent`, `--space-1` … `--space-6`, `--radius`.
- **Dark mode is optional.** If the theme supports it:
  - Keep the Shiki rules from `global.css`, which switch code blocks to the
    `--shiki-dark` variables.
  - Wire up the light/dark toggle. Any element with the
    `data-color-scheme-toggle` attribute works once a script calls
    `initColorSchemeToggles()` from `src/lib/color-scheme.ts`. The script sets
    `data-scheme="light|dark"` on the button for styling.

  `photo-theme` is light only and has no toggle.
- **Render covers with `PostImage`.** `post.entry.data.cover` is a
  `CoverSource` (`src/themes/contract.ts`): an `ImageMetadata` while the author
  is writing, or a `https://…` string once the image is published to
  CloudFront (docs/IMAGES.md). `src/components/PostImage.astro` handles both
  and passes `class`, `loading`, `sizes`, `widths` and `width` through, so a
  theme uses it exactly like `<Image>` from `astro:assets`. Need the image's
  dimensions (for art-directed `sizes`)? `imageSize(cover)` from
  `src/lib/cdn-images.ts`. `BaseProps.image` (the Open Graph image) is a
  `CoverSource` too.
- **Theme settings stay in the theme folder.** A theme can have its own
  settings file, e.g. `src/themes/photo-theme/theme.config.ts` (accent color,
  fonts, slider, navigation). `src/site.config.ts` stays theme-independent.
- **Pass internal links through `withBase()`.** Use it from `src/lib/url.ts` so
  links work on project sites (`username.github.io/repo/`). Post URLs
  (`post.url`) and tag URLs already include the base.

## Shared helpers themes can use

| Helper                         | Purpose                                      |
| ------------------------------ | -------------------------------------------- |
| `src/lib/url.ts`               | `withBase(path)`, `absoluteUrl(path, site)`  |
| `src/lib/format.ts`            | `formatDate(date)`                           |
| `src/lib/posts.ts`             | `PostSummary` type (entry, url, tags) |
| `src/lib/color-scheme.ts`      | Light/dark toggle behaviour                  |
| `src/lib/lightbox.ts`          | `initLightbox(selector)`: click-to-enlarge viewer; the theme styles `.lightbox*` |
| `src/components/PostImage.astro` | Local or published image as `<Image>` / `<img>` with srcset (use for covers) |
| `src/lib/cdn-images.ts`        | `CoverSource` type, `imageSize(src)`, `cdnImgAttrs(url)` for published images |
| `src/components/ImageOriginals.astro` | Render in `PostLayout` (`<ImageOriginals post={post} />`) so the image viewer can offer "Download original"; style `.lightbox-download` |
| `/search.json`                 | Search index (title, description, url, tags) for client-side search |
| `src/site.config.ts`           | Title, description, author, social links     |
