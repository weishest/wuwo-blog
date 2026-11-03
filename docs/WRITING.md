# Writing and publishing a post

This guide covers the whole path from an empty folder to a live post: the
frontmatter, the cover photo (including wide, horizontal covers), putting a
post in the home page spotlight, images and captions in the text, and
publishing. The image pipeline behind `npm run images:publish` is explained
in [IMAGES.md](./IMAGES.md); the one-time AWS setup must be done first.

What this guide describes is how **photo-theme** (the active theme) shows
things. `featured` and `fullWidth` have no visible effect in the `minimal` and
`modern` themes.

## The short version

```sh
mkdir src/content/blog/all-about-chimneys
# put index.md and the photos in that folder
npm run dev                          # preview at http://localhost:4321
npm run images:publish               # upload photos, rewrite the post
git add src/content/blog/all-about-chimneys src/data/image-manifest.json
git commit -m "Post: All about chimneys"
git push                             # GitHub Actions builds and deploys
```

## 1. Create the post

One folder per post, with an `index.md` inside and the photos next to it:

```
src/content/blog/all-about-chimneys/
├── index.md
├── P1060619.JPG      ← cover
└── P1060617.JPG      ← photo in the text
```

- The **folder name is the URL**: `/posts/all-about-chimneys/`. Use lowercase
  words and hyphens. Changing it later changes the URL.
- Photo file names do not matter (camera names like `P1060619.JPG` are fine).
  They become part of the image URL, in lowercase.
- Use `index.mdx` instead of `index.md` when you want captions or wide images
  (section 5).

## 2. Frontmatter

The block between the two `---` lines at the top of `index.md`:

```md
---
title: All about chimneys
description: A chimney in Mustamäe happens to be my most photographed object.
pubDate: 2026-11-01
tags: [photography, tallinn]
cover: ./P1060619.JPG
coverAlt: A brick chimney against a pale evening sky
featured: true
fullWidth: true
---

The text of the post starts here.
```

| Field         | Required | What it does |
| ------------- | -------- | ------------ |
| `title`       | yes      | Post title: page heading, lists, browser tab, RSS, link previews |
| `description` | yes      | One or two sentences under the title in lists; also the RSS summary and the link-preview text |
| `pubDate`     | yes      | Publication date, `YYYY-MM-DD`. Posts are sorted by it, newest first |
| `updatedDate` | no       | Last real change. Sent to search engines and link previews; photo-theme does not display it (minimal and modern show "updated") |
| `tags`        | no       | `[one, two]`. Each tag gets a page at `/tags/<tag>/`; the first four show on the post |
| `cover`       | no       | The post's main photo, path relative to `index.md` (section 3) |
| `coverAlt`    | no       | Describes the cover for screen readers and search engines. Without it the title is used |
| `featured`    | no       | `true` puts the post in the home page slider (section 4) |
| `fullWidth`   | no       | `true` shows the post as a full-width row in the post lists (section 3) |
| `draft`       | no       | `true` hides the post from the live site; it still shows in `npm run dev` |

A typo in a field name or a wrong value (for example a date that is not a
date) stops the build with a message that names the file and the field.

## 3. The cover photo

The cover appears in four places, each with its own shape. The photo is
cropped to fill each shape, keeping the centre:

| Where                                   | Shape of the frame on a laptop | What a horizontal 3:2 photo looks like |
| --------------------------------------- | ------------------------------ | -------------------------------------- |
| Post page, right half of the header     | tall, about 4:5                | the middle third or so                 |
| Home slider (if `featured`)             | tall, about 4:5                | the middle third or so                 |
| Post lists, normal row                  | slightly tall, about 5:6       | the middle part                        |
| Post lists, **full-width row** (`fullWidth: true`) | wide, about 2:1     | almost the whole photo                 |

On phones every frame is a wide band across the screen, so horizontal photos
fit there anyway.

### Make a horizontal cover show as horizontal

Set `fullWidth: true`. In the home page list, on `/blog/` and its following
pages, the post then gets a row of its own: the photo spans the whole width
(about 2:1), with the title, excerpt and tags centred below it. This is the
place for landscapes and panoramas.

```md
cover: ./P1060619.JPG
fullWidth: true
```

What stays the same: the **post page header** and the **home slider** keep
their tall frame, so even with `fullWidth` they show the centre of the photo.
That is part of the design (the Ghost theme behaves the same way). Tag pages
use a two-column grid and ignore `fullWidth`.

Tips:

- **Keep the subject near the centre.** Every frame crops around the middle.
  For a very wide panorama (3:1 and wider), the tall frames show only a narrow
  slice; crop the photo yourself before publishing if one part matters.
- **Use at least 2400px on the long side.** Smaller photos are never enlarged,
  so they look soft in the large frames.
- A vertical photo as cover suits the tall frames best. Do not combine it with
  `fullWidth`, which would show only a thin horizontal strip of it.
- JPEG, PNG, WebP or AVIF. HEIC from an iPhone must be converted first
  (`sips -s format jpeg photo.heic --out photo.jpg`), or set the iPhone to
  "Most Compatible" under Settings → Camera → Formats.

### No cover

Leave out `cover`. The post page header is then text only, and in lists the
row has no photo.

## 4. Put a post in the spotlight (home slider)

The large slider at the top of the home page shows **featured** posts:

```md
featured: true
```

- It shows the **five newest** featured posts, newest first. Older featured
  posts drop out of the slider when newer ones arrive; remove `featured` from
  a post to take it out sooner.
- If no post is featured, the slider shows the five newest posts.
- A featured post also stays in the normal list below the slider.
- Each slide shows the cover in the tall frame (section 3) next to the title,
  description and tags. A featured post without a cover becomes a text-only
  slide, which looks empty; give featured posts a cover.
- The slider itself is configured in `src/themes/photo-theme/theme.config.ts`:
  `showSlider: false` turns it off, `sliderPosts: 'latest'` ignores `featured`
  and always shows the newest posts.

`featured` and `fullWidth` are independent: a post can be in the slider and
have a full-width row in the list.

## 5. Photos in the text

### In `index.md`

```md
Some text.

![A brick chimney against a pale evening sky](./P1060617.JPG)

More text.
```

- The part in `[...]` is the alt text: describe the photo. It is read by
  screen readers, shown when the photo cannot load, and used as the caption
  in the image viewer when there is no other caption.
- Leave an empty line before and after the image.
- Plain Markdown has **no captions**. An italic line under the photo
  (`*This is caption*`) is just italic text. For a real caption, use `.mdx`.
- Photos in the text show at column width, uncropped.
- Visitors can click any photo to open it large; with `images.originals` on
  they can also download the full-size version (see [IMAGES.md](./IMAGES.md)).

### Captions and wide photos: use `index.mdx`

Rename `index.md` to `index.mdx`, import the `Figure` component and the
photos at the top (below the frontmatter), and use `Figure` where the photo
goes:

```mdx
---
title: All about chimneys
# …same frontmatter as before…
---

import Figure from '../../../components/mdx/Figure.astro';
import evening from './P1060617.JPG';

Some text.

<Figure src={evening} alt="A brick chimney against a pale evening sky" caption="Mustamäe, November evening" />

<Figure src={evening} alt="…" caption="Wider than the text" width="wide" />

<Figure src={evening} alt="…" caption="Edge to edge" width="full" />
```

| `width`            | Shows the photo                                   |
| ------------------ | ------------------------------------------------- |
| (none) or `regular`| at the width of the text column                    |
| `wide`             | wider than the text, up to about 1100px           |
| `full`             | across the whole window, edge to edge              |

Do not use `Image` from `astro:assets` in posts, and do not read
`photo.width` or similar: after publishing, an imported photo becomes a URL
and those would break. `npm run images:publish` refuses such a post and says
why.

Other MDX extras: a highlighted note box,

```mdx
import Callout from '../../../components/mdx/Callout.astro';

<Callout title="Tip">Bring a tripod.</Callout>
```

and a large centred quote:

```mdx
<blockquote class="kg-blockquote-alt">A chimney is a lighthouse for smoke.</blockquote>
```

## 6. Preview

```sh
npm run dev
```

Open <http://localhost:4321>. The post appears in the lists by `pubDate`;
open it at `/posts/<folder-name>/`. Local photos show while you write. Drafts
(`draft: true`) appear here with a "draft" label but never on the live site.

## 7. Publish

**1. Upload the photos.** Optional dry run first:

```sh
npm run images:publish -- --post all-about-chimneys --dry-run
npm run images:publish -- --post all-about-chimneys
```

(Without `--post` it publishes every post that still has local photos.) The
command uploads the photos, replaces `./P1060619.JPG` etc. in the post with
`https://static.wuwo.blog/…` URLs, records their sizes in
`src/data/image-manifest.json` and moves the original files to
`.image-archive/all-about-chimneys/`. Preview again if you like: the photos
now come from CloudFront.

**2. Commit** the post and the manifest:

```sh
git add src/content/blog/all-about-chimneys src/data/image-manifest.json
git commit -m "Post: All about chimneys"
```

The photo files are ignored by Git. If the commit is refused with "Commit
blocked: post images must be published…", a photo is still local; run
`npm run images:publish` and add the files again.

**3. Push:**

```sh
git push
```

GitHub Actions checks, builds and deploys; follow it in the repository's
**Actions** tab. The post is live after about two minutes.

## 8. After publishing

- **Fix a typo or change text**: edit `index.md`, commit, push. No image step.
- **Change `featured`, `fullWidth`, tags or the cover's alt text**: same,
  frontmatter only.
- **Replace a photo**: put the new file in the folder, point the reference
  back at it (`cover: ./new-cover.jpg`), run `npm run images:publish`, commit
  the post and the manifest. The old photo stays in S3 but is no longer used.
- **Unpublish**: set `draft: true`, or delete the folder; commit and push.
  The photos stay in S3 (nothing is ever deleted there).
- **Change the date**: edit `pubDate`. The post moves in the lists; the URL
  stays the same.

## Checklist

- [ ] Folder name is the URL you want
- [ ] `title`, `description`, `pubDate` filled in
- [ ] `cover` set, `coverAlt` describes it
- [ ] Wide landscape cover? `fullWidth: true`
- [ ] Spotlight? `featured: true`
- [ ] Captions or wide photos? `index.mdx` with `Figure`
- [ ] Every photo has alt text
- [ ] `npm run images:publish` done, no problems reported
- [ ] Post folder and `src/data/image-manifest.json` committed, pushed
