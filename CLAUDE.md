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

The lake-temperature Cloudflare Worker (`worker.js`) lives outside this repo.

### Key structures in `app.js`

- `RIVER_SECTIONS`: parent river mapped to its section names.
- `RIVER_CONFIG[section]`: gauge, flow sweet spot, species, `season` band, `regs`, `access[]`.
- `access[].closed[]`: date windows (`MM-DD` or a floating token like `FRI_BEFORE_4TH_SAT_APRIL`) when a spot is closed.
- `RIVER_REGS[river]`: the regulations panel text. Its `special[]` lines are parsed for dates.
- `ACCESS_COORDS[section]`: lined up **by index** with `access[]`. Keep both in the same order.
- `GUIDES`: the homepage guide cards. Add new guide and river pages here, ordered by season.
- `STAGING_ZONES`: river mouths used for the salmon staging model.

## House rules

### Never recommend closed water
- The source of truth is the **MNR 2026 Ontario Fishing Regulations Summary**. It's a doc in
  the claude.ai project. If it isn't available, ask TJ to attach the PDF. Never work from memory.
- Season bands: `all-year`, `extended` (4th Sat in April to Dec 31), `standard` (4th Sat in
  April to Sept 30). Sanctuaries go in `access[].closed`.
- `speciesFishableIn()`, `seasonClosureFor()`, `accessClosureOn()`, `allAccessClosed()` and `sectionClosedOn()` decide
  legality. Use them. Don't write a new check.
- Before changing seasons or closures, run a date-by-date check of every access spot against
  the regulations (see PR #60 for the approach).

### One decision, one function
The most common bug in this codebase is duplicated logic drifting apart: the hero, the
Technique panel and the summary tile each kept their own rule and disagreed.
- Gear and method: `methodSpeciesKey(section)` plus `salmonMethodMode()`. **Never read
  `selectedSpecies[0]` for a decision.** The user can select several species.
- If two parts of the UI show the same idea, they must call the same function.
- Recommended access spot: `bestAccessSpot(access, atMouth)`. The hero headline and the access cards both use it.
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

## Current state (updated 2026-10-13)

Merged recently:
- **#60** Regulations verified against MNR 2026. Closed-as-open spot/dates went from 25 to 0. Added `allAccessClosed()`.
- **#61** `/guides/steelhead-run-timing/`, plus the Credit steelhead SSR page rewrite.
- **#62** `/rivers/humber/` (Old Mill in fall, winter and spring; TJ's photos, video and redhorse clip).
- **#63** Em-dash and wording pass across the site; About page "Who I am" in TJ's voice; `secLabel()`; new homepage guide cards.
- **#64** Method pick looks at every selected migratory species. Steelhead now gets float fishing.
- **#66** "Closed to fishing" pill and drive verdict on closed water; headline no longer suggests all-access-closed
  sections; dead bait code removed; `hqdefault` thumbnails; Rouge Marsh removed; hero and cards share `bestAccessSpot()`.

Analytics (Search Console to Oct 4, Umami 90 days) are in the claude.ai project doc
`claude/analytics-2026-10-06.md`. Most clicks come from searches that name a place and a year
("bowmanville salmon run 2026"). The Humber is #2 in app river picks.

## Open threads

1. **Sep 9 to 25 search drop.** Cause unknown. Need Umami daily visitors for September, plus
   Search Console Page indexing and Manual actions.
2. **Request indexing** for `/guides/steelhead-run-timing/` and `/rivers/humber/` (TJ, in Search Console).
3. **Umami species breakdown** hasn't been reviewed. The river breakdown has.
4. **Closed-water pill:** done in #66 (merged).
5. **Dead code:** done in #66. Removed `populateMethodBaits`, `applyBaitShowMore`,
   `adaptLurePanel` (no-op: `#bpanels-primary` does not exist) and `assets/Test`. **`#bait-source` is NOT dead.**
   It is hidden, but `renderBaitPillar()` reads its cards to build the Bait pillar. Keep it.
6. **Thumbnails:** done in #66 (no `maxresdefault` left). #66 also removed Rouge Marsh (warmwater only; it ranked #1
   on crowd alone). **Awaiting merge** in PR #67: with no species picked, gear follows the hero's species (it was trout
   nymphing for Chinook).
7. **Next year:** switch "2026" to "2027" in titles and copy before staging season (July 2027).
8. **Unconfirmed gauge:** the Humber sections and Black Creek all use `02HC025`. Check it's the right station for each.
9. Carried over: `BAIT_ADVICE` draft copy, photo permissions and licences, Nottawasaga Pine
   River confluence is open all year but sits in a `standard` section (over-cautious).
10. **Staging, no species picked:** fixed on `claude/default-species-gear` (PR #67, awaiting merge). The hero now names
    the staging salmon at the mouth with spinning gear. Still open: with **Brown Trout picked** on a staging day at a
    mouth section (Bronte, Lower Humber, Nottawasaga Lower, Sixteen Mile), the Technique panel says spoons and the hero
    says nymphing. Needs TJ's call on how to fish browns at the mouth in August.
11. **TJ's upstream rule:** after Sep 30, fish as far upstream as the regs allow ("above the CNR if legal, else
    below it"). Today the in-river pick only knows "not the mouth" (the `mouth` flag). A real upstream pick needs a
    per-section upstream order for `access[]`. TJ chose to skip that for now (2026-10-13).

A scheduled task runs on 2026-10-15 to ask TJ for Search Console and Umami data and recommend
the next pages to build.
