# CLAUDE.md: HereFishyFishy

Live handoff doc for any Claude session working on this repo (Claude Code, the
claude.ai app, or a scheduled task). Read it first. **Update "Current state" and
"Open threads" at the end of every session** so the next one can pick up cold.

Owner: TJ (GitHub `tnt007tarun`). He works mostly from an iPad, reviews Cloudflare
preview links, and merges PRs himself.

## What this is

herefishyfishy.ca is a free Ontario river fishing conditions app. For a river section,
species and date, it combines live flow (Water Survey of Canada gauges), weather
(Open-Meteo), lake temperature and the Ontario regulations. It then says whether to go,
where to stand, and what to fish. Around it are hand-written SEO pages (guides and river
pages) based on TJ's own fishing.

Deploy: GitHub `main` goes to Cloudflare Pages automatically. Every PR gets a preview
build, and the Cloudflare check on the PR links to it.

## Repo map

| Path | What it is |
|---|---|
| `index.html` | App markup only |
| `assets/conditions-core.js` | Config and the rules that rate and legalise water (river config, regs, seasons, closures, scoring). Pure: no DOM, window or fetch. Loaded before `app.js`, and bundled into the Worker (`globalThis.HFF_CORE`). Checks: `node worker/core.test.mjs`, `node worker/reads.test.mjs`, `node worker/parts.test.mjs` |
| `assets/app.js` | App UI and logic (~6k lines, one file, no build step) |
| `assets/app.css` | All app styling, in cascade layers. See `assets/README.md` |
| `functions/credit-river/[species].js` | Cloudflare Pages Function: server-rendered `/credit-river/{species}` pages |
| `guides/*/index.html`, `rivers/*/index.html`, `about/` | Hand-written static pages, each self-contained with its own `<style>` |
| `sitemap.xml`, `llms.txt`, `robots.txt` | Keep in sync when pages are added |
| `_redirects`, `_headers` | Cloudflare Pages config. They keep repo docs (`CLAUDE.md`, the READMEs) off the live site and out of search. Add any new repo-only doc to both |
| `images/`, `video/` | Photos (WebP for pages, JPG kept for og:image) and short clips |
| `worker/` | The `streamcast-proxy` Worker (flow, lake temps, stocking, subscribe, unsubscribe) and its `wrangler.toml`. Not deployed by Pages. See `worker/README.md` |
| `unsubscribe/` | Unsubscribe page (noindex). Talks to the Worker's `/unsubscribe` |
| `assets/signup.js` | The one signup box on guide, river, about and home pages (`<div class="hff-signup" data-kind="run|outlook|weekly" data-river="...">`). From October to April a `run` box offers the weekly steelhead email (`STEELHEAD_REACH`), run alerts as a tick box; the homepage box is `weekly` with river and fish pickers |

The Worker deploys itself: Workers Builds runs `npx -y wrangler@4 deploy` in `worker/` when a merge to `main` touches
`worker/*` or `assets/conditions-core.js` (since 2026-10-21; other branches upload a preview version only). By hand, deploy
only from `worker/` so `wrangler.toml` supplies the bindings. A deploy without them broke every signup from June to
October 2026. The old `Streamcast-worker` repo is disconnected; never deploy from it.

### Key structures (`conditions-core.js` unless noted)

- `RIVER_SECTIONS`: parent river mapped to its section names.
- `RIVER_CONFIG[section]`: gauge, flow sweet spot, species, `season` band, `regs`, `access[]`.
- `access[].closed[]`: date windows (`MM-DD` or a floating token like `FRI_BEFORE_4TH_SAT_APRIL`) when a spot is closed.
- `RIVER_REGS[river]`: the regulations panel text. Its `special[]` lines are parsed for dates.
- `ACCESS_COORDS[section]`: lined up **by index** with `access[]`. Keep both in the same order.
- `GUIDES`: the homepage guide cards. Add new guide and river pages here, ordered by season. `peak`/`on` months pick the
  up-to-4 cards shown; the rest go in the collapsed list. A local `img` needs a 480 px copy in `images/thumbs/` (same file name).
- `STAGING_ZONES`: river mouths used for the salmon staging model.
- `UPSTREAM_OF[section]`: the next reach upstream (geography only). Add new migratory sections to it.
- `waterTempFor()`: water temperature. Live CVC reading on the Credit (today), else `modelWaterTemp()` over 30 days of
  daily mean air plus the forecast to the trip date, with per-reach `waterModelParams()` (groundwater pull `gw`, memory
  `tau`; overrides in `WATER_MODEL_OVERRIDES`), else the old `waterTempEst()`. Label from `waterTempSourceText()`.
- `SECTION_DISPLAY[section]`: display name for a key that reads wrong on screen. `secLabel()` and `secShort()` use it;
  never split a section key yourself for display.
- `#bait-source` in `index.html` is hidden but **not dead**: `renderBaitPillar()` reads its cards to build the Bait pillar.

## House rules

### Never recommend closed water
- The source of truth is the **MNR 2026 Ontario Fishing Regulations Summary**. It's a doc in
  the claude.ai project. If it isn't available, ask TJ to attach the PDF. Never work from memory.
- Season bands: `all-year`, `extended` (4th Sat in April to Dec 31), `standard` (4th Sat in
  April to Sept 30). Sanctuaries go in `access[].closed`.
- Bands are for brown trout, rainbow trout (steelhead) and salmon only. **Brook trout close Sept 30 on every reach**:
  the Zone 16 and 17 extended and all-year exceptions don't name them (MNR 2026 pp. 118, 128). `SPECIES_SEASON_BAND`
  and `speciesSeasonClosureFor()` in the core; `speciesFishableIn()`, `sectionSeasonScore()`, `recommendSpecies()`, the
  hero's legal-season pass and the pill ("Closed for Brook Trout") use it (2026-10-29).
- Every species a river's sections list needs a matching `RIVER_REGS[river].species` row (`regsRowMatches()`), or the
  regs panel shows no summary and no limit for it. Rows come from the zone-wide table in the MNR summary unless an
  exception applies.
- `speciesFishableIn()`, `seasonClosureFor()`, `speciesSeasonClosureFor()`, `accessClosureOn()`, `allAccessClosed()` and
  `sectionClosedOn()` decide legality. Use them. Don't write a new check.
- Before changing seasons or closures, run a date-by-date check of every access spot against
  the regulations (see PR #60 for the approach).

### Migratory reach and lake-run browns
- A section's `species` list encodes the barriers: listing Steelhead or salmon means it is below the
  first impassable barrier (Norval on the Credit, Whitevale on Duffins, Milne Dam on the Rouge, below
  Bolton on the Humber). Researched river by river and confirmed by TJ on 2026-10-13.
- Brown Trout in such a section are **lake-run** (`isLakeRunBrownSection()`), unless the config sets
  `residentBrowns:true` (Saugeen headwaters). Their calendar is TJ's: Sep in on FMZ 17 rivers only,
  Oct-Nov fall run, Dec-Feb holding over (good), Mar-Apr spring run, May-Aug in the lake. Gear is
  float with roe, like steelhead.
- `getCurrentSeason(species, date, section)`: pass the section when it isn't the one being viewed.
- **Coho** are rare on the Credit, Bronte and Humber (TJ, 2026-11-02: they run mostly in the eastern tributaries), so
  those sections don't list them. `/credit-river/coho-salmon` 301s to `/credit-river/steelhead`. Run alert drafts for
  the Credit talk about steelhead only.

### One decision, one function
The most common bug in this codebase is duplicated logic drifting apart: the hero, the
Technique panel and the summary tile each kept their own rule and disagreed.
- Rating and legality live in `conditions-core.js` so the app and the Worker's emails share them. Score:
  `sectionSeasonScore()` (species, season, mouth or river, closures), plus drive time in `rankRivers()` (app), plus
  water via `conditionsScore()`. `scoreDay()` is the one-day version for emails. `scoreToConfidence().word` is the
  Conditions pill word. The pill rates the reach on screen on conditions only (no drive time, TJ 2026-11-02); `rankRivers()` still adds drive time to rank. Anything new there must stay free of DOM and window state.
- Gear wording: `bringPhraseFor(method)`; staging read: `stagingSectionFor()` + `stagingRead()`; modelled water
  temperature: `waterTempFromHistory()`. The hero, staging card and weekly email all call these.
- Gear and method: `methodSpeciesKey(section)` plus `salmonMethodMode()`. **Never read
  `selectedSpecies[0]` for a decision.** The user can select several species.
- If two parts of the UI show the same idea, they must call the same function.
- Display reads (2026-11-02): sky words and grade `skyRead()` (70% overcast, under 30% bright; `clsSky()` uses the same
  steps), water temperature `waterTempRead()` (value, "About" + whole degrees when modelled, tag, sentence), flow
  `flowRead()` (band word, gauge source and reading time), the Conditions pill `confidenceRead()`, the time to fish
  `fishingWindow()` (from the trip date's sunrise and sunset), and the hero's why lines `heroReasons()`. The tiles, the
  conditions columns, the Best Window card and the hero all call these; don't word one of those readings by hand.
- Recommended access spot: `bestAccessSpot(access, atMouth)`. The hero headline and the access cards both use it.
- Moving people to another reach: the hero's `_goto` (legal-season pass, then the upstream pass via
  `furthestUpstreamOpen()`). Both use the "See … →" button and `goToSection()`.
- Reach for "Best for species": `resolveAutoSection()`. With no species it uses `autoSectionNoSpecies()` (best-season
  species that is fishable on some reach, then the upstream rule); it never lands on a closed reach when one is open.
- Spinning picked with migratory fish in the river: `salmonMethodMode()` returns `'spin-float'` (float and roe on a
  spinning rod, TJ 2026-10-17). It stays on lures while staging, or while the calendar puts the fish at the mouth.
- Species when none is picked: `defaultTargetSpecies(cfg, wt)`, stored in `window._defaultTargetSpecies` before
  `updateMethods()`. The hero names it and `methodSpeciesKey()` falls back to it for the gear.

### Section names are keys
Names like `"Ganaraska River — Lower (Lake to CNR Bridge)"` are used in URLs, Umami
analytics and config, and the code splits on `' — '`. **Don't rename them.** Show them
on screen with `secLabel()`, which swaps in a middot. Access spot names use `·`, and the
short-name splits accept either character.

### Writing (TJ's preferences)
- **No em dashes** anywhere a reader can see: body text, meta, alt text, JSON-LD, app strings.
  A lone `—` as a "no data" placeholder in a number tile is fine.
- Avoid AI tells: "honest/honestly", "genuinely", "deliberately", "simply", "actually",
  "not X but Y", colon reveals, tidy closing lines.
- **No emoji in the interface** (TJ, 2026-11-03): plain ★ and ✓ marks are fine.
- **He is "TJ" on the site**, never "Tarun": bylines (`.meta` span), JSON-LD `author.name`, captions (TJ, 2026-11-02).
- Only TJ's stated facts go in first person. Don't invent where, when or how he caught something.
  Ask him.
- Guides and regulation copy stay plain and factual. Personal sections (the About page "Who I am",
  side stories) can use TJ's comic voice: mock-epic setups, bathos, a punchline to finish.
- Visible FAQ and FAQPage JSON-LD must match word for word. Generate one from the other.

### Assets
- YouTube thumbnails: `hqdefault.jpg` (`maxresdefault` doesn't exist for every video).
- Every `.vid-play` button needs `data-yt="<id>"` (the click script builds the embed from it) **and** the Umami
  `data-umami-event-video`. #72 swapped one for the other and every video showed "An error occurred" until #115.
- Photos: WebP, max 1200 px wide, quality 72. Keep the JPG for og:image and JSON-LD.
- Videos: compress (720p, CRF 28, `+faststart`), `preload="none"`, with a poster frame.
- Type (TJ, 2026-11-04): **Inter only**, everywhere, self-hosted (`assets/fonts/inter-latin-wght.woff2`, one variable file, 100 to
  900). No serif, no mono, no italic styling (`em` in prose may still slant). The app gets `@font-face` from `app.css`; every
  other page links `assets/site-type.css` (font plus the shared heading and body sizes, `html`-prefixed so it beats each page's
  own `<style>`). Numbers use `font-variant-numeric: tabular-nums` instead of the mono. No Google Fonts. New pages: add the
  preload and the `site-type.css` link before `</head>`, and use `Inter,system-ui,-apple-system,sans-serif` in any page style.
- Site icon: `favicon.svg` is the source: the leaping trout traced from TJ's logo, white with its pink stripe, on a
  logo-navy (`#0e2a4a`) circle (TJ's pick 2026-10-19; the earlier teal fish looked too much like Fishbrain's).
  `favicon.ico` (16/32/48), `icon-192.png` and `icon-512.png` are rendered from it; `apple-touch-icon.png` and
  `icon-maskable-512.png` use a full-bleed navy square with the trout inside the safe zone. Every page head carries the
  same four icon tags with `?v=3` (bump it when the icon changes). The app headers (landing and results) and every page masthead (guides, rivers, about, outlook, weekly, unsubscribe, the
  Credit SSR pages; 26 px, 22 px under 360 px, "Conditions" link hidden under 340 px) show `favicon.svg` too (TJ, 2026-11-04: one mark everywhere); `images/brand/logo.png` is no longer used on the site.

## Workflow

1. Branch from `main` (`claude/<topic>`). Never push to `main`.
2. Make the change. Edit HTML directly; the page builders used earlier were throwaway scripts.
3. Check before you open a PR:
   - `node --check assets/app.js`. For the Pages Function, copy it to a `.mjs` file and check that.
   - Serve the repo (`python3 -m http.server`) and render with Playwright at 390 px and 1280 px.
     Look for no horizontal page scroll and no `pageerror`. Look at the screenshot.
   - App logic: load real cases, e.g. `/?river=Lower%20Credit%20River&species=steelhead,chinook`,
     and compare before and after.
   - JSON-LD parses, the sitemap is valid XML, and there are no em dashes in visible text.
4. Open a PR. In cloud sessions `gh pr create` fails (GraphQL is blocked), so use
   `gh api repos/tnt007tarun/StreamCast/pulls -f title=... -f head=... -f base=main -F body=@file`.
5. The PR description says what changed, why, and what you tested. TJ merges.
   Avoid stacked PRs (a PR whose base is another `claude/` branch). If one is unavoidable, retarget it to `main` before
   TJ merges: #129 and #130 merged into their parent branches and never reached the site (fixed in #132, 2026-11-03).
6. After a merge, remind TJ to request indexing in Search Console for any new URL.

Cloud sessions can't reach herefishyfishy.ca or the gauge and weather APIs, so test with
the app's fallback data and say so. Local Claude Code can test against live data.

## Current state (updated 2026-10-26)

Merged recently:
- **#60** Regulations verified against MNR 2026. Closed-as-open spot/dates went from 25 to 0. Added `allAccessClosed()`.
- **#61** `/guides/steelhead-run-timing/`, plus the Credit steelhead SSR page rewrite.
- **#62** `/rivers/humber/` (Old Mill in fall, winter and spring; TJ's photos, video and redhorse clip).
- **#63** Em-dash and wording pass across the site; About page "Who I am" in TJ's voice; `secLabel()`; new homepage guide cards.
- **#64** Method pick looks at every selected migratory species. Steelhead now gets float fishing.
- **#66** "Closed to fishing" pill and drive verdict on closed water; headline no longer suggests all-access-closed
  sections; dead bait code removed; `hqdefault` thumbnails; Rouge Marsh removed; hero and cards share `bestAccessSpot()`.
- **#67** With no species picked, gear and headline follow one species (`defaultTargetSpecies()`), in-river and on
  staging days. Fixed "spinning gear and spinning" stutter.
- **#68** Lake-run brown trout (own calendar, float gear); steelhead stage from September; headlines for closed
  sanctuaries, out-of-season and unlisted species no longer fall through to "Head to <spot>".
- **#71** Regs panel by reach: `reachSeasons()` shows every reach's season band and whether it's open on the
  trip date (Details, plus a sentence in the summary). The species filter now uses `regsRowMatches()`, so
  "Chinook / Coho Salmon" rows show. Gear rules and C&R come from the reach config, not river-wide text (the
  lower Credit no longer says "artificial lures only"). Wrong `catchRelease` tags removed from the Lower Grand (C&R is Paris to
  Brantford only) and the Nottawasaga Lower Section (C&R is Boyne to Pine only; McKinnon Road is below the Pine, per TJ).

- **#72** Funnel tracking and honest signup handling (see "Analytics events" below). The notify bar used to
  show success and fire `Email Signup` even when `/subscribe` returned 500. It now checks `{ok:true}`, shows an
  error and fires `Email Signup Failed` otherwise.

- **#73** Unsubscribe: `/unsubscribe/` page plus the Worker's `/unsubscribe` (signed links, one-click headers).
  Worker source and `wrangler.toml` now live in `worker/`.
- **#74** Notify bar rides above the mobile keyboard (`visualViewport`), and its listeners bind once (opening a
  second river used to stack handlers, so one tap sent one signup per river viewed). Email footer has `SENDER_FOOTER`
  (deployed 2026-10-15).
- **#75** Clean Umami data: every tracker tag has `data-domains` (live domain only, so PR previews and local
  runs don't count), and `/?notrack=1` sets `umami.disabled` on that browser so TJ's own visits drop out (`=0` undoes it).
- **#77** New site icon (fish mark, TJ's pick 2026-10-16). The old icon was the full logo shrunk to 16 px and was
  invisible in tabs, and Google needs a square icon of 48 px or more for search results.
- **#78** Funnel from search pages into the app: a "Today's conditions" block (`.cond-now`, links tagged
  `placement: top`) right after the short answer on salmon-run-timing, steelhead-run-timing, winter-steelhead,
  where-steelhead-hold and the Bowmanville page. Fixed the salmon table's Bowmanville row (linked to `/`) and tracked the
  Credit row. Homepage guides: up to 4 in-season picks as cards, the rest in a collapsed "More guides" list; pictures
  are lazy `<img>` from `images/thumbs/` (480 px), so the section loads about 80 KB instead of 573 KB.
- **#80** Water temperature: live CVC readings on the Credit (today), a weather-memory model everywhere else
  (`waterTempFor()`), and the Credit SSR pages use the live reading. Worker `/water-temps` plus an hourly cron logging
  readings to KV `wt:log:*` (deployed 2026-10-16). First calibration on 4 CVC stations: mean error 0.4 °C (was 1.3 °C with
  the default curve; the old air-now rule ranged about 6.5 to 18 °C over that same day). Plan and sources: project doc
  `claude/water-temperature-plan-2026-10-16.md`.
- **#79** Upstream reach suggestion (TJ's rule, 2026-10-16): in `upstreamWindowOn()` dates (Oct 1 to Dec 31, and
  the trout opener to May 31, TJ), the hero adds a link and
  "See … →" button to the furthest reach upstream that is open on the trip date for a migratory target species
  (`furthestUpstreamOpen()` over `UPSTREAM_OF`). Suggest, not switch (TJ's choice). The Ganaraska town reach displays as
  "Port Hope Town Reach (Jocelyn St to CNR)" via `SECTION_DISPLAY` (key unchanged). The regs summary now says other
  reaches are "open" on the date instead of quoting their season band, which hid the Sep 1 to Oct 14 closure.
  "Best for species" (`resolveAutoSection()` / `bestSectionForSpecies()`) follows the same rule: it skips reaches where
  the species isn't fishable on the trip date, and for steelhead and salmon in the same window moves up via
  `furthestUpstreamOpen()`. Steelhead was missing from two species-label maps (`_sm`, `_sm2`), so a steelhead search
  showed "Any Species" and skipped the species seasonal check.
- **#81** Regs panel Details: the season-by-reach table is an aligned two-column list (`.rr-row`: name and
  "This reach" tag; open/closed on the date plus the season band). On multi-reach rivers the species rows drop the
  river-wide season text and season notes, which repeated the reach table vaguely or wrongly; species and limit stay.
  Fixed the Ganaraska steelhead note ("Extended season applies at lower Ganaraska" was wrong).
- **#82** Regs rows filled from the MNR 2026 zone-wide rules where a listed species had none: Chinook/Coho on the
  Credit and Black Creek, Rainbow (Steelhead) on the Humber, Rainbow on the Eramosa, Brook on Bronte, Sixteen Mile
  (Zone 16, S-5/C-2), Duffins and Wilmot (Zone 17, S-2/C-1). The regs panel is now plain-English bullets
  (`buildRegsBullets()`, TJ's ask 2026-10-17) instead of S-x/C-x codes, a grey summary and a legend: open or closed on
  the trip date for this reach, "Keep up to N … a day with a Sport licence, or M with a Conservation licence" per
  species (or catch and release on C&R reaches), the FMZ 16/17 aggregate only when it adds something, artificial-only
  when the reach config says so, and the bait zone rule. A closed reach shows only the closed bullet. The
  season-by-reach list sits behind "Season by reach +". `filterAndSummariseRegs()` (given the section) still feeds the
  hero chip.
- **#83** "Best for species" with no species picked returned the first section in the list
  (Upper Credit, closed after Sep 30). Now `autoSectionNoSpecies()`. Spinning plus salmon or steelhead in the river now
  gets float fishing on a spinning rod (hero, Technique panel, gear kit) instead of spinners. `buildGearSetup()` takes the
  species from `methodSpeciesKey()`, not `selectedSpecies[0]`.
- **#85** Hero float wording: "centrepin or spinning rod with float gear" instead of "float rod and bait". Float
  gear box offers a centrepin for resident trout too, with lighter line (4 to 6 lb main, 3 to 4 lb leader) and #12 to 16
  hooks (TJ: centrepin works for trout, lighter terminal tackle); steelhead and lake-run browns get the heavier kit.
- **#86** Subscription routes (TJ, 2026-10-17). See "Email list" below. One ask per page: the app's notify bar
  picks one offer (`notifyOffer()`), and every guide, river, about and home page has one `.hff-signup` box
  (`assets/signup.js`): run alerts on salmon and steelhead pages, the monthly outlook elsewhere. On salmon-run-timing and
  steelhead-run-timing the box sits mid-article, right after the timing table (`data-placement="mid"`, TJ 2026-10-19);
  everywhere else it is at the end. No leave-the-page popup until there's data (TJ). Fixed a 9 px horizontal
  scroll on `/rivers/` at 390 px (run table).
- **#88** Site icon: the trout from TJ's logo on navy (see Assets). Icon links bumped to `?v=3`; manifest
  theme colour navy, plus a maskable icon.
- **#89** `assets/conditions-core.js`: config and the scoring and legality rules moved out of `app.js` verbatim (58
  declarations), so the Worker can score weekly alert emails with the same code. New shared `sectionSeasonScore()`,
  `conditionsScore()`, `scoreDay()`, `driveVerdict()`; the two copies of the drive verdict now call it. No behaviour
  change: 8,784 `rankRivers` cases (54 sections, 8 species picks, every other day of 2026) and 4,032 verdict cases match
  the old code exactly. Step 1 of project doc `claude/weekly-alerts-plan-2026-10-20.md`.
- **#90** Weekly conditions email (`worker/weekly.js`, see `worker/README.md`):
  Thursday 5 pm Toronto, Fri to Wed scored with `scoreDay()`, one email per person listing combos with a Good or
  Excellent day on open water, `ALERTS_MODE=preview` (TJ gets the preview) until TJ sets `live`. Caps (TJ, 2026-10-20):
  one weekly email and one run alert per person per 6 days; only someone with both gets two emails in a week; trip-day
  and the monthly outlook don't count. Signup: notify bar checkbox under run alerts, own offer on trout-only rivers
  (Eramosa, Speed); `/subscribe` takes `weekly: {section, species}`. Also moved to the core and shared with the app:
  `salmonMethodMode()` (takes `section`/`dateStr`), `bringPhraseFor()`, `stagingRead()`, `stagingSectionFor()`,
  `waterTempFromHistory()`. The app takes `?date=YYYY-MM-DD` in deep links.

- **Don River** (TJ asked, 2026-10-21; asked for on r/torontourbanfishing): two sections split at the regs line, Chinook
  only (TJ). `Lower Don River (Lake to Eglinton)` is `all-year` (Todmorden Mills/Pottery Rd, Crothers Woods, E.T. Seton);
  `Upper Don River (Eglinton to Hwy 407)` is `extended` (Charles Sauriol on the East Don, Sunnybrook on the West Don). MNR
  2026 Zone 16; no Don waterbody exceptions or sanctuaries. Gauge `02HC024` (Todmorden; base flow about 4 m3/s, flashy);
  `02HC005` (West Don, York Mills) and `02HC056` (East Don, Thornhill) exist but aren't used yet. No mouth spot or staging
  zone: the new Port Lands mouth is left out (TJ). Run timing a little after the Humber (TJ), only stated in spot text.
  Added to the run-alert lists (app, signup box, Worker). Also fixed the closed-reach headline repeating its reason.

- **Credit flow ranges** (TJ, 2026-10-24): set from 2015 to 2025 daily flow. Sweet spot = flow 4 to 5 days after a rain
  bump (middle half of 50+ bumps, TJ's rule of thumb), too low = driest 5% of fishing-season days, blown out = top 3%.
  Upper (Cataract 02HB001) 1.4 to 2.8, low 0.9, high 5; Middle moved to **Norval 02HB025** (its spots are at or below
  Norval; Cataract at the Forks carries a third of the water and sat under 5 on 95% of days) 4.5 to 9, low 2.5, high
  19; Lower (Streetsville 02HB029) 6 to 13, low 3, high 30. Same numbers in `RIVERS_DB`, `DEFAULT_RIVERS` and the
  Credit SSR routes. The flow bar's axis end now shows the river's `flowHigh` (it said "20+" for every river). Flow only,
  no water level line (TJ). Method and the 7-day flow forecast backtest: project doc
  `claude/flow-forecast-research-2026-10-24.md`.
- **Flow ranges, every river** (TJ marked them up, 2026-10-24): same method on 2015 to 2025 daily flow, prime = 2 to 3
  days after a rain bump on creeks, 4 to 5 on rivers. 38 active sections changed in `RIVER_CONFIG` and `RIVERS_DB`.
  Kept as they were (TJ): Credit (already done), Upper Grand tailwater, Lower Grand, Lower Humber, Lower Nottawasaga,
  Lower Saugeen, each on its old gauge. New gauges: Duffins on **Ajax 02HC049** (it read the Rouge gauge 02HC022;
  Duffins above Pickering 02HC019 has history but no real-time data), Black Creek 02HC027, Lower-Mid Humber Weston
  02HC003, Upper Humber Palgrave 02HC047, Nottawasaga headwaters Hockley 02ED026 and middle Baxter 02ED003, Ganaraska
  upper Osaca 02HD003, Speed Armstrong Mills 02GA040, Upper Beaver Vandeleur 02FB013, Wilmot upper Leskard 02HD021
  (too low under 0.2, TJ). Middle Beaver is TJ's custom 9 to 20, blown over 21. Review page: artifact "River Flow
  Ranges" (`decisions` collection). Inactive sections (Middle Humber, Black Creek Concrete Channel, Middle Grand,
  Middle Saugeen) were not reviewed.
- **Flow forecast** (TJ approved 2026-10-24): estimated flow 1 to 7 days out on future trip dates. Worker
  `/flow-forecast?station=` (`worker/flowforecast.js`, model `worker/flowmodel.json`, fit by `tools/flowmodel_fit.py`,
  weather from `tools/flowmodel_fetch.py` in GitHub Actions; see `worker/README.md`). Served from KV `flowfc:<gauge>`,
  refreshed by the hourly cron (a third of the gauges each hour) so page views never call Open-Meteo. 22 of 27 gauges;
  no estimate for Grand below Shand Dam, Beaver near Vandeleur, Wilmot (both gauges) and Bowmanville (they didn't beat
  "flow stays as it is"). App: flow card and summary tile only (`fetchFlowForecastDay()`, `renderFlowEstimate()`); days 1
  to 2 show a number and range, days 3 to 7 a range and band. On days 1 to 2 the estimate can pull the Conditions pill
  (and so the drive verdict) down, never up, and the pill then reads "Potentially tough/marginal" (TJ, 2026-10-24):
  `rateWithFlowEstimate()` and `confidenceWord()` in the core, used by the pill and the staging card's re-rate.
- **Upstream switch, species label, email look** (TJ, 2026-10-25):
  - In `upstreamWindowOn()` dates the app now **opens** the furthest open reach upstream instead of suggesting it
    (`autoUpstreamSection()`, run at the top of `renderResults()` so there's one render). Not when the staging
    headline would apply (picked run species out of season at a mouth). A small line under the headline says it moved,
    with "Stay on the …" (`_upstreamStay`, per page load). The hero's upstream pass no longer adds a sentence to the
    headline (it had grown too long); after "Stay" it only shows the See button. Replaces "suggest, not switch" (2026-10-16).
  - Deep links (emails, guide buttons) now set `selectedSpeciesLabel`, so the banner says "Steelhead", not "Any Species".
  - Every subscriber email (welcome, trip day, run alert, weekly) goes through `brandEmail()` in `worker/emailshell.js`:
    navy header with the trout icon and the name as text, white card, preheader. Previews to TJ stay plain.
- **First monthly outlook sent** (November 2026, 2026-10-26, Resend broadcast): best steelhead dates by region from
  AccuWeather plus the flow rule, TJ's note and photo (`images/email/outlook-2026-11-steelhead.jpg`, #103). Layout is now
  `tools/outlook-template.html` (#105): one column, no fixed widths, because the two-column version ran wider than the
  screen in Gmail on Android (TJ checked the new one in Gmail). The "Monthly outlook draft" task copies it each month.
  #104: contacts are opted out of the outlook topic unless they ticked it (the topic's opt-out default).

- **Find my best spot fixes** (TJ, 2026-10-27; a Toronto steelhead search landed on the Lower Don, which has no
  steelhead). (1) Race: the city picker refreshes the nearby list on a 280 ms timer and set `selectedRiver` to the
  nearest river; on iPhone the change fires as the button is tapped, so the timer ran after the search and replaced
  its pick. `goToResults()` now runs a pending timer first, and `updateRivers()` leaves the pick alone while results
  show. (2) The search ranked only the 6 nearest sections (`getRivers()` cap), so a species missing from those 6 fell
  back to a river without it; it now ranks every section in the travel range (`getRivers(loc, max, Infinity)`; chips
  still show 6). (3) Toronto drive times: Lower Credit 20 to 30 min, Sixteen Mile lower 20 to 35 (Oakville harbour), so
  Toronto steelhead lands on the Humber. Checked 448 city/species/date cases: no pick misses an open option in range.
  Toronto drive times from TJ (2026-10-27): Lower Humber and Lower-Mid Humber (Old Mill) 10 min, Upper Humber 40,
  Lower Don 20, Upper Don 40.
  Upper Grand (Fergus/Elora): Toronto 60, Guelph 20, Kitchener 20 (TJ); the rest of its row estimated (the old row
  was copied from a Mississauga-area river and put the Grand 25 min from Toronto).
  Drive time audit (2026-10-27): every active section's times checked against straight-line distance (x1.3 road
  factor, 75 km/h). Corrected the rows that were far off: Lower Credit from Hamilton, Markham, Vaughan, Ajax, Pickering,
  Oshawa; Upper Credit from Milton, Guelph, Pickering, Clarington; Sixteen Mile lower from Pickering, Whitby,
  Bowmanville; Ganaraska from Whitby and Bowmanville (Bowmanville was 10 min); Upper Ganaraska from Cobourg (was 40).
  Estimates, for TJ to adjust. The Upper Don (Toronto 40) confirmed by TJ 2026-10-29.

- **Signup boxes, round 2** (TJ, 2026-10-28; mockups approved in chat). Umami, last 30 days: app bar 121 shown, 3 real
  signups (about 2.5%, sticky-bar average); page boxes 64 seen, 0 signups (embedded-form benchmark about 4%). Most box
  views: homepage, Humber, salmon-run-timing, Bowmanville. Changes: copy "Stop guessing / Each week, get the best
  steelhead days on <river>, with where to stand and what to bring. / Picked from live river flow and the week's rain,
  temperature and cloud forecast. / Send me the best days / Only sent when there's a good day. Free, no account,
  unsubscribe anytime." From October to April every `run` box (river and guide pages) offers the weekly steelhead email
  for the river's reach in `STEELHEAD_REACH` (all-year reach where there is one), with "Also send run alerts" (posts
  `kind: run` plus `weekly`); August and September keep salmon run alerts; the Don keeps run alerts (no steelhead).
  Homepage box: `data-kind="weekly"`, river and fish pickers (`pickSection()`: open today, then the longest season),
  "Also send the monthly outlook". Homepage badges under the headline (Free, No account, Live river gauges) were
  replaced on 2026-11-01 by a one-liner in `.hero-sub` (shown on phones too). Shortened 2026-11-02 (TJ: one line
  of title and at most two of subtitle on phones, so the form starts higher): h1 "Where to fish today." and "Live river
  data and regs for trout and salmon. Plan before you drive." "Plan before you drive" is desktop only
  (`.hero-sub-more`, hidden under 600 px; TJ: redundant on phones). Checked at 360, 375 and 390 px.
  Same day, phones only: the gap above "Method" (form-top padding, tech-section padding and the label margin) cut from
  about 48 to 7 px; "Find my best spot" starts at about 716 px on a 390 x 844 screen (was 840). "Fish with a buddy?" box (`shareBox()` in `worker/emailshell.js`) above the
  footer of the weekly email, the welcome email and `tools/outlook-template.html`. Umami `offer` is now also `weekly`,
  `weekly+run`, `weekly+outlook`. Judge it on signups per Signup Box Seen, 4 to 6 weeks before and after.

- **Trout after Sept 30** (TJ, 2026-10-29): `/guides/trout-after-september-30/`, a river-by-river table of what stays
  open for brown and rainbow trout after Sept 30 (every row from the MNR 2026 text, pp. 13, 117 to 129), brook trout
  closed until the opener (April 24, 2027). In the guides index, sitemap and llms.txt; not in the homepage `GUIDES`
  cards. Found while writing it: the app rated brook trout fishable Oct 1 to Dec 31 on Sixteen Mile Upper West Branch
  (`extended`); fixed with `speciesSeasonClosureFor()` (see House rules). Then TJ confirmed the reach is mostly above
  Hwy 407, so it is now `standard` (closes Sept 30 for all trout). Checked against main for every reach, species and
  day of 2026: only that reach changed, Oct 1 to Dec 31.

- **Species chips on the form** (TJ, 2026-10-30; first try #117 closed, TJ didn't like greyed tiles and a hint line):
  every tile gets a word chip top right (Prime, Good, Slow, In lake, Closed) and tiles are ordered best first, left
  to right. Closed tiles stay tappable. `formSpeciesStatus()` in the core: TJ's half-month calendar `FORM_SEASON_CAL`
  (from the "Species Season Calendar" artifact; his blanks = slow) on reaches in the travel range that are legally
  open that day (`speciesSeasonClosureFor()`, `allAccessClosed()`; lake-run browns use their own row). Steelhead
  reaches also count for the Rainbow Trout tile, at Slow at most (TJ: always a chance at a rainbow or two down low).
  `updateSpeciesGrid()` in `app.js` reruns on date, city and range changes. **Form only for now (TJ):** ratings and
  ranking still use `SPECIES_SEASONS`. Before switching them over, handle eastern tribs (Ganaraska, Bowmanville)
  getting Chinook a bit earlier (TJ).

- **Monthly outlook page** (TJ, 2026-11-01, for his YouTube intros): `/outlook/` shows this month's outlook as a
  calendar (best dates per region: West, Central, East, plus forecast rain and snow days), date chips into the app
  (`&ref=outlook`), TJ's note and photo, closures, and how the dates were picked. Same content as the monthly outlook
  email. One URL, replaced each month (no archive yet). The "Monthly outlook draft" task opens a PR updating it on the
  26th; TJ merges on the 1st. In the sitemap, llms.txt and the guides index.
  Homepage: a "See this month's best dates by region" link, moved 2026-11-03 from the hero to under the "Find my best spot" button (`.hero-outlook` in `.form-bottom`, `?ref=home`,
  Umami `Outlook Link Clicked {placement: form}`, was `hero`). Not a `GUIDES` card: its month strip and season status don't fit
  a page that changes every month (2026-11-01).

- **Add to home screen** (TJ, 2026-10-31): `site.webmanifest` is `standalone` (full screen from the home-screen icon,
  scope `/`), and every page has the Apple web-app meta tags after the manifest link (add them to new pages). The
  homepage shows a one-time hint on phones from the second day someone visits (`maybeInstallHint()` in `app.js`):
  Share > Add to Home Screen steps on iPhone/iPad, an Add button on Android Chrome (`beforeinstallprompt`), menu
  wording on other Android browsers. Never on results, deep links, in-app browsers or desktop; x hides it for good;
  stops after 3 showings. `?a2hs=1` forces it for testing. No service worker or offline cache on purpose (a stale
  cache would serve an old `app.js` after a fix). Store apps (Capacitor) later, once the web app is stable (TJ).

- **Bronte late-season video** (TJ, 2026-11-01): `wzk3Ex5294I` on `/rivers/bronte/`, right after the run table (the
  November row). It opens with the /outlook/ page; the caption links there. Its YouTube description links the outlook,
  Bronte page, salmon float tips and /weekly/ with `?ref=yt`.

- **Sky note** (TJ, 2026-11-02): the Temperature & Light note under the sky strip used the cloud reading right now
  ("Clear. Fishing is hard until 8:30 AM, then expect it to die." at 7 am) while the strip and Best Window card used
  the 8 AM / 12 PM / 6 PM forecast. `skyDayNote()` now words the note from the same forecast (70%+ overcast, under 30%
  bright, like Best Window), and the headline value says "now" on today's date.

- **Compact header on phones** (TJ, 2026-11-02, from the home-screen app): logo and name on one row with the nav, the
  "South Ontario" line hidden under 600 px (header about 100 px to 52). Tighter under 380 px; "Conditions" (links to
  `/`) hidden under 340 px so 320 px screens fit. `_headers` now sends `Cache-Control: no-cache` for `/assets/*`: TJ's
  iPhone showed a new `index.html` with a stale `app.css`.
- **Coho off the west and central rivers** (TJ, 2026-11-02, after a Credit run-alert draft led with "peak coho"):
  Coho removed from Lower Credit and Bronte lower and mid (the Humber never listed them); copy on the Credit, Bronte,
  Humber and salmon-run-timing pages follows. The "Run alert drafts" task has a species rule (Credit: steelhead only).

- **Phase 1, recommendation trust** (2026-11-02, from the UX audit): the hero's `#tp-why` was emptied on every render;
  it now shows two or three reasons from `heroReasons()` (season window, mouth note from `sectionSeasonScore()`, flow,
  water temp), only under a headline that sends the reader out. The best window was fixed clock times (6 to 9 AM and
  6 to 8 PM, after dark in November) and the headline said "Fish Morning"; it now comes from Open-Meteo's daily
  `sunrise`/`sunset` for the trip date (`fishingWindow()`), and says when the sun data or the weather is missing. The
  period choice is the old rule. Sky grades were 20, 25, 30 or 40 depending on the panel; now 70/30 everywhere (display
  only: `liveConditionsScore()` keeps its own steps, rankings unchanged). With no weather the page used to model the
  water and sky from a stand-in 12 °C and 50%; it now says there is no data. Modelled water shows "About 10°C ·
  Modelled"; a live CVC reading keeps one decimal. The flow card shows the gauge and the reading time in Toronto time
  (it printed WSC's UTC timestamp as local). The warm-water early-hours rule applies to trout only.
  Follow-up the same day (TJ): no live flow today, or no weather, the pill makes no call: "Conditions: Unknown · no flow
  reading" (`conf-unknown`, neutral) and the drive verdict "~ Not rated. Check the gauge before you drive"
  (`driveVerdictShown()`); the score and rankings are unchanged. Why lines word the season as an expectation from the
  calendar ("Fall return season for steelhead is under way"), never as fish seen in the river (the app has no counts).
  The hero, the fishing window, the water wording, the water tile and the why lines all use the fish the headline
  names (`speciesReads()` in `app.js`, called again once `buildTopPick()` settles the species). Today's window shows
  only what is left ("Now to about 9:50 AM"); once it is over the hero says so and gives tomorrow's window from
  tomorrow's sunrise and cloud (today's Open-Meteo call now asks for 2 days); the picked date never changes.
  Decided by TJ the same evening: (1) flow trend copy reads direction against the band (`flowTrendRead(trend, band)`,
  `FLOW_TREND_TEXT`): a river dropping through prime is the usual good day, a rise is coloured water; same idea in the
  default routine step, the staging run chip and headline, and the streamer card. (2) Winter run fish: steelhead and
  lake-run browns in their open season score 3 to 4 °C like 4 to 8 °C (+1), 1 to 3 °C 0 (very cold, TJ 2026-11-06), below 1 °C stays -3 (`tempContext()`,
  `coldTolerantFish()`, `COLD_RUN_MIN`); the water reads "Cold" in amber. (3) The 18 °C advisory and its -3 are for
  trout only (`troutHeat`); salmon get "well above the feeding range". Both go through `liveConditionsScore(..., ctx)`
  and `conditionsScore(..., ctx)`: the app's pill (fish the headline names) and the weekly email (`scoreDay()`); with no
  fish named the old steps apply, so rankings and the landing cards are unchanged.
  (4) Peak winter (TJ): in January and February `fishingWindow()` gives late morning through the afternoon (10 AM to
  4 PM, cut at sunset; `WINTER_MIDDAY_MONTHS`, `WINTER_WINDOW`) whatever the cloud, because the sun warms the water a
  little and wakes the fish; the sky note then describes the sky only. December and March keep the sky rules.
  Checked: 20 rendered cases (four seasons, gauge down, live flow, no weather, staging, closed reach, deep link, a
  fallback species, after sunset) match `main` on river, species, technique, gear, bait, access spot and regs.
- **Signup boxes mid-page + scroll depth** (TJ, 2026-11-03): Umami, 7 days, box seen / page views: where-steelhead-hold 0 of 24,
  don 0 of 7, winter-steelhead 2 of 19 (11%), ganaraska 17%, bowmanville 18%, humber 22%, bronte and salmon-run-timing 31%,
  steelhead-run-timing 50% (mid). End boxes sat at the bottom of the page, so the box moved to mid-article
  (`data-placement="mid"`, after the first main section or table) on where-steelhead-hold, winter-steelhead, humber, bowmanville,
  bronte, ganaraska and don (now 24 to 48% down the page). `assets/signup.js` also sends `Scroll Depth {page, depth: 25|50|75|100}`
  once each per page view (not on the homepage). Offer check (2026-11-03): every box matches its page; the Don's run-alert box says "salmon" only (no steelhead reach). Salmon pages (salmon-run-timing, float tips, Bowmanville and Ganaraska salmon pages) offer the weekly steelhead email from October to April by TJ's 2026-10-28 rule. Re-check in 3 to 4 weeks: seen / views per page, mid vs end, and where depth drops.

- **Phase 2, mobile results polish** (2026-11-02, stacked on #128): go headlines name the place ("Head to <em>Erindale
  Park</em> on the Lower Credit River."); when to fish and what to bring sit on their own lines (`renderHeroLines()`, the
  fish named only when the species banner doesn't already say it). The email signup bar (every results page) keeps
  its fixed bottom spot and 300 px scroll trigger but is about two thirds the height on phones (title and close on one
  row, a short note from the offer's `subShort`, 44 px field and button, 16 px input so iOS doesn't zoom, safe area);
  while it shows, `reserveBarSpace()` pads the results page so the end of the page scrolls clear of it. "How this was
  rated" under the pill (replaced by the Phase 3 tile tags below) used `conditionsParts()` (the score is now the sum of
  `liveConditionsParts()`; `worker/parts.test.mjs` checks 806,400 cases against the old functions). Results labels 12 px minimum (`#results { --fs-label: 12px }`), condition tiles two by
  two on phones. When and Bring are serif, 1.1rem, with a teal label above and a teal left rule (TJ picked option E, 2026-11-02). The all-day window reads "Sunrise to sunset (…), with cloud cover all day".

- **Phase 3, conditions-only pill** (TJ, 2026-11-02, stacked on #129): the Conditions pill rates the reach on screen
  with the same inputs as the weekly email, `sectionSeasonScore(section, the fish the headline names, date, section)`
  then `conditionsScore()`. It used the top-ranked river's `rankRivers()` score, which includes drive time and the method
  bonus and can belong to a different reach; that double-counted drive time with the verdict chip. The "Worth the drive"
  chip and `driveVerdict()` are gone (drive time stays as plain text; the "est. from city centre" line was dropped, TJ 2026-11-03); "How this was
  rated" is gone too. Each tile (Water, Sky, Flow) now says how its reading moved the rating: "Helps the rating", "No
  effect", "Holds it back", or the flow cap ("Caps the day at Marginal/Tough"), from `ratingEffects(conditionsParts(...))`
  in the core. No line when the reading wasn't scored (future date with no flow, run days where the run strength decides).
  The why lines (`#tp-why`, from `heroReasons()`) moved from under the pill to below the tiles, under a "Notes" heading
  (`#tp-notes`, hidden when there are no lines; TJ 2026-11-03).
  `rankRivers()` is unchanged apart from dropping its `parts` field; rankings and the landing cards are the same. Checked
  48 rendered cases against #129: same pill word, headline, gear, access spot and regs.

- **Phase 3b, pill label, note and tile tags** (TJ, 2026-11-03, on #130): the pill reads "Conditions here: Excellent / Good /
  Marginal / Tough" (`confidenceRead()`), so it is clearly about the reach on screen and not the destination pick. When the
  pill is Marginal or Tough, `#tp-limit` (under the pill) says what holds it down and whether that reading is measured,
  modelled or estimated: `limitRead()` in the core (cap first, then a negative water step, then a weak or fair run, then flow
  below prime, then the calendar). "Picked for season and distance." is added only when the app chose the reach from a
  search (`window._pickSource === 'search'`, not after an upstream move, a chip tap, a deep link or a redirect).
  Never shown for Excellent, Good, Unknown or closed. `renderPillNote()` in `app.js`, state in `window._pillState`, redrawn
  after the drive line and the staging re-rate. Tile tags (`ratingEffects()`): under a flow cap, a good Water or Sky reading
  says "Flow cap overrides" instead of "Helps the rating"; run days say "Not used for run rating" (Water, Sky) and "Not used
  at the mouth" (Flow, fish in the lake); a future date with no flow says "Not scored for this date"; a missing reading says
  "No data, not rated" (neutral, never "Holds it back"). Scoring, ranking, regs and species logic unchanged (8 rendered
  cases match #130 apart from the label).
- **Phase 3c, alternative reach** (TJ, 2026-11-03, on #130): a compact "Consider another nearby reach" section (`#tp-alt`)
  under the pill and its note, with the existing "See ... →" button (`goToSection()`). Rules (all TJ): only when today's
  pill is Tough, or Unknown because the primary gauge is down while weather is fine (the card then says conditions here
  are unrated because the gauge is not reporting, no comparison); never on future dates; the alternative must be Good or
  Excellent, at most 20 minutes farther to drive than the primary (20 allowed, 21 not), one only, same fish as the
  headline. Core (`conditions-core.js`): `alternativeMode()`, `alternativeCandidates()` (resolves each reach to its final
  upstream reach with `upstreamMigratoryWant()`, dedupes, then `sectionClosedOn()` and `speciesFishableIn()`),
  `rateReachToday()` (same chain as `scoreDay()`), `pickAlternative()`, `alternativeText()`. App (`updateAlternative()`):
  each candidate is rated on its own gauge, its own weather and its own water read; reliable means live flow no older than
  3 h, weather present, and a real water read; otherwise nothing is shown. A missing live lake temperature does not block it (the seasonal estimate is used, as in the primary pill; TJ 2026-11-03). No
  live CVC water for alternatives (modelled). Ranking, pill scoring, regs and fishing windows are unchanged. Umami:
  `Alternative Reach Shown {river, alt, rating, primary}` (once per river/alt/species/date) and
  `Alternative Reach Clicked {river, alt}`. Tests: `worker/reads.test.mjs`.
- **Voice and emoji pass** (TJ, 2026-11-03, from the Nov 2 UX audit, Phase 2): no emoji in the interface (mode toggle, notify bar,
  stocking heading, species and conditions summaries, landing cards, Navigate links, the drive line). Plain ★ and ✓ marks stay.
  The Pre-Trip Routine card is gone from the results page (`cfg.routine` stays in the config: `rankRivers()` gives it a +1 score
  bonus, and removing it would change rankings); the condition columns are now two. "Weekday fishing is significantly quieter"
  removed. Float tip is TJ's wording: "Cast upstream, keep the line off the water, set the hook when the float stops or drops."
  Gear cards: "Fish it anywhere, always", two "Deadly" lines and "When nothing else works" were not TJ's words and are now plain.
  TJ reviewed the other gear superlatives (2026-11-03) and kept them as written: Hard Bead is "top producer, especially in clear water"
  (his words); Roe Bag, Soft Bead, Little Cleo, Vibrax and Woolly Bugger stay as they were. Dead `icon:` fields in `RIVER_REGS` and `RIVER_CONFIG`
  (📋 🚫 💧 🔁) are not rendered; left alone. Audit phases still open: 3 (visual system) and 4 (homepage photo and river-page Today strips).

- **Visual system, quick wins** (TJ, 2026-11-03, audit Phase 3, PR 1 of 2): the results header uses `logo.png` instead of the
  three-line `.res-logo-wave` (it read as a dead menu button); section numbers (`.sec-num`) and pillar numbers (`.p-step`)
  are gone from the markup and `app.js`; pillar labels (`.p-lbl`) are sentence-case sans. Dead CSS for the removed pieces is
  left in place. Next in Phase 3 (TJ picked): fonts (Source Serif 4 for headings and hero, Outfit for UI, JetBrains Mono for
  numbers only, Nunito dropped). TJ did not pick the dark tile strip or the results reorder for now.
- **Visual system, fonts** (TJ, 2026-11-03, audit Phase 3, PR 2 of 2; app only, guides and river pages carry their own styles):
  Source Serif 4 leads `--font-serif` (headings, hero sentence; Charter and Georgia stay as fallbacks), Outfit is the one UI
  sans (Nunito is gone from `app.css` and the Google Fonts link), JetBrains Mono is for numbers only. The 58 label rules that
  were tracked mono capitals are now sentence-case Outfit (`text-transform:none`, no tracking), and the drive line and the
  Top Bait tile word (`.tp-word`) use the sans. Guides and river pages keep their own system fonts for now. Still open from
  the audit's Phase 3: dark tile strip, results reorder (TJ did not pick them), and the 49 inline `style=` attributes in `index.html`.

- **Results type system** (TJ, 2026-11-03: "so much happening in terms of fonts, sizes, sections"): the last block of `@layer overrides`
  in `app.css` gives the results page named roles. Serif (Source Serif 4): display 24 (hero headline), heading 20 (section and card
  heads), title 17. Sans (Outfit): body 15, note 13 muted, label and chip 12 (600, sentence case). Mono: the number itself only
  (`.bnum`, `.tp-tile-val`, gauge axis numbers). Colours: `--t-ink`, `--t-body`, `--t-muted`, teal for good, amber for caution,
  white on the dark tile strip. Whole-page count of distinct text styles went from 58 (11 sizes, 15 colours) to about 40.
  New results markup should use these roles, not a new font, size or colour. Left for later: the dark tile strip and 49 inline `style=`.

- **Sky card** (TJ, 2026-11-03): "Temperature & Light" is two cards. Water temperature (`#temp-dot`, the water read) and Sky & light
  (`#sky-dot`; cloud cover, the 8 AM / 12 PM / 6 PM strip, Best Window). The old combined dot averaged both, so each card now takes
  its own `clsTemp()` / `clsSky()` class. Three cards across on desktop (`#results .cgrid`), one column under 900 px.

- **Home form order and search routing** (TJ, 2026-11-03): Target species is now the second block of the form, then Method, then the
  button; spacing is one 1.1rem rhythm (`.form-species` in `app.css`). Search used to land on a reach closed or unlisted for the
  fish asked for (Vaughan + Rainbow Trout opened the Upper Credit, closed after Sept 30, and the hero read as if TJ had chosen
  a river). Now `goToResults()` checks the pick with `legalSpeciesFor(section, species, date, needSeason)` (core: listed,
  season band, access not all closed, fish not "absent" that time of year). If it fails, `pickLegalReach()` takes the best reach
  that is open for the fish: in the travel range first, then every reach we cover (TJ: "irrespective of distance"). Steelhead
  water counts as Rainbow Trout water (TJ, 2026-10-30); when only steelhead is open the search runs as Steelhead and a line under
  the headline says why (`window._speciesNote`). If resident rainbows are open only far away and steelhead is 20+ min closer,
  the line offers the steelhead reach with a See link. Checked 224 city/species/date cases against main: 19 differ, all
  rainbow (now steelhead water) or coho (main picked reaches that don't list coho).

- **Weekly email by river, several picks** (TJ, 2026-11-03): the homepage weekly box and `/weekly/` pick whole rivers
  (up to 3, `MAX_WEEKLY_RIVERS`) and any fish on them, as tappable chips (`weeklyPicker()` in `assets/signup.js`, also
  `window.HFF_weeklyPicker` for `/weekly/`). `/subscribe` takes `weekly` as one entry or a list; entries are
  `{river, species}` or the old `{section, species}` (`weeklyEntries()` in `worker/weekly.js`; newest first, oldest
  rivers dropped past 3 at signup only). The Thursday run scores a river on the reach the app would open for that fish
  on Friday: `reachForRiver()` in the core (`bestReachForSpecies()`, moved from `app.js` `bestSectionForSpecies()`
  unchanged, 2,448 river/species/date cases match, plus the upstream rule). The steelhead boxes on river pages and the
  notify bar still save a reach. Welcome email lists the fish and rivers (`weeklyWhat()`).
  River chips show the 8 most used first (`TOP_RIVERS`: Credit, Humber, Bronte, Bowmanville, Ganaraska, Duffins, Rouge,
  Sixteen Mile, from Umami app picks), the rest behind "More rivers (9)" (TJ, 2026-11-03); a prefilled other river opens the list.
  Pages load `/assets/signup.js?v=3`: TJ's browser kept an old cached copy after #137 (no picker on `/weekly/`). Bump `v` when
  `signup.js` changes in a way pages depend on.

- **Phase 4, home photo and river-page Today strips** (TJ, 2026-11-03, audit Phase 4): the home hero has TJ's Humber chrome
  steelhead (`images/hero/home-steelhead.webp`, 1100 px crop around the fish, 61 KB) as the background of `.hero-photo`, under a dark wash with white
  text, so it adds no height (form still starts about 206 px on a 390 x 844 phone). A paper lip behind the form tabs (`.mode-wrap`)
  because the card is pulled 30 px up over the photo edge. The six river pages (credit, humber, bronte, don, ganaraska and bowmanville
  salmon-run) load `conditions-core.js` and `assets/today-strip.js`, which finds the `.now` block, reads the reach and fish from its
  app link and adds Flow, Water and Conditions tiles plus a one-line source (`.hff-today`, styles injected by the script). All wording
  and rating come from the core (`flowRead`, `waterTempRead`, `rateReachToday`). Rules: nothing is added unless live flow is under 3 h old,
  weather loaded and there is a real water read (live CVC on the Credit, else modelled); no strip on a closed reach; the fish is the
  page's, or Steelhead when the reach lists it and it is in better season (or the page's fish is in its "Late Run" tail), and the link
  into the app then switches to `species=steelhead`; with the fish out of season (rank 0) the Conditions tile is dropped.
  Checked with mocked gauge and weather at 390 and 1280 px (no scroll, no page errors), since cloud sessions can't reach the APIs: look
  at a real preview. New river pages with a `.now` block and an app link get the strip by adding the two script tags.

- **Closed spots line** (TJ, 2026-11-04): access spots closed on the trip date are no longer a red box at the top of the
  Access Points card. They are one muted line each at the bottom of the card list ("Closed on this date: <spot>." plus the
  reason), with the regs source line under them (`.closed-notice.cn-line`).
- **Gear as a rig ladder** (TJ picked option B, 2026-11-04): the Gear card lists the setup rod to hook, one row per part with
  a small drawing (`gearIcon(label, kind)` in `app.js`; kind is fly, pin for centrepin float, or spin), joined by a thin line.
  The specs are unchanged; the float setup now lists Float and Weights before Leader (rig order). Styles: `.gear-lad` at the
  end of `app.css` (unlayered, so it beats the old `.gear-item` boxes). A new gear label needs an icon in `gearIcon()`.
  From 900 px up the same rows read left to right (rod to hook, line across, text centred under each icon); phones keep the
  vertical ladder (TJ, 2026-11-04).

- **City feedback and memory** (TJ, 2026-11-04, from the MS Clarity week: the city select was the top tap, 44 of 246, and "Find my best
  spot" with no city only flashed a 2 s outline, so on phones, where the field is off screen, the button looked dead): tapping the
  button with no city now scrolls the city field into view, focuses it and shows "Pick a city first, then tap Find my best spot."
  (`#loc-msg`, cleared when a city is picked; Umami `City Required Shown`). The picked city is remembered in `localStorage`
  (`hff_city`) and restored on the next visit with a `change` event (`City Remembered`); it never overrides a deep link. "Use my
  location" is not built (TJ is still deciding). Clarity (7 days, 76 page views, old layout): average fold at the Target species
  label, 46% scroll less than halfway; the button bottom was about 736 px on a 664 px phone window (see the compact form below).

- **Compact home form on phones** (TJ picked A+B+C+D, 2026-11-04; phones only, under 600 px, desktop unchanged): (A) Method is
  collapsed behind its label (`.m-collapsible`, `m-open` toggles; the label's `.opt` span shows the chosen method or "(optional)";
  the buttons stay in the DOM so other code still finds them); (B) species tiles are rows with a 30 px round image and 12 px name;
  (C) the hero subtitle is hidden; (D) the date and city labels sit inside their fields. Button bottom went from about 736 to about
  549 px on a 390 x 664 window. Checked at 390 x 664 and 390 x 844: no horizontal scroll, no page errors, Method open and close, summary
  text. Not checked: the date field with a label inside on a real iPhone (iOS date inputs are quirky). Judge with a Clarity re-check
  in about a week plus Umami `City Required Shown` and `City Remembered`.

- **Inter everywhere** (TJ, 2026-11-04, after comparing Current / Inter / Serif on preview #146 against a reference site with one
  type family): Source Serif 4, Outfit, JetBrains Mono, Charter and the system stacks are gone from the app, the hand-written
  pages, the Credit SSR function, `signup.js` and `today-strip.js` (emails untouched). Body text on the hand-written pages is
  17 px (was 19 px Charter), headings 600 with tighter tracking, the home h1 and results headline 500. The "Results type system"
  roles above still hold, with Inter in every role. Next (TJ): a size and hierarchy pass (gear ladder values bigger than their
  labels, too many sizes on the home form) and home spacing on iPad (no gap under the hero, the button sitting at the bottom).
  The home subtitle is hidden on iPads and other touch screens, and on any window under 1200 px (TJ, 2026-11-04).

- **Home form air, season dots, reach chips retired** (TJ, 2026-11-04, from iPhone: "too dense and busy"): form labels are
  sentence case 13 px ("Target species", "Method"; the in-field Date and Location labels on phones stay 11 px). The species
  tile chips are coloured dots on the photo's corner (green Prime/Good, amber Slow/In lake, red Closed; the word stays in the
  tile's title and screen-reader text) with a legend under the tiles (`.sp-legend`). Phones keep 3 columns with 10 px gaps and
  54 px tiles; button bottom is about 599 px on a 390 x 664 window (was 549 with the tighter tiles). iPads and narrow windows
  (601 to 1199 px, or any touch screen over 600 px): shorter hero, a gap under it, one-line method buttons; button bottom about
  697 px on 1024 x 768 (was 739). "Check by river" no longer shows reach chips: the app always picks the reach
  (`resolveAutoSection()`), and results show one line under the headline, "Other reaches: …" (`#tp-reaches`, siblings from
  `RIVER_SECTIONS`, "(closed)" from `sectionClosedOn()`). Tapping one opens that reach and marks it in `_upstreamStay`, so the
  upstream rule doesn't move the reader back up. Umami `Other Reach Clicked {river}`.

- **Regs follow the picked fish** (TJ, 2026-11-05: a Steelhead + Chinook search on the Duffins showed "2026 Regs · Coho"): with
  two or more picked fish on the reach, `buildTopPick()` still ran its no-species fallback (`defaultTargetSpecies()`), so
  `window._effectiveRecommendedSpecies` and the regs panel named the river's default fish. That branch now runs only when no
  picked fish is on the reach (`else if (!_multiTarget)`); the regs title reads "Steelhead + Chinook" and lists each picked
  fish's limit. Checked 140 river/fish/date cases against main: only the regs title and bullets changed.
- **Results hierarchy** (TJ, 2026-11-04: "sub-text larger than its heading"): one scale, display 24 (28 from 901 px) > heading 20
  > title 17 > body 15 > note 13 > label 12. Headings (600) are section heads only (`.sec-label h3`, `.dam h3`, `.sshdr h3`);
  card titles (method, "Float setup", bait name, access spot) are titles at 17/600, so they no longer match or beat the section
  they sit in. "Technique / Gear / Bait" (`.p-lbl`) are 13/600 muted group labels. Gear ladder values 15/600 under 12 px teal
  labels. Tile meaning lines were 8 px on desktop (now 12), tile values 17/600, notify bar 15 / 13 / 15, stray 11.5 to 14.4 px
  text moved onto the scale. Distinct size/weight pairs on the results page: 22 to 15 on phones, 32 to 18 on desktop (map
  labels aside). Rules live in the type-system block of `@layer overrides` plus a short unlayered block at the end of `app.css`.

- **Email type and run alert layout** (TJ, 2026-11-05): `brandEmail()` (`worker/emailshell.js`) uses Inter like the site
  (`BRAND_FONT` stack; `@font-face` from the site's woff2 for Apple Mail, system sans in Gmail and Outlook). The wordmark is
  Inter 600, no serif or italic. `tools/outlook-template.html` the same (no italics, no tracked capitals). Run alerts get the
  "Fish with a buddy?" box. Run alert drafts carry their own layout: a teal label ("Run alert · <reach>"), a 22 px navy
  headline, short paragraphs with no font-family (they inherit the shell), and a teal button into the app. Tone: upbeat and
  a little playful (TJ: "bring anglers some excitement, no need to go overboard"); still factual numbers, no em dashes, no emoji.
- **Method open on phones again** (TJ, 2026-11-05): the phone-only Method collapse (option A of the compact form) is removed
  from `app.js` and `app.css`. The four buttons are a compact row instead (small icon over a one-line 12 px word, words wrap
  under 380 px). Button bottom about 644 px on 390 x 664 (collapsed was 599, open with the old tall buttons 671); 694 on
  360 x 640, so the smallest phones scroll a little to reach it.

- **One form, no tabs** (TJ, 2026-11-05, layout B from mockups): "Find my spot" and "Check by river" are one form. Every width:
  Date on its own row, then "Your city" and "River" side by side (TJ wanted the same on desktop). iPads and windows of 601 to 1199 px get smaller
  species tiles (36 px photo, 12 px name). A "When and where (a city, a river, or both)" heading (`.form-sec-lbl`, same look as Target species and
  Method; the River label has no "(optional)", since either field will do, TJ 2026-11-05) sits above Date; from 601 px up the Date, Your city and River labels are 12 px muted sub-labels under it. The date input is
  forced to full width (`#date-field-group`; TJ's Android showed it narrow) and the city select has the same paper background as
  the others. Phones trim card and section padding to pay for the heading. Button bottom: 660 on 390 x 664, 711 on 360 x 640,
  753 on 1024 x 768, 873 on 1280 x 900. Phones show the species photo (28 px) above the name
  (TJ, 2026-11-05: "Steelhead" ran past its tile; hyphenating was the other option), dot on the photo's corner; that moves the
  button to about 685 on 390 x 664 and 736 on 360 x 640.
  River defaults to "Best near me" (the city search). A picked river runs the river search (`goToResults()` sets `appMode`
  from `#expert-river-select`: `'expert'` with a river, `'beginner'` without) and the city is then optional; with both, the
  drive time to the picked river shows (RIVERS_DB, then `RIVER_CONFIG.driveTime`, via `driveKeyFor()`). Neither picked:
  "Pick a city or a river first, then tap Find my best spot." (`#loc-msg`, `City Required Shown`). If `updateRivers()` (city
  change) moved `selectedRiver` off the picked river, the search re-resolves it with `resolveAutoSection()`. One Method row
  (`.beginner-only`); the river tab's copy, the tabs (`.mode-toggle`, hidden) and the reach chips stay in the markup but are
  never shown. The picked river is not remembered between visits (only the city is). Umami: `Search {mode}` is `beginner`
  without a river, `expert` with one; `River Viewed` carries `mode: spot|river`. Supersedes #152 (river-required message,
  remembered river, `Mode Switched`).

- **Results depth baseline** (TJ, 2026-11-05): phones don't scroll far on results (the top card fills the first screen and
  nothing says what is below). `Results Section Seen` and `Results Engaged` measure it (#156, merge first for a baseline week).
  Compare phone views, layout `scroll` vs `pill`: share of River Viewed reaching each section, and 30/60/120 s.
- **"Next" pill and light tiles** (TJ, 2026-11-05; merge about a week after #156): a sticky jump bar was built (#157) and dropped
  for screen space (header 59 + bar 54 + email bar 126 px pinned on a 664 px phone). Instead, phones under 600 px get a teal pill
  bottom right (`#res-next`, `nextPillUpdate()`): "Next: Conditions / Spots / Gear ↓" names the first section heading still below
  the header, tapping scrolls it up under the header, and near the end it reads "Back to top ↑". It sits above the email bar
  when that shows, and hides while the results load and while someone types in the email bar. Umami `Next Pill Clicked
  {to, river}`; views with the pill send `layout: pill`; sections a tap scrolls past don't count as seen. The condition tiles
  under the summary are light cards (TJ picked option 1; the dark block drew more attention than the headline): white,
  thin border, a coloured dot by the label, coloured line under the value. The Sky value says "80% cloud" (was "80%"), and
  "Top Bait" is now "Technique": the method ("Float") over the bait ("Roe & beads"), with no dot, since it isn't a condition.

- **Home: borrowed from TJ's Figma Make concept** (TJ, 2026-11-06; ideas only, the phone form unchanged): TJ's own fall lake photo
  (`images/hero/home-fall-lake.webp` 1600 px, `-800.webp` on phones) replaces the steelhead as the home hero at every width
  (TJ may send a fall photo with a fish later). Warmer paper behind the home page (`#f4f0e6`). From 1000 px up (iPad landscape,
  desktop) the form card sits beside the photo on the right (540 px, rounded, shadow) so the whole form and its button fit on the
  first screen (button bottom 710 on 1280 x 900, 673 on 1024 x 768; was 873 and 753); the headline, subtitle and three short points
  (`.hero-points`: live flow from Water Survey of Canada gauges; 2026 Ontario regulations, reach by reach; where to stand and what
  to bring for your fish) sit on the left, and the header matches the same 1180 px width. Thin rules separate the three form steps
  there, with no step numbers. Under 1000 px the stacked layout is unchanged (button 685 on 390 x 664). Not taken from the Make
  file: its serif and second font, step numbers, line-art fish, rust button and invented field-note copy.
  Results page (TJ, 2026-11-06): the same photo sits behind the target-species strip (`#species-banner`, white text, light
  season-badge colours). Under 1000 px it is one line, 64 px tall: photo circle, name, badge; the "Target species" label is
  dropped (it cut "Steelhead" off at 360 px) and two fish wrap. From 1000 px up the strip is taller and the summary
  (`#tpband .tpband-inner`) is a white rounded card overlapping its bottom edge, like the home form card (TJ picked B).
- **Species badge checks legality** (TJ, 2026-11-06: an Upper Credit brook trout search on Nov 6 read "★ Peak season now"): the
  badge under the fish name (`#species-season-badge`) read only the season calendar. It now checks `speciesSeasonClosureFor()`
  and `allAccessClosed()` first: "Season closed" when the season is shut for every picked fish on the reach, "Closed on this
  date" when the season is open but every access spot is closed, "<fish> season closed" (amber) when only some picked fish are.
  Checked 168 reach/fish/date cases against main: only closed water changed (Upper Credit, Middle Credit, Upper Humber).

- **Install hint close fix** (TJ, 2026-11-06, iPhone Chrome): the X on the add-to-home-screen hint set `hidden`, but
  `.a2hs { display:flex }` beats the browser's `[hidden]` rule, so the banner stayed on screen (every browser; the dismissal
  was saved, so it didn't come back on later visits). `hideInstallHint()` now removes the element, `.a2hs[hidden]` is
  `display:none` as a backstop, and the X is a 44 px target. Watch for the same trap: an element with its own `display`
  needs a `[hidden]` rule.

- **Flow in plain English** (TJ, 2026-11-06): the flow card leads with the band ("Normal flow", "Likely low flow" on an
  estimate, "Gauge not reporting", "No estimate"), the reading and gauge under it, then what the fish do in that flow
  (`#fnote`). Lines are TJ's (`FLOW_FISH_TEXT` in the core, groups run = steelhead and lake-run browns, salmon, resident
  trout; `flowPlainRead(band, species, section, estimate)`, `flowFishGroup()`). The note follows the fish the headline names
  (`renderFlowFishNote()`, called from the flow column and `speciesReads()`), only when that fish is fishable on the reach on
  the date (`speciesFishableIn()`), never while fish are in the lake. The summary tile's value is the band word with the
  number under it. Dropped as repeats: the bar's status word, the "Flow X m³/s (band)" and "Fish lies" bullets, two of the
  three estimate bullets. Water temperature card the same way (same PR): "Cold water / Cool water / Prime temperature / Warm
  water / Too warm" (`waterTempRead().band`, `TEMP_HEAD`), the reading and its source under it, then `TEMP_FISH_TEXT` for the
  fish, activity and catch-and-release safety only (where fish hold is the flow card's job, TJ 2026-11-06) (`waterPlainRead()`; trout at 18 °C+ always get the advisory, lake-run browns included); without a fishable fish the old
  feeding-range sentence stands in. Temperature lines are a first draft for TJ to edit. Water tile value is the band word.
  Very cold water (under `VERY_COLD_WATER` 3 °C, TJ 2026-11-06: "real winter days, Dec to
  February mostly"): steelhead, lake-run browns and resident trout sit near the bottom of deep, slow pools and barely move,
  so the temperature card says so (`TEMP_DEEP_TEXT`) and the flow note switches to `FLOW_COLD_TEXT` (clarity and approach,
  no holding water); salmon unchanged. Consistency pass over all 90 flow x temperature x fish combinations
  (TJ, 2026-11-06): cold 3 to 6 °C prime flow says fish move a little in slower water (`FLOW_CHILLY_TEXT`); salmon under
  6 °C get "the salmon left" lines (`FLOW_SALMON_COLD_TEXT`); 18 °C+ trout flow note is "Let them be until the water cools",
  salmon hold at the mouth, steelhead prime flow warns about heat (`FLOW_HOT_TEXT`); low flow says "fish hold deep and spook
  easily" everywhere (trend, why line, `flowRead` sentence, a Grand access note; was "spread out"/"scattered"); the trend's
  "Fresh fish can move on it" is dropped for resident trout and for salmon in cold or too-warm water (`flowTrendNoFresh()`).
  Scoring change (TJ, 2026-11-06): winter run fish in 1 to 3 °C water score 0 for temperature (was +1), so the Water tile
  says "No effect" while the card says fish barely move; 3 to 4 °C keeps +1. Moves the pill and the weekly email down one
  point on those days (Excellent to Good or Marginal to Tough in about 40 of 96 sample cases); rankings with no fish named
  are unchanged. The Worker redeploys on merge (core change). Open: per-spot access notes (`getAccessFlowNote()` in `app.js`) use their own
  hardcoded flow thresholds, not the reach's bands. Sky card unchanged for now. The home-screen hint now closes when results open
  (`hideInstallHint()` at the top of `renderResults()`). Scoring unchanged.

- **Spot notes and Fishability removed** (TJ, 2026-11-06): the per-spot flow line on the access cards (`.afnote`,
  `getAccessFlowNote()`) looked notes up by parent river ("Credit River") but was handed the reach ("Lower Credit River"), so it
  never matched and every card said "Check the local gauge for current conditions." Removed with its hardcoded thresholds; the
  flow card is the one flow read. The homepage "Fishability · Today near Toronto" block (three river boxes,
  `renderDefaultPreview()`, `DEFAULT_RIVERS`, `fetchLandingWeather()`, `#default-preview`) is gone too (TJ: unused); guides
  now follow the form. `.dp-*` and `.afnote` CSS left as dead rules. Umami `River Viewed` source `home-list` stops.

- **After sunset, show tomorrow** (TJ, 2026-11-06, Duffins at 11 pm: the sky card graded tonight's cloud while its strip and
  the hero showed tomorrow): once the sun is down, a trip date of today becomes tomorrow before anything renders
  (`rollPastSunset()` at the top of `renderResults()` and in the date-field init; sunset from `sunsetMinutesLocal()`, the
  standard solar formula, for the reach's lat/lng, Toronto on the form). The date field's min moves to tomorrow too. Flow then
  comes from the day-1 estimate, like any future date. Replaces "the picked date never changes" (Phase 1); the hero's
  "Today's window is over" path is now rarely reached. Dates further out are untouched.

- **Sky covers the hours left** (TJ, 2026-11-06/07): on today's date the cloud figure was this minute's reading, so the Sky
  card's headline and colour ("Partly Cloudy now (36%)") could disagree with its 8 AM / 12 PM / 6 PM strip and note. Now
  `fetchWeather()` returns `cloudPct` as the mean of the periods still ahead today (`skyPeriodsLeft()`: periods end 10 AM,
  3 PM, 9 PM; `skyCloudFor()`), and `periodsLeft`; a future date uses the whole day's mean. The card reads "<word> (N% for
  the rest of the day)" (or "through the day"), past periods in the strip are dimmed (`.spc-past`), the note describes only
  what's left (`skyRestNote()`), and the Sky tile and the rating use the same number. This minute's reading is kept as
  `cloudNow` (unused). Replaces "the headline value says now on today's date" (Sky note, 2026-11-02).

- **Tile rating lines removed** (TJ, 2026-11-07): the summary tiles (Water, Sky, Flow, Technique) no longer show "Helps the
  rating / No effect / Holds it back / Caps the day..." (noise for a first-time reader, a line on every tile). `tile()` in
  `app.js` ignores its `effect` argument; `ratingEffects()` and `window._tileEffects` are still computed, and the note under
  the pill (`limitRead()`) still says what holds a Marginal or Tough day down. Supersedes the Phase 3b tile tags.

### Analytics events (Umami)
- App, via `track()` in `app.js`: `River Viewed {river, species, source, day}` (fired once per river/species/date in
  `renderResults()` via `trackRiverViewed()`; `source` is search, deep-link, redirect, nearby or home-list, set in
  `window._viewSource`), `Notify Bar Shown`, `Notify Bar Dismissed`, `Email Signup {river, species}`,
  `Email Signup Failed {river, reason}`, `Navigate Clicked {river, spot}`, `Gauge Link Clicked`,
  `Full Regs Clicked`, `Regs Details Opened`, `Guide Card Clicked {url, slot: card|list}`,
  `Upstream Auto Switch {from, river}`, `Upstream Stay Clicked {river}`, `Install Hint Shown {platform}`,
  `Install Hint Dismissed {platform}`, `Install Prompt Answered {outcome}`, `Other Reach Clicked {river}`,
  `Search {location, species, mode}`, `River Viewed` also carries `mode` (spot or river), `Results Section Seen {river, section: conditions|spots|gear, layout, screen}` (first time each section heading is 60% on screen in a results view, watched only once the headline has loaded) and `Results Engaged {river, seconds: 30|60|120, layout, screen}` (time the results page is on screen in a visible tab), both from `resultsDepthStart()` (`layout` is `scroll`, or `pill` once the Next pill ships; `screen` is phone under 600 px, else wide; TJ 2026-11-05: results share `/` with the form, so Umami's bounce rate and time on page can't measure them), `Alternative Reach Shown`, `Alternative Reach Clicked`, `Scroll Depth {page, depth}` (signup.js, pages with a box), `App Installed`, `Home Screen Launch`. Click events come from one delegated listener
  next to `track()`. Add new click events there.
- Static pages and the Credit SSR page, via `data-umami-event` attributes: `Conditions CTA Clicked {page, river}` on
  every link into the app (`placement: top` for the Today's conditions block), `Video Played {page, video}` on `.vid-play`. New pages need the same attributes.
- Umami started 2026-09-11 (replaced Plausible). Its Events view counts visitors who fired an event, not all
  visitors. `Email Signup` counts before 2026-10-15 are not real signups (the Worker was failing). `CTA Clicked`
  stops 2026-10-04 (duplicate removed). Data before this PR includes TJ's own visits and preview builds.
- New tracker tags need `data-domains="herefishyfishy.ca,www.herefishyfishy.ca"`.
- Unsubscribe page: `Unsubscribe Completed`, `Unsubscribe Failed {reason}`, `Unsubscribe Link Bad {reason}`. Its Umami
  script has `data-exclude-search` so emails in the link never reach Umami.

### Email list
**Interests (2026-10-18).** One list, three things people can ask for, all through the Worker's `/subscribe` (`kind`):
- `outlook`: monthly outlook. Resend topic "Monthly outlook" (`8acca89a-661a-4607-819c-1290deac79b2`, opt-out default,
  which Resend can't change: a contact who never ticked it still counts as subscribed). So `/subscribe` opts every
  contact without `outlook: true` out of that topic (2026-10-26), and the broadcast must have Topic = Monthly outlook.
  The four contacts from before then were opted out by hand; TJ's tnt.tarun@gmail.com is opted in to get a copy.
  Scheduled task "Monthly outlook draft" (26th, 8:54 Toronto) drafts a Resend broadcast (segment General + that topic)
  and emails TJ; TJ edits the "[TJ: add your take]" placeholder and sends from Resend.
- `run` + `river`: run alerts for one of `RUN_RIVERS` (worker) / `RUN_ALERT_RIVERS` (app), the 14 rivers with
  salmon or steelhead. Resend topic "Run alerts" (`81a6f6ee-5667-476e-92d0-bd06c32fd009`). The free Resend plan
  allows 3 segments, so rivers live in KV (`runRivers` on `sub:<email>`), and the Worker sends run alerts itself.
  Scheduled task "Run alert drafts" (Mon and Thu 7:42, in season) writes KV CACHE `alert:draft:<id>`; the Worker's hourly
  cron emails TJ a preview with a signed `/alerts/approve` link (GET shows the preview, only POST sends). "General" is the only
  segment in use (two test segments were deleted 2026-10-19).
- `trip` + `trip{date, section, gauge, lat, lng, sweetMin, sweetMax}`: trip-day email, 1 to 16 days out, offered only
  when the section is open that day. KV `trip:<date>:<email>:<section>`; the cron sends flow and weather at 6 am Toronto.
- Old pages with no `kind` still work (`legacy`). Unsubscribing from our page clears outlook and runRivers in KV.
- `weekly` + `weekly{section, species}`: weekly conditions email (Thursday, Worker sends it, `worker/weekly.js`). Also
  the old notify-bar `rivers` + `species`. One weekly email and one run alert per person per 6 days (`lastWeeklyAt`,
  `lastRunAlertAt`).
- Resend free plan: 100 emails a day, 3,000 a month. A run alert to a big river list can hit that.
- Run-alert inputs: the hourly cron saves flow (96 h log), a flow-bump summary and rain for every river with a run-alert
  subscriber to KV CACHE `runcond:latest` (`worker/runconditions.js`, also `GET /run-conditions`). The "Run alert drafts"
  task reads it through the Cloudflare API, since its cloud session can't always reach the gauge and weather APIs.
- Weekly scheduled task "Weekly subscriber report" (Mon 8:50) emails TJ counts by interest and form.
- Umami `Email Signup`, `Email Signup Failed` and `Notify Bar Shown` now carry `offer` (trip, run, outlook); page boxes
  send `page` and `placement` (mid or end), and fire `Signup Box Seen` once when half the box is on screen. Signups
  divided by Seen is the box's conversion rate; compare mid vs end before trying other placements.

`streamcast-proxy` (`worker/worker.js`) handles `/subscribe`: writes `sub:<email>` to KV `SUBSCRIBERS`, adds the contact to Resend
(`RESEND_AUDIENCE_ID`, segment "General" `7c4ef108-3d3d-41ba-95f4-3776f957330e`), sends the welcome email. Bindings it
needs: KV `SUBSCRIBERS` (HEREFISHYFISHY_SUBSCRIBERS), KV `CACHE` (HEREFISHYFISHY_CACHE), secret `RESEND_API_KEY`,
var `RESEND_AUDIENCE_ID`, secret `UNSUBSCRIBE_SECRET` (HMAC for unsubscribe links). A redeploy dropped the bindings, so
every signup from 2026-06-08 to 2026-10-15 failed; fixed 2026-10-15. Every email to the list needs `unsubLinks()` and the
`List-Unsubscribe` headers, and must skip KV records with `unsubscribed: true`. CASL also wants a mailing address in
commercial emails: `SENDER_FOOTER` in `worker.js`. `hello@herefishyfishy.ca` forwards to TJ's Gmail (Cloudflare
Email Routing, 2026-10-15).

Analytics (Search Console to Oct 4, Umami 90 days) are in the claude.ai project doc
`claude/analytics-2026-10-06.md`. Most clicks come from searches that name a place and a year
("bowmanville salmon run 2026"). The Humber is #2 in app river picks.

## Open threads

16. **Alternative reach (built 2026-11-03, Phase 3c):** see Current state. Open: wording "Conditions there" vs "Conditions
   here"; alternatives use regional weather and modelled water (no live CVC); judge on Shown vs Clicked in Umami.

15. **Pill basis (done 2026-11-02, Phase 3):** the pill now rates the viewed reach on conditions only, like the weekly
   email, and the drive verdict chip is gone (TJ approved).

14. **Phase 1 follow-ups (2026-11-02):** trend wording, winter run temperatures and the trout-only 18 °C rule are
   done (see Current state). Still open: (a) TJ thinks river water can't go below about 5 °C under ice; most rivers run
   near 0 to 1 °C under ice, spring-fed reaches warmer. Check against the CVC `wt:log:*` readings this winter before
   moving `COLD_RUN_MIN`. (b) Window lengths (2 h early, 3 h morning, last 2 h evening, winter 10 AM to 4 PM) are first
   settings for TJ to adjust. (c) The score's cloud bonus (overcast +2) still applies in January and February.

0. **Signups:** bindings restored and test signup verified in KV and Resend (2026-10-15). Unsubscribe and the Worker
   in the repo are done (#73); the Worker version with `/unsubscribe` was deployed 2026-10-15 before the page merged.
   TJ tested unsubscribe end to end (2026-10-15). The footer address is a placeholder ("Shawnmarr Rd, Mississauga ON",
   no street number); TJ will swap in a virtual mailbox address. Still to do: an Umami review with the new events.
   (The old "alerts when conditions are excellent" promise is gone since #86; the weekly email is that alert, live 2026-10-27.)
   Every welcome email now ends with a reply question (which river, what species), signed TJ (2026-10-21). Replies
   reach TJ's Gmail through hello@. Use them to test the personas (fall run chaser, steelhead regular, trout
   explorer, newer angler) before building for any of them.

1. **Sep 9 to 25 search drop:** closed (TJ, 2026-10-29: moved on).
2. **Indexing:** `/guides/steelhead-run-timing/` and `/rivers/humber/` are indexed (TJ, 2026-10-29). Request indexing for
   `/guides/trout-after-september-30/` after #114 (merged).
3. **Umami review (2026-10-15, partial)** in project doc `claude/analytics-2026-10-15.md`. Still to get from TJ:
   species by river. Then recommend the next pages. Ideas so far: a
   clearer species prompt ("any" is one of the biggest species values). Done 2026-10-29: the "trout after Sept 30"
   page, and brook trout now read closed after Sept 30 everywhere.
   TJ: open `herefishyfishy.ca/?notrack=1` on each browser after #75 deploys.
4. **Next year:** switch "2026" to "2027" in titles and copy before staging season (July 2027).
5. **Gauges (2026-10-24):** Black Creek, Lower-Mid and Upper Humber now have their own gauges (#100). Only the Lower Humber
   still reads Elder Mills (`02HC025`), by TJ's choice.
6. Carried over: `BAIT_ADVICE` draft copy, photo permissions and licences, Nottawasaga Pine
   River confluence is open all year but sits in a `standard` section (over-cautious).
7. **TJ's upstream rule:** after Sep 30, fish as far upstream as the regs allow ("above the CNR if legal, else
   below it"); TJ extended it to the trout opener through May (2026-10-16). Across reaches this is done (upstream pass
   and Best for species, 2026-10-16; the app switches reaches itself since 2026-10-25). Within a reach the pick still only knows "not
   the mouth" (the `mouth` flag); a per-spot upstream order for `access[]` is still skipped (TJ, 2026-10-13).
8. **Migratory data decisions (2026-10-13):** lake-run browns on the Rouge are minimal (TJ), so the Rouge mouth
   doesn't list them; the Rouge Mid-Section keeps Brown Trout (TJ). Steelhead at Hogs Falls above Kimberley: one
   fishing site only, no fisheries source, and Upper Beaver is a `standard` section (closed through the spring
   run), so it stays resident-only.
10. **Water temperature (2026-10-16):** refit `WATER_CURVE_MID` and per-reach `gw`/`tau` from `wt:log:*` once a few weeks
   (and later winter and spring) of readings exist; read them with the Cloudflare API, compute in the API sandbox. Find
   which GRCA (Grand, Speed, Eramosa) and SVCA (Saugeen) stations report water temperature and add them as live sources.
   TJ to ask Conservation Halton for Bronte and Sixteen Mile logger data, and CLOCA for Bowmanville probe data.
   "Credit River at Highway 10 N" location unknown (coordinates in `CVC_STATIONS` are a guess); not used by the app.
9. **Float wording (done, 2026-10-17):** the hero says "centrepin or spinning rod with float gear" for in-river salmon,
   steelhead and lake-run browns, "spinning rod with float gear" when Spin Fishing is picked, "centrepin or spinning
   rod with a float and bait" for other float methods, and "spinning rod with bait" for bait without a float (TJ:
   "float rod" means different things to different anglers).

12. **Don River follow-ups (2026-10-21):** confirmed by TJ: the flow sweet spot (2.5 to 8 m3/s at Todmorden; replaced 2026-10-24 by prime 1.9 to 3.5 lower, 1.7 to 3 upper) is fine,
   Sunnybrook Park is north of Eglinton (so `extended` is right), and steelhead stay off the list (extremely rare and
   unreliable on the Don). `/rivers/don/` added 2026-10-27 (factual, no photo yet; not in the homepage `GUIDES` cards until TJ has a
   photo). Later: the Port Lands mouth once fishing there is clear. TJ replied on the Reddit thread (2026-10-29).

13. **Flow ranges and forecast (done 2026-10-24, see Current state).** The weekly email uses the estimate since 2026-10-29
   (#113): `deps.flowForecast()` reads KV `flowfc:<gauge>` through `servedForecast()` (no new calls). Fri and Sat
   (days 1 to 2) are rated on the estimated flow, **up or down** (`estimateRating()`; TJ 2026-10-29: blown out Thursday
   and prime by Saturday should say so), "Potentially ..." when the estimate changed the word. The app's pill still
   only lets an estimate lower a day. Sun to Wed keep Thursday's rating and the text words the likely band range
   (`flowWords()`). Gauges with no model (Wilmot, Bowmanville, Grand below Shand, Upper Beaver) use Thursday's reading.
   A better model for the spring-fed creeks (Wilmot, Bowmanville), e.g. shrinking
   toward "flow stays as it is". Refit yearly. TJ to delete the throwaway branch `claude/flowlab-data`.

11. **Weekly conditions alerts (TJ, 2026-10-20):** Thursday evening email covering Fri to Wed, sent only when a day
   scores Good or better on open water, at most once a week, preview-only to TJ for 2 to 3 weeks first. Plan:
   project doc `claude/weekly-alerts-plan-2026-10-20.md`. Step 1 (shared core) is #89; the email itself is #90.
   Both merged and deployed 2026-10-21 (first preview Thursday Oct 22, 5 pm). **Live since 2026-10-27** (TJ, after one
   preview): `ALERTS_MODE = "live"`; TJ gets a copy of each run in the preview layout. Recipients are people with a
   `weekly` interest or the old notify-bar `rivers` + `species` (they signed up for conditions alerts). Signup page
   `/weekly/` (noindex), linked from the monthly outlook with `?email={{{EMAIL}}}`. The "Weekly subscriber report" task counts `weekly`
   interests (since 2026-10-21). Known app quirk, now shared by the email: on a migratory reach with a run active, the Conditions word
   comes from run strength at the mouth (lake temperature, wind, cloud) and ignores river flow; only the email's rain
   cap catches blowouts. Decided (TJ, 2026-10-23): flow counts once fish are in the river. `conditionsScore()` caps a
   run day at Marginal outside the sweet spot and Tough outside `flowLow`/`flowHigh`, unless `fishInLake` (staging and
   at the mouth; the app's `window._stagingInLake`). Weekly email subjects use `secLabel()` (full name).
   Extended 2026-10-24 (TJ: every river): `flowCapScore()` applies the same cap to trout days too (the Lower Grand
   read Excellent at 200 m3/s), and to the landing cards; the staging card's re-rate passes `window._pillFlow`.
   Normal flow (2026-10-24, TJ): flow between `flowLow` and `sweetMin` is not capped; about half of open-season days
   sit there and rivers are fishable most days. `sweetMin`..`sweetMax` is now called **prime** on screen (flow a few days
   after rain) and is the only band with a bonus. `flowBand()` names the band (low, normal, prime, high, blown) for the
   flow card, summary, weekly and trip emails and the Credit SSR tiles. `clsFlow()` rates normal as good.
   A strong run (staging score 8) with prime flow in the river reads Excellent (`RUN_PRIME_SCORE`, TJ 2026-10-24).
