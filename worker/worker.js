import { runWeekly, weeklyInterests } from "./weekly.js";
var ARCGIS_BASE = "https://services1.arcgis.com/TJH5KDher0W13Kgo/arcgis/rest/services/FishStockingDataForRecreationalPurposes/FeatureServer/0/query";
var EC_FLOW_BASE = "https://api.weather.gc.ca/collections/hydrometric-realtime/items";
var CACHE_TTL_STOCKING = 86400;
var CACHE_TTL_FLOW = 300;
var CACHE_TTL_LAKE = 3600;
var NDBC_BASE = "https://www.ndbc.noaa.gov/data/realtime2/";
var BUOYS = {
  west: "45139",
  east: "45012",
  georgian: "45143"
};
var ZONE_BUOY = {
  credit: "west",
  humber: "west",
  bronte: "west",
  sixteen: "west",
  rouge: "west",
  duffins: "west",
  bowmanville: "west",
  wilmot: "west",
  ganaraska: "east",
  nottawasaga: "georgian"
};
var NEARSHORE_OFFSET_C = 1.5;
var BUOY_MAX_AGE_HOURS = 12;
var F = {
  district: "MNRF_District",
  year: "Stocking_Year",
  species: "Species",
  nameOfficial: "Official_Waterbody_Name",
  nameUnofficial: "Unoffcial_Waterbody_Name",
  // typo in source
  wbid: "Waterbody_Location_Identifier",
  stage: "Developmental_Stage",
  quantity: "Number_of_Fish_Stocked",
  lat: "Latitude",
  lng: "Longitude"
};
var STREAMCAST_RIVERS = [
  { name: "Credit River", keyword: "Credit" },
  { name: "Grand River", keyword: "Grand" },
  { name: "Humber River", keyword: "Humber" },
  { name: "Bronte Creek", keyword: "Bronte" },
  { name: "Duffins Creek", keyword: "Duffin" },
  { name: "Rouge River", keyword: "Rouge" },
  { name: "Sixteen Mile Creek", keyword: "Sixteen Mile" },
  { name: "Ganaraska River", keyword: "Ganaraska" },
  { name: "Beaver River", keyword: "Beaver" },
  { name: "Saugeen River", keyword: "Saugeen" },
  { name: "Nottawasaga River", keyword: "Nottawasaga" },
  { name: "Speed River", keyword: "Speed" },
  { name: "Eramosa River", keyword: "Eramosa" },
  { name: "Bowmanville Creek", keyword: "Bowmanville" },
  { name: "Wilmot Creek", keyword: "Wilmot" }
];
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function jsonResponse(data, status = 200, ttl = 0) {
  const headers = { ...CORS, "Content-Type": "application/json" };
  if (ttl > 0)
    headers["Cache-Control"] = `public, max-age=${ttl}`;
  return new Response(JSON.stringify(data), { status, headers });
}
function errorResponse(msg, status = 500) {
  return jsonResponse({ error: msg }, status);
}
async function fetchStockingForRiver({ name, keyword }) {
  const where = `${F.nameOfficial} LIKE '%${keyword}%' OR ${F.nameUnofficial} LIKE '%${keyword}%'`;
  const params = new URLSearchParams({
    where,
    outFields: [F.year, F.species, F.nameOfficial, F.nameUnofficial, F.stage, F.quantity, F.district].join(","),
    orderByFields: `${F.year} DESC`,
    resultRecordCount: "200",
    f: "json"
  });
  const res = await fetch(`${ARCGIS_BASE}?${params}`, {
    headers: { "Accept": "application/json", "User-Agent": "StreamCast/1.0" }
  });
  if (!res.ok)
    throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error)
    throw new Error(data.error.message || JSON.stringify(data.error));
  return data.features || [];
}
function summarise(features, riverName) {
  if (!features.length)
    return null;
  const perSpecies = {};
  features.forEach((f) => {
    const p = f.attributes;
    const sp = p[F.species] || "Unknown";
    const yr = p[F.year] || 0;
    if (!perSpecies[sp] || yr > perSpecies[sp].year) {
      perSpecies[sp] = {
        species: sp,
        year: yr,
        stage: p[F.stage] || null,
        // e.g. "Yearlings", "Fry", "Adults"
        quantity: p[F.quantity] || null,
        waterbody: p[F.nameOfficial] || p[F.nameUnofficial] || riverName
      };
    }
  });
  const stockedSpecies = Object.values(perSpecies).sort((a, b) => b.year - a.year);
  return {
    stockedSpecies,
    mostRecentYear: stockedSpecies[0]?.year || null,
    totalRecords: features.length
  };
}
async function handleStocking(url, ctx) {
  const singleRiverName = url.searchParams.get("river");
  const rivers = singleRiverName ? STREAMCAST_RIVERS.filter((r) => r.name === singleRiverName) : STREAMCAST_RIVERS;
  if (singleRiverName && !rivers.length) {
    return errorResponse(`Unknown river: ${singleRiverName}. Valid rivers: ${STREAMCAST_RIVERS.map((r) => r.name).join(", ")}`, 400);
  }
  const cacheKey = new Request(
    `https://cache.streamcast/stocking-v3?rivers=${rivers.map((r) => r.name).join(",")}`
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached)
    return cached;
  const result = { updated: (new Date()).toISOString(), rivers: {}, errors: {} };
  for (const river of rivers) {
    try {
      const features = await fetchStockingForRiver(river);
      const summary = summarise(features, river.name);
      result.rivers[river.name] = summary || { stockedSpecies: [], mostRecentYear: null, totalRecords: 0, note: "No stocking records found" };
    } catch (e) {
      result.errors[river.name] = e.message;
    }
  }
  const response = jsonResponse(result, 200, CACHE_TTL_STOCKING);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
async function handleFlow(url, ctx) {
  const station = url.searchParams.get("station");
  if (!station)
    return errorResponse("Missing ?station= parameter", 400);
  if (!/^[0-9A-Z]{5,10}$/.test(station))
    return errorResponse("Invalid station ID", 400);
  const cacheKey = new Request(`https://cache.streamcast/flow?station=${station}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached)
    return cached;
  const params = new URLSearchParams({
    STATION_NUMBER: station,
    sortby: "-DATETIME",
    limit: "5",
    f: "json"
  });
  let upstream;
  try {
    upstream = await fetch(`${EC_FLOW_BASE}?${params}`, {
      headers: { "Accept": "application/json", "User-Agent": "StreamCast/1.0" }
    });
  } catch (e) {
    return errorResponse("EC fetch failed: " + e.message);
  }
  if (!upstream.ok)
    return errorResponse(`EC returned ${upstream.status}`);
  const raw = await upstream.json();
  const features = raw.features || [];
  if (!features.length)
    return jsonResponse({ flow: null, trend: null, station });
  const getVal = (obj, keys) => {
    for (const k of keys) {
      if (obj[k] != null)
        return parseFloat(obj[k]);
      const kl = Object.keys(obj).find((ok) => ok.toLowerCase() === k.toLowerCase());
      if (kl && obj[kl] != null)
        return parseFloat(obj[kl]);
    }
    return null;
  };
  const readings = features.map((f) => ({
    flow: getVal(f.properties, ["DISCHARGE", "discharge", "LEVEL", "level"]),
    at: f.properties.DATETIME || f.properties.datetime || null
  })).filter((r) => r.flow != null && !isNaN(r.flow));
  if (!readings.length)
    return jsonResponse({ flow: null, trend: null, station });
  const flow = Math.round(readings[0].flow * 100) / 100;
  const prev = readings[1]?.flow ?? null;
  const trend = prev == null ? "stable" : flow > prev + 0.05 ? "up" : flow < prev - 0.05 ? "down" : "stable";
  const response = jsonResponse({ flow, trend, at: readings[0].at, station }, 200, CACHE_TTL_FLOW);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
async function handleFields() {
  const res = await fetch(`${ARCGIS_BASE}?where=1%3D1&outFields=*&resultRecordCount=1&f=json`, {
    headers: { "Accept": "application/json", "User-Agent": "StreamCast/1.0" }
  });
  const data = await res.json();
  const fields = data.features?.[0]?.attributes ? Object.keys(data.features[0].attributes) : (data.fields || []).map((f) => f.name);
  return jsonResponse({ fields, sample: data.features?.[0]?.attributes || null });
}
function parseBuoyWtmp(text) {
  if (!text)
    return null;
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 3)
    return null;
  const header = lines[0].replace(/^#/, "").trim().split(/\s+/);
  let wtmpIdx = header.indexOf("WTMP");
  if (wtmpIdx === -1)
    wtmpIdx = 14;
  const now = Date.now();
  for (const line of lines) {
    if (line.startsWith("#"))
      continue;
    const f = line.trim().split(/\s+/);
    if (f.length <= wtmpIdx)
      continue;
    const raw = f[wtmpIdx];
    if (!raw || raw === "MM")
      continue;
    const val = parseFloat(raw);
    if (!isFinite(val) || val < -5 || val > 35)
      continue;
    const ts = Date.UTC(
      parseInt(f[0], 10),
      parseInt(f[1], 10) - 1,
      parseInt(f[2], 10),
      parseInt(f[3], 10),
      parseInt(f[4], 10)
    );
    if (!isFinite(ts))
      continue;
    if (now - ts > BUOY_MAX_AGE_HOURS * 3600 * 1e3)
      return null;
    return Math.round((val + NEARSHORE_OFFSET_C) * 10) / 10;
  }
  return null;
}
async function fetchBuoyTemp(stationId) {
  try {
    const r = await fetch(NDBC_BASE + stationId + ".txt", {
      cf: { cacheTtl: 1800, cacheEverything: true },
      headers: { "User-Agent": "HereFishyFishy/1.0 (herefishyfishy.ca)" }
    });
    if (!r.ok)
      return null;
    return parseBuoyWtmp(await r.text());
  } catch (e) {
    return null;
  }
}
async function handleLakeTemps(url, ctx) {
  const cacheKey = new Request("https://cache.streamcast/lake-temps-v2");
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached)
    return cached;
  const ids = Object.keys(BUOYS);
  const results = await Promise.all(ids.map((k) => fetchBuoyTemp(BUOYS[k])));
  const byBuoy = {};
  ids.forEach((k, i) => {
    byBuoy[k] = results[i];
  });
  const out = {};
  for (const zone of Object.keys(ZONE_BUOY)) {
    const t = byBuoy[ZONE_BUOY[zone]];
    out[zone] = t == null ? null : t;
  }
  const payload = {
    updated: (new Date()).toISOString(),
    source: "NDBC buoys 45139 (west Lk Ontario) / 45012 (east Lk Ontario) / 45143 (S Georgian Bay)",
    nearshoreOffsetC: NEARSHORE_OFFSET_C,
    buoys: byBuoy,
    temps: out
  };
  const response = jsonResponse(payload, 200, CACHE_TTL_LAKE);
  if (Object.values(byBuoy).some((v) => v != null)) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
var SSR_ROUTES = {
  "credit-river/brown-trout": {
    river: "Credit River",
    species: "Brown Trout",
    section: "Upper Credit River",
    // most relevant section for this species
    gauge: "02HB001",
    // Credit River near Cataract
    sweetMin: 5,
    sweetMax: 15,
    lat: 43.87,
    lng: -80.01,
    seasonMonths: [3, 9],
    // April–October (0-indexed)
    peakMonths: [3, 5],
    // April–June peak
    access: [
      "Forks of the Credit Provincial Park \u2014 Cataract, ON",
      "Belfountain Conservation Area \u2014 Belfountain, ON",
      "Upper Credit Conservation Area \u2014 Caledon, ON"
    ],
    evergreen: `The Upper Credit River is one of Southern Ontario's best wild brown trout fisheries. The river runs cold year-round through the Niagara Escarpment gorge, holding resident browns from Cataract down through Belfountain. Best action is April through June on nymphs and dry flies, and again in September as water cools. The stretch above Old Baseline Road in Caledon is catch-and-release, artificial only \u2014 some of the most pristine trout water in the province.`,
    tips: `Fish the seams at the head of pools in the morning before the sun hits the water. Hendrickson hatches in late April and early May draw fish to the surface \u2014 a size 14 parachute pattern dead-drifted over rising fish is hard to beat. In summer, switch to a dropper rig with a small nymph off a dry.`
  },
  "credit-river/rainbow-trout": {
    river: "Credit River",
    species: "Rainbow Trout",
    section: "Upper Credit River",
    gauge: "02HB001",
    sweetMin: 5,
    sweetMax: 15,
    lat: 43.87,
    lng: -80.01,
    seasonMonths: [2, 4],
    // March–May (spring run)
    peakMonths: [2, 3],
    access: [
      "Norval Conservation Area \u2014 Norval, ON",
      "Streetsville Road Allowances \u2014 Mississauga, ON",
      "Forks of the Credit Provincial Park \u2014 Cataract, ON"
    ],
    evergreen: `Rainbow trout (including migratory steelhead) enter the Credit River in spring, typically March through May. Resident rainbows hold in the upper reaches year-round in smaller numbers. The best spring run fishing is in the middle section around Norval and the Forks, where fish stack below holding pools waiting for water temperatures to peak. Flows between 10\u201320 m\xB3/s produce the best conditions \u2014 fish spread out and become more accessible when the river is at moderate height.`,
    tips: `Drift roe, bead patterns, or large nymphs through the deep pools during peak flows. As levels drop through April, switch to lighter nymphing rigs with smaller flies. Rising fish are uncommon in early spring \u2014 focus on the bottom third of the water column.`
  },
  "credit-river/brook-trout": {
    river: "Credit River",
    species: "Brook Trout",
    section: "Upper Credit River",
    gauge: "02HB001",
    sweetMin: 3,
    sweetMax: 10,
    lat: 43.87,
    lng: -80.01,
    seasonMonths: [3, 9],
    // April–October
    peakMonths: [3, 4],
    access: [
      "Upper Credit Conservation Area \u2014 Caledon, ON (catch-and-release)",
      "Belfountain Conservation Area \u2014 Belfountain, ON"
    ],
    evergreen: `Brook trout are found in the coldest headwater reaches of the Upper Credit River, particularly in the catch-and-release sections above Old Baseline Road in Caledon. These are wild fish \u2014 smaller than the browns below but extraordinarily beautiful. The Upper Credit Conservation Area protects some of the best habitat. Water temperature is the key variable: brookies go off the feed when water exceeds 18\xB0C in midsummer. Best fishing is May\u2013June and again in September.`,
    tips: `Use light tackle \u2014 3 or 4 weight fly rod, 5x or 6x tippet, small flies (size 14\u201318). Brook trout in clear headwater streams spook easily. Wade carefully, stay low, and cast accurately to specific fish rather than covering water randomly.`
  },
  "credit-river/steelhead": {
    river: "Credit River",
    species: "Steelhead",
    section: "Middle Credit River",
    gauge: "02HB001",
    sweetMin: 8,
    sweetMax: 25,
    lat: 43.66,
    lng: -79.88,
    seasonMonths: [8, 4],
    // Sept–May (wraps around winter)
    peakMonths: [2, 3],
    access: [
      "Norval Conservation Area \u2014 Norval, ON",
      "Streetsville Conservation Area \u2014 Streetsville, ON",
      "Erindale Park \u2014 Mississauga, ON"
    ],
    evergreen: `Steelhead begin entering the Credit River in late September following the Chinook salmon run, and continue through winter into late April. Peak fishing is March\u2013April when fish are pushing upriver on rising spring temperatures. The Credit produces both fall-run and spring-run fish, with the middle section around Norval and Streetsville holding the most accessible water. Lake Ontario surface temperature is the key trigger \u2014 when it cools below 10\xB0C in fall, fish start staging near the harbour mouth.`,
    tips: `In fall, swing large streamers or run float rigs with roe through the deeper pools. Spring fish are more willing to take nymphs dead-drifted through feeding lanes. Early morning before 9AM is consistently the most productive window, especially on bright days.`
  },
  "credit-river/chinook-salmon": {
    river: "Credit River",
    species: "Chinook Salmon",
    section: "Lower Credit River",
    gauge: "02HB001",
    sweetMin: 10,
    sweetMax: 40,
    lat: 43.56,
    lng: -79.72,
    seasonMonths: [8, 10],
    // September–November
    peakMonths: [9, 9],
    access: [
      "Erindale Park \u2014 Mississauga, ON",
      "Port Credit Harbour Mouth \u2014 Port Credit, ON",
      "Streetsville Conservation Area \u2014 Streetsville, ON"
    ],
    evergreen: `Chinook salmon enter the Credit River from Lake Ontario starting in late September, with peak numbers moving through in October. Fish stack near the harbour mouth at Port Credit waiting for sufficient flow, then push upriver after rain events raise levels. The lower Credit through Mississauga holds the most fish \u2014 the middle section at Streetsville sees fish arrive 1\u20132 weeks later. Chinook can reach 15\u201320kg on the Credit, making this one of the most exciting urban fisheries in Ontario.`,
    tips: `Target the Credit during and just after rain events when flows spike above 15 m\xB3/s \u2014 fresh fish push hard on rising water. Anchor beads, roe bags, or large streamers near the bottom of the deepest pools. Early morning low-light conditions produce the most aggressive fish.`
  },
  "credit-river/coho-salmon": {
    river: "Credit River",
    species: "Coho Salmon",
    section: "Lower Credit River",
    gauge: "02HB001",
    sweetMin: 8,
    sweetMax: 30,
    lat: 43.56,
    lng: -79.72,
    seasonMonths: [9, 10],
    // October–November
    peakMonths: [9, 10],
    access: [
      "Erindale Park \u2014 Mississauga, ON",
      "Port Credit Harbour Mouth \u2014 Port Credit, ON"
    ],
    evergreen: `Coho salmon arrive on the Credit River in October, following the main Chinook push. Smaller and more acrobatic than Chinook, coho are known for aggressive takes and spectacular aerial fights. They tend to hold higher in the water column than Chinook and are more willing to chase flies and lures. The lower Credit through Port Credit and Mississauga is the primary coho water \u2014 fish rarely push as far upriver as steelhead do.`,
    tips: `Coho respond well to swung flies and small spoons \u2014 a size 2 silver spoon retrieved steadily through pools can be deadly. They are far more willing to take a moving fly than Chinook. Focus on the lower 5km of the Credit, particularly in the pools below Erindale Park.`
  }
};
function scoreConditions(flow, airTemp, cloudPct, route, month) {
  let flowState = "unknown", flowLabel = "Check gauge";
  if (flow != null) {
    if (flow >= route.sweetMin && flow <= route.sweetMax) {
      flowState = "good";
      flowLabel = "In range";
    } else if (flow < route.sweetMin) {
      flowState = flow >= route.sweetMin * 0.4 ? "ok" : "poor";
      flowLabel = "Low";
    } else {
      flowState = flow <= route.sweetMax * 1.8 ? "ok" : "poor";
      flowLabel = "High";
    }
  }
  const waterTemp = airTemp != null ? Math.round((airTemp * 0.7 + 4) * 10) / 10 : null;
  let tempState = "unknown", tempLabel = "Unknown";
  if (waterTemp != null) {
    if (waterTemp >= 8 && waterTemp <= 14) {
      tempState = "good";
      tempLabel = "Ideal";
    } else if (waterTemp >= 5 && waterTemp < 8) {
      tempState = "ok";
      tempLabel = "Cool";
    } else if (waterTemp > 14 && waterTemp <= 18) {
      tempState = "ok";
      tempLabel = "Warm";
    } else if (waterTemp > 18) {
      tempState = "poor";
      tempLabel = "Too warm";
    } else {
      tempState = "poor";
      tempLabel = "Too cold";
    }
  }
  let skyState = "unknown", skyLabel = "Unknown";
  if (cloudPct != null) {
    if (cloudPct >= 50) {
      skyState = "good";
      skyLabel = "Good cover";
    } else if (cloudPct >= 25) {
      skyState = "ok";
      skyLabel = "Some cover";
    } else {
      skyState = "poor";
      skyLabel = "Clear sky";
    }
  }
  const [seasonStart, seasonEnd] = route.seasonMonths;
  const inSeason = seasonStart <= seasonEnd ? month >= seasonStart && month <= seasonEnd : month >= seasonStart || month <= seasonEnd;
  const scores = { good: 2, ok: 1, poor: 0, unknown: 1 };
  const total = scores[flowState] + scores[tempState] + scores[skyState];
  let quality, qualityLabel;
  if (!inSeason) {
    quality = "out-of-season";
    qualityLabel = "Out of season";
  } else if (total >= 5) {
    quality = "excellent";
    qualityLabel = "Excellent";
  } else if (total >= 3) {
    quality = "good";
    qualityLabel = "Good";
  } else if (total >= 2) {
    quality = "marginal";
    qualityLabel = "Marginal";
  } else {
    quality = "tough";
    qualityLabel = "Tough";
  }
  return {
    quality,
    qualityLabel,
    inSeason,
    flow: flow != null ? Math.round(flow * 10) / 10 : null,
    flowState,
    flowLabel,
    waterTemp,
    tempState,
    tempLabel,
    cloudPct,
    skyState,
    skyLabel
  };
}
function renderSSRPage(route, cond, slug) {
  const speciesSlug = slug.split("/")[1];
  const qualityColor = {
    excellent: "#6dbf8a",
    good: "#6dbf8a",
    marginal: "#e8a85a",
    tough: "#e07070",
    "out-of-season": "#9ecfca"
  }[cond.quality] || "#9ecfca";
  const stateColor = (s) => ({ good: "#6dbf8a", ok: "#e8a85a", poor: "#e07070", unknown: "#9ecfca" })[s] || "#9ecfca";
  const stateBar = (s) => `background:${stateColor(s)}`;
  const today = (new Date()).toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" });
  const riverParam = encodeURIComponent(route.section);
  const speciesParam = speciesSlug.replace("-trout", "").replace("-salmon", "").replace("brook", "brook").replace("coho", "coho").replace("chinook", "chinook").replace("steelhead", "steelhead");
  const appLink = `https://herefishyfishy.ca/?river=${riverParam}&species=${speciesParam}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${route.river} ${route.species} Fishing Conditions \u2014 HereFishyFishy</title>
  <meta name="description" content="Live ${route.species} fishing conditions on the ${route.river} today. Flow: ${cond.flow != null ? cond.flow + " m\xB3/s" : "check gauge"} \xB7 Water: ${cond.waterTemp != null ? "~" + cond.waterTemp + "\xB0C" : "unknown"} \xB7 Conditions: ${cond.qualityLabel}. Updated ${today}.">
  <link rel="canonical" href="https://herefishyfishy.ca/${slug}">
  <link rel="icon" href="https://herefishyfishy.ca/favicon.ico">
  <meta property="og:title" content="${route.river} ${route.species} \u2014 ${cond.qualityLabel} conditions today">
  <meta property="og:description" content="Flow ${cond.flow != null ? cond.flow + " m\xB3/s (" + cond.flowLabel + ")" : "check gauge"} \xB7 ${cond.tempLabel} water \xB7 ${cond.skyLabel}. Updated live.">
  <meta property="og:url" content="https://herefishyfishy.ca/${slug}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${route.river} ${route.species} Fishing Conditions",
    "description": "Live fishing conditions for ${route.species} on the ${route.river}, Ontario. Updated ${today}.",
    "url": "https://herefishyfishy.ca/${slug}",
    "isPartOf": { "@type": "WebApplication", "name": "HereFishyFishy", "url": "https://herefishyfishy.ca" }
  }
  <\/script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f5f0ea; color: #1a2e3a; }
    a { color: #1e7a6e; }

    .top-bar { background: #0d1f2d; padding: .75rem 1.5rem; display: flex; align-items: center; justify-content: space-between; }
    .top-bar-brand { font-family: Georgia, serif; font-style: italic; font-weight: 700; color: #fff; font-size: 1.1rem; text-decoration: none; }
    .top-bar-link { font-size: .75rem; color: #9ecfca; text-decoration: none; }

    .hero { background: linear-gradient(160deg, #0d1f2d, #1a3a4a); padding: 2rem 1.5rem 1.75rem; }
    .hero-eyebrow { font-family: 'Courier New', monospace; font-size: .55rem; letter-spacing: .15em; text-transform: uppercase; color: #9ecfca; opacity: .65; margin-bottom: .5rem; }
    .hero-title { font-size: 1.6rem; font-weight: 800; color: #fff; line-height: 1.15; margin-bottom: .25rem; }
    .hero-sub { font-size: .9rem; color: #9ecfca; margin-bottom: 1rem; }
    .quality-pill { display: inline-block; font-family: 'Courier New', monospace; font-size: .72rem; font-weight: 700; letter-spacing: .06em; color: ${qualityColor}; background: ${qualityColor}20; padding: .3rem .8rem; border-radius: 20px; margin-bottom: 1.25rem; }

    .tiles { display: flex; gap: 6px; margin-bottom: 1.25rem; }
    .tile { flex: 1; border-radius: 10px; overflow: hidden; background: rgba(255,255,255,.04); border: 1px solid rgba(158,207,202,.12); }
    .tile-bar { height: 4px; }
    .tile-body { padding: 9px 8px; }
    .tile-lbl { font-family: 'Courier New', monospace; font-size: .5rem; letter-spacing: .06em; color: #9ecfca; opacity: .8; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
    .tile-val { font-size: 1rem; font-weight: 700; color: #fff; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tile-meaning { font-family: 'Courier New', monospace; font-size: .48rem; margin-top: 3px; text-transform: uppercase; }

    .cta-btn { display: block; background: #1e7a6e; color: #fff; text-align: center; padding: .85rem 1rem; border-radius: 10px; font-weight: 700; font-size: .95rem; text-decoration: none; letter-spacing: .01em; }
    .cta-btn:hover { background: #2a9d8f; }
    .cta-note { font-size: .65rem; color: #9ecfca; opacity: .65; text-align: center; margin-top: .4rem; font-family: 'Courier New', monospace; }

    .content { max-width: 680px; margin: 0 auto; padding: 1.5rem; }
    .section { background: #fff; border-radius: 14px; padding: 1.25rem; margin-bottom: 1rem; border: 1px solid rgba(30,122,110,.1); }
    .section-title { font-family: 'Courier New', monospace; font-size: .55rem; letter-spacing: .12em; text-transform: uppercase; color: #4a8c7a; margin-bottom: .6rem; }
    .section-body { font-size: .9rem; line-height: 1.65; color: #2c3e50; }
    .section-tip { margin-top: .75rem; padding: .6rem .85rem; background: rgba(30,122,110,.05); border-left: 3px solid #1e7a6e; border-radius: 0 6px 6px 0; font-size: .85rem; color: #1a3a4a; line-height: 1.55; }

    .access-list { list-style: none; }
    .access-list li { padding: .4rem 0; border-bottom: 1px solid rgba(30,122,110,.08); font-size: .88rem; color: #2c3e50; }
    .access-list li:last-child { border-bottom: none; }
    .access-list li::before { content: '\u{1F4CD} '; }

    .updated { font-family: 'Courier New', monospace; font-size: .6rem; color: #9ab5b0; text-align: center; padding: 1rem; letter-spacing: .05em; }
    .footer { background: #0d1f2d; padding: 1.25rem 1.5rem; text-align: center; }
    .footer a { color: #9ecfca; font-size: .8rem; text-decoration: none; margin: 0 .75rem; }
  </style>
</head>
<body>

<div class="top-bar">
  <a href="https://herefishyfishy.ca" class="top-bar-brand">HereFishyFishy</a>
  <a href="https://herefishyfishy.ca" class="top-bar-link">\u2190 All rivers</a>
</div>

<div class="hero">
  <div style="max-width:680px;margin:0 auto">
    <div class="hero-eyebrow">Live conditions \xB7 ${today}</div>
    <div class="hero-title">${route.river} \xB7 ${route.species}</div>
    <div class="hero-sub">${route.section} \xB7 ${route.access[0].split("\u2014")[0].trim()}</div>
    <div class="quality-pill">Conditions: ${cond.qualityLabel}</div>

    <div class="tiles">
      <div class="tile">
        <div class="tile-bar" style="${stateBar(cond.flowState)}"></div>
        <div class="tile-body">
          <div class="tile-lbl">Flow</div>
          <div class="tile-val">${cond.flow != null ? cond.flow : "\u2014"}</div>
          <div class="tile-meaning" style="color:${stateColor(cond.flowState)}">${cond.flowLabel}</div>
        </div>
      </div>
      <div class="tile">
        <div class="tile-bar" style="${stateBar(cond.tempState)}"></div>
        <div class="tile-body">
          <div class="tile-lbl">Water</div>
          <div class="tile-val">${cond.waterTemp != null ? "~" + cond.waterTemp + "\xB0" : "\u2014"}</div>
          <div class="tile-meaning" style="color:${stateColor(cond.tempState)}">${cond.tempLabel}</div>
        </div>
      </div>
      <div class="tile">
        <div class="tile-bar" style="${stateBar(cond.skyState)}"></div>
        <div class="tile-body">
          <div class="tile-lbl">Sky</div>
          <div class="tile-val">${cond.cloudPct != null ? cond.cloudPct + "%" : "\u2014"}</div>
          <div class="tile-meaning" style="color:${stateColor(cond.skyState)}">${cond.skyLabel}</div>
        </div>
      </div>
    </div>

    <a href="${appLink}" class="cta-btn">See full conditions, access points &amp; gear \u2192</a>
    <div class="cta-note">Opens the full app \xB7 free \xB7 no account needed</div>
  </div>
</div>

<div class="content">
  <div class="section">
    <div class="section-title">About ${route.river} ${route.species} fishing</div>
    <div class="section-body">
      ${route.evergreen}
      <div class="section-tip">${route.tips}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Access points</div>
    <ul class="access-list">
      ${route.access.map((a) => `<li>${a}</li>`).join("\n      ")}
    </ul>
  </div>

  <div class="section">
    <div class="section-title">More Credit River fishing</div>
    <div class="section-body" style="display:flex;flex-direction:column;gap:.4rem">
      <a href="/credit-river/brown-trout">Credit River \u2014 Brown Trout</a>
      <a href="/credit-river/rainbow-trout">Credit River \u2014 Rainbow Trout</a>
      <a href="/credit-river/brook-trout">Credit River \u2014 Brook Trout</a>
      <a href="/credit-river/steelhead">Credit River \u2014 Steelhead</a>
      <a href="/credit-river/chinook-salmon">Credit River \u2014 Chinook Salmon</a>
      <a href="/credit-river/coho-salmon">Credit River \u2014 Coho Salmon</a>
    </div>
  </div>
</div>

<div class="updated">Conditions updated ${(new Date()).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" })} ET \xB7 Flow: Water Survey of Canada \xB7 Weather: Open-Meteo</div>

<div class="footer">
  <a href="https://herefishyfishy.ca">Home</a>
  <a href="https://herefishyfishy.ca/sitemap.xml">All rivers</a>
</div>

</body>
</html>`;
}
async function handleSSR(request, env) {
  const url = new URL(request.url);
  const slug = url.pathname.replace(/^\//, "").replace(/\/$/, "");
  const route = SSR_ROUTES[slug];
  if (!route)
    return null;
  const cacheKey = `ssr:${slug}`;
  if (env.CACHE) {
    const cached = await env.CACHE.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { "Content-Type": "text/html;charset=UTF-8", "X-Cache": "HIT" }
      });
    }
  }
  const [flowData, weatherData] = await Promise.allSettled([
    fetch(`https://streamcast-proxy.tnt-tarun.workers.dev/flow?station=${route.gauge}`).then((r) => r.json()).catch(() => null),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${route.lat}&longitude=${route.lng}&current=temperature_2m,cloudcover&timezone=America/Toronto`).then((r) => r.json()).catch(() => null)
  ]);
  const flow = flowData.status === "fulfilled" && flowData.value?.flow != null ? flowData.value.flow : null;
  const airTemp = weatherData.status === "fulfilled" && weatherData.value?.current?.temperature_2m != null ? weatherData.value.current.temperature_2m : null;
  const cloudPct = weatherData.status === "fulfilled" && weatherData.value?.current?.cloudcover != null ? weatherData.value.current.cloudcover : null;
  const month = (new Date()).getMonth();
  const cond = scoreConditions(flow, airTemp, cloudPct, route, month);
  const html = renderSSRPage(route, cond, slug);
  if (env.CACHE) {
    await env.CACHE.put(cacheKey, html, { expirationTtl: 1800 });
  }
  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8", "X-Cache": "MISS" }
  });
}
// Email list
// KV SUBSCRIBERS holds "sub:<email>" records. Resend holds the same contacts
// (legacy audiences endpoint, RESEND_AUDIENCE_ID = the "General" segment).
// Unsubscribe links carry an HMAC of the email (secret UNSUBSCRIBE_SECRET), so
// a link only works for the address it was sent to.
var SITE = "https://herefishyfishy.ca";
var PROXY_PUBLIC = "https://proxy.herefishyfishy.ca";
var FROM = "HereFishyFishy <hello@herefishyfishy.ca>";
// CASL sender identification: name, mailing address, contact. Shown in every email footer.
var SENDER_FOOTER = "HereFishyFishy \xB7 Shawnmarr Rd, Mississauga ON \xB7 hello@herefishyfishy.ca";
function resend(env, path, method, body, extraHeaders) {
  return fetch("https://api.resend.com" + path, {
    method,
    headers: Object.assign({ "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" }, extraHeaders || {}),
    body: body ? JSON.stringify(body) : void 0
  });
}
async function unsubToken(env, email) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.UNSUBSCRIBE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32);
}
function sameString(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function unsubLinks(env, email) {
  const q = "e=" + encodeURIComponent(email) + "&t=" + await unsubToken(env, email);
  return { page: SITE + "/unsubscribe/?" + q, oneClick: PROXY_PUBLIC + "/unsubscribe?" + q };
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
// Interests (TJ, 2026-10-17). One list ("General" segment) with Resend topics for what each
// person asked for. Run alerts are per river; the free Resend plan allows 3 segments, so the
// rivers live in the KV record and the Worker sends run alerts itself (see /alerts below).
var TOPIC_OUTLOOK = "8acca89a-661a-4607-819c-1290deac79b2";   // Monthly outlook
var TOPIC_RUN = "81a6f6ee-5667-476e-92d0-bd06c32fd009";       // Run alerts
var RUN_RIVERS = ["Beaver River", "Black Creek", "Bowmanville Creek", "Bronte Creek", "Credit River", "Don River", "Duffins Creek",
  "Ganaraska River", "Grand River", "Humber River", "Nottawasaga River", "Rouge River", "Saugeen River",
  "Sixteen Mile Creek", "Wilmot Creek"];
var OWNER_EMAIL = "tnt.tarun@gmail.com";
var MAX_TRIPS = 5;
function validEmail(e) {
  return typeof e === "string" && e.length < 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}
function emailFooter(links, why) {
  return `<p style="color:#999;font-size:11px;margin-top:32px">
              ${escapeHtml(why)}
              <a href="${links.page}" style="color:#999">Unsubscribe</a><br>
              ${SENDER_FOOTER}
            </p>`;
}
function listHeaders(links) {
  return { "List-Unsubscribe": "<" + links.oneClick + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
async function getRecord(env, email) {
  const raw = await env.SUBSCRIBERS.get("sub:" + email);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
// Create the Resend contact, or switch an existing one back on, and opt it in to the topics asked for.
async function upsertContact(env, email, topics) {
  const t = topics.map((id) => ({ id, subscription: "opt_in" }));
  const created = await resend(env, "/contacts", "POST", { email, unsubscribed: false, segments: [{ id: env.RESEND_AUDIENCE_ID }], topics: t });
  if (created.ok) return;
  await resend(env, "/contacts/" + encodeURIComponent(email), "PATCH", { unsubscribed: false });
  await resend(env, "/contacts/" + encodeURIComponent(email) + "/segments/" + env.RESEND_AUDIENCE_ID, "POST");
  if (t.length) await resend(env, "/contacts/" + encodeURIComponent(email) + "/topics", "PATCH", t);
}
function isoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function prettyDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
function secDisplay(s) {
  return String(s || "").replace(/ — /g, " \xB7 ");
}
async function handleSubscribe(request, env) {
  if (request.method !== "POST")
    return jsonResponse({ error: "POST only" }, 405);
  try {
    const body = await request.json();
    if (!validEmail(body.email))
      return jsonResponse({ error: "Valid email required" }, 400);
    const clean = body.email.toLowerCase().trim();
    // kind: outlook | run | trip. Old cached pages send no kind; keep them working as before.
    const kind = ["outlook", "run", "trip", "weekly"].indexOf(body.kind) !== -1 ? body.kind : "legacy";
    const record = await getRecord(env, clean) || { email: clean, createdAt: (new Date()).toISOString(), runRivers: [], trips: [] };
    record.runRivers = record.runRivers || [];
    record.trips = record.trips || [];
    record.unsubscribed = false;
    record.source = body.source || record.source || "notify-panel";
    record.lastSignupAt = (new Date()).toISOString();
    const topics = [];
    let trip = null;
    if (kind === "outlook" || body.outlook === true) {
      record.outlook = true;
      topics.push(TOPIC_OUTLOOK);
    }
    if (kind === "run") {
      const river = String(body.river || "");
      if (RUN_RIVERS.indexOf(river) === -1) return jsonResponse({ error: "Unknown river" }, 400);
      if (record.runRivers.indexOf(river) === -1) record.runRivers.push(river);
      topics.push(TOPIC_RUN);
    }
    if (kind === "trip") {
      const t = body.trip || {};
      const date = isoDate(t.date);
      const today = torontoDate(new Date());
      const days = date ? (Date.parse(date) - Date.parse(today)) / 864e5 : -1;
      const lat = Number(t.lat), lng = Number(t.lng);
      if (!date || days < 1 || days > 16) return jsonResponse({ error: "Trip date must be 1 to 16 days out" }, 400);
      if (typeof t.section !== "string" || !t.section || t.section.length > 120) return jsonResponse({ error: "Section required" }, 400);
      if (!(lat > 41 && lat < 47 && lng > -84 && lng < -74)) return jsonResponse({ error: "Bad location" }, 400);
      record.trips = record.trips.filter((k) => k.slice(5, 15) >= today);
      const key = "trip:" + date + ":" + clean + ":" + t.section;
      if (record.trips.indexOf(key) === -1) {
        if (record.trips.length >= MAX_TRIPS) return jsonResponse({ error: "Too many trips saved" }, 429);
        record.trips.push(key);
      }
      trip = { email: clean, date, section: t.section, species: String(t.species || "").slice(0, 60),
        gauge: /^[0-9A-Z]{5,10}$/.test(t.gauge || "") ? t.gauge : null, lat, lng,
        sweetMin: Number(t.sweetMin) || null, sweetMax: Number(t.sweetMax) || null, createdAt: (new Date()).toISOString() };
      await env.SUBSCRIBERS.put(key, JSON.stringify(trip), { expirationTtl: (days + 3) * 86400 });
    }
    // Weekly conditions email: its own offer on trout rivers, a checkbox under run alerts elsewhere.
    let weeklyAdded = null;
    if (kind === "weekly" || (body.weekly && typeof body.weekly === "object")) {
      const w = weeklyInterests({ weekly: [body.weekly || {}] })[0];
      if (!w) {
        if (kind === "weekly") return jsonResponse({ error: "Unknown river or species" }, 400);
      } else {
        record.weekly = (record.weekly || []).filter((x) => !(x.section === w.section && x.species === w.species));
        record.weekly.unshift(w);
        record.weekly = record.weekly.slice(0, 5);
        weeklyAdded = w;
      }
    }
    if (kind === "legacy") {
      record.rivers = Array.isArray(body.rivers) ? body.rivers.map(String).slice(0, 5) : record.rivers || [];
      record.species = Array.isArray(body.species) ? body.species.map(String).slice(0, 6) : record.species || [];
    }
    await env.SUBSCRIBERS.put("sub:" + clean, JSON.stringify(record));
    await upsertContact(env, clean, topics);
    const links = await unsubLinks(env, clean);
    let subject, lead;
    if (kind === "trip") {
      subject = "Your trip email is set for " + prettyDate(trip.date);
      lead = `<p>On the morning of <strong>${escapeHtml(prettyDate(trip.date))}</strong> we'll email you the flow and weather for
            <strong>${escapeHtml(secDisplay(trip.section))}</strong>, with a link to the full forecast.</p>`;
    } else if (kind === "run") {
      subject = "Run alerts for the " + body.river;
      lead = `<p>We'll email you when salmon or steelhead are running on the <strong>${escapeHtml(body.river)}</strong>.
            Each alert is checked by an angler before it goes out, so expect a few a season, not a stream.</p>` +
        (weeklyAdded ? `<p>You'll also get a Thursday email when the coming days look good for ${escapeHtml(weeklyAdded.species)} on
            ${escapeHtml(secDisplay(weeklyAdded.section))}. No good days, no email.</p>` : "") +
        (record.outlook ? `<p>You'll also get the monthly outlook.</p>` : "");
    } else if (kind === "weekly") {
      subject = "Thursday heads-up for " + weeklyAdded.species;
      lead = `<p>On Thursdays we check the next six days for <strong>${escapeHtml(weeklyAdded.species)}</strong> on
            <strong>${escapeHtml(secDisplay(weeklyAdded.section))}</strong>. When at least one looks good, we email you which days,
            where to stand and what to bring. No good days, no email.</p>`;
    } else if (kind === "outlook") {
      subject = "You're on the monthly outlook";
      lead = `<p>Once a month we'll send what the forecast means for Ontario's trout and salmon rivers, plus the season
            openers and closures coming up.</p>`;
    } else {
      subject = "You're on the list \u{1F3A3}";
      lead = `<p>Thanks for signing up. We'll be in touch with conditions news for the rivers you follow.</p>`;
    }
    await resend(env, "/emails", "POST", {
      from: FROM,
      to: [clean],
      subject,
      headers: listHeaders(links),
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a2e3a">
            <h2 style="color:#1e7a6e">You're set.</h2>
            ${lead}
            <p>Check conditions any time at <a href="${SITE}" style="color:#1e7a6e">herefishyfishy.ca</a>.</p>
            <p>One question for you: which river do you fish most, and what are you after? Hit reply and tell me.
            It goes straight to me and helps decide what I add next.</p>
            <p>TJ</p>
            ${emailFooter(links, "You're getting this because you signed up at herefishyfishy.ca.")}
          </div>`
    });
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}
// Trip-day emails. The hourly cron sends them at 6 am Toronto time on the trip date.
function flowWord(flow, lo, hi) {
  if (flow == null) return "";
  if (lo && flow < lo) return "below the sweet spot (" + lo + " to " + hi + ")";
  if (hi && flow > hi) return "above the sweet spot (" + lo + " to " + hi + ")";
  if (lo && hi) return "in the sweet spot (" + lo + " to " + hi + ")";
  return "";
}
async function sendTripEmails(env, ctx) {
  const today = torontoDate(new Date());
  const listed = await env.SUBSCRIBERS.list({ prefix: "trip:" + today + ":" });
  for (const k of listed.keys) {
    const trip = await env.SUBSCRIBERS.get(k.name, "json");
    if (!trip || trip.sentAt) continue;
    const rec = await getRecord(env, trip.email);
    if (rec && rec.unsubscribed) { await env.SUBSCRIBERS.delete(k.name); continue; }
    let flow = null, trend = null;
    if (trip.gauge) {
      try {
        const r = await handleFlow(new URL("https://x/flow?station=" + trip.gauge), ctx);
        const j = await r.json();
        flow = j.flow; trend = j.trend;
      } catch (e) {}
    }
    let wx = null;
    try {
      const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + trip.lat + "&longitude=" + trip.lng +
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,cloud_cover_mean,wind_speed_10m_max&forecast_days=1&timezone=America%2FToronto");
      const j = await r.json();
      if (j.daily) wx = { hi: j.daily.temperature_2m_max[0], lo: j.daily.temperature_2m_min[0], rain: j.daily.precipitation_sum[0],
        cloud: j.daily.cloud_cover_mean ? j.daily.cloud_cover_mean[0] : null, wind: j.daily.wind_speed_10m_max[0] };
    } catch (e) {}
    const links = await unsubLinks(env, trip.email);
    const link = SITE + "/?river=" + encodeURIComponent(trip.section) + (trip.species ? "&species=" + encodeURIComponent(trip.species) : "");
    const rows = [];
    if (flow != null) rows.push(`<li>Flow: <strong>${flow} m\xB3/s</strong>, ${trend === "up" ? "rising" : trend === "down" ? "dropping" : "steady"}${flowWord(flow, trip.sweetMin, trip.sweetMax) ? ", " + flowWord(flow, trip.sweetMin, trip.sweetMax) : ""}.</li>`);
    if (wx) rows.push(`<li>Weather: ${Math.round(wx.lo)} to ${Math.round(wx.hi)} \xB0C, ${wx.cloud != null ? (wx.cloud >= 70 ? "overcast" : wx.cloud >= 30 ? "some cloud" : "mostly clear") + ", " : ""}${wx.rain >= 1 ? Math.round(wx.rain) + " mm of rain" : "little or no rain"}, wind up to ${Math.round(wx.wind)} km/h.</li>`);
    if (!rows.length) rows.push(`<li>Live flow and weather weren't available this morning. The app has the latest.</li>`);
    const sent = await resend(env, "/emails", "POST", {
      from: FROM,
      to: [trip.email],
      subject: "Today on the " + secDisplay(trip.section).split(" \xB7 ")[0] + ": your trip conditions",
      headers: listHeaders(links),
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a2e3a">
            <h2 style="color:#1e7a6e">${escapeHtml(secDisplay(trip.section))}</h2>
            <p>Conditions for your trip today, ${escapeHtml(prettyDate(trip.date))}:</p>
            <ul style="padding-left:18px;line-height:1.6">${rows.join("")}</ul>
            <p><a href="${link}" style="display:inline-block;background:#1e7a6e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">See where to stand and what to fish</a></p>
            <p style="font-size:13px;color:#555">Check posted signs and the regulations where you fish.</p>
            ${emailFooter(links, "You asked for this email when you planned a trip at herefishyfishy.ca.")}
          </div>`
    });
    if (sent.ok) { trip.sentAt = (new Date()).toISOString(); await env.SUBSCRIBERS.put(k.name, JSON.stringify(trip), { expirationTtl: 3 * 86400 }); }
  }
}
// Run alerts. A drafting task (scheduled, run by Claude for TJ) writes KV CACHE "alert:draft:<id>" =
// {river, subject, html}. The hourly cron emails TJ a preview with a signed link; nothing reaches
// subscribers until he opens the link and presses Send. The link only works for that draft.
async function alertToken(env, id) {
  return unsubToken(env, "alert:" + id);
}
// Workers on the free plan get 50 outbound requests per run, so this makes one Resend call per
// 100 contacts (to drop anyone who unsubscribed through a Resend link) rather than one per person.
async function resendUnsubscribed(env) {
  const out = new Set();
  let after = null;
  for (let i = 0; i < 20; i++) {
    const r = await resend(env, "/contacts?limit=100" + (after ? "&after=" + after : ""), "GET");
    if (!r.ok) break;
    const j = await r.json();
    const rows = j.data || [];
    rows.forEach((c) => { if (c.unsubscribed) out.add(String(c.email).toLowerCase()); });
    if (!j.has_more || !rows.length) break;
    after = rows[rows.length - 1].id;
  }
  return out;
}
// At most one run alert per person per week (TJ, 2026-10-20). Someone who also follows a reach
// and species can get the weekly conditions email as well; that cap is in weekly.js.
var RUN_ALERT_GAP_DAYS = 6;
async function allRecords(env) {
  const out = [];
  let cursor;
  do {
    const listed = await env.SUBSCRIBERS.list({ prefix: "sub:", cursor });
    for (const k of listed.keys) {
      const rec = await env.SUBSCRIBERS.get(k.name, "json");
      if (rec && rec.email) out.push(rec);
    }
    cursor = listed.list_complete ? null : listed.cursor;
  } while (cursor);
  return out;
}
function runAlertCapped(rec) {
  return !!(rec.lastRunAlertAt && Date.now() - Date.parse(rec.lastRunAlertAt) < RUN_ALERT_GAP_DAYS * 864e5);
}
async function runAlertRecipients(env, river, withCapped) {
  let recs = (await allRecords(env)).filter((rec) => !rec.unsubscribed && (rec.runRivers || []).indexOf(river) !== -1);
  if (recs.length) {
    const gone = await resendUnsubscribed(env);
    recs = recs.filter((r) => !gone.has(r.email));
  }
  const send = recs.filter((r) => !runAlertCapped(r)).map((r) => r.email);
  if (!withCapped) return send;
  return { send, capped: recs.filter(runAlertCapped).map((r) => r.email) };
}
async function notifyAlertDrafts(env) {
  if (!env.CACHE) return;
  const listed = await env.CACHE.list({ prefix: "alert:draft:" });
  for (const k of listed.keys) {
    const d = await env.CACHE.get(k.name, "json");
    if (!d || d.notifiedAt || d.sentAt) continue;
    const id = k.name.slice("alert:draft:".length);
    const url = PROXY_PUBLIC + "/alerts/approve?id=" + encodeURIComponent(id) + "&t=" + await alertToken(env, id);
    const rr = await runAlertRecipients(env, d.river, true);
    const n = rr.send.length;
    await resend(env, "/emails", "POST", {
      from: FROM,
      to: [OWNER_EMAIL],
      subject: "Approve run alert: " + d.river + " (" + n + " subscriber" + (n === 1 ? "" : "s") + ")",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2e3a">
            <p><strong>Draft run alert for the ${escapeHtml(d.river)}.</strong> Nothing has been sent. ${n} subscriber${n === 1 ? "" : "s"} would get it.${rr.capped.length ? ` ${rr.capped.length} more had a run alert in the last 6 days and will be skipped.` : ""}</p>
            <p><a href="${url}" style="display:inline-block;background:#1e7a6e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Review and send</a></p>
            ${d.why ? `<p style="font-size:13px;color:#555"><strong>Why it was drafted:</strong> ${escapeHtml(d.why)}</p>` : ""}
            <hr><p style="color:#555">Subject: ${escapeHtml(d.subject)}</p>${d.html}
          </div>`
    });
    d.notifiedAt = (new Date()).toISOString();
    await env.CACHE.put(k.name, JSON.stringify(d), { expirationTtl: 21 * 86400 });
  }
}
function htmlPage(title, inner) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{font:16px/1.5 -apple-system,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;color:#1a2e3a;background:#fbf9f5}
button{font:600 1rem/1 inherit;background:#1e7a6e;color:#fff;border:0;border-radius:8px;padding:.9rem 1.4rem}
.box{border:1px solid #e2ded6;background:#fff;padding:16px;border-radius:8px;margin:16px 0}</style></head><body>${inner}</body></html>`,
    { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" } });
}
async function handleAlertApprove(request, env, url) {
  const id = url.searchParams.get("id") || "";
  const t = url.searchParams.get("t") || "";
  if (!id || !sameString(t, await alertToken(env, id))) return htmlPage("Link not valid", "<h1>This link isn't valid</h1>");
  const key = "alert:draft:" + id;
  const d = await env.CACHE.get(key, "json");
  if (!d) return htmlPage("Not found", "<h1>That draft no longer exists</h1>");
  if (d.sentAt) return htmlPage("Already sent", `<h1>Already sent</h1><p>Sent to ${d.sentTo} subscriber(s) on ${escapeHtml(d.sentAt)}.</p>`);
  const recipients = await runAlertRecipients(env, d.river);
  // GET only shows the preview: mail scanners open links, and that must never send anything.
  if (request.method !== "POST") {
    return htmlPage("Review run alert", `<h1>Run alert: ${escapeHtml(d.river)}</h1>
      <p>${recipients.length} subscriber${recipients.length === 1 ? "" : "s"} will get this.</p>
      <div class="box"><p><strong>${escapeHtml(d.subject)}</strong></p>${d.html}</div>
      <form method="post"><button type="submit">Send to ${recipients.length} subscriber${recipients.length === 1 ? "" : "s"}</button></form>
      <p style="font-size:14px;color:#6b7d86">To change the wording, reply in the Claude project and ask for a new draft. Drafts expire after 3 weeks.</p>`);
  }
  let sentTo = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const batch = [];
    for (const e of recipients.slice(i, i + 100)) {
      const links = await unsubLinks(env, e);
      batch.push({ from: FROM, to: [e], subject: d.subject, headers: listHeaders(links), topic_id: TOPIC_RUN,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a2e3a">${d.html}
          ${emailFooter(links, "You're getting this because you asked for run alerts for the " + d.river + " at herefishyfishy.ca.")}</div>` });
    }
    const r = await resend(env, "/emails/batch", "POST", batch);
    if (r.ok) {
      sentTo += batch.length;
      for (const e of recipients.slice(i, i + 100)) {
        const rec = await getRecord(env, e);
        if (rec) { rec.lastRunAlertAt = (new Date()).toISOString(); await env.SUBSCRIBERS.put("sub:" + e, JSON.stringify(rec)); }
      }
    }
  }
  d.sentAt = (new Date()).toISOString();
  d.sentTo = sentTo;
  await env.CACHE.put(key, JSON.stringify(d), { expirationTtl: 90 * 86400 });
  return htmlPage("Sent", `<h1>Sent</h1><p>The ${escapeHtml(d.river)} run alert went to ${sentTo} subscriber${sentTo === 1 ? "" : "s"}.</p>`);
}
async function handleUnsubscribe(request, env, url) {
  // GET: someone opened the one-click URL in a browser. Send them to the site page.
  if (request.method === "GET")
    return Response.redirect(SITE + "/unsubscribe/" + url.search, 302);
  if (request.method !== "POST")
    return jsonResponse({ error: "POST only" }, 405);
  // One-click (RFC 8058) puts e and t in the URL; the site page sends JSON.
  let email = url.searchParams.get("e");
  let token = url.searchParams.get("t");
  if (!email || !token) {
    try {
      const body = await request.json();
      email = body.e;
      token = body.t;
    } catch (e) {
    }
  }
  if (!email || !token)
    return jsonResponse({ error: "missing" }, 400);
  const clean = String(email).toLowerCase().trim();
  if (!sameString(String(token), await unsubToken(env, clean)))
    return jsonResponse({ error: "invalid" }, 400);
  const key = "sub:" + clean;
  const existing = await env.SUBSCRIBERS.get(key);
  let record = { email: clean };
  if (existing) {
    try {
      record = JSON.parse(existing);
    } catch (e) {
    }
  }
  record.unsubscribed = true;
  record.outlook = false;
  record.runRivers = [];
  record.weekly = [];
  record.unsubscribedAt = (new Date()).toISOString();
  await env.SUBSCRIBERS.put(key, JSON.stringify(record));
  const r = await resend(env, "/audiences/" + env.RESEND_AUDIENCE_ID + "/contacts/" + encodeURIComponent(clean), "PATCH", { unsubscribed: true });
  return jsonResponse({ ok: true, resend: r.status });
}
// Live water temperature
// CVC publishes the latest reading and the 24 h range for its real-time stations as a
// server-rendered table (one table per parameter, each headed by the parameter name).
// The hourly cron also logs readings plus the station's recent daily air temperature, which
// is what the app's water temperature model is calibrated against.
var CVC_WQ_URL = "https://cvc.ca/water-quality-table/";
var CVC_STATIONS = {
  "Credit River at Mississaugua Golf and Country Club": { lat: 43.566, lng: -79.622 },
  "Credit River at Old Derry Road": { lat: 43.626, lng: -79.734 },
  "Credit River at Highway 10 N": { lat: 43.87, lng: -80.02 },
  "Credit River at Cataract Falls": { lat: 43.829, lng: -80.03 },
  "West Credit River at Belfountain Conservation Area": { lat: 43.795, lng: -80.01 }
};
function htmlText(s) {
  return String(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
}
function parseCvcTable(html, label) {
  var re = new RegExp(label, "i");
  var tables = html.split(/<table/i).slice(1).map(function(t) { return t.split(/<\/table>/i)[0]; });
  var body = tables.find(function(t) { return re.test(htmlText(t).slice(0, 300)); });
  if (!body) return null;
  var out = {};
  (body.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(function(row) {
    if (/<th[\s>]/i.test(row)) return;   // header row ("24 Hour Min" would parse as 24)
    var cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(htmlText);
    if (cells.length < 2 || !cells[0] || /^station$/i.test(cells[0])) return;
    var nums = cells.slice(1).map(function(c) { return parseFloat(c); }).filter(function(n) { return isFinite(n); });
    if (!nums.length) return;
    out[cells[0]] = { latest: nums[0], min: nums.length > 1 ? nums[1] : null, max: nums.length > 2 ? nums[2] : null };
  });
  return out;
}
async function fetchCvcTemps() {
  var res = await fetch(CVC_WQ_URL, { headers: { "User-Agent": "HereFishyFishy/1.0 (herefishyfishy.ca)" } });
  if (!res.ok) throw new Error("CVC " + res.status);
  var html = await res.text();
  var water = parseCvcTable(html, "Water Temperature") || {};
  // Drop impossible readings (a dead sensor reports 0.0 across the board).
  Object.keys(water).forEach(function(k) {
    var w = water[k];
    if (w.latest < -1 || w.latest > 35 || (w.latest === 0 && w.min === 0 && w.max === 0)) delete water[k];
  });
  return { updated: (new Date()).toISOString(), source: "Credit Valley Conservation", water: water, air: parseCvcTable(html, "Air Temperature") || {}, html: html };
}
async function handleWaterTemps(env) {
  var cached = env.CACHE ? await env.CACHE.get("wt:latest", "json") : null;
  if (cached && Date.now() - Date.parse(cached.updated) < 45 * 60 * 1e3) return jsonResponse(cached, 200, 900);
  try {
    var d = await fetchCvcTemps();
    delete d.html;
    if (env.CACHE) await env.CACHE.put("wt:latest", JSON.stringify(d));
    return jsonResponse(d, 200, 900);
  } catch (e) {
    if (cached) return jsonResponse(cached, 200, 300);
    return errorResponse("Water temperature unavailable: " + e.message, 502);
  }
}
function torontoDate(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
async function logWaterTemps(env) {
  if (!env.CACHE) return;
  var d = await fetchCvcTemps();
  var html = d.html; delete d.html;
  await env.CACHE.put("wt:latest", JSON.stringify(d));
  var day = torontoDate(new Date());
  var key = "wt:log:" + day;
  var log = await env.CACHE.get(key, "json") || { date: day, readings: [], airDaily: null };
  var pick = function(tbl) { var o = {}; Object.keys(tbl || {}).forEach(function(k) { o[k] = tbl[k].latest; }); return o; };
  log.readings.push({ t: d.updated, water: pick(d.water), air: pick(d.air) });
  if (!log.airDaily) {
    log.airDaily = {};
    for (var name of Object.keys(CVC_STATIONS)) {
      var s = CVC_STATIONS[name];
      try {
        var r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + s.lat + "&longitude=" + s.lng +
          "&daily=temperature_2m_mean&past_days=60&forecast_days=1&timezone=America%2FToronto");
        var j = await r.json();
        if (j.daily) log.airDaily[name] = { time: j.daily.time, mean: j.daily.temperature_2m_mean };
      } catch (e) {}
    }
  }
  await env.CACHE.put(key, JSON.stringify(log), { expirationTtl: 400 * 86400 });
  if (!await env.CACHE.get("wt:debug")) {
    var i = html.search(/Water Temperature/i);
    await env.CACHE.put("wt:debug", html.slice(Math.max(0, i - 600), i + 3000), { expirationTtl: 30 * 86400 });
  }
}
// Weekly conditions email: Thursday, 5 pm hour, Toronto time. See weekly.js.
function weeklyDeps(env, ctx) {
  return {
    FROM, SITE, torontoDate, listHeaders, emailFooter,
    listRecords: () => allRecords(env),
    resendUnsubscribed: () => resendUnsubscribed(env),
    fetchJson: async (u) => { const r = await fetch(u); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); },
    flow: async (gauge) => { const r = await handleFlow(new URL("https://x/flow?station=" + gauge), ctx); const j = await r.json(); return j.flow != null ? j.flow : null; },
    lakeTemps: async () => { const r = await handleLakeTemps(new URL("https://x/lake-temps"), ctx); const j = await r.json(); return j.temps || null; },
    liveWater: async () => env.CACHE ? env.CACHE.get("wt:latest", "json") : null,
    unsubLinks: (email) => unsubLinks(env, email),
    sendBatch: async (batch, key) => (await resend(env, "/emails/batch", "POST", batch, { "Idempotency-Key": key })).ok,
    sendOwner: (subject, html) => resend(env, "/emails", "POST", { from: FROM, to: [OWNER_EMAIL], subject, html }),
    putRecord: (rec) => env.SUBSCRIBERS.put("sub:" + rec.email, JSON.stringify(rec)),
    putLog: (key, log) => env.CACHE ? env.CACHE.put(key, JSON.stringify(log), { expirationTtl: 120 * 86400 }) : null
  };
}
async function maybeRunWeekly(env, ctx) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday").value, hour = Number(parts.find((p) => p.type === "hour").value);
  if (wd !== "Thu" || hour !== 17 || !env.CACHE) return;
  const key = "alert:weekly:ran:" + torontoDate(now);
  if (await env.CACHE.get(key)) return;
  await env.CACHE.put(key, "1", { expirationTtl: 3 * 86400 });
  await runWeekly(env, weeklyDeps(env, ctx));
}
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(maybeRunWeekly(env, ctx));
    ctx.waitUntil(logWaterTemps(env));
    ctx.waitUntil(notifyAlertDrafts(env));
    // Trip-day emails go out in the 6 am hour, Toronto time.
    const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    if (hour === 6) ctx.waitUntil(sendTripEmails(env, ctx));
  },
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    const ssrResult = await handleSSR(request, env);
    if (ssrResult)
      return ssrResult;
    if (url.pathname === "/subscribe")
      return handleSubscribe(request, env);
    if (url.pathname === "/unsubscribe")
      return handleUnsubscribe(request, env, url);
    if (url.pathname === "/alerts/approve")
      return handleAlertApprove(request, env, url);
    const path = url.pathname;
    if (path === "/health")
      return jsonResponse({ status: "ok", version: "1.4.0", ts: (new Date()).toISOString() });
    if (path === "/stocking")
      return handleStocking(url, ctx);
    if (path === "/flow")
      return handleFlow(url, ctx);
    if (path === "/fields")
      return handleFields();
    if (path === "/lake-temps")
      return handleLakeTemps(url, ctx);
    if (path === "/water-temps")
      return handleWaterTemps(env);
    return jsonResponse({ error: "Valid endpoints: /stocking, /flow, /health, /fields, /lake-temps, /water-temps, /subscribe, /unsubscribe, /alerts/approve" }, 404);
  }
};
