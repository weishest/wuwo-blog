import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** A relative path to an image file (no scheme, image extension). */
const localImagePath = /^(?!.*:\/\/)\S+\.(jpe?g|png|webp|avif|gif|svg)$/i;

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      /**
       * Either a local image next to the post (while writing) or the
       * CloudFront URL that `npm run images:publish` writes here. The URL
       * option must stay first: the `image()` helper accepts any string, so
       * the preprocess step rejects values that are neither a URL nor an
       * image path (a typo would otherwise drop the cover silently).
       */
      cover: z
        .preprocess(
          (value, ctx) => {
            if (typeof value === 'string' && !URL.canParse(value) && !localImagePath.test(value)) {
              ctx.addIssue({ code: 'custom', message: 'cover must be a relative image path or an https URL' });
            }
            return value;
          },
          z.union([z.url({ protocol: /^https$/ }), image()]),
        )
        .optional(),
      coverAlt: z.string().optional(),
      /** Highlight the post (e.g. in a theme's home slider). */
      featured: z.boolean().default(false),
      /** Ask themes for a full-width presentation in lists (photo-theme uses it). */
      fullWidth: z.boolean().default(false),
    }),
});

export const collections = { blog };
