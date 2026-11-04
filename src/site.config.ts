/**
 * Site-wide settings. This is the one file to edit for identity and theme.
 *
 * `theme` selects the folder in `src/themes/` that controls the whole look
 * of the site. Change it and rebuild (or restart `npm run dev`).
 */
export const siteConfig = {
  /** Folder name inside `src/themes/`. */
  theme: 'photo-theme',

  title: 'Wuwo 無我',
  description: 'Imagerial puns and textual montages',
  author: 'Wei',
  lang: 'en',
  homePostCount: 5,
  postsPerPage: 4,
  /** Optional social links, shown in the footer. Remove what you do not need. */
  social: {
    blog: 'https://wuwo.blog',
  } as Record<string, string>,

  /**
   * Post images live on S3 behind CloudFront, published by
   * `npm run images:publish` (see docs/IMAGES.md). The build only needs the
   * public domain, so it is committed here; `.env` holds the AWS side.
   */
  images: {
    /** CloudFront domain without scheme, e.g. 'd111111abcdef8.cloudfront.net'. Empty until the infra exists. */
    cdnDomain: 'static.wuwo.blog',
    /**
     * Also upload a full-resolution copy of each photo (location and camera
     * metadata removed) and offer it as "Download original" in the image
     * viewer. For photos published earlier: `npm run images:publish -- --originals`.
     */
    originals: false,
    /**
     * `sizes` attribute for published images inside post bodies. Match the
     * active theme's column: minimal ~38rem, modern ~68rem, photo-theme 740px
     * (1100px for wide figures).
     */
    sizes: '(min-width: 960px) 1100px, 100vw',
  },
};

export type SiteConfig = typeof siteConfig;
