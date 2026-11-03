import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPostSummaries } from '../lib/posts';
import { absoluteUrl } from '../lib/url';
import { siteConfig } from '../site.config';

export async function GET(context: APIContext) {
  const posts = await getPostSummaries();
  return rss({
    title: siteConfig.title,
    description: siteConfig.description,
    // `site` + base, so relative item links resolve correctly on project sites.
    site: absoluteUrl('/', context.site),
    items: posts.map(({ entry, url }) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.pubDate,
      categories: entry.data.tags,
      link: new URL(url, context.site).href,
    })),
    customData: `<language>${siteConfig.lang}</language>`,
  });
}
