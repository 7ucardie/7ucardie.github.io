---
title: "Pensioen Dashboard: A Self-Hosted Pension Gap Planner in One HTML File"
description: "A zero-dependency Node and HTML dashboard that stacks AOW, work pension and savings by start age and shows what bridging early retirement really costs."
pubDate: 2026-09-09
author: "Ellert van der Vecht"
category: "DEEP DIVE"
tags: ["pension", "personal finance", "netherlands", "node", "dataviz", "self-hosted"]
heroImage: "/images/pensioen-dashboard/hero.webp"
source: "local project: pensioen (Node + single HTML page)"
---

Three pension sources, three start ages, one question: can I stop working at 65 instead of 68 without my income falling through the floor? My AOW state pension will start at 67 years and 3 months at the earliest under the current schedule, my employer pension at 68, and a small early pension at 65. No tool I tried showed those steps on one timeline next to the income I actually want, so I built one.

The result is a single HTML page served by a Node script of under 150 lines with no npm dependencies. It projects net monthly income by age, models any number of savings pots with their own returns, works out the "bridge" money needed until the full pension arrives, and writes every change to a JSON history file. This post walks through the model, the numbers it produced for an example case, and the design decisions behind it.

**Key Takeaways**

- In the Netherlands your retirement income arrives in steps: AOW at the state pension age, your employer pension at the scheme's own age, and anything private whenever you choose. A plan has to model each step, not one retirement date.
- For the example household in this post, stopping at 65 needs about € 100.000 to bridge 36 months, while stopping at 60 needs about € 310.000. Each year earlier adds a flat € 42.000 to the bridge.
- Saved from age 40 at a 3% return, that bridge costs roughly € 229 per month for a stop at 65 and € 907 per month for a stop at 60. The monthly cost rises faster than the bridge itself because there are fewer years to save.
- The whole tool is one HTML file, one Node script, and two JSON files. You can run it locally and never send your pension figures to anyone.

## Why one retirement date is the wrong model

Dutch retirement income arrives in layers that start at different ages, which is exactly what a single "retirement date" field cannot capture. The sector body Pensioenfederatie describes three pillars: the AOW state pension, which everyone who has lived or worked in the Netherlands builds up pro rata over their insured years; an occupational pension that the vast majority of employees accrue through their employer; and individual products for whatever is left ([Pensioenfederatie](https://pensioenfederatie.nl/the-dutch-pension-system/), retrieved 2026-09-09). Each pillar has its own start age and its own rules, so a plan needs one row per source.

The AOW age is 67 in 2025, 2026 and 2027 and rises to 67 years and 3 months for 2028 through 2031 ([Rijksoverheid](https://www.rijksoverheid.nl/onderwerpen/algemene-ouderdomswet-aow/aow-leeftijd), retrieved 2026-09-09). The law fixes each year's age five years in advance from CBS life-expectancy projections, and CBS explains the formula as eight months of extra AOW age for every extra year of remaining life expectancy at 65 ([CBS](https://www.cbs.nl/nl-nl/nieuws/2022/27/prognose-in-2035-vooral-meer-inwoners-in-en-om-grotere-gemeenten/aow-leeftijd), July 2022). For someone in their early forties today no official AOW age exists yet and none can before the mid-2040s, because the age for 2050, the year that cohort turns 67, is fixed in 2045. That is why the dashboard treats the AOW start age as an input you revisit every year rather than a constant, and why the change log matters.

The employer pillar is moving under our feet as well. The new pension law gives every fund until 1 January 2028 to switch, and on 1 January 2026 more than 9.5 million pensions, over half of all participants, moved to the new system in which a pension is based on the premiums paid in plus investment return rather than a promised accrual ([Rijksoverheid](https://www.rijksoverheid.nl/actueel/nieuws/2025/12/02/voldoende-tijd-voor-overgang-naar-nieuw-pensioenstelsel), 2 December 2025). In practical terms the amount on your pension statement will move with markets from now on. A tool that only stores this year's figure loses the trend; one that logs every revision shows it.

Not everyone has a second pillar to revise. CBS counted 765,000 employees, 11% of all employees, without any employer pension at the end of 2022, with the highest share among 21 to 35 year olds ([CBS](https://www.cbs.nl/nl-nl/nieuws/2024/25/aantal-werknemers-zonder-pensioen-afgenomen-met-bijna-20-procent), 18 June 2024). For them the savings pots in this dashboard are not a bridge but the main event, which is why each pot carries its own return assumption.

Knowledge lags the changes. A Nibud survey of 1,541 adults aged 25 to 67, run in February and March 2024, found that more than half know little to nothing about the new pension law ([Nibud](https://www.nibud.nl/nieuws/nibud-meeste-mensen-weten-nog-niet-wat-veranderingen-pensioenstelsel-betekenen/), 16 July 2024; sample details in the [Pensioenpeiling 2024 report](https://www.nibud.nl/onderzoeksrapporten/rapport-pensioenpeiling-2024/)). The Dutch financial regulator AFM estimated in May 2026 that about 800,000 households aged 35 to 67 hold savings above the recommended buffer yet accrue too little pension to keep their standard of living, and do not invest the difference ([AFM, Onbenut vermogen](https://www.afm.nl/~/profmedia/files/rapporten/2026/onbenut-vermogen-een-studie-naar-niet-beleggers.pdf), May 2026; summarised by [Reformatorisch Dagblad](https://www.rd.nl/artikel/1148227-afm-800-000-nederlanders-moeten-beleggen-voor-hun-pensioen), 7 May 2026). Engagement is rising, though: the government's quarterly pension monitor found that 58% of adults had looked at their pension in the previous six months in mid-2025, and 31% had changed something ([SZW Publieksmonitor](https://www.werkenaanonspensioen.nl/onderwerpen/feiten-en-cijfers), retrieved 2026-09-09). Looking is the easy part. The hard part is turning three statements with three start ages into one answer, and that gap is what this project fills.

## What the dashboard shows

![Six stat tiles on the Pensioen Dashboard: income at 65, full pension at 68, bridge money needed, time until stopping, savings pot at 65, and extra monthly saving needed](/images/pensioen-dashboard/dashboard-tiles.webp)

The top row answers the questions I kept asking myself. Income at the age I want to stop, split into pension and savings drawdown. The full pension once every source pays. The bridge money needed until then. A countdown. The size of the savings pot at the stop age, and the extra monthly amount that would close any remaining gap.

Below the tiles sits one chart: monthly net income by age, from today until 90. Pension income is a stepped blue line because each source switches on at its own age. Savings are green: faded while the pot builds up, solid while it pays out. The goal is a plain horizontal line. If the green sits below the line, there is a gap; if it sits above, there is a surplus.

![The income-by-age chart: a green savings line rising from today, a blue pension line stepping up at 65, 67y 3m and 68, and a white goal line at € 3.500](/images/pensioen-dashboard/dashboard-chart.webp)

Everything to the right is input. Birth month and year, official retirement age, current net income with a default raise and optional per-year raise periods, savings pots, the goal amount, and the stop age in years plus months. Change a number and the whole page recalculates while you type. Seven hundred milliseconds later it saves.

## How the projection works

The model is a month-by-month timeline from your birth month to age 90. Every month gets four numbers: work income, pension income, savings drawdown, and the savings pot balance. All the tiles and the chart are derived from that table, so there is exactly one place where the arithmetic lives.

**Pension sources** are rows with a label, a start age in years and months, a net monthly amount in today's euros, and an expected yearly growth. Growth stands in for whatever applies: indexation for AOW, return on accrued capital for a work pension. A source's amount at any month is today's amount compounded from now:

```js
function tierAmountAt(t, m, s) {
  const nowM = ageMonthsAt(new Date(), s);
  const years = Math.max(0, m - nowM) / 12;
  return t.amount * Math.pow(1 + t.growthPct / 100, years);
}
```

By default the rows add up, because they are separate contracts that keep paying. A toggle switches to "each amount is the total from that age", for people whose pension statement already includes AOW.

**Work income** runs from today until the stop age. It compounds monthly at the raise that applies to that calendar year. The default raise covers every year without its own row; a per-year schedule overrides it, so a 4% year followed by two frozen years is three rows, not a guess at an average.

**Savings pots** are rows too: amount today, contribution per month, yearly return. Each pot grows at its own rate until the stop age. A checkbox lets contributions scale with income, so € 150 on a € 3.800 salary becomes € 166 when the salary reaches € 4.200.

**The drawdown** is where it gets interesting. At the stop age the pots merge into one balance. The dashboard then computes the present value of every monthly gap between pension and goal inside the drawdown window, at the balance-weighted return of the pots, meaning a pot that holds 80% of the money sets 80% of the rate. Present value here simply means each future gap is shrunk by the return the pot would earn until that month, so € 3.000 needed in three years costs less than € 3.000 today. If the pot covers that present value, every gap is filled and any surplus is paid out evenly on top of the goal. If it does not, every gap is filled by the same percentage, so the shortfall is spread rather than hitting the last years hardest.

The drawdown window defaults to the bridge only: from the stop age until the last pension source starts. Once the full pension is in, the savings stop. That mirrors how I think about early retirement. You are not funding old age from savings; you are funding the years before the pension system catches up with you. A second option keeps drawing until 90 for people whose full pension still falls short of the goal.

## The real cost of stopping early

To show what the model does, I ran a fictional example household through it: born October 1985, goal € 3.500 net per month, an early pension of € 180 from 65, AOW of € 1.450 from 67 years and 3 months, and a work pension of € 2.200 from 68, the last two indexed at 1.5%. The figures are made up for the example and are not my own or anyone else's statement.

Two notes on the arithmetic. Bridge capital in the first chart is the plain, undiscounted sum of the monthly gaps, with the two indexed pension sources growing at 1.5% and the goal held flat, which is why every earlier year adds the same amount. The monthly-saving chart below it discounts those gaps at the 3% return before working out the contribution.

![Horizontal bar chart of bridge capital needed by stop age: about € 310.000 for 96 months when stopping at 60, € 226.000 for 72 months at 62, € 100.000 for 36 months at 65, and € 10.500 for 9 months at 67 years and 3 months](/images/pensioen-dashboard/chart-bridge.svg)

*Bridge capital by stop age, computed by the dashboard from the example inputs. Own calculation, September 2026.*

| Stop at | Bridge months | Bridge capital | Monthly saving from age 40 at 3% |
|---|---|---|---|
| 60 | 96 | € 310.109 | € 907 |
| 62 | 72 | € 226.109 | € 596 |
| 65 | 36 | € 100.109 | € 229 |
| 67y 3m | 9 | € 10.469 | € 22 |

Every year earlier adds € 42.000 to the bill, because each extra bridge year has the full € 3.500 gap for twelve months while nothing else has started yet. At 65 the bridge is 36 months and about € 100.000. At 60 it is 96 months and about € 310.000. Stopping at 67 years and 3 months, when AOW starts, leaves only the nine months until the work pension and about € 10.500.

Translated into a monthly saving from today, with 3% return on the savings, the picture looks like this:

![Lollipop chart of the monthly saving needed from today to fund the bridge at 3% return: € 907 to stop at 60, € 596 at 62, € 229 at 65 and € 22 at 67 years and 3 months](/images/pensioen-dashboard/chart-saving.svg)

*Monthly saving needed from today to fund the bridge, at 3% return. Own calculation, September 2026.*

Two effects compound here. Stopping earlier means a bigger bridge and fewer years to save for it. The person who wants to stop at 60 needs almost four times the monthly saving of the person who stops at 65, for a bridge that is only about three times as large. That relationship is the single most useful thing the dashboard taught me, and it is why the stop age is the first field I adjust when I open it.

## One HTML file and a very small server

The whole front end is `public/index.html`: styles, markup, and about 900 lines of plain JavaScript. There is no framework, no build step, and no chart library. The chart is SVG assembled from template strings. A ResizeObserver redraws it when the card changes size.

The server exists only so the data lives in files you can read and back up:

```js
if (url.pathname === '/api/settings' && req.method === 'PUT') {
  const next = JSON.parse(await readBody(req));
  const prev = readJson(SETTINGS_FILE, null);
  const history = readJson(HISTORY_FILE, []);
  const changes = prev ? diffSettings(prev, next, new Date().toISOString()) : [];
  history.push(...changes);
  writeJson(SETTINGS_FILE, next);
  writeJson(HISTORY_FILE, history);
  return send(res, 200, { settings: next, history, changes });
}
```

Node's built-in `http` module serves the page and two JSON endpoints. Writes go to a temporary file first and are renamed into place, so a crash mid-write cannot leave a half-written settings file. If you open the HTML directly without the server, it falls back to localStorage and the status badge in the header says so.

**The change log** was a requirement from day one. Pension amounts on a statement change every year, and I wanted to see how my expected work pension moved over time. The server flattens the settings object into labelled keys, including every pension source, savings pot, and raise period, and diffs the old and new versions on each save. Each difference becomes a history row with a timestamp, a human-readable label, and the old and new values:

```json
[
  { "ts": "2026-09-09T20:03:17Z", "key": "tier:t3:amount", "label": "Work pension · amount", "from": 2200, "to": 2280 },
  { "ts": "2026-09-09T20:03:23Z", "key": "savings:s2:monthly", "label": "Index fund · per month", "from": 150, "to": 175 },
  { "ts": "2026-09-09T20:03:26Z", "key": "goalAgeYears", "label": "Goal age (years)", "from": 65, "to": 62 }
]
```

The settings file calls the stop age the goal age, hence the last label. A year of statements later, that file is the trend line nobody else keeps for you.

![Pension source rows with label, start age, net amount and growth, next to the gap analysis card listing each source, the bridge capital and the savings pots](/images/pensioen-dashboard/dashboard-sources.webp)

## Design decisions worth stealing

**One axis, always.** Capital and monthly income live on different scales. My first attempt put the savings pot balance in a second panel under the income chart. It looked fine and read badly, because the eye kept trying to compare a € 100.000 pot with a € 3.000 income. The fix was to express the pot in income terms: the share of the first payout month that today's balance already funds. The green line now starts near zero today and lands exactly on the drawdown at the stop age, on the same axis as everything else.

**Colours that survive colour blindness.** The three series are blue for pension, orange for work income, and green for savings. I ran the trio through a colour-vision-deficiency checker script that simulates deuteranopia, protanopia, and tritanopia before settling on them, and a legend plus end labels mean no meaning depends on hue alone. Both light and dark mode have their own colour steps rather than a mechanical flip.

**Collapsible sections that also change the chart.** Birth date and official retirement age rarely change, so they fold away. Folding the income section also removes work income from the chart and its two tiles, which turns the page into a pure pension-and-savings view. That state lives in the browser, not in the settings file, because it is a viewing preference rather than a plan.

**A calculator in the header.** Half the numbers I type come from a pension statement plus or minus something. A small popover calculator with a hand-written expression parser, no `eval`, and Dutch number formatting saves a trip to another app. Press `c` to open it.

## How I run it

The code is not on a public repository yet, so treat this section as a description rather than a tutorial. The model in "How the projection works" and the snippets above are enough to reimplement the core in an afternoon, and I intend to publish the repository once the inflation and partner features below are in. The steps assume a copy of the project folder. You need Node 18 or newer (the server only uses the built-in `http` and `fs` modules; I developed it on Node 25) and nothing else.

```sh
cd pensioen
npm start
open http://localhost:3210   # or visit the URL in any browser
```

![The settings column of the dashboard with the collapsed situation and income sections, two savings pots, the drawdown horizon select and the goal fields](/images/pensioen-dashboard/dashboard-settings.webp)

On first load the page writes `data/settings.json` with defaults and a first history entry. Fill in your own figures from your pension statements: the net amounts, the start ages, and your goal. Add one savings pot per account or fund. Then move the stop age slider and watch the bridge tile.

The two JSON files are the whole state. Copy them to back up, delete them to start over, or version them in a private git repository to keep the history beyond what the dashboard logs.

## What it deliberately does not do

The dashboard works in net euros and today's prices. It does not model income tax on pension payouts, inflation of the goal, mortgage payoff, a partner's pension, or survivor benefits. Each of those changes the picture, and each is a checkbox I have not written yet. The growth fields are the escape hatch: a lower growth on a pension source approximates a real-terms view, and a higher goal at a later age approximates inflation.

It is also not advice. It is arithmetic on numbers you type in. The value is in seeing the arithmetic move when you change one assumption, and in having a log of how your own expectations shifted year over year.

## Frequently asked questions

### Does the dashboard work without the Node server?

Yes. Open `public/index.html` in a browser and it stores settings and history in localStorage instead of JSON files. The header badge turns amber to show you are in that mode. Start the server later and the first save moves your data to the files.

### Why does the savings line stop at 68 instead of continuing?

Because the default drawdown horizon is the bridge: from your stop age until the last pension source starts. Switch "Draw down the savings" to "until age 90" if your full pension is below your goal and you want savings to top it up for life.

### Can I model a pension whose amount already includes AOW?

Untick "Amounts add up". Each row is then treated as the total monthly income from that age on, replacing the previous row, rather than as a separate source that stacks.

### How accurate is the projection?

As accurate as the inputs. The compounding is exact, but every future number is an assumption you typed. Treat the results as a way to compare scenarios against each other, not as a forecast.

## Where this goes next

The next additions are an inflation setting that grows the goal over time, a partner column so two AOW entitlements and two pensions can be planned together, and a printable one-page summary. If you build your own version, start with the month-by-month table. Once every number on the page is derived from one array, every feature after that is a few lines.
