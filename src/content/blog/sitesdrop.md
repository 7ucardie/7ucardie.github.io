---
title: "SitesDrop: Drop a Zip, Get a Website, for a While"
description: "One Go binary hosting temporary static sites and slide decks behind SSO, refusing uploads with secrets, and deleting each site when its countdown ends."
pubDate: 2026-09-09
updatedDate: 2026-09-10
author: "Ellert van der Vecht"
category: "DEEP DIVE"
tags: ["go", "static sites", "self-hosted", "security", "devops", "schuberg philis"]
heroImage: "/images/sitesdrop/hero.webp"
source: "Schuberg Philis SitesDrop (Go, v2.0.3, private repository)"
---

Every team I have worked with produces small websites nobody planned for: a dashboard for one review meeting, a docs preview for a pull request, a slide deck that has to be shared with people who do not have PowerPoint. They end up on a laptop, in a personal Vercel account, or in a file share where the CSS never loads. At Schuberg Philis I wanted the opposite of a hosting platform: a place where you drop a zip, get a URL on the company domain, and the site quietly disappears a week later.

[SitesDrop](https://www.sitesdrop.com/) is that place. It is one Go binary that is the server, the Windows or Linux service, the command-line client, a GitHub Action and a Model Context Protocol server at the same time. It issues its own wildcard certificate, checks every upload before it goes live, puts every site behind single sign-on, and treats every site as temporary by design. This post walks through why it exists, what happens between a zip and a URL, and the design choices I would make again.

**Key Takeaways**

- Sites on SitesDrop are temporary on purpose. Every site is deleted when its countdown ends, after 7 days by default and 30 days at most, so nothing you share is ever a permanent commitment.
- Everything you deploy is served to everyone who can open the site, so the pipeline refuses uploads that contain private keys, cloud credentials, `.env` files or hardcoded passwords. GitGuardian counted 28.65 million new secrets in public GitHub commits in 2025 alone, so the accident this guards against is common.
- The same `check` command runs the exact code the server runs, locally, before a single byte is uploaded. On a laptop it clears a 32 MB build in about a second and a half.
- A `.pptx` file becomes a real website: arrow keys, deep links to slides, speaker notes and print to PDF, with no PowerPoint on the viewer's machine.
- Ten immutable versions per site make rollback a metadata change. A personal API token acts as you, is never an administrator, and expires. The same token drives the CLI, the GitHub Action and an AI assistant.

## Why the sites are temporary on purpose

The best decision in the project was to make expiry the default instead of a feature. A site deployed without an explicit countdown is deleted after seven days. A deploy can ask for more, up to the operator's cap of 30 days, and the console and the CLI both say so on every upload. A background reaper sweeps once at startup, to catch expiries that passed while the process was down, and then every minute, deleting whole sites and freeing the name.

![The deploy card of the SitesDrop console: a yellow notice that sites are temporary and reachable from approved networks only, fields for site name, note, auto-destroy countdown and who can open the site, and a drop zone for a zip, an HTML page or a PowerPoint file](/images/sitesdrop/console-deploy.webp)

This changes the conversation around the tool. Nobody has to ask whether a preview is allowed to live on the company domain, because the answer is "for a week or two, then it is gone". Nobody has to remember to clean up. And nobody mistakes the platform for production hosting, which is what every internal "quick" host eventually becomes if you let it.

Deletion has a counterpart: history while the site is alive. Re-uploading an existing name creates a new immutable version and activates it. The last ten are kept, and rollback is a click, or one command:

```sh
sitesdrop versions quarterly-dashboard
sitesdrop rollback quarterly-dashboard
sitesdrop expire quarterly-dashboard 30d
```

![The site list in the SitesDrop console with the history of the quarterly-dashboard site expanded: three versions with deploy notes, the active one marked, and Activate buttons on the others](/images/sitesdrop/console-history.webp)

Because a version directory is never modified after activation, switching the active pointer is the whole rollback. It is also why the server can send strong ETags for every file: the content behind `version/path` cannot change, so a browser that already has it never downloads it again.

## What gets checked before a site goes live

The single most important property of the platform is also the easiest to forget: everything in the zip is served to everyone who can open the site. A key pasted into a config file during development becomes readable the moment the deploy finishes, and a site that has been made public shares it with the whole internet. So the pipeline refuses such uploads, and it refuses them before anything is written to disk.

This is not a theoretical accident. GitGuardian's State of Secrets Sprawl 2026 report counted 28.65 million new hardcoded secrets added to public GitHub commits in 2025, across roughly 1.94 billion public commits ([GitGuardian](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026/), 17 March 2026). The report calls that a 34% increase year over year; its restated 2024 baseline is not the 23.8 million the previous edition published, so the two absolute counts do not reproduce the percentage. The same report re-tested credentials it had confirmed valid in 2022 and found that more than 64% still worked in January 2026. GitHub's own scanning found more than a million leaked secrets in public repositories in the first eight weeks of 2024, which its engineers described as more than a dozen accidental leaks every minute ([GitHub](https://github.blog/news-insights/product-news/keeping-secrets-out-of-public-repositories/), 29 February 2024). A static site host that publishes whatever it is handed is one more place for the same mistake to land.

Here is what a refused deploy looks like from the CLI, using the AWS documentation's example key and a `.env` file dropped into a demo build:

```text
$ sitesdrop check ./leaky --name leaky-demo
checked ./leaky — 4 files, site name "leaky-demo"

✗ possible secrets — everything you deploy is PUBLIC:
    · .env file, not published: .env
    · AWS access key in assets/config.js:3 (AKIAIOSFODNN…)
    · hardcoded credential in assets/config.js:4 (apiKey: "sk-…)
  fix: remove them and rebuild. Only pass --allow-secrets if they are
       genuinely safe to publish.

1 problem(s) would prevent this deploy.
```

The console shows the same findings and adds a consent button, because the person uploading is the only one who knows whether a string is really a secret:

![The SitesDrop console refusing a deploy: a red panel titled Possible secrets detected, listing the .env file, an AWS access key and a hardcoded credential with line numbers, and a button labelled I understand, publish anyway](/images/sitesdrop/console-refused.webp)

### Precision over recall

Narrowness is deliberate here. The scanner has a list of named patterns with distinctive prefixes: private key headers, AWS keys starting with `AKIA`, GitHub tokens starting with `ghp_`, and SitesDrop's own tokens. The same list covers the GitLab, Slack, Stripe, Google, OpenAI, Anthropic, npm, SendGrid and Azure formats. It also has exactly one generic pattern, a `password`, `secret` or `api_key` assignment followed by a quoted string of at least eight characters, and that pattern is suppressed for obvious placeholders like `CHANGE_ME` or `<your-key-here>`. There is no entropy heuristic, because a false alarm costs a consent click on every deploy, and a scanner people learn to click through is worse than none.

That trade-off is real. The previous edition of GitGuardian's report found that 58% of the 23.8 million secrets it counted on public GitHub in 2024 were generic credentials, such as passwords and database connection strings, rather than recognisable API keys ([GitGuardian](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2025/), 11 March 2025). A prefix-based scanner catches the other 42% reliably and the generic majority only when it is written in the obvious form. The docs say so in plain words: the scan catches the common accident, a key pasted into a source file, and will not stop someone who is trying.

![Donut chart: of the 23.8 million secrets found on public GitHub in 2024, 58 percent were generic credentials and 42 percent were specific API keys a pattern can name](/images/sitesdrop/chart-secret-types.svg)

*Generic versus specific secrets in GitGuardian's 2024 public GitHub data. The scanner in SitesDrop names the specific kinds and covers generic ones with a single assignment pattern.*

Filenames are a finding on their own. A `.pem`, `.key`, `.p12` or `.kdbx` file, an `id_rsa`, a `.netrc` or a `.htpasswd` has no business in a published site regardless of its contents. So does a `.git` directory, which is reconstructible into the entire repository. Files starting with a dot are never published at all, with `.well-known` as the single exception.

### Making the scan cheap to run

The scanner also has to survive hostile input, because it runs on the server before extraction. Early on, every line was tested against fifteen separate regular expressions. The project's own profiling note records that a 228 KB zip of highly compressible single-line JavaScript cost 85 seconds of CPU while holding a deploy slot. Combining all patterns into one alternation, so Go's RE2 engine can reject most lines on their literal prefixes without entering the automaton, brought the cost from 418 ms to roughly 28 ms per MiB scanned. On top of that, lines over 4 KB are skipped, at most 1 MB of any single file is read, and the whole archive shares a 32 MB scan budget. When a budget runs out the result says so, instead of implying a clean bill of health.

I measured what that means for a normal build. On an Apple M5 Pro laptop running macOS 26.6.2, wall-clock time for `sitesdrop check` on folders of text-heavy JavaScript chunks, best of three runs and including the time to zip the folder, came out like this. The folders held synthetic chunks of about 220 KB each, one variable assignment with a 100-character random string per line, and each run timed the whole CLI process from a Python script, with the binary built from the v2.0.3 source using Go 1.27:

![Area chart of check time by build size: 0.21 seconds for 1 MB, 0.74 seconds for 4 MB, 1.30 seconds for 8 MB, 1.40 seconds for 16 MB and 1.57 seconds for 32 MB](/images/sitesdrop/chart-check-time.svg)

*Pre-flight check time by build size. Own measurement, September 2026, SitesDrop v2.0.3 built from source.*

| Build size | Files | Check time |
|---|---|---|
| 1 MB | 6 | 0.21 s |
| 4 MB | 19 | 0.74 s |
| 8 MB | 37 | 1.30 s |
| 16 MB | 73 | 1.40 s |
| 32 MB | 145 | 1.57 s |

Running the check locally means nothing surprises you after a slow upload. The CLI's `check` command and the server's deploy handler call the same package, so a folder that passes on your machine passes on the server.

## Un-built source, single files and PowerPoint decks

Secrets are the dangerous failure. The everyday failure is uploading the wrong thing: a zip of the whole project rather than its build output, which renders as a blank page. The pipeline recognises the shape of a project folder and says so:

```text
$ sitesdrop check ./app --name app

✗ this looks like un-built project source, not a built site:
    · index.html loads "/src/main.jsx" — browsers cannot run un-built .jsx files
    · the zip contains package.json and vite.config.js — it is a project folder, not its build output
  fix: run your build and upload the output folder (dist/, build/, out/),
       or re-run the deploy with --fix to pick it out automatically
```

The `--fix` flag finds the built site inside the archive and deploys that. A single wrapping folder like `dist/` is stripped automatically, and `index.html` at the root is mandatory. Beyond that the rules are the boring ones a static host needs: a 100 MB zip, 512 MB extracted, 20,000 files, and an optional `404.html`. Extension-less paths that miss fall back to `index.html`, so a single-page app survives a refresh on `/dashboard/settings`, while a missing real asset still returns a 404.

Two other inputs turned out to matter more than I expected. A single `.html` file is published as a one-page site, with a warning listing the local files it references that cannot come along. And a `.pptx` file is converted into a website: one page holding every slide, arrow-key and swipe navigation, `#slide-7` deep links, speaker notes behind the `n` key, and `Ctrl+P` printing one slide per page.

![A converted PowerPoint deck served as a website by SitesDrop: a slide titled What changed this quarter with four bullet points, and a footer bar with Notes, Read as page, previous and next buttons and a 2 of 3 counter](/images/sitesdrop/deck-slide.webp)

The conversion reads the deck's own theme for colours and font sizes and places shapes where they were on the slide. Charts, SmartArt and EMF pictures have no HTML equivalent and are reported rather than silently dropped. `sitesdrop convert deck.pptx --out ./site` writes the result to disk without uploading, so you can look first.

## One binary, many roles

The whole platform is a single statically linked Go binary. Run it as `sitesdrop server` and it is the platform. Install it with the shipped Windows installer or the systemd unit and it is the service. Run `sitesdrop deploy` and it is the client talking to the same REST API the console uses. Run `sitesdrop mcp` and it is a Model Context Protocol server an AI assistant can drive. Reference it as `schubergphilis/sitesdrop@v2` in a workflow and it is a GitHub Action. That decision has paid for itself many times: the pre-flight check can share code with the server because it is the server.

The binary's runtime dependencies fit on one hand: the standard library, the `golang.org/x` packages, the official Go SDK for the Model Context Protocol, and gopsutil for reading host metrics. Version 2.0.0, released on 8 September 2026, renamed the binary, the service, the release assets and the environment prefix from the older `sitedrop` to `sitesdrop`; the old `SITEDROP_` variables are still read as a fallback so nobody's CI breaks on upgrade.

SitesDrop runs as a Windows service today, because that is what the platform offered when it started, and ships as a systemd unit, a distroless container image and Kubernetes manifests from the same code. That matches where Go programs run in general: the Go team's 2025 developer survey of 5,379 respondents found that 96% deploy to Linux-based systems and 96% deploy to containers ([Go team](https://go.dev/blog/survey2025), 21 January 2026). It also matches where the people who use the platform already are. In the Stack Overflow Developer Survey 2025, 71.1% of respondents reported using Docker and 28.5% Kubernetes, while the hosted static platforms Vercel and Netlify were at 10.6% and 5.9% ([Stack Overflow](https://survey.stackoverflow.co/2025/technology), July 2025). Most teams already run a container platform and do not run a static host, which is the gap a small internal service fills.

![Horizontal bar chart of deployment tools used by developers in 2025: Docker 71.1 percent, AWS 43.3 percent, Kubernetes 28.5 percent, Cloudflare 20.1 percent, Vercel 10.6 percent, Netlify 5.9 percent](/images/sitesdrop/chart-deploy-tools.svg)

*Share of all respondents, Stack Overflow Developer Survey 2025. Docker and Kubernetes come from the survey's other-tools question, the rest from its cloud-platforms question.*

Requests are routed by hostname. A single label under the base domain is a site; the base domain itself, a raw IP or `localhost` reaches the management console, so the console works before DNS exists. Apart from sites an owner has deliberately made public, two reserved names are served without sign-in: `pitch.<base-domain>` serves one operator-supplied page that introduces the platform to colleagues who have no account yet, and `cli.<base-domain>` hands out the command-line client with checksums, so nobody needs access to the private source repository to install it.

Files are served through Go's `os.Root`, a kernel-enforced directory root, so even a symlink that somehow made it onto disk cannot escape the active version's directory. The zip extractor rejects path traversal, absolute paths, Windows-reserved names and case-colliding duplicates during the copy, not from declared sizes. This is the vulnerability class Snyk named Zip Slip in 2018 and found in thousands of projects across Java, JavaScript, .NET, Ruby and Go ([Snyk](https://security.snyk.io/research/zip-slip-vulnerability), 5 June 2018). Path traversal in general still sits at number six in MITRE's 2025 CWE Top 25 ([MITRE](https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html), retrieved 2026-09-09).

### Its own wildcard certificate

For a real domain the server issues and renews a Let's Encrypt wildcard certificate itself rather than depending on a proxy. It uses the DNS-01 challenge through the Cloudflare, Azure DNS or Route 53 API, because a wildcard can only be validated over DNS and because nothing needs to be publicly reachable to issue the certificate. One certificate covers `base` and `*.base`, which means two authorisations that share one `_acme-challenge` record with two different values, so both values are published before either challenge is accepted. Renewal runs about 30 days before expiry, and a failed renewal keeps serving the still-valid certificate.

The scale of the CA this leans on is hard to overstate. Let's Encrypt went from serving 492 million websites at the start of 2025 to 762 million at the end, issuing ten million certificates on some days ([Let's Encrypt](https://letsencrypt.org/2025/12/29/eoy-letter-2025), 29 December 2025). Google reported in October 2025 that HTTPS navigations in Chrome have plateaued at 95 to 99% ([Google](https://blog.google/security/https-by-defau/), 28 October 2025). An internal tool that served plain HTTP would be the odd one out on every screen.

## Who can do what

There is one authentication model and no modes. People sign in with Okta, or with Entra ID since version 1.1.0. Scripts and CI send a personal API token that a signed-in person minted in the console. That token acts as its owner, is never an administrator, and expires after 30 days by default and a year at most. Administrators are the members of a configured identity-provider group. A server with no identity-provider configuration refuses to start, unless it is run with a flag that disables authentication entirely, warns on every startup, and paints a permanent red banner across the console. The production instance adds a network gate on top: it is reachable from the office Wi-Fi and the company VPN only.

Every site is private by default: opening it needs a sign-in, and the per-site Access dialog can narrow it to specific identity-provider groups. A deliverable meant for people outside the company, a customer or a conference, can be made public with `sitesdrop access brochure public`, which asks for confirmation and spells out what it means. Public and group-restricted are mutually exclusive, only a deliberate separate step changes who can read a live site, and the operator decides whether owners may make sites public at all.

A site belongs to the person who created it. Only that person or an administrator can re-deploy, roll back, change the expiry or delete it. The earlier version of the platform had a mode that trusted the network, and it taught me the lesson that led to the current model. In that mode the token layer injected an administrator identity into every request that reached it, and any request carrying an `Authorization` header reached it. On a reachable instance, sending `Bearer anything` was a full administrator. The mode is gone and a configuration that still sets it fails to load. Verizon's 2025 Data Breach Investigations Report put compromised credentials at 22% of breaches as the initial access vector ([Verizon](https://www.verizon.com/business/resources/articles/credential-stuffing-attacks-2025-dbir-research/), 2025), which is reason enough to make sure a credential that expires is the only kind a script can have.

## Three ways to deploy without opening the console

The publish wrapper that ships with every release detects your package manager, runs the build, finds the output folder, zips it, checks it, and uploads only if the checks pass:

```sh
export SITESDROP_SERVER=https://sitesdrop.com
export SITESDROP_TOKEN=sd_xxxxxxxxxxxx
./publish.sh --name my-app --expire 14d
```

A pull-request preview needs no wrapper at all. The repository doubles as a GitHub Action, referenced by its floating major tag, that builds the CLI at that tag, runs the check and deploys, so a refused upload fails the step with the server's own words and nothing is published:

```yaml
- uses: schubergphilis/sitesdrop@v2
  with:
    server: https://sitesdrop.com
    token: ${{ secrets.SITESDROP_TOKEN }}
    path: dist
    name: my-app-pr-${{ github.event.number }}
    expire: 7d
```

The third way is an AI assistant. `sitesdrop mcp` turns the same binary into a Model Context Protocol server that runs on your machine with your token, so Claude Code can be asked to deploy the `dist` folder as a one-week preview, roll a site back, or explain what the secret scan says about a build. The safety rules are the interesting part. The assistant cannot mint tokens or reassign sites, because the token cannot. The two delete tools require a confirmation argument equal to the site name. A deploy the server refuses comes back as an error in the server's own words and is never retried with the force or allow-secrets flags. And making a site public is something the tool does only when a person explicitly asked for it, never on the assistant's own initiative.

## Design decisions worth stealing

**Refuse, then let the human consent.** A warning is ignored; a refusal with a specific reason and an explicit override is read. Secrets and un-built source can be overridden by the uploader. Hate speech, adult content and phishing pages cannot. They return a 422 and notify an administrator through the log, a persistent flagged-content queue and an optional webhook. Only a signed-in administrator can publish them anyway. Phishing detection is structural rather than word-based: a password field whose form posts to another domain, or a password field next to a third-party brand name, is what gets flagged, not the word "login".

**Make rollback a pointer swap.** Version IDs sort chronologically and directories are immutable once active, so activating an older version touches one JSON file. The registry is a single file behind a read-write lock, written atomically with a temporary file, an fsync and a rename. If the registry is lost, it is rebuilt from the directory layout. That is the same "everything is a file you can back up" approach I took in [the pension dashboard I wrote about earlier](/blog/pensioen-dashboard), and it holds up at tens to hundreds of sites.

**Never buffer a zip in memory.** Uploads are spooled to a size-capped temporary file, validated and extracted to a staging directory, and renamed into place. Every guard is enforced during the copy, so a zip that lies about its sizes is caught when it exceeds them, not when it declares them.

**Let the server watch its own host.** A `monitoring` block makes the server sample disk, CPU, memory and its own log every 30 seconds and post to the same Teams, Slack or JSON webhooks the acceptable-use alerts use, or send an email. One threshold per check, one alert when it is crossed, a reminder while it stays crossed, one message on recovery. It is not a metrics pipeline, and it does not try to be; it is the page that wakes someone up when the disk fills, on a box that has no other agent.

**Be honest about the boundaries you cannot fix.** Sites and the console share a registrable domain, so cookies set with a `Domain=` attribute by one site are sent to every sibling and to the console. The consequences land on tenants: a hosted site that keeps security state in cookies can be session-fixated by another tenant. The security page says this outright, together with the only real fix, which is a separate domain on the Public Suffix List. I would rather a reader plan around a documented limit than discover an undocumented one.

## Run it yourself

The source lives in a private company repository, so for colleagues the CLI comes from the Homebrew tap or from the `cli.<base-domain>` download page, and the server comes as a release package. Running a throwaway instance on a laptop takes one command and no configuration, because the zero-DNS `sslip.io` default turns your IP address into a base domain:

```sh
sitesdrop server --listen 127.0.0.1:8080 --data-dir ./data --insecure-open
open http://127.0.0.1:8080
```

The console shows the red development banner because authentication is off, and every site is reachable at a name like `my-app.sites.10-1-2-3.sslip.io:8080`, with your own address in the middle. The screenshots in this post come from exactly this setup, on version 2.0.3.

For a real installation the Windows package carries a guided installer that asks for a base domain and a TLS choice, and the Linux tarball carries the same for systemd. Upgrading is a binary swap. Either way, the config file holds the only static credentials on the box, and the server warns at startup if it is readable by other accounts.

## What it deliberately does not do

SitesDrop is not a hosting platform. There is no custom domain per site, no server-side code, no per-site environment variables, and nothing stays up longer than 30 days unless an operator raises the cap. Inside a site there is no per-file access control; visibility is decided for the site as a whole. Hosted pages get no Content-Security-Policy from the server, because it is the tenant's page and imposing one would break it.

The secret scan is best-effort. A secret split across string concatenation or base64-encoded passes. The content filter stops the careless and the obvious and will not catch someone determined to evade it. Both are documented as limits rather than guarantees, and the flagged-content queue plus site ownership are the real controls: they tell an administrator what to look at and whom to ask.

## Frequently asked questions

### What happens when a site expires?

The reaper deletes the site, all of its versions and its content, and frees the name. There is no recycle bin. Keep your source elsewhere, and re-deploy if you need the URL again.

### Can I extend a site that is about to expire?

Yes, up to the operator's cap. `sitesdrop expire my-app 30d` or the Expiry button in the console sets a new countdown. A plain re-deploy leaves the existing countdown untouched.

### Does the check run on the server too, or only in the CLI?

Both, and they are the same code. The CLI's `check` is there so a slow upload never ends in a refusal you could have seen locally. The server repeats every check on what it actually receives, whether the upload came from the CLI, the GitHub Action, an assistant or the browser.

### Why does a personal token never become an administrator?

Because a token is the one credential that lives in scripts, CI logs and laptops. Administration comes from identity-provider group membership, which cannot leak into a repository. The only static administrator credential is a break-glass token for an identity-provider outage, and the manual says to keep that list empty unless you need one.

## Where this goes next

The architecture notes list the next seams to open: federated cloud identities instead of long-lived credentials, secrets read from Key Vault or Secrets Manager, and a separate registrable domain for hosted content so the cookie boundary becomes real. If you build something like this, start with the expiry and the pre-flight check rather than the console. The countdown is what makes the platform safe to offer to everyone, and the check is what makes the uploads safe to serve.
