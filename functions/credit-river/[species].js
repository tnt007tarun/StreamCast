// functions/credit-river/[species].js
// Cloudflare Pages Function — handles /credit-river/{species} routes
// Runs on herefishyfishy.ca domain, before Pages serves index.html

// ── ROUTE TABLE ──────────────────────────────────────────────────────────────
const SSR_ROUTES = {
  'brown-trout': {
    river: 'Credit River',
    species: 'Brown Trout',
    section: 'Upper Credit River',
    gauge: '02HB001',
    sweetMin: 5, sweetMax: 15,
    lat: 43.870, lng: -80.010,
    seasonMonths: [3, 9],
    access: [
      'Forks of the Credit Provincial Park — Cataract, ON',
      'Belfountain Conservation Area — Belfountain, ON',
      'Upper Credit Conservation Area — Caledon, ON',
    ],
    evergreen: `The Upper Credit River is one of Southern Ontario's best wild brown trout fisheries. The river runs cold year-round through the Niagara Escarpment gorge, holding resident browns from Cataract down through Belfountain. Best action is April through June on nymphs and dry flies, and again in September as water cools. The stretch above Old Baseline Road in Caledon is catch-and-release, artificial only.`,
    tips: `Fish the seams at the head of pools in the morning before the sun hits the water. Hendrickson hatches in late April and early May draw fish to the surface. In summer, switch to a dropper rig with a small nymph off a dry fly.`,
  },
  'rainbow-trout': {
    river: 'Credit River',
    species: 'Rainbow Trout',
    section: 'Upper Credit River',
    gauge: '02HB001',
    sweetMin: 5, sweetMax: 15,
    lat: 43.870, lng: -80.010,
    seasonMonths: [2, 4],
    access: [
      'Norval Conservation Area — Norval, ON',
      'Streetsville Road Allowances — Mississauga, ON',
      'Forks of the Credit Provincial Park — Cataract, ON',
    ],
    evergreen: `Rainbow trout enter the Credit River in spring, typically March through May. Resident rainbows hold in the upper reaches year-round in smaller numbers. The best spring run fishing is around Norval and the Forks, where fish stack below holding pools. Flows between 10–20 m³/s produce the best conditions.`,
    tips: `Drift roe, bead patterns, or large nymphs through the deep pools during peak flows. As levels drop through April, switch to lighter nymphing rigs with smaller flies. Early morning before 9AM is consistently the most productive window.`,
  },
  'brook-trout': {
    river: 'Credit River',
    species: 'Brook Trout',
    section: 'Upper Credit River',
    gauge: '02HB001',
    sweetMin: 3, sweetMax: 10,
    lat: 43.870, lng: -80.010,
    seasonMonths: [3, 9],
    access: [
      'Upper Credit Conservation Area — Caledon, ON (catch-and-release)',
      'Belfountain Conservation Area — Belfountain, ON',
    ],
    evergreen: `Brook trout are found in the coldest headwater reaches of the Upper Credit River, particularly in the catch-and-release sections above Old Baseline Road in Caledon. These are wild fish — smaller than the browns below but extraordinarily beautiful. Water temperature is key: brookies go off the feed when water exceeds 18°C in midsummer. Best fishing is May–June and again in September.`,
    tips: `Use light tackle — 3 or 4 weight fly rod, 5x or 6x tippet, small flies (size 14–18). Brook trout in clear headwater streams spook easily. Wade carefully, stay low, and cast accurately to specific fish rather than covering water randomly.`,
  },
  'steelhead': {
    river: 'Credit River',
    species: 'Steelhead',
    section: 'Middle Credit River',
    gauge: '02HB001',
    sweetMin: 8, sweetMax: 25,
    lat: 43.660, lng: -79.880,
    seasonMonths: [8, 4],
    access: [
      'Norval Conservation Area — Norval, ON',
      'Streetsville Conservation Area — Streetsville, ON',
      'Erindale Park — Mississauga, ON',
    ],
    evergreen: `Steelhead begin entering the Credit River in late September following the Chinook salmon run, and continue through winter into late April. Peak fishing is March–April when fish push upriver on rising spring temperatures. The middle section around Norval and Streetsville holds the most accessible water.`,
    tips: `In fall, swing large streamers or run float rigs with roe through the deeper pools. Spring fish are more willing to take nymphs dead-drifted through feeding lanes. Early morning before 9AM is consistently the most productive window on bright days.`,
  },
  'chinook-salmon': {
    river: 'Credit River',
    species: 'Chinook Salmon',
    section: 'Lower Credit River',
    gauge: '02HB001',
    sweetMin: 10, sweetMax: 40,
    lat: 43.560, lng: -79.720,
    seasonMonths: [8, 10],
    access: [
      'Erindale Park — Mississauga, ON',
      'Port Credit Harbour Mouth — Port Credit, ON',
      'Streetsville Conservation Area — Streetsville, ON',
    ],
    evergreen: `Chinook salmon enter the Credit River from Lake Ontario starting in late September, with peak numbers moving through in October. Fish stack near the harbour mouth at Port Credit waiting for sufficient flow, then push upriver after rain events. The lower Credit through Mississauga holds the most fish.`,
    tips: `Target the Credit during and just after rain events when flows spike above 15 m³/s — fresh fish push hard on rising water. Anchor beads, roe bags, or large streamers near the bottom of the deepest pools. Early morning low-light conditions produce the most aggressive fish.`,
  },
  'coho-salmon': {
    river: 'Credit River',
    species: 'Coho Salmon',
    section: 'Lower Credit River',
    gauge: '02HB001',
    sweetMin: 8, sweetMax: 30,
    lat: 43.560, lng: -79.720,
    seasonMonths: [9, 10],
    access: [
      'Erindale Park — Mississauga, ON',
      'Port Credit Harbour Mouth — Port Credit, ON',
    ],
    evergreen: `Coho salmon arrive on the Credit River in October, following the main Chinook push. Smaller and more acrobatic than Chinook, coho are known for aggressive takes and spectacular aerial fights. They hold higher in the water column than Chinook and are more willing to chase flies and lures.`,
    tips: `Coho respond well to swung flies and small spoons — a size 2 silver spoon retrieved steadily through pools can be deadly. Focus on the lower 5km of the Credit, particularly in the pools below Erindale Park.`,
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
function renderPage(route, cond, speciesSlug) {
  const qualityColor = { excellent: '#6dbf8a', good: '#6dbf8a', marginal: '#e8a85a', tough: '#e07070', 'out-of-season': '#9ecfca' }[cond.quality] || '#9ecfca';
  const stateColor = s => ({ good: '#6dbf8a', ok: '#e8a85a', poor: '#e07070', unknown: '#9ecfca' }[s] || '#9ecfca');
  const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Toronto' });
  // Map URL slug to the app's internal species key (data-value on species buttons)
  const speciesKeyMap = {
    'brown-trout': 'brown', 'rainbow-trout': 'rainbow', 'brook-trout': 'brook',
    'steelhead': 'steelhead', 'chinook-salmon': 'chinook', 'coho-salmon': 'coho'
  };
  const speciesKey = speciesKeyMap[speciesSlug] || speciesSlug;
  const appLink = `https://herefishyfishy.ca/?river=${encodeURIComponent(route.section)}&species=${speciesKey}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${route.river} ${route.species} Fishing Conditions Today — HereFishyFishy</title>
  <meta name="description" content="Live ${route.species} fishing conditions on the ${route.river} today. Flow: ${cond.flow != null ? cond.flow + ' m3/s' : 'check gauge'} · Water: ${cond.waterTemp != null ? '~' + cond.waterTemp + 'C' : 'unknown'} · Conditions: ${cond.qualityLabel}. Updated ${today}.">
  <link rel="canonical" href="https://herefishyfishy.ca/credit-river/${speciesSlug}">
  <link rel="icon" href="https://herefishyfishy.ca/favicon.ico">
  <meta property="og:title" content="${route.river} ${route.species} — ${cond.qualityLabel} today">
  <meta property="og:url" content="https://herefishyfishy.ca/credit-river/${speciesSlug}">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"${route.river} ${route.species} Fishing Conditions","url":"https://herefishyfishy.ca/credit-river/${speciesSlug}","isPartOf":{"@type":"WebApplication","name":"HereFishyFishy","url":"https://herefishyfishy.ca"}}</script>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#f5f0ea;color:#1a2e3a}
    a{color:#1e7a6e}
    .topbar{background:#0d1f2d;padding:.75rem 1.5rem;display:flex;align-items:center;justify-content:space-between}
    .topbar-brand{font-family:Georgia,serif;font-style:italic;font-weight:700;color:#fff;font-size:1.1rem;text-decoration:none}
    .topbar-link{font-size:.75rem;color:#9ecfca;text-decoration:none}
    .hero{background:linear-gradient(160deg,#0d1f2d,#1a3a4a);padding:2rem 1.5rem 1.75rem}
    .hero-inner{max-width:680px;margin:0 auto}
    .eyebrow{font-family:'Courier New',monospace;font-size:.55rem;letter-spacing:.15em;text-transform:uppercase;color:#9ecfca;opacity:.65;margin-bottom:.5rem}
    .hero-title{font-size:1.6rem;font-weight:800;color:#fff;line-height:1.15;margin-bottom:.25rem}
    .hero-sub{font-size:.9rem;color:#9ecfca;margin-bottom:1rem}
    .quality-pill{display:inline-block;font-family:'Courier New',monospace;font-size:.72rem;font-weight:700;letter-spacing:.06em;color:${qualityColor};background:${qualityColor}22;padding:.3rem .8rem;border-radius:20px;margin-bottom:1.25rem}
    .tiles{display:flex;gap:6px;margin-bottom:1.25rem}
    .tile{flex:1;border-radius:10px;overflow:hidden;background:rgba(255,255,255,.04);border:1px solid rgba(158,207,202,.12)}
    .tile-bar{height:4px}
    .tile-body{padding:9px 8px}
    .tile-lbl{font-family:'Courier New',monospace;font-size:.52rem;letter-spacing:.06em;color:#9ecfca;opacity:.85;text-transform:uppercase;font-weight:700;margin-bottom:4px}
    .tile-val{font-size:1rem;font-weight:700;color:#fff;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tile-meaning{font-family:'Courier New',monospace;font-size:.48rem;margin-top:3px;text-transform:uppercase}
    .cta{display:block;background:#1e7a6e;color:#fff;text-align:center;padding:.85rem 1rem;border-radius:10px;font-weight:700;font-size:.95rem;text-decoration:none}
    .cta-note{font-size:.65rem;color:#9ecfca;opacity:.65;text-align:center;margin-top:.4rem;font-family:'Courier New',monospace}
    .content{max-width:680px;margin:0 auto;padding:1.5rem}
    .card{background:#fff;border-radius:14px;padding:1.25rem;margin-bottom:1rem;border:1px solid rgba(30,122,110,.1)}
    .card-title{font-family:'Courier New',monospace;font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:#4a8c7a;margin-bottom:.6rem}
    .card-body{font-size:.9rem;line-height:1.65;color:#2c3e50}
    .tip{margin-top:.75rem;padding:.6rem .85rem;background:rgba(30,122,110,.05);border-left:3px solid #1e7a6e;border-radius:0 6px 6px 0;font-size:.85rem;color:#1a3a4a;line-height:1.55}
    .access-list{list-style:none}
    .access-list li{padding:.4rem 0;border-bottom:1px solid rgba(30,122,110,.08);font-size:.88rem}
    .access-list li:last-child{border-bottom:none}
    .access-list li::before{content:'📍 '}
    .links{display:flex;flex-direction:column;gap:.4rem}
    .updated{font-family:'Courier New',monospace;font-size:.6rem;color:#9ab5b0;text-align:center;padding:1rem;letter-spacing:.05em}
    .footer{background:#0d1f2d;padding:1.25rem 1.5rem;text-align:center}
    .footer a{color:#9ecfca;font-size:.8rem;text-decoration:none;margin:0 .75rem}
  </style>
</head>
<body>
<div class="topbar">
  <a href="https://herefishyfishy.ca" class="topbar-brand">HereFishyFishy</a>
  <a href="https://herefishyfishy.ca" class="topbar-link">All rivers &rarr;</a>
</div>
<div class="hero">
  <div class="hero-inner">
    <div class="eyebrow">Live conditions &middot; ${today}</div>
    <div class="hero-title">${route.river} &middot; ${route.species}</div>
    <div class="hero-sub">${route.section}</div>
    <div class="quality-pill">Conditions: ${cond.qualityLabel}</div>
    <div class="tiles">
      <div class="tile">
        <div class="tile-bar" style="background:${stateColor(cond.flowState)}"></div>
        <div class="tile-body">
          <div class="tile-lbl">Flow</div>
          <div class="tile-val">${cond.flow != null ? cond.flow : '&mdash;'}</div>
          <div class="tile-meaning" style="color:${stateColor(cond.flowState)}">${cond.flowLabel}</div>
        </div>
      </div>
      <div class="tile">
        <div class="tile-bar" style="background:${stateColor(cond.tempState)}"></div>
        <div class="tile-body">
          <div class="tile-lbl">Water</div>
          <div class="tile-val">${cond.waterTemp != null ? '~' + cond.waterTemp + '&deg;' : '&mdash;'}</div>
          <div class="tile-meaning" style="color:${stateColor(cond.tempState)}">${cond.tempLabel}</div>
        </div>
      </div>
      <div class="tile">
        <div class="tile-bar" style="background:${stateColor(cond.skyState)}"></div>
        <div class="tile-body">
          <div class="tile-lbl">Sky</div>
          <div class="tile-val">${cond.cloudPct != null ? cond.cloudPct + '%' : '&mdash;'}</div>
          <div class="tile-meaning" style="color:${stateColor(cond.skyState)}">${cond.skyLabel}</div>
        </div>
      </div>
    </div>
    <a href="${appLink}" class="cta">See full conditions, access points &amp; gear &rarr;</a>
    <div class="cta-note">Opens the full app &middot; free &middot; no account needed</div>
  </div>
</div>
<div class="content">
  <div class="card">
    <div class="card-title">About ${route.river} ${route.species} fishing</div>
    <div class="card-body">${route.evergreen}<div class="tip">${route.tips}</div></div>
  </div>
  <div class="card">
    <div class="card-title">Access points</div>
    <ul class="access-list">${route.access.map(a => `<li>${a}</li>`).join('')}</ul>
  </div>
  <div class="card">
    <div class="card-title">More Credit River fishing</div>
    <div class="links">
      <a href="/credit-river/brown-trout">Credit River &mdash; Brown Trout</a>
      <a href="/credit-river/rainbow-trout">Credit River &mdash; Rainbow Trout</a>
      <a href="/credit-river/brook-trout">Credit River &mdash; Brook Trout</a>
      <a href="/credit-river/steelhead">Credit River &mdash; Steelhead</a>
      <a href="/credit-river/chinook-salmon">Credit River &mdash; Chinook Salmon</a>
      <a href="/credit-river/coho-salmon">Credit River &mdash; Coho Salmon</a>
    </div>
  </div>
</div>
<div class="updated">Conditions updated ${new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })} ET &middot; Flow: Water Survey of Canada &middot; Weather: Open-Meteo</div>
<div class="footer">
  <a href="https://herefishyfishy.ca">Home</a>
  <a href="https://herefishyfishy.ca/sitemap.xml">Sitemap</a>
</div>
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

  // Cache key
  const cacheKey = `ssr:credit-river:${speciesSlug}`;
  if (env.CACHE) {
    try {
      const cached = await env.CACHE.get(cacheKey);
      if (cached) return new Response(cached, { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'X-Cache': 'HIT' } });
    } catch (e) {}
  }

  // Fetch flow + weather in parallel
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

  // Cache for 30 minutes
  if (env.CACHE) {
    try { await env.CACHE.put(cacheKey, html, { expirationTtl: 1800 }); } catch (e) {}
  }

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'X-Cache': 'MISS' } });
}
