import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Published posts, newest first. Drafts are excluded in production builds only. */
export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('blog', ({ data }) => (import.meta.env.PROD ? !data.draft : true));
  return all.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function readingTime(body: string | undefined): number {
  const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Up to `n` other posts sharing the most tags/category with `post`. */
export function related(post: Post, all: Post[], n = 2): Post[] {
  return all
    .filter((p) => p.id !== post.id)
    .map((p) => {
      const shared = p.data.tags.filter((t) => post.data.tags.includes(t)).length;
      const sameCat = p.data.category === post.data.category ? 1 : 0;
      return { p, score: shared * 2 + sameCat };
    })
    .sort((a, b) => b.score - a.score || b.p.data.pubDate.valueOf() - a.p.data.pubDate.valueOf())
    .slice(0, n)
    .map(({ p }) => p);
}
