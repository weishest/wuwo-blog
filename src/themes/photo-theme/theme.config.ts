/**
 * Settings for photo-theme only (the Ghost theme's custom settings).
 * Site-wide identity (title, description, author, social links) stays in
 * src/site.config.ts.
 */
export interface NavItem {
  label: string;
  /** Internal path (base is added automatically) or absolute URL. */
  url: string;
}

export const photoTheme = {
  /**
   * Theme color, the only place it is set: highlighter bar, link underlines,
   * hovers, active states. Any CSS color works.
   */
  accent: '#ff6dc4',

  fonts: {
    /** Stylesheet that loads the two families. Set to '' when self-hosting fonts. */
    href: 'https://fonts.googleapis.com/css2?family=Josefin+Sans:ital,wght@0,600;1,600&family=Mulish:ital,wght@0,400;0,700;1,400;1,700&display=swap',
    head: '"Josefin Sans", sans-serif',
    body: '"Mulish", sans-serif',
    /** 600 for Josefin Sans; use 700 for most custom heading fonts. */
    headWeight: 600,
  },

  /** Image logo in public/, e.g. '/logo.png'. Empty shows the site title as text. */
  logo: '',

  /** Home hero slider. */
  showSlider: true,
  /** 'featured' uses posts with `featured: true` (falls back to latest); 'latest' uses the newest posts. */
  sliderPosts: 'featured' as 'featured' | 'latest',

  /** Replaces the default copyright line in the footer. */
  footerText: '',

  /** Menu panel navigation. */
  navigation: [
    { label: 'Home', url: '/' },
    { label: 'Stories', url: '/blog/' },
    { label: 'Tags', url: '/tags/' },
    { label: 'About', url: '/about/' },
  ] satisfies NavItem[],

  /** Footer navigation. */
  secondaryNavigation: [
    { label: 'About', url: '/about/' },
    { label: 'Tags', url: '/tags/' },
    { label: 'RSS', url: '/rss.xml' },
  ] satisfies NavItem[],
};
