import type { Page } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { slugify } from './tags';
import { withBase } from './url';

export type Post = CollectionEntry<'blog'>;

/** Post plus values every theme needs, computed once in one place. */
export interface PostSummary {
  entry: Post;
  url: string;
  tags: { name: string; slug: string; url: string }[];
}

/** All posts, newest first. Drafts are only included in `astro dev`. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => (import.meta.env.PROD ? !data.draft : true));
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postUrl(post: Post): string {
  return withBase(`/posts/${post.id}/`);
}

export function tagUrl(tag: string): string {
  return withBase(`/tags/${slugify(tag)}/`);
}

export function summarize(post: Post): PostSummary {
  return {
    entry: post,
    url: postUrl(post),
    tags: post.data.tags.map((name) => ({ name, slug: slugify(name), url: tagUrl(name) })),
  };
}

export async function getPostSummaries(): Promise<PostSummary[]> {
  return (await getPosts()).map(summarize);
}

/**
 * Page 1 of the /blog/ pagination, shaped like Astro's `paginate()` output,
 * so the home page can hand it to themes that continue into /blog/2/.
 */
export function firstBlogPage<T>(items: T[], size: number): Page<T> {
  const lastPage = Math.max(1, Math.ceil(items.length / size));
  const data = items.slice(0, size);
  return {
    data,
    start: 0,
    end: Math.max(0, data.length - 1),
    total: items.length,
    currentPage: 1,
    size,
    lastPage,
    url: {
      current: withBase('/blog/'),
      prev: undefined,
      next: lastPage > 1 ? withBase('/blog/2/') : undefined,
      first: undefined,
      last: lastPage > 1 ? withBase(`/blog/${lastPage}/`) : undefined,
    },
  };
}

/** Map of tag slug -> { name, posts } across all published posts. */
export async function getTags(): Promise<Map<string, { name: string; slug: string; url: string; posts: PostSummary[] }>> {
  const tags = new Map<string, { name: string; slug: string; url: string; posts: PostSummary[] }>();
  for (const post of await getPostSummaries()) {
    for (const tag of post.tags) {
      const existing = tags.get(tag.slug);
      if (existing) existing.posts.push(post);
      else tags.set(tag.slug, { ...tag, posts: [post] });
    }
  }
  return tags;
}
