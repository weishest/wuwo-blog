/**
 * photo-theme: editorial, photo-first. A port of the Ghost photo-theme
 * (../photo-theme, DESIGN.md). Light mode only. Settings in theme.config.ts.
 * Exports every layout required by src/themes/contract.ts.
 */
import type { Theme } from '../contract';
import BaseLayout from './layouts/BaseLayout.astro';
import HomeLayout from './layouts/HomeLayout.astro';
import PostLayout from './layouts/PostLayout.astro';
import PostListLayout from './layouts/PostListLayout.astro';
import TagLayout from './layouts/TagLayout.astro';
import TagIndexLayout from './layouts/TagIndexLayout.astro';
import PageLayout from './layouts/PageLayout.astro';
import NotFoundLayout from './layouts/NotFoundLayout.astro';

export { BaseLayout, HomeLayout, PostLayout, PostListLayout, TagLayout, TagIndexLayout, PageLayout, NotFoundLayout };

/** Type-checked against the contract: `astro check` fails if a layout is missing or its props drift. */
export const theme: Theme = {
  BaseLayout,
  HomeLayout,
  PostLayout,
  PostListLayout,
  TagLayout,
  TagIndexLayout,
  PageLayout,
  NotFoundLayout,
};
