// Single place to brand the site. Every page reads from here.
export const SITE = {
  // Used for canonical URLs, sitemap, RSS, and Open Graph. Change before deploying.
  url: 'https://example.com',
  // Shown in the nav brand and page titles.
  name: 'BLOG',
  title: 'Blog',
  description: 'Write-ups on cloud, security, compliance, and the things I build.',
  author: {
    name: 'Ellert van der Vecht',
    bio: 'Cloud and security engineer at Schuberg Philis since 2011. Builds observability, compliance, and AI tooling for enterprise infrastructure. Gamer, father, builder.',
    url: 'https://www.evandervecht.nl',
  },
  // Links shown in the top-right of the nav and in the footer.
  github: 'https://github.com/evandervecht',
  nav: [
    { label: 'HOME', href: '/' },
    { label: 'BLOG', href: '/blog' },
  ],
  footerLinks: [
    { label: 'evandervecht.nl', href: 'https://www.evandervecht.nl' },
    { label: 'LinkedIn', href: 'https://nl.linkedin.com/in/ellert-van-der-vecht-1009b11b' },
    { label: 'GitHub', href: 'https://github.com/evandervecht' },
    { label: 'RSS', href: '/rss.xml' },
  ],
  // Default social share image (1200x630) used when a page or post has none. Lives in public/.
  ogImage: '/og-image.png',
  // Copy for the /blog index hero. The second line is rendered in the accent colour.
  blogHeading: ['GUIDES AND', 'WRITE-UPS.'],
  blogIntro: 'Practical write-ups from my projects: cloud infrastructure, security and compliance engineering, observability, and AI tooling.',
};
