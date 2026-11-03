/**
 * Small search index for themes with client-side search (photo-theme).
 * Contains titles, descriptions, tags and URLs of published posts.
 */
import type { APIRoute } from 'astro';
import { getPostSummaries } from '../lib/posts';

export const GET: APIRoute = async () => {
  const posts = await getPostSummaries();
  const index = posts.map(({ entry, url, tags }) => ({
    title: entry.data.title,
    description: entry.data.description,
    url,
    date: entry.data.pubDate.toISOString(),
    tags: tags.map((t) => ({ name: t.name, url: t.url })),
  }));
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
