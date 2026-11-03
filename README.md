# Blog

A personal blog built with [Astro](https://astro.build) 7 and deployed to GitHub Pages.
The look of the site is controlled by swappable themes in `src/themes/`.

- Markdown and MDX posts with a typed schema (content collections)
- Home page, paginated post list, post pages, tag pages, about page, 404
- RSS feed (`/rss.xml`), sitemap (`/sitemap-index.xml`), SEO and Open Graph tags
- Syntax highlighting with light and dark Shiki themes, built at compile time
- Click any post image (or the post's cover) to view it larger; arrow keys step
  through the post's images
- Post images live on S3 behind CloudFront, never in Git or in the build. One
  local command publishes them; see [docs/IMAGES.md](./docs/IMAGES.md).
  The image viewer offers a full-resolution download (metadata removed).
- Three themes:
  - `minimal` and `modern`, each with light and dark mode that follows the
    system setting and has a toggle.
  - `photo-theme`, an editorial, photo-first port of the Ghost photo-theme
    (light only), with a hero slider, Load more and search.
- No UI framework. Client-side JavaScript is limited to small vanilla scripts:
  the toggle, or photo-theme's menu, slider, Load more and search.

## Local setup

Requirements: **Node.js 22.23.4 or newer** (Astro 7 requirement) and npm.

```sh
npm install              # also installs the pre-commit hook
npm run dev              # http://localhost:4321
npm run build            # type-check (astro check) + build to dist/
npm run preview          # serve dist/ locally
npm run images:publish   # upload post images to S3/CloudFront and rewrite the posts
npm run images:check     # list unpublished post images (what CI checks)
npm test                 # unit tests for the image scripts
```

## Project structure

```
src/
├── site.config.ts        # site title, author, active theme, posts per page, image CDN domain
├── content.config.ts     # post schema
├── content/blog/<slug>/  # one folder per post: index.md(x) + its images (until published)
├── data/image-manifest.json  # sizes of published images (committed)
├── pages/                # routes (theme-independent)
├── themes/<name>/        # layouts, components, styles of each theme
├── components/           # theme-independent: SEO, PostImage, dark mode init, MDX components
└── lib/                  # helpers: posts, base-aware URLs, CDN images
scripts/                  # publish-images (S3 upload + rewrite), pre-commit and CI guards, tests
infra/                    # AWS CDK app: S3 bucket, CloudFront, publisher IAM policy
docs/IMAGES.md            # image pipeline: setup, workflow, troubleshooting
public/                   # copied as-is (favicon, .nojekyll)
astro.config.mjs          # site/base, integrations, Markdown processor, theme alias
.github/workflows/deploy.yml
```

Routes:

| URL                    | File                                |
| ---------------------- | ----------------------------------- |
| `/`                    | `src/pages/index.astro`             |
| `/blog/`, `/blog/2/`   | `src/pages/blog/[...page].astro`    |
| `/posts/<id>/`         | `src/pages/posts/[...id].astro`     |
| `/tags/`               | `src/pages/tags/index.astro`        |
| `/tags/<tag>/`         | `src/pages/tags/[tag]/[...page].astro` |
| `/about/`              | `src/pages/about.astro`             |
| `/rss.xml`             | `src/pages/rss.xml.ts`              |
| `/search.json`         | `src/pages/search.json.ts` (search index) |

## Writing a post

Step-by-step guide, including wide covers, the home page spotlight, captions
and publishing: [docs/WRITING.md](./docs/WRITING.md).

Create a folder in `src/content/blog/` with an `index.md` (or `index.mdx`)
inside. The folder name becomes the URL: `src/content/blog/my-first-post/index.md`
is published at `/posts/my-first-post/`. (A flat `my-first-post.md` works too.)

```md
---
title: My first post
description: One or two sentences, used in lists, RSS and social previews.
pubDate: 2026-11-03
updatedDate: 2026-11-10        # optional
tags: [astro, notes]           # optional
draft: false                   # optional; true = only visible in `npm run dev`
cover: ./cover.jpg             # optional; image in the post folder (or a published URL)
coverAlt: What the cover shows # optional
featured: false                # optional; true = in photo-theme's home slider
fullWidth: false               # optional; true = full-width row in photo-theme lists
---

Post content in Markdown.
```

- **Drafts.** With `draft: true`, a post shows in `npm run dev` with a "draft"
  label. It is left out of `npm run build`, the RSS feed and the sitemap.
- **MDX.** Use the `.mdx` extension to import components. See
  `src/content/blog/mdx-and-images/index.mdx` and `src/components/mdx/Callout.astro`.
- **Images.** Put them in the post folder and reference them with a relative
  path (`./photo.jpg`). They render locally in `npm run dev`. Before committing,
  run `npm run images:publish`: it uploads them to S3/CloudFront, rewrites the
  references to `https://<cdn>/…` URLs and moves the originals to
  `.image-archive/`. Image files under `src/content/` are gitignored, and a
  pre-commit hook refuses posts with unpublished images. Full guide:
  [docs/IMAGES.md](./docs/IMAGES.md).
  - Published images get `width`, `height`, `srcset` and lazy loading from
    `src/data/image-manifest.json` automatically.
  - In MDX, use `Figure` or `PostImage` (`src/components/`) for images, not
    `Image` from `astro:assets`: after publishing, an imported image is a URL
    string.
- **Wide and full-width images (MDX).**
  `<Figure src={img} alt="…" caption="…" width="wide" />` from
  `src/components/mdx/Figure.astro`. photo-theme widens these; the other
  themes show them at column width.
- **Links between posts.** Use relative links such as `[text](../other-post/)`.
  A link starting with `/` skips the `base` path and breaks on a project site.
- **Code blocks.** Use fenced code blocks with a language. They are highlighted
  at build time.
- **Schema.** The frontmatter is validated by `src/content.config.ts`. A missing
  or misspelled field fails the build with a clear error.

## Switching themes

Open `src/site.config.ts` and change one value:

```ts
theme: 'photo-theme', // or 'minimal', 'modern'
```

Then rebuild, or restart `npm run dev`. Pages and posts stay the same; layouts,
components and styles all come from `src/themes/<theme>/`.

photo-theme has its own settings in `src/themes/photo-theme/theme.config.ts`:
accent color, fonts, logo, slider, footer text and navigation. It shows X and
Facebook icons in the footer when `social.x` / `social.facebook` are set in
`src/site.config.ts`.

To create your own theme, see [THEMES.md](./THEMES.md).

## Deploying to GitHub Pages

### 1. Choose your site type

GitHub Pages serves a repository either at the root of your domain or under a
sub-path. Astro needs to know which:

| Repository name             | Published at                            | `site`                            | `base`        |
| --------------------------- | --------------------------------------- | --------------------------------- | ------------- |
| `<username>.github.io`      | `https://<username>.github.io/`         | `https://<username>.github.io`    | `/`           |
| anything else, e.g. `blog`  | `https://<username>.github.io/blog/`    | `https://<username>.github.io`    | `/blog`       |
| custom domain               | `https://example.com/`                  | `https://example.com`             | `/`           |

**You usually do not need to set these by hand.** When the site builds in GitHub
Actions, `astro.config.mjs` reads the `GITHUB_REPOSITORY` variable (`owner/repo`)
and picks the right `site` and `base` for user and project sites.

To set them yourself:

- **Local builds.** Edit `FALLBACK_SITE` and `FALLBACK_BASE` at the top of
  `astro.config.mjs`. They are used when the build is not running in Actions.
- **Custom domain.**
  1. Add a file `public/CNAME` that contains only your domain, e.g. `example.com`.
  2. In `.github/workflows/deploy.yml`, uncomment the `env:` block and set
     `SITE_URL: 'https://example.com'` and `BASE_PATH: '/'`.
- **Any build.** The `SITE_URL` and `BASE_PATH` environment variables override
  the automatic values. For example, to test a project-site build locally:
  `BASE_PATH=/blog npm run build && npm run preview`.

### 2. Push the code to GitHub

```sh
git init
npm install                # installs the pre-commit hook into .git/hooks
npm run images:publish     # posts with local images cannot be committed (docs/IMAGES.md)
git add .
git commit -m "Initial blog"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

Commit `package-lock.json`. The deploy action uses it to detect npm.

### 3. Turn on GitHub Pages

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

### 4. Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which:

1. Checks out the code (`actions/checkout`).
2. Refuses to continue if any post still references a local image or an image
   file exists under `src/content/` (`node scripts/publish-images.ts --check`).
3. Installs dependencies, builds and uploads the site (`withastro/action`).
4. Refuses to deploy if `dist/` contains an image that is not from `public/`
   or a theme (`node scripts/check-dist.ts`).
5. Publishes it to GitHub Pages (`actions/deploy-pages`).

The workflow has no AWS credentials. Images are published from your machine.

Follow the run in the **Actions** tab. When it finishes, the site URL appears in
the run summary and under **Settings → Pages**. To redeploy without a new commit,
open **Actions → Deploy to GitHub Pages → Run workflow**.

`public/.nojekyll` tells GitHub Pages not to run Jekyll, so files and folders
starting with `_` (like Astro's `_astro/`) are served normally.

## Configuration reference

`src/site.config.ts`:

| Key             | Meaning                                         |
| --------------- | ----------------------------------------------- |
| `theme`         | Folder name in `src/themes/`                    |
| `title`         | Site title (header, `<title>`, RSS)             |
| `description`   | Default meta description and RSS description    |
| `author`        | Footer and `<meta name="author">`               |
| `lang`          | `<html lang>` and date formatting               |
| `homePostCount` | Number of posts on the home page                |
| `postsPerPage`  | Posts per page on `/blog/` and tag pages        |
| `social`        | Footer links, `{ name: url }`                   |
| `images.cdnDomain` | CloudFront domain of published post images (no scheme); empty until set up |
| `images.sizes`  | `sizes` attribute for published images in post bodies; match the theme's column |
| `images.originals` | `true`: also publish full-size copies and show "Download original" in the image viewer |

`postsPerPage` is set to `4` so the example posts show pagination and Load
more. Raise it (the Ghost photo-theme used `9`) once you have more posts.

The example posts keep their photos next to them (not committed) so you can try
`npm run images:publish` on them. The photos are from Unsplash; credits are in
`src/content/PHOTO-CREDITS.md`.
