---
title: "Laya vs semif: A Local Router for Claude Code and Codex"
description: "I put a small local model in front of Claude Code, Codex and a local Qwen to pick the right model for each prompt. Laya and semif both decide in one forward pass. On my own 36 prompts, semif picked the right target 81% of the time and Laya 39 to 47%."
pubDate: 2026-09-23
author: "Ellert van der Vecht"
category: "DEEP DIVE"
tags: ["ai", "llm routing", "claude code", "codex", "local models", "mlx", "qwen"]
heroImage: "/images/laya-vs-semif/hero.webp"
source: "github.com/7ucardie/trivium (Python, MLX, semif 1f2dea3)"
draft: false
---

I pay for Claude Code and for Codex, and for months I sent almost every prompt to whichever frontier model happened to be open. "What does HTTP 409 mean" went to the same model as "find out why memory grows until the server is killed". Picking a model by hand for every prompt is just enough friction that nobody does it.

So I built [Trivium](https://github.com/7ucardie/trivium): one command, `ask`, with a small model on my own laptop in front of both tools. It reads the prompt, answers three typed questions about it in a fraction of a second, and sends the prompt down one of three roads: answered locally by a 4B model, opened in Claude Code, or opened in Codex, each on the tier the task needs. This post compares the two libraries I considered for that decision, Laya and semif, explains why I built on semif, and shows what the router got right and wrong on 36 prompts I labelled by hand. Everything was built and measured on an Apple M5 Pro in September 2026.

**Key Takeaways**

- semif reads option probabilities straight out of a stock Qwen3.5-4B, so it needs no training. On my 36 labelled prompts it picked the right target 80.6% of the time, in about 240 ms per prompt.
- Laya, a 421M-parameter encoder, answered the same three questions in about 100 ms but picked the right target only 38.9% of the time with its English checkpoint and 47.2% with its typed-decisions checkpoint. It rated almost every request "moderate". Its authors say it is a base to fine-tune, and that is what it is.
- Laya did beat semif on one question: whether a request needs your own files, where it scored 97 to 100% against semif's 81%.
- Rewording a single question moved semif from 72.2% to 80.6% right targets. Wording mattered more than any setting.
- The router belongs in a wrapper in front of both CLIs. Claude Code and Codex both choose their model at launch, and only a wrapper can cross vendors and add a local model.

## Why route prompts at all

The price ladder is steep, and most prompts don't need the top of it. Anthropic's list prices per million input and output tokens are $1 and $5 for Claude Haiku 4.5, $2 and $10 for Sonnet 5, $4 and $20 for Opus 5.5, and $10 and $50 for Fable 5.1 ([Claude pricing](https://claude.com/pricing), retrieved 2026-09-23). The top tier costs ten times the bottom one for every token, before you count the extra thinking a bigger model does on a question that didn't need it. Codex describes its own tiers the same way in its model list: gpt-6-luna is the "fast and affordable model for easier tasks", gpt-6-sol the "workhorse model for coding and everyday work", and gpt-6-astra "frontier intelligence for the most demanding work".

Routing is not a new idea, and the research says it pays. RouteLLM, a paper by Isaac Ong, Ion Stoica, Joseph Gonzalez and colleagues, trained routers that choose between a strong and a weak model for each query, and reported that routing "significantly reduces costs, by over 2 times in certain cases, without compromising the quality of responses" ([Ong et al., RouteLLM](https://arxiv.org/abs/2406.18665), revised February 2025). The volume these tools handle makes the saving worth having: in the Stack Overflow Developer Survey 2025, 84% of respondents were using or planning to use AI tools in their development process, and 51% of professional developers used them daily ([Stack Overflow](https://survey.stackoverflow.co/2025/ai), July 2025).

The part I wanted to get right is where the decision happens. A router that calls a hosted model to decide has already paid for one round trip before any work starts. Laya's authors call their model a "System 1" decision model, and the term fits: a fast, cheap, typed decision made before the slow, expensive model starts thinking. That is the job: a local model that reads a prompt and returns a probability for each option, quickly enough that I never notice.

## Laya and semif at a glance

Laya and semif take the same approach. Neither generates text. Both take a piece of evidence, a question and a list of options, and return a probability per option in one forward pass, so there is nothing to parse and no invented answer. They differ in what sits underneath.

[Laya](https://huggingface.co/convaiinnovations/laya) is a trained model. It puts a ModernBERT-large encoder under a small decision head, fills one mask token per option, and was trained with a reward that pays for honest probabilities. [semif](https://github.com/theoleecj/semif) is a technique. It asks an ordinary chat model, Qwen3.5-4B by default, to answer with the letter of one option, and reads the model's own scores for those letters from a single forward pass without generating anything.

| | Laya 0.3.7 | semif (commit 1f2dea3) |
|---|---|---|
| **What it is** | Trained 421M encoder with a decision head | Option-logit readout from a stock Qwen3.5-4B |
| **Input budget** | 512 tokens total on the English checkpoint, about 320 for the evidence | Qwen's context window, capped at 4,096 tokens by default |
| **Published speed** | 39.5 ms for one question on a T4 GPU | 1.023 s for 21 yes/no questions on an RTX 3090 |
| **Speed on my Mac, 3 questions** | 98 ms p50, PyTorch on MPS | 241 ms p50, MLX in bf16 |
| **Published quality without training** | 0.362 on its typed-decisions benchmark, below the 0.461 majority-class baseline | 0.813 balanced accuracy on 144 authored decisions; 0.845 agreement with the modal answer on a 102-row TypeSafe subset, where TypeSafe's hosted Jev scores 0.883 |
| **Right target, my 36 prompts** | 38.9% (English), 47.2% (typed-decisions) | **80.6%** |
| **Calibration** | Ships with fitted temperatures; the card recommends refitting on your own data | Uncalibrated; per-workload temperature scaling documented |
| **License** | Apache 2.0 | MIT |
| **Best for** | High-volume, clear-cut decisions once fine-tuned | Nuanced decisions with no training data |

*Published figures come from the Laya model card and the semif README at commit 1f2dea3, both retrieved 2026-09-23. The published quality numbers use different benchmarks and metrics and are not directly comparable. The two "my Mac" rows and the 36-prompt row are my own runs, documented in [evals/results/2026-09-23.md](https://github.com/7ucardie/trivium/blob/main/evals/results/2026-09-23.md).*

## Which one is accurate without training?

semif is, by a wide margin, because it borrows the general knowledge of a 4B chat model, while Laya has to learn each decision. Laya's own model card is candid about this. Its base checkpoints score 0.362 and 0.352 on the card's typed-decisions benchmark, below the 0.461 you get by always answering the most common label; the 0.766 headline comes from fine-tuning on that benchmark's training split. The card's words: "Laya is a fast base to specialise, not a zero-shot decision engine."

An independent run tells the same story from the other side. Brain function collapse tested the English checkpoint zero-shot on 500 labelled examples in September 2026 and found 93% on news topics and 96% on SMS spam, but 45% on six-way emotion, 65% on prompt-injection detection and 35% on five-level star ratings ([brain function collapse](https://brainfunctioncollapse.com/laya), retrieved 2026-09-23). Clear categories work; graded judgements don't. "How much work is this coding task?" is a graded judgement.

<!-- [ORIGINAL DATA] -->

I didn't want to settle it on published numbers, so I wired Laya into Trivium as a second backend and ran both on the same 36 prompts: the same three questions, the same rules, the same Mac, with the confidence thresholds switched off so each router is judged on its first choice.

![Grouped bar chart comparing semif with Qwen3.5-4B, Laya English and Laya typed-decisions on 36 prompts: right target 80.6, 38.9 and 47.2 percent; task kind 94.4, 69.4 and 80.6 percent; difficulty 80.6, 47.2 and 47.2 percent; needs files 80.6, 97.2 and 100 percent](/images/laya-vs-semif/chart-head-to-head.svg)

*Share of 36 hand-labelled prompts answered correctly by each router. Own measurement, Apple M5 Pro, September 2026.*

The difficulty column explains most of the gap. Laya answered "moderate" to almost every prompt, with probabilities between about 0.45 and 0.65, so the rules that send easy prompts to the local model and hard ones to the frontier tier almost never fired. Everything landed in the middle. The English checkpoint also read chat requests as code: "rewrite this sentence to sound less formal" came back as a code change at 0.83, and "write the changelog entry for the changes in this branch" at 0.86. The typed-decisions checkpoint, fine-tuned on other decision workflows, fixed part of the task-kind problem but none of the difficulty one.

Laya won one question outright. Asked whether a request needs the user's own files, repository or commands, it scored 97.2% with the English checkpoint and 100% with the typed-decisions one, against semif's 80.6%. semif's misses there were real: it decided "our p99 latency doubled after last week's deploy, find the cause" could be answered from general knowledge. A yes/no question with a clear answer is exactly the shape Laya is good at.

This comparison leans towards semif, and I'd rather say so than hide it. I tuned the question wording on these 36 prompts while using semif. Swapping Laya back to the original wording moved it from 38.9% to 41.7%, so the tuning isn't the whole story, but it is part of it. And nothing here tests a Laya fine-tuned on routing data, which is what its authors recommend.

**Verdict: with no training data, semif makes the better routing decisions. Laya is the better judge of simple yes/no questions and the stronger candidate once you have labelled examples.**

## Which one is fast enough?

Laya is faster, and for this job it doesn't matter. On my M5 Pro, Laya answered the three routing questions in 98 ms at the median and semif in 241 ms. Laya's card reports 39.5 ms for a single question on a T4 GPU. semif's README reports 1.023 s for 21 yes/no questions on an RTX 3090, against 5.332 s for the same model writing its answers out as JSON ([semif](https://github.com/theoleecj/semif), commit 1f2dea3).

![Lollipop chart on a log scale of time to a routing decision: Laya published 39.5 milliseconds for one question on a T4 GPU; Laya on an M5 Pro 98 milliseconds for three questions; semif on an M5 Pro 241 milliseconds for three questions; semif published 1.023 seconds for 21 questions on an RTX 3090; a hosted LLM with structured output about 4 seconds](/images/laya-vs-semif/chart-latency.svg)

*Time to a routing decision. The workloads and hardware differ per row, so compare orders of magnitude, not exact values.*

What matters is how the decision compares to the work that follows. Brain function collapse puts a hosted model's structured output for the same kind of decision at roughly 4 seconds. A Claude Code or Codex session takes seconds to answer a simple question and minutes to finish a real task. Against that, a quarter of a second is noise, and it is time the laptop spends, not the API. Laya's speed would matter where decisions are the whole workload: gating every message in a chat or email pipeline, or classifying thousands of items a minute.

The number I did have to design around is load time. semif loads Qwen3.5-4B, about 8.7 GB on disk in bf16, in 6.4 seconds on the M5 Pro. Paying that on every prompt would make the router slower than just picking a model by hand, so Trivium runs a small local server, `ask serve`, that keeps the model in memory, and `ask` talks to it.

**Verdict: Laya wins on speed by about 2.5 times on my machine. semif is still fast enough that you never wait on the router.**

## How I built the router

Trivium is one command, `ask`, in front of three roads. It builds a short piece of evidence from the prompt, asks the router three questions about it, looks the answers up in a rules table, and then either answers locally or starts the real `claude` or `codex` CLI with the chosen model.

![Flow diagram of Trivium: a prompt plus a sentence about the current repository goes to the router, semif with Qwen3.5-4B on MLX, which answers three questions; a rules table in targets.yaml picks a target or falls back to Claude Sonnet when unsure; the prompt then goes to the local Qwen, to Claude Code via claude --model, or to Codex via codex -m, and every decision is logged](/images/laya-vs-semif/architecture.svg)

The three questions are `kind` (quick answer, code change, debugging, review, design or writing), `difficulty` (trivial, moderate or hard) and `tools` (whether the request needs the user's files or commands). Three habits made them work, and they came from the integration guide brain function collapse wrote for Laya: ask what the text says rather than what to do, describe every option instead of giving bare labels, and turn facts into sentences. The router never sees a flag saying "in a repo". It sees "The request was typed inside the code repository 'trivium'."

The answers go through a rules table where the first match wins. The defaults send code to Codex and debugging, review, design and writing to Claude:

```yaml
rules:
  - when: {kind: [quick_answer, writing], difficulty: trivial, tools: none}
    to: local
  - when: {difficulty: trivial, tools: none}
    to: claude-haiku
  - when: {kind: code_change, difficulty: [trivial, moderate]}
    to: codex-sol
  - when: {kind: code_change, difficulty: hard}
    to: codex-astra
  - when: {kind: design, difficulty: hard}
    to: claude-fable
  - when: {difficulty: hard}
    to: claude-opus
  - when: {difficulty: trivial}
    to: claude-haiku

default: claude-sonnet    # no rule matched
fallback: claude-sonnet   # router unsure
```

If any answer falls below its confidence threshold, the prompt goes to the fallback, Claude Sonnet 5, instead of risking a wrong guess in either direction. This is what the decisions look like with the shipped configuration:

```text
$ ask why "what does HTTP 409 mean"
→ local (Qwen/Qwen3.5-4B) · quick_answer/trivial/none · 258 ms · rule 1
  difficulty trivial=0.98  moderate=0.02  hard=0.00

$ ask why "add retry with exponential backoff to the http client in server.py"
→ codex-sol (gpt-6-sol) · code_change/trivial/workspace · 258 ms · rule 3
  difficulty trivial=0.78  moderate=0.22  hard=0.00

$ ask why "plan the architecture for multi-tenant billing with usage metering, proration, invoices and dunning"
→ claude-fable (claude-fable-5-1) · design/hard/none · 261 ms · rule 5
  difficulty hard=0.98  trivial=0.01  moderate=0.01

$ ask why --via codex "plan the architecture for multi-tenant billing ..."
→ codex-astra-max (gpt-6-astra) · design/hard/none · 259 ms · rule 5
```

My favourite detail is the first road. The Qwen3.5-4B that routes is an ordinary chat model, so when the answer is "a trivial question, no files", the same weights answer it. One model in memory does both jobs, and "what does HTTP 409 mean" never leaves the laptop. For everything else, Trivium runs the real CLIs with `claude --model <id>` or `codex -m <id>`, so logins, subscriptions, skills and MCP servers work as they already do. The same property made [SitesDrop's MCP server](/blog/sitesdrop) pleasant to build: the assistant drives the tool I already use rather than a copy of it.

A few overrides cover the cases where I know better than the router. `ask --to opus` skips it entirely, `ask --via codex` keeps the routed tier but swaps the vendor, as in the last example above, and `ask rate bad --should opus` labels the last decision for later.

## What the router got right and wrong

<!-- [ORIGINAL DATA] -->

The router picked the right target for 29 of 36 prompts, and one reworded question did more for that than anything else. The test set is 36 prompts I wrote and labelled by hand, from "convert 72 fahrenheit to celsius" to "implement a write-ahead log with crash recovery for our key value store". Each prompt carries the answer I expect for each question, and a routing counts as right when the router's answers lead to the same target the labels would. I tuned the wording on the same set, so read the numbers as a direction, not a benchmark.

| semif + Qwen3.5-4B, default thresholds | Kind | Difficulty | Tools | Right target | Sent to fallback |
|---|---|---|---|---|---|
| Original wording | 94.4% | 66.7% | 83.3% | 72.2% | 5.6% |
| New difficulty and new tools wording | 94.4% | 80.6% | 72.2% | 75.0% | 2.8% |
| New difficulty wording only (shipped) | 94.4% | 80.6% | 83.3% | **80.6%** | 2.8% |

![Bar chart of right target for semif under three question wordings: original 72.2 percent, new difficulty and tools wording 75.0 percent, new difficulty wording only 80.6 percent](/images/laya-vs-semif/chart-wording.svg)

*Right target on 36 prompts by question wording. Own measurement, September 2026.*

The original difficulty question was "How demanding is the work the request describes?", with options such as "one obvious step that takes seconds of thought". The model rated too much as hard: a 1,500-word blog post and "review my uncommitted changes for bugs" both went to Opus. The shipped version asks "How much work would a skilled engineer need for this request?" and describes the options in time: "a quick answer or a small mechanical edit, done in a few minutes", "a focused task of up to an hour with a clear path", "hours or days of work, open-ended investigation, or many interacting parts". Difficulty accuracy went from 66.7% to 80.6%.

Rewording is not automatically progress. My rewrite of the tools question, which asked about "the user's own code, files, logs, machine or systems", dropped its accuracy from 83.3% to 72.2%, and its mistakes were the expensive kind: requests that need the repository were routed as if they didn't, towards the local model and Haiku. I kept the original.

The remaining misses share a pattern: the shipped wording underestimates effort. "Review my uncommitted changes for bugs" is now rated trivial at 0.68 and goes to Haiku. "The test test_via_keeps_tier fails with KeyError 'tier', figure out why" is rated trivial at 0.65. "Explain how Python's GIL works" is read as writing, rated trivial and answered locally, which is fine for a sentence and thin for an explanation. The original wording erred towards the expensive side, the new one errs towards the cheap side. Of the two, I prefer the cheap mistake: a Haiku answer that falls short costs me a retry with `--to sonnet`, while an Opus answer that wasn't needed costs money I never see back.

## Why a wrapper, not a plugin inside Claude Code

The decision has to happen before either tool starts, because that is when both choose their model. Claude Code takes `--model` and Codex takes `-m` at launch. Inside a running session, the only way to route is for the main model to hand work to a subagent, and by then the main model has already read the prompt. A router inside Claude Code also can't send a task to GPT, and one inside Codex can't send it to Opus, and choosing between vendors was half of what I wanted.

That doesn't make in-session orchestration pointless. [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode), with 39.3k stars on GitHub (retrieved 2026-09-23), runs teams of agents inside Claude Code, sends simple subtasks to Haiku and demanding ones to Opus, and can start Codex and Gemini workers in tmux panes. It solves a different problem. Trivium picks the door; a plugin like that organises the room once you're inside. The two work together: a Claude route from Trivium opens a session in which such a plugin is active.

The trade-off is granularity. Trivium routes once per task, not once per turn. When a task that looked easy turns out to be hard halfway through, I switch model inside the session myself, or start a fresh `ask`. Switching models mid-conversation throws away context and cached prompts anyway, so a decision per task is the right size.

## When I would pick Laya instead

Laya is the better tool when decisions are the workload rather than a step before it. At about 100 ms for three questions on a laptop, and 20 to 40 ms per question on a GPU, it can sit in front of every message in a support queue, an inbox or a chat, where semif's quarter-second and 9 GB footprint would add up. It is also the better choice for clear yes/no checks, where it beat semif in my own test, and for anything you can label a few hundred examples of: its authors publish a fine-tuning notebook and describe fitting temperatures on about 300 labelled examples, and their typed-decisions checkpoint shows what training on a workflow does.

The package is also more production-shaped. Laya ships a language-detecting router across its English and multilingual checkpoints, prebuilt question sets for triage, email, guardrails and routing, calibration hooks, and an HTTP server. semif is a phase-one research baseline with a scoring CLI, and Trivium wraps it in the pieces it lacks. If I had a few hundred labelled routing decisions today, a fine-tuned Laya would be the first thing I'd test against semif.

## What's next

The log is the plan. Every decision Trivium makes goes to `decisions.jsonl` with the full probabilities, and `ask rate` adds my verdict. Once there are a few hundred labelled decisions from real use, rather than 36 I wrote for a test, I'll fit a temperature per question to calibrate the thresholds, and fine-tune Laya on the same log to see whether a trained 421M encoder catches up with a stock 4B chat model. The obvious hybrid is also worth a run: ask Laya whether a prompt needs the workspace, and semif what kind of task it is and how hard.

The decision rule so far:

- **Choose semif** when you have no labelled data, the decision is graded rather than yes/no, and a quarter of a second is small next to what follows.
- **Choose Laya** when decisions are high-volume, the categories are clear-cut, or you can label a few hundred examples and fine-tune.

Trivium is open source under the MIT License at [github.com/7ucardie/trivium](https://github.com/7ucardie/trivium). It runs on Apple Silicon, needs about 9 GB of memory for the router, and includes the 36-prompt test set, so you can run `ask eval` on your own prompts and see where your numbers land.
