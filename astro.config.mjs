// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { siteConfig } from './src/site.config.ts';
import { cdnImages } from './src/lib/satteri-cdn-images.ts';

/**
 * GitHub Pages: `site` and `base`
 * --------------------------------
 * User site    (repo named `<username>.github.io`):
 *   SITE = 'https://<username>.github.io'   BASE = '/'
 * Project site (any other repo name, e.g. `blog`):
 *   SITE = 'https://<username>.github.io'   BASE = '/blog'
 * Custom domain (with `public/CNAME`):
 *   SITE = 'https://example.com'            BASE = '/'
 *
 * Inside GitHub Actions both values are derived from `GITHUB_REPOSITORY`
 * (`owner/repo`), so the deploy works for user and project sites without
 * edits. Set `SITE_URL` / `BASE_PATH` env vars (or edit the fallbacks below)
 * to override, e.g. for a custom domain.
 */
const FALLBACK_SITE = 'https://your-username.github.io';
const FALLBACK_BASE = '/';

function resolveSiteAndBase() {
  const envSite = process.env.SITE_URL;
  const envBase = process.env.BASE_PATH;
  if (envSite) return { site: envSite, base: envBase ?? '/' };

  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo" in GitHub Actions
  if (repo) {
    const [owner, name] = repo.split('/');
    const site = `https://${owner}.github.io`;
    const isUserSite = name?.toLowerCase() === `${owner?.toLowerCase()}.github.io`;
    return { site, base: envBase ?? (isUserSite ? '/' : `/${name}`) };
  }
  return { site: FALLBACK_SITE, base: envBase ?? FALLBACK_BASE };
}

const { site, base } = resolveSiteAndBase();
const themeDir = fileURLToPath(new URL(`./src/themes/${siteConfig.theme}/`, import.meta.url));

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
    // Sätteri (the default processor) with one extra hast plugin: published
    // images get width/height/srcset from the manifest. The CloudFront domain
    // is deliberately NOT in `image.domains`/`remotePatterns`, so Astro leaves
    // those <img> tags alone and never copies them into dist/.
    processor: satteri({
      hastPlugins: [
        cdnImages({
          cdnDomain: siteConfig.images.cdnDomain,
          manifestPath: fileURLToPath(new URL('./src/data/image-manifest.json', import.meta.url)),
          sizes: siteConfig.images.sizes,
        }),
      ],
    }),
  },
  vite: {
    resolve: {
      // Pages import layouts from '@theme'; this points it at the active theme.
      alias: { '@theme': themeDir },
    },
  },
});
