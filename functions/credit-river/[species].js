// functions/credit-river/[species].js
// Cloudflare Pages Function — handles /credit-river/{species} routes

// ── ROUTE TABLE ──────────────────────────────────────────────────────────────
// gauge: the Lower Credit uses Streetsville (02HB029), NOT Cataract (02HB001).
// Cataract sits ~40 km upstream near the Forks and does not represent lower-river flow.
// access: must never list a reach that is closed during that species' season — see
// `closures` below, which is surfaced on the page.
const SSR_ROUTES = {
  'brown-trout': {
    river: 'Credit River',
    species: 'Brown Trout',
    section: 'Upper Credit River',
    gauge: '02HB001', gaugeName: 'Credit River near Cataract',
    sweetMin: 5, sweetMax: 15,
    lat: 43.870, lng: -80.010,
    seasonMonths: [3, 8],   // April – September (season closes Sept 30)
    access: [
      'Forks of the Credit Provincial Park — Cataract, ON',
      'Belfountain Conservation Area — Belfountain, ON',
      'Upper Credit Conservation Area — Caledon, ON',
    ],
    closures: 'Above Old Baseline Road: artificial lures only, one single-pointed barbless hook, and catch-and-release for Brook, Brown and Rainbow Trout. Season runs from the fourth Saturday in April to September 30 — this water is closed October 1 to December 31.',
    evergreen: `The Upper Credit is one of Southern Ontario's best wild brown trout fisheries. The river runs cold year-round through the Niagara Escarpment gorge, holding resident browns from Cataract down through Belfountain. Best action is April through June on nymphs and dry flies, and again in September as the water cools.`,
    tips: `Fish the seams at the head of pools in the morning before the sun hits the water. Hendrickson hatches in late April and early May bring fish to the surface. In summer, switch to a dropper rig with a small nymph off a dry fly.`,
  },
  'rainbow-trout': {
    river: 'Credit River',
    species: 'Rainbow Trout',
    section: 'Middle Credit River',
    gauge: '02HB001', gaugeName: 'Credit River near Cataract',
    sweetMin: 5, sweetMax: 20,
    lat: 43.660, lng: -79.880,
    seasonMonths: [2, 4],   // March – May
    access: [
      'McNab Park — Norval, ON (below the Norval dam)',
      'Forks of the Credit Provincial Park — Cataract, ON',
    ],
    closures: 'The Forks reach is artificial lures only, single barbless hook, and catch-and-release for trout. Streetsville Road Allowances is deliberately not listed here: part of that reach sits below the Britannia Road bridge, inside the Hwy 403–Britannia sanctuary that closes August 15 to December 31.',
    evergreen: `Rainbow trout run the Credit in spring, typically March through May, and resident rainbows hold in the upper reaches year-round in smaller numbers. Worth knowing how they get there: migratory fish stop at the Streetsville dam, and the water above it is stocked by hand — Credit River Anglers Association volunteers lift fish through the fishway and truck them 30 km north past the Norval dam. The ladder runs daily from ice-out to late April, which is exactly the spring run.`,
    tips: `Drift roe, beads or large nymphs through the deep pools during peak flows — but note that the artificial-only reaches above Old Baseline allow no bait at all. As levels drop through April, switch to lighter nymphing rigs with smaller flies. Before 9am is consistently the most productive window. Below Streetsville you are fishing fish that arrived under their own power; above it, fish that were carried.`,
  },
  'brook-trout': {
    river: 'Credit River',
    species: 'Brook Trout',
    section: 'Upper Credit River',
    gauge: '02HB001', gaugeName: 'Credit River near Cataract',
    sweetMin: 3, sweetMax: 10,
    lat: 43.870, lng: -80.010,
    seasonMonths: [3, 8],
    access: [
      'Upper Credit Conservation Area — Caledon, ON',
      'Belfountain Conservation Area — Belfountain, ON',
    ],
    closures: 'Catch-and-release only for Brook Trout on this stretch, artificial lures only, one single-pointed barbless hook. Season closes September 30.',
    evergreen: `Brook trout hold in the coldest headwater reaches of the Upper Credit, particularly above Old Baseline Road in Caledon. These are wild fish — smaller than the browns below but extraordinarily beautiful. Water temperature is the whole game: brookies go off the feed above 18°C, so midsummer is unproductive. Best fishing is May–June and again in September.`,
    tips: `Use light tackle — a 3 or 4 weight, 5x or 6x tippet, flies in the 14–18 range. Brook trout in clear headwater streams spook easily. Wade carefully, stay low, and cast to specific fish rather than covering water at random.`,
  },
  'steelhead': {
    river: 'Credit River',
    species: 'Steelhead',
    section: 'Lower Credit River',
    gauge: '02HB029', gaugeName: 'Credit River at Streetsville',
    sweetMin: 8, sweetMax: 25,
    lat: 43.560, lng: -79.720,
    seasonMonths: [8, 4],   // September – May
    access: [
      'Erindale Park — Mississauga, ON',
      'Credit River Mouth — Port Credit, ON',
    ],
    closures: 'Streetsville Road Allowances is deliberately not listed: part of that reach is below the Britannia Road bridge, inside the Hwy 403–Britannia sanctuary closed August 15 to December 31 — which covers most of the fall steelhead run. Erindale Park is downstream of Hwy 403 and open year-round.',
    evergreen: `Steelhead start entering the Credit in late September behind the Chinook run and keep coming through winter into late April. Peak fishing is March and April, when fish push upriver on rising spring temperatures. The lower river below Hwy 403 stays open all year. Unlike Chinook, steelhead get the whole river — they swim as far as the Streetsville dam, then Credit River Anglers Association volunteers lift them through the fishway and truck them 30 km north past Norval. When CRAA rebuilt the ladder entrance in 1997, the share of steelhead finding it went from 10–20% to 99.5%.`,
    tips: `In fall, swing large streamers or run float rigs with roe through the deeper pools. Spring fish are more willing to take nymphs dead-drifted through feeding lanes. Before 9am is consistently the most productive window on bright days.`,
  },
  'chinook-salmon': {
    river: 'Credit River',
    species: 'Chinook Salmon',
    section: 'Lower Credit River',
    gauge: '02HB029', gaugeName: 'Credit River at Streetsville',
    sweetMin: 5, sweetMax: 30,
    lat: 43.560, lng: -79.720,
    seasonMonths: [7, 10],  // August – November
    access: [
      'Credit River Mouth — Port Credit, ON',
      'Erindale Park — Mississauga, ON',
    ],
    closures: 'Streetsville Road Allowances is deliberately not listed: part of that reach is below the Britannia Road bridge, inside the Hwy 403–Britannia sanctuary closed August 15 to December 31 — the whole of the salmon run. Fish the mouth and Erindale instead; both are open.',
    evergreen: `Chinook stage off Port Credit harbour from late July and enter the Credit from late August, with peak numbers moving through in late September and October. Fish hold near the harbour mouth waiting for flow, then push upriver after rain. Until they commit, the pier and beach fish better than the river does.`,
    tips: `Target the Credit during and just after rain, when fresh fish push on rising water. While fish are still staging, cast spoons and spinners from the pier at dawn and dusk. Once they are in the river, float-fished roe or beads through the deepest pools is the more productive approach.`,
  },
  'coho-salmon': {
    river: 'Credit River',
    species: 'Coho Salmon',
    section: 'Lower Credit River',
    gauge: '02HB029', gaugeName: 'Credit River at Streetsville',
    sweetMin: 5, sweetMax: 30,
    lat: 43.560, lng: -79.720,
    seasonMonths: [8, 10],
    access: [
      'Credit River Mouth — Port Credit, ON',
      'Erindale Park — Mississauga, ON',
    ],
    closures: 'The Hwy 403–Britannia reach is closed August 15 to December 31. Erindale Park is downstream of Hwy 403 and open.',
    evergreen: `Coho arrive on the Credit in October, behind the main Chinook push. Smaller and more acrobatic than Chinook, they hold higher in the water column and are far more willing to chase a fly or a lure.`,
    tips: `Coho respond well to swung flies and small spoons — a size 2 silver spoon retrieved steadily through a pool can be deadly. Focus on the lower river, particularly the pools below Erindale Park.`,
  },
};

// ── SCORING LOGIC ────────────────────────────────────────────────────────────
function scoreConditions(flow, airTemp, cloudPct, route, month) {
  let flowState = 'unknown', flowLabel = 'Check gauge';
  if (flow != null) {
    if (flow >= route.sweetMin && flow <= route.sweetMax) { flowState = 'good'; flowLabel = 'In range'; }
    else if (flow < route.sweetMin) { flowState = flow >= route.sweetMin * 0.4 ? 'ok' : 'poor'; flowLabel = 'Low'; }
    else { flowState = flow <= route.sweetMax * 1.8 ? 'ok' : 'poor'; flowLabel = 'High'; }
  }

  const waterTemp = airTemp != null ? Math.round((airTemp * 0.7 + 4) * 10) / 10 : null;
  let tempState = 'unknown', tempLabel = 'Unknown';
  if (waterTemp != null) {
    if (waterTemp >= 8 && waterTemp <= 14) { tempState = 'good'; tempLabel = 'Ideal'; }
    else if (waterTemp >= 5 && waterTemp < 8) { tempState = 'ok'; tempLabel = 'Cool'; }
    else if (waterTemp > 14 && waterTemp <= 18) { tempState = 'ok'; tempLabel = 'Warm'; }
    else if (waterTemp > 18) { tempState = 'poor'; tempLabel = 'Too warm'; }
    else { tempState = 'poor'; tempLabel = 'Too cold'; }
  }

  let skyState = 'unknown', skyLabel = 'Unknown';
  if (cloudPct != null) {
    if (cloudPct >= 50) { skyState = 'good'; skyLabel = 'Good cover'; }
    else if (cloudPct >= 25) { skyState = 'ok'; skyLabel = 'Some cover'; }
    else { skyState = 'poor'; skyLabel = 'Clear sky'; }
  }

  const [seasonStart, seasonEnd] = route.seasonMonths;
  const inSeason = seasonStart <= seasonEnd
    ? month >= seasonStart && month <= seasonEnd
    : month >= seasonStart || month <= seasonEnd;

  const scores = { good: 2, ok: 1, poor: 0, unknown: 1 };
  const total = scores[flowState] + scores[tempState] + scores[skyState];
  let quality, qualityLabel;
  if (!inSeason) { quality = 'out-of-season'; qualityLabel = 'Out of season'; }
  else if (total >= 5) { quality = 'excellent'; qualityLabel = 'Excellent'; }
  else if (total >= 3) { quality = 'good'; qualityLabel = 'Good'; }
  else if (total >= 2) { quality = 'marginal'; qualityLabel = 'Marginal'; }
  else { quality = 'tough'; qualityLabel = 'Tough'; }

  return { quality, qualityLabel, inSeason,
    flow: flow != null ? Math.round(flow * 10) / 10 : null,
    flowState, flowLabel, waterTemp, tempState, tempLabel, cloudPct, skyState, skyLabel };
}

// ── HTML TEMPLATE ────────────────────────────────────────────────────────────
// Editorial styling, matching /guides/ and /rivers/: serif on paper, hairline rules,
// no gradient hero and no shadowed cards.
function renderPage(route, cond, speciesSlug) {
  const stateColor = s => ({ good: '#1e7a6e', ok: '#b8620f', poor: '#a3402f', unknown: '#6b7d86' }[s] || '#6b7d86');
  const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Toronto' });
  const speciesKeyMap = {
    'brown-trout': 'brown', 'rainbow-trout': 'rainbow', 'brook-trout': 'brook',
    'steelhead': 'steelhead', 'chinook-salmon': 'chinook', 'coho-salmon': 'coho'
  };
  const speciesKey = speciesKeyMap[speciesSlug] || speciesSlug;
  const appLink = `/?river=${encodeURIComponent(route.section)}&species=${speciesKey}`;
  const others = Object.keys(SSR_ROUTES).filter(k => k !== speciesSlug);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Credit River ${route.species} — Conditions Today</title>
<meta name="description" content="Live ${route.species} conditions on the Credit River. Flow ${cond.flow != null ? cond.flow + ' m³/s' : '— check gauge'}, water ${cond.waterTemp != null ? '~' + cond.waterTemp + '°C' : 'unknown'}, ${cond.qualityLabel.toLowerCase()}. Access points and regulations.">
<link rel="canonical" href="https://herefishyfishy.ca/credit-river/${speciesSlug}">
<meta property="og:title" content="Credit River ${route.species} — ${cond.qualityLabel} today">
<meta property="og:description" content="Live flow, water temperature and access points for ${route.species} on the Credit River.">
<meta property="og:url" content="https://herefishyfishy.ca/credit-river/${speciesSlug}">
<meta property="og:type" content="article">
<script defer src="https://cloud.umami.is/script.js" data-website-id="839b4e48-5eb8-4ef5-a7a4-d8cace66f68c"></script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Credit River ${route.species} Fishing Conditions","url":"https://herefishyfishy.ca/credit-river/${speciesSlug}","isPartOf":{"@type":"WebSite","name":"HereFishyFishy","url":"https://herefishyfishy.ca"}}</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#1a2e3a;--text:#31414c;--muted:#6b7d86;--rule:#e2ded6;--paper:#fbf9f5;
--fern:#1e7a6e;--amber:#b8620f;
--serif:Charter,'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif}
body{background:var(--paper);color:var(--text);
font:400 19px/1.72 var(--serif);-webkit-font-smoothing:antialiased}
a{color:var(--fern)}
.wrap{max-width:660px;margin:0 auto;padding:0 1.4rem}
.mast{border-bottom:1px solid var(--rule)}
.mast .wrap{display:flex;align-items:center;justify-content:space-between;
padding:1.1rem 1.4rem;max-width:900px}
.mast .brand{font:italic 700 1.05rem/1 var(--serif);color:var(--ink);text-decoration:none}
.mast nav{display:flex;gap:1.3rem}
.mast nav a{font:500 .78rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
color:var(--muted);text-decoration:none}
article{padding:3rem 0 4rem}
.eyebrow{font:600 .68rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
letter-spacing:.14em;text-transform:uppercase;color:var(--amber);margin-bottom:1rem}
h1{font:700 2.3rem/1.15 var(--serif);color:var(--ink);letter-spacing:-.015em;margin-bottom:.9rem}
.standfirst{font-size:1.18rem;line-height:1.6}
.byline{font:500 .76rem/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
color:var(--muted);margin:1.4rem 0 0;padding-top:1rem;border-top:1px solid var(--rule)}
p{margin:0 0 1.3rem}
h2{font:700 1.5rem/1.28 var(--serif);color:var(--ink);margin:2.8rem 0 1rem}
strong{font-weight:600;color:var(--ink)}
.now{border-top:2px solid var(--ink);border-bottom:1px solid var(--rule);
padding:1.2rem 0 1.3rem;margin:2.2rem 0}
.now-lbl{font:600 .68rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
letter-spacing:.13em;text-transform:uppercase;color:var(--ink);margin-bottom:.9rem}
.tiles{display:flex;gap:1.6rem;flex-wrap:wrap}
.tile-lbl{font:600 .62rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
letter-spacing:.11em;text-transform:uppercase;color:var(--muted);margin-bottom:.3rem}
.tile-val{font:700 1.5rem/1 var(--serif);color:var(--ink)}
.tile-meaning{font:600 .62rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
letter-spacing:.08em;text-transform:uppercase;margin-top:.35rem}
.verdict{font:600 .8rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
letter-spacing:.06em;margin-top:1.1rem}
.cta-line{margin-top:1.1rem}
.cta-line a{font:600 .88rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
text-decoration:none;border-bottom:2px solid rgba(30,122,110,.3);padding-bottom:2px}
.regs{border-left:3px solid var(--amber);padding:.2rem 0 .2rem 1.3rem;margin:2rem 0}
.regs-lbl{font:600 .68rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
letter-spacing:.13em;text-transform:uppercase;color:var(--amber);margin-bottom:.6rem}
.regs p{font-size:1rem;margin:0}
ul{margin:0 0 1.3rem 1.2rem}li{margin-bottom:.45rem}
.other{list-style:none;margin:0}
.other li{border-bottom:1px solid var(--rule);margin:0}
.other a{display:block;padding:.8rem 0;text-decoration:none;color:var(--ink);
font:700 1rem/1.3 var(--serif)}
.other a:hover{color:var(--fern)}
.endnote{margin-top:3rem;padding-top:1.3rem;border-top:1px solid var(--rule);
font:400 .84rem/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--muted)}
footer.site{border-top:1px solid var(--rule);margin-top:2.5rem}
footer.site .wrap{display:flex;justify-content:space-between;gap:1.2rem;flex-wrap:wrap;
padding-top:1.5rem;padding-bottom:2.2rem;max-width:900px;align-items:center}
footer.site a{font:500 .8rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
color:var(--muted);text-decoration:none}
footer.site .b{font:italic 700 .95rem/1 var(--serif);color:var(--ink)}
@media(max-width:640px){body{font-size:18px}h1{font-size:1.85rem}.tiles{gap:1.2rem}}
</style>
</head>
<body>
<header class="mast"><div class="wrap">
  <a class="brand" href="/">HereFishyFishy</a>
  <nav><a href="/rivers/">Rivers</a><a href="/guides/">Guides</a><a href="/">Conditions</a></nav>
</div></header>

<article><div class="wrap">
  <div class="eyebrow"><a href="/rivers/credit/" style="color:inherit;text-decoration:none;border-bottom:1px solid rgba(184,98,15,.4)">Credit River</a> &middot; ${route.section}</div>
  <h1>Credit River ${route.species.toLowerCase()}, today</h1>
  <p class="standfirst">${route.evergreen}</p>
  <p class="byline">Live conditions &middot; ${today} &middot; Gauge: ${route.gaugeName}</p>

  <div class="now">
    <div class="now-lbl">The river right now</div>
    <div class="tiles">
      <div><div class="tile-lbl">Flow</div>
        <div class="tile-val">${cond.flow != null ? cond.flow + ' <span style="font-size:.8rem">m³/s</span>' : '&mdash;'}</div>
        <div class="tile-meaning" style="color:${stateColor(cond.flowState)}">${cond.flowLabel}</div></div>
      <div><div class="tile-lbl">Water temp</div>
        <div class="tile-val">${cond.waterTemp != null ? '~' + cond.waterTemp + '&deg;' : '&mdash;'}</div>
        <div class="tile-meaning" style="color:${stateColor(cond.tempState)}">${cond.tempLabel}</div></div>
      <div><div class="tile-lbl">Sky</div>
        <div class="tile-val">${cond.cloudPct != null ? cond.cloudPct + '%' : '&mdash;'}</div>
        <div class="tile-meaning" style="color:${stateColor(cond.skyState)}">${cond.skyLabel}</div></div>
    </div>
    <div class="verdict" style="color:${stateColor(cond.quality === 'excellent' || cond.quality === 'good' ? 'good' : cond.quality === 'marginal' ? 'ok' : 'poor')}">
      Conditions: ${cond.qualityLabel}${route.sweetMin ? ` &middot; aim for ${route.sweetMin}&ndash;${route.sweetMax} m³/s` : ''}
    </div>
    <div class="cta-line"><a href="${appLink}">See access points, technique and gear for today &rarr;</a></div>
  </div>

  <h2>How to fish it</h2>
  <p>${route.tips}</p>

  <div class="regs">
    <div class="regs-lbl">Before you go</div>
    <p>${route.closures} Confirm the current rules in the <a href="https://www.ontario.ca/page/ontario-fishing-regulations" target="_blank" rel="noopener">Ontario fishing regulations</a> for Zone 16 before you fish.</p>
  </div>

  <h2>Access points</h2>
  <ul>${route.access.map(a => `<li>${a}</li>`).join('')}</ul>

  <h2>Read next</h2>
  <p>For the river as a whole &mdash; the three sections, the two dams, and why which stretch you pick
  matters more here than anywhere &mdash; see <a href="/rivers/credit/">fishing the Credit River</a>.
  Timing for every Ontario river is in the <a href="/guides/salmon-run-timing/">river-by-river salmon
  run guide</a>, and for the drift itself, <a href="/guides/salmon-float-fishing-tips/">three float
  fishing tips</a>.</p>

  <h2>Other species on the Credit</h2>
  <ul class="other">${others.map(k => `<li><a href="/credit-river/${k}">${SSR_ROUTES[k].species} &rarr;</a></li>`).join('')}</ul>

  <div class="endnote">
    <strong>Sources.</strong> Flow: Water Survey of Canada, ${route.gaugeName} (${route.gauge}) &middot;
    Weather: Open-Meteo &middot; Ontario Fishing Regulations Summary 2026, Zone 16. Conditions refresh
    every 30 minutes. Regulations change and vary by reach — always confirm the rules for the exact
    stretch you plan to fish.
  </div>
</div></article>

<footer class="site"><div class="wrap">
  <span class="b">HereFishyFishy</span>
  <span><a href="/rivers/">Rivers</a> &nbsp; <a href="/guides/">Guides</a> &nbsp; <a href="/about">About</a></span>
</div></footer>
</body>
</html>`;
}

// ── PAGES FUNCTION HANDLER ────────────────────────────────────────────────────
export async function onRequest(context) {
  const { params, env } = context;
  const speciesSlug = params.species;
  const route = SSR_ROUTES[speciesSlug];

  if (!route) {
    return new Response('Not found', { status: 404 });
  }

  const cacheKey = `ssr:credit-river:${speciesSlug}`;
  if (env.CACHE) {
    try {
      const cached = await env.CACHE.get(cacheKey);
      if (cached) return new Response(cached, { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'X-Cache': 'HIT' } });
    } catch (e) {}
  }

  const PROXY = 'https://streamcast-proxy.tnt-tarun.workers.dev';
  const [flowRes, wxRes] = await Promise.allSettled([
    fetch(`${PROXY}/flow?station=${route.gauge}`).then(r => r.json()).catch(() => null),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${route.lat}&longitude=${route.lng}&current=temperature_2m,cloudcover&timezone=America%2FToronto`).then(r => r.json()).catch(() => null),
  ]);

  const flow = flowRes.status === 'fulfilled' && flowRes.value?.flow != null ? flowRes.value.flow : null;
  const airTemp = wxRes.status === 'fulfilled' && wxRes.value?.current?.temperature_2m != null ? wxRes.value.current.temperature_2m : null;
  const cloudPct = wxRes.status === 'fulfilled' && wxRes.value?.current?.cloudcover != null ? wxRes.value.current.cloudcover : null;

  const cond = scoreConditions(flow, airTemp, cloudPct, route, new Date().getMonth());
  const html = renderPage(route, cond, speciesSlug);

  if (env.CACHE) {
    try { await env.CACHE.put(cacheKey, html, { expirationTtl: 1800 }); } catch (e) {}
  }

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'X-Cache': 'MISS' } });
}
