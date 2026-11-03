/**
 * The contract every theme implements.
 *
 * Pages in `src/pages/` only talk to themes through these layouts and props.
 * A theme's `index.ts` must export every layout below; the `satisfies Theme`
 * check there makes `astro check` fail if a theme drifts from the contract.
 */
import type { Page } from 'astro';
import type { CoverSource } from '../lib/cdn-images';
import type { PostSummary } from '../lib/posts';

export type { CoverSource };

export interface BaseProps {
  /** Page title (site title is appended by the layout). Omit on the home page. */
  title?: string;
  description?: string;
  /** Open Graph image: a local image or a published URL (see PostImage). */
  image?: CoverSource;
  /** Open Graph type. */
  type?: 'website' | 'article';
  publishedTime?: Date;
  modifiedTime?: Date;
  /** Pagination links, rendered as <link rel="prev|next"> in <head>. */
  prev?: string | undefined;
  next?: string | undefined;
}

export interface HomeProps {
  /** Latest posts, `siteConfig.homePostCount` of them. */
  posts: PostSummary[];
  /** Posts marked `featured: true`, newest first, at most 5. May be empty. */
  featured: PostSummary[];
  /** Page 1 of the /blog/ pagination, for themes whose home continues into /blog/2/. */
  firstPage: Page<PostSummary>;
}

export interface PostProps {
  post: PostSummary;
  /** Newer / older posts for navigation at the bottom. */
  prev?: PostSummary | undefined;
  next?: PostSummary | undefined;
}

export interface PostListProps {
  page: Page<PostSummary>;
}

export interface TagProps {
  tag: { name: string; slug: string };
  page: Page<PostSummary>;
}

export interface TagIndexProps {
  tags: { name: string; slug: string; url: string; count: number }[];
}

export interface PageProps {
  title: string;
  description?: string;
}

export type NotFoundProps = Record<string, never>;

// The default export of an .astro file is a function taking its Props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Component<P> = (props: P) => any;

export interface Theme {
  BaseLayout: Component<BaseProps>;
  HomeLayout: Component<HomeProps>;
  PostLayout: Component<PostProps>;
  PostListLayout: Component<PostListProps>;
  TagLayout: Component<TagProps>;
  TagIndexLayout: Component<TagIndexProps>;
  PageLayout: Component<PageProps>;
  NotFoundLayout: Component<NotFoundProps>;
}
