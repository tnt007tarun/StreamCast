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
| `assets/app.js` | All app logic (~7.7k lines, one file, no build step) |
| `assets/app.css` | All app styling, in cascade layers. See `assets/README.md` |
| `functions/credit-river/[species].js` | Cloudflare Pages Function: server-rendered `/credit-river/{species}` pages |
| `guides/*/index.html`, `rivers/*/index.html`, `about/` | Hand-written static pages, each self-contained with its own `<style>` |
| `sitemap.xml`, `llms.txt`, `robots.txt` | Keep in sync when pages are added |
| `_redirects`, `_headers` | Cloudflare Pages config. They keep repo docs (`CLAUDE.md`, the READMEs) off the live site and out of search. Add any new repo-only doc to both |
| `images/`, `video/` | Photos (WebP for pages, JPG kept for og:image) and short clips |
| `worker/` | The `streamcast-proxy` Worker (flow, lake temps, stocking, subscribe, unsubscribe) and its `wrangler.toml`. Not deployed by Pages. See `worker/README.md` |
| `unsubscribe/` | Unsubscribe page (noindex). Talks to the Worker's `/unsubscribe` |

Deploy the Worker only from `worker/` (`npx wrangler deploy`) so `wrangler.toml` supplies the bindings. A deploy
without them broke every signup from June to October 2026.

### Key structures in `app.js`

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
- Every species a river's sections list needs a matching `RIVER_REGS[river].species` row (`regsRowMatches()`), or the
  regs panel shows no summary and no limit for it. Rows come from the zone-wide table in the MNR summary unless an
  exception applies.
- `speciesFishableIn()`, `seasonClosureFor()`, `accessClosureOn()`, `allAccessClosed()` and `sectionClosedOn()` decide
  legality. Use them. Don't write a new check.
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

### One decision, one function
The most common bug in this codebase is duplicated logic drifting apart: the hero, the
Technique panel and the summary tile each kept their own rule and disagreed.
- Gear and method: `methodSpeciesKey(section)` plus `salmonMethodMode()`. **Never read
  `selectedSpecies[0]` for a decision.** The user can select several species.
- If two parts of the UI show the same idea, they must call the same function.
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
- Only TJ's stated facts go in first person. Don't invent where, when or how he caught something.
  Ask him.
- Guides and regulation copy stay plain and factual. Personal sections (the About page "Who I am",
  side stories) can use TJ's comic voice: mock-epic setups, bathos, a punchline to finish.
- Visible FAQ and FAQPage JSON-LD must match word for word. Generate one from the other.

### Assets
- YouTube thumbnails: `hqdefault.jpg` (`maxresdefault` doesn't exist for every video).
- Photos: WebP, max 1200 px wide, quality 72. Keep the JPG for og:image and JSON-LD.
- Videos: compress (720p, CRF 28, `+faststart`), `preload="none"`, with a poster frame.
- Site icon: `favicon.svg` is the source (white fish on teal `#1e7a6e`). `favicon.ico` (16/32/48), `apple-touch-icon.png`,
  `icon-192.png`, `icon-512.png` and `site.webmanifest` are rendered from it. Every page head carries the same four
  icon tags (copy them from any page). The header logo `images/brand/logo.png` is separate and stays.

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
6. After a merge, remind TJ to request indexing in Search Console for any new URL.

Cloud sessions can't reach herefishyfishy.ca or the gauge and weather APIs, so test with
the app's fallback data and say so. Local Claude Code can test against live data.

## Current state (updated 2026-10-17)

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

### Analytics events (Umami)
- App, via `track()` in `app.js`: `River Viewed {river, species, source, day}` (fired once per river/species/date in
  `renderResults()` via `trackRiverViewed()`; `source` is search, deep-link, redirect, nearby or home-list, set in
  `window._viewSource`), `Notify Bar Shown`, `Notify Bar Dismissed`, `Email Signup {river, species}`,
  `Email Signup Failed {river, reason}`, `Navigate Clicked {river, spot}`, `Gauge Link Clicked`,
  `Full Regs Clicked`, `Regs Details Opened`, `Guide Card Clicked {url, slot: card|list}`. Click events come from one delegated listener
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

0. **Signups:** bindings restored and test signup verified in KV and Resend (2026-10-15). Unsubscribe and the Worker
   in the repo are done (#73); the Worker version with `/unsubscribe` was deployed 2026-10-15 before the page merged.
   TJ tested unsubscribe end to end (2026-10-15). The footer address is a placeholder ("Shawnmarr Rd, Mississauga ON",
   no street number); TJ will swap in a virtual mailbox address. Still to do: an Umami review with the new events, and
   a better signup offer (the bar promises "alerts when conditions are excellent", which aren't sent yet).

1. **Sep 9 to 25 search drop.** Cause unknown. Umami (live from Sep 11) shows no matching collapse in app events
   (Sep 12, 14, 21, 25 at 110 to 120 events vs 156 on Sep 26), but TJ's own testing is in those numbers. Next: Umami
   Overview filtered to Referrer contains google, visitors by day, Sep 1 to 30. Flat means a Search Console reporting
   artifact (close the thread); a dip means check Page indexing and Manual actions.
2. **Indexing requested** for `/guides/steelhead-run-timing/` and `/rivers/humber/` (TJ, 2026-10-14). Check they show
   as indexed in Search Console's Page indexing report at the next analytics review.
3. **Umami review (2026-10-15, partial)** in project doc `claude/analytics-2026-10-15.md`. Still to get from TJ:
   species by river, and the Google-referrer daily visitors above. Then recommend the next pages. Ideas so far: a
   "where to trout fish after Sep 30" page (Brook Trout searches appear in October; verify every claim against MNR
   2026), and a clearer species prompt ("any" is one of the biggest species values). Also check a Brook Trout search
   on a closed reach shows as closed.
   TJ: open `herefishyfishy.ca/?notrack=1` on each browser after #75 deploys.
4. **Next year:** switch "2026" to "2027" in titles and copy before staging season (July 2027).
5. **Unconfirmed gauge:** the Humber sections and Black Creek all use `02HC025`. Check it's the right station for each.
6. Carried over: `BAIT_ADVICE` draft copy, photo permissions and licences, Nottawasaga Pine
   River confluence is open all year but sits in a `standard` section (over-cautious).
7. **TJ's upstream rule:** after Sep 30, fish as far upstream as the regs allow ("above the CNR if legal, else
   below it"); TJ extended it to the trout opener through May (2026-10-16). Across reaches this is done (upstream pass
   and Best for species, 2026-10-16). Within a reach the pick still only knows "not
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
9. **Float wording:** in-river float headlines say "float rod and bait"; the intended "float rod with roe bags or
   beads" never matches (it checks for an em dash, the method name uses a middot). Left as is on purpose; change
   only if TJ wants the longer wording.

