import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Every .md/.mdx file under src/content/blog becomes a post at /blog/<file-name>.
// Subfolders are allowed and become part of the slug (e.g. project-x/intro.md -> /blog/project-x/intro).
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    // Short label shown above the title, e.g. "DEEP DIVE", "RELEASE", "TUTORIAL".
    category: z.string().default('POST'),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),
    heroImage: z.string().optional(),
    // Set true to keep a file in the repo without publishing it.
    draft: z.boolean().default(false),
    // Which repo/project this post came from. Purely informational.
    source: z.string().optional(),
  }),
});

export const collections = { blog };
