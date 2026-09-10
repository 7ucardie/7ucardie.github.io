# blogs

A barebones static blog built with [Astro](https://astro.build). Dark palette (navy, deep teal, steel blue, graphite, white), monospace, typography-first layout modelled on claude-blog.md. Posts are plain markdown files, so content can be copied in from other repositories with no conversion.

## Run it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run preview  # serve dist/ locally
```

## Add a post

Drop a `.md` file into `src/content/blog/`. The file name (and any subfolder) becomes the URL.

```md
---
title: "Post title"
description: "One or two sentences for the card and meta description."
pubDate: 2026-09-09
category: "DEEP DIVE"        # optional label above the title
tags: ["astro", "seo"]       # optional, used for related posts
author: "Someone Else"       # optional, defaults to SITE.author.name
heroImage: "/images/x.webp"  # optional, put files in public/
updatedDate: 2026-09-10      # optional
draft: false                 # true keeps it out of production builds
source: "github.com/you/repo" # optional note on where it came from
---

Markdown body here.
```

The schema lives in `src/content.config.ts`. A build fails loudly if a post is missing a required field.

## Pulling posts from other repos

Copy markdown files into a subfolder per project, for example:

```
src/content/blog/
  project-x/
    intro.md          -> /blog/project-x/intro
    architecture.md   -> /blog/project-x/architecture
  project-y/
    release-notes.md  -> /blog/project-y/release-notes
```

Images referenced by those posts go in `public/` and are referenced with an absolute path like `/images/project-x/diagram.png`.

## Brand it

Everything site-wide is in `src/site.config.mjs`: site name, URL, description, author, nav items, footer links, and the blog index heading. Set `url` before deploying, since canonical URLs, the sitemap, RSS, and Open Graph tags derive from it. Update the sitemap line in `public/robots.txt` to match.

## Layout

```
src/
  site.config.mjs        site-wide settings
  content.config.ts      post schema
  content/blog/          posts (markdown)
  layouts/Base.astro     html shell, nav, footer, meta tags
  components/PostCard.astro
  pages/index.astro      home
  pages/blog/index.astro post grid
  pages/blog/[...slug].astro  single post
  pages/rss.xml.ts       feed
  lib/posts.ts           sorting, reading time, related posts
  styles/global.css      all styling (design tokens at the top)
public/                  static files served as-is
```

## Deploy

The build is fully static. Any static host works: Vercel, Netlify, Cloudflare Pages, GitHub Pages. Build command `npm run build`, output directory `dist`.
