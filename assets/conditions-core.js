// conditions-core.js: the rules that decide whether a river section is legal and good to fish.
// Shared by the app (loaded by index.html before app.js, so everything here is a global there)
// and by the streamcast-proxy Worker (bundled from ../assets/, read through globalThis.HFF_CORE).
// One decision, one function: anything that rates water or decides legality lives here, so the
// app and the emails can never disagree. Nothing in this file may touch the DOM, window state
// or the network. Config (RIVER_CONFIG, RIVER_REGS, ACCESS_COORDS, SPECIES_SEASONS) lives here too.

var RIVER_SECTIONS = {"Beaver River": ["Lower Beaver River (Thornbury)", "Middle Beaver River (Clarksburg to Heathcote)", "Upper Beaver River (Kimberley)"], "Black Creek": ["Black Creek — Upper Reaches (Vaughan to North York)", "Black Creek — Lower Watershed & Humber Confluence"], "Bowmanville Creek": ["Bowmanville Creek — River Mouth & Piers", "Lower Bowmanville Creek", "Middle Bowmanville Creek (Fish Ladder)", "Upper Bowmanville Creek"], "Bronte Creek": ["Bronte Creek — Lower Estuary & Mouth", "Bronte Creek — Mid-Section & Provincial Park", "Bronte Creek — Upper Headwaters"], "Credit River": ["Upper Credit River", "Middle Credit River", "Lower Credit River"], "Don River": ["Lower Don River (Lake to Eglinton)", "Upper Don River (Eglinton to Hwy 407)"], "Duffins Creek": ["Duffins Creek — Lower Section", "Duffins Creek — Middle Section", "Duffins Creek — Upper Reaches"], "Eramosa River": ["Eramosa River — Upper Headwaters (Above Rockwood)", "Eramosa River — Mid-Section (Rockwood to Eden Mills)"], "Ganaraska River": ["Ganaraska River — Lower (Lake to CNR Bridge)", "Ganaraska River — Port Hope Sanctuary", "Ganaraska River — Upper & Conservation Areas"], "Grand River": ["Upper Grand River (Tailwater)", "Lower Grand River"], "Humber River": ["Lower Humber River", "Lower-Mid Humber (Old Mill to Eglinton)", "Upper Humber River (Headwaters)"], "Nottawasaga River": ["Nottawasaga River — Headwaters (Niagara Escarpment)", "Nottawasaga River — Middle Section (Alliston to Angus)", "Nottawasaga River — Lower Section (Boyne to Wasaga Beach)"], "Rouge River": ["Rouge River — Marsh & Mouth (Lake Ontario)", "Rouge River — Mid-Section (Rouge National Urban Park)", "Rouge River — Upper & Milne Dam (Markham)"], "Saugeen River": ["Saugeen River — Headwaters & Upper Tributaries", "Saugeen River — Lower Main Stem (Paisley to Southampton)"], "Sixteen Mile Creek": ["Sixteen Mile Creek — Lower Reaches & Oakville Harbour", "Sixteen Mile Creek — Middle Reaches & Main Valley", "Sixteen Mile Creek — Upper West Branch (Trout)"], "Speed River": ["Speed River — Upper (Above Guelph Lake)"], "Wilmot Creek": ["Wilmot Creek — Mouth & Marsh (Lake Ontario)", "Wilmot Creek — Lower River (to CN Rail Tracks)", "Wilmot Creek — Middle Section (Hwy 401 to Hwy 2)", "Wilmot Creek — Upper Watershed & Orono Crown Lands"]};

// Section names are keys (URLs, analytics, config) and keep their em dash. For display,
// show a middot instead.
// A few keys read wrong on screen, so they get a display name. The key itself never changes.
var SECTION_DISPLAY = {
  // "Sanctuary" read as closed, but this is the town reach, open outside Sep 1 to Oct 14.
  'Ganaraska River \u2014 Port Hope Sanctuary': 'Ganaraska River \u2014 Port Hope Town Reach (Jocelyn St to CNR)'
};

function secDisplay(s) { s = String(s == null ? '' : s); return SECTION_DISPLAY[s] || s; }

function secLabel(s) { return secDisplay(s).replace(/ \u2014 /g, ' \u00b7 '); }

// The reach part only ("Port Hope Town Reach (Jocelyn St to CNR)"), for chips and short mentions.
function secShort(s) { var d = secDisplay(s); return d.indexOf(' \u2014 ') !== -1 ? d.split(' \u2014 ')[1] : d; }

// ── SALMON STAGING (June–July lake staging near river mouths) ─────────────────
var STAGING_ZONES = {
  "Lower Credit River":                                       {key:"credit",     lat:43.560, lng:-79.720, sLat:43.530, sLng:-79.720, lake:"Lake Ontario"},
  "Lower Humber River":                                       {key:"humber",     lat:43.640, lng:-79.480, sLat:43.610, sLng:-79.470, lake:"Lake Ontario"},
  "Ganaraska River — Lower (Lake to CNR Bridge)":             {key:"ganaraska",  lat:43.940, lng:-78.305, sLat:43.915, sLng:-78.290, lake:"Lake Ontario"},
  "Bowmanville Creek — River Mouth & Piers":                  {key:"bowmanville",lat:43.893, lng:-78.692, sLat:43.870, sLng:-78.685, lake:"Lake Ontario"},
  "Wilmot Creek — Mouth & Marsh (Lake Ontario)":              {key:"wilmot",     lat:43.912, lng:-78.598, sLat:43.888, sLng:-78.590, lake:"Lake Ontario"},
  "Bronte Creek — Lower Estuary & Mouth":                     {key:"bronte",     lat:43.393, lng:-79.723, sLat:43.370, sLng:-79.715, lake:"Lake Ontario"},
  "Sixteen Mile Creek — Lower Reaches & Oakville Harbour":    {key:"sixteen",    lat:43.440, lng:-79.672, sLat:43.415, sLng:-79.665, lake:"Lake Ontario"},
  "Rouge River — Marsh & Mouth (Lake Ontario)":              {key:"rouge",      lat:43.803, lng:-79.134, sLat:43.780, sLng:-79.125, lake:"Lake Ontario"},
  "Duffins Creek — Lower Section":                            {key:"duffins",    lat:43.835, lng:-79.075, sLat:43.810, sLng:-79.060, lake:"Lake Ontario"},
  "Nottawasaga River — Lower Section (Boyne to Wasaga Beach)":{key:"nottawasaga",lat:44.333, lng:-79.878, sLat:44.355, sLng:-79.890, lake:"Georgian Bay"}
};

// Migratory species that stage in the lake before fall runs
var STAGING_SPECIES = ["Chinook Salmon", "Coho Salmon", "Steelhead"];

// Is this date within the staging window? (mid-June through late July; ramps toward fall)
// River timing groups for salmon staging + run (by mouth key).
// Eastern rivers run cooler and earlier; Bronte is the latest.
var STAGING_GROUP = {
  bowmanville: 'east', wilmot: 'east', ganaraska: 'east',
  duffins: 'centralEarly',
  humber: 'central', credit: 'central', rouge: 'central', sixteen: 'central', nottawasaga: 'central',
  bronte: 'late'
};

// Returns a fractional "month" value, e.g. July 15 -> 6.5
function _mfrac(month, day) { return month + (Math.min(day,30) / 30); }

// Salmon (Chinook/Coho) staging + run phase, group-aware.
// Each group defines: stageStart (lake staging begins), runStart (fish enter river),
// runPeak (main push), runEnd (tapering off). Values are fractional months (0-indexed).
function getSalmonPhase(groupKey, month, day) {
  var m = _mfrac(month, day);
  var G = {
    // eastern: stage Jul 1, run can trigger late Jul, big push mid-late Aug
    east:         { stageStart: 6.0, runStart: 6.8, runPeak: 7.5, runEnd: 9.3 },
    // duffins: a few weeks ahead of west — stage mid-Jul, run early Sep
    centralEarly: { stageStart: 6.5, runStart: 8.0, runPeak: 8.4, runEnd: 9.7 },
    // central/west: stage late Jul, run mid-late Sep
    central:      { stageStart: 6.8, runStart: 8.4, runPeak: 8.7, runEnd: 10.0 },
    // bronte: ~2 weeks behind central
    late:         { stageStart: 7.0, runStart: 8.9, runPeak: 9.2, runEnd: 10.3 }
  };
  var g = G[groupKey] || G.central;
  if (m < g.stageStart) return {active:false, intensity:0, label:"", mode:"none"};
  if (m < g.runStart) {
    // Lake staging window — fish stacking near the mouth
    var sFrac = (m - g.stageStart) / (g.runStart - g.stageStart); // 0..1
    var inten = 0.25 + 0.55 * sFrac; // ramps 0.25 -> 0.8
    return {active:true, intensity:Math.round(inten*100)/100,
            label: sFrac < 0.5 ? "Early staging" : "Staging building", mode:"stage"};
  }
  if (m < g.runEnd) {
    // In-river run window
    var peakDist = Math.abs(m - g.runPeak);
    var inten2 = m < g.runPeak ? 0.8 + 0.2 * ((m - g.runStart) / (g.runPeak - g.runStart))
                                : 1.0 - 0.6 * ((m - g.runPeak) / (g.runEnd - g.runPeak));
    inten2 = Math.max(0.3, Math.min(1.0, inten2));
    return {active:true, intensity:Math.round(inten2*100)/100,
            label: m < g.runPeak ? "Run starting" : (m < g.runPeak + 0.5 ? "Peak run" : "Run tapering"),
            mode:"run"};
  }
  return {active:false, intensity:0, label:"", mode:"none"};
}

// Steelhead phase — separate from salmon. Fall run follows the salmon, winter trickle,
// spring is the main push (temperature-gated on lake surface temp 5-10°C at mouths).
// lakeTemp may be null; if so we fall back to calendar-only for spring.
function getSteelheadPhase(month, day, lakeTemp) {
  var m = _mfrac(month, day);
  // Fall staging: steelhead stage off the mouths from September (TJ, 2026-10-13), then run.
  if (m >= 8.0 && m < 8.7) return {active:true, intensity:0.4, label:"Fall staging", mode:"stage"};
  // Fall run: late Sept - Oct, following salmon
  if (m >= 8.7 && m < 10.3) return {active:true, intensity:0.6, label:"Fall run", mode:"run"};
  // Winter trickle: Nov - Feb
  if (m >= 10.3 || m < 2.0)  return {active:true, intensity:0.3, label:"Winter holdovers", mode:"run"};
  // Spring push: early Mar - early May, gated on warming water
  if (m >= 2.0 && m < 4.4) {
    // Temperature gate: steelhead stage/run when surface warms into ~5-12°C
    if (lakeTemp != null) {
      if (lakeTemp >= 5 && lakeTemp <= 12) return {active:true, intensity:0.9, label:"Spring run", mode:"stage"};
      if (lakeTemp > 12 && lakeTemp <= 15) return {active:true, intensity:0.45, label:"Spring run winding down", mode:"run"};
      if (lakeTemp > 15) return {active:false, intensity:0, label:"", mode:"none"}; // too warm — run over
      return {active:true, intensity:0.25, label:"Pre-run, water still cold", mode:"stage"}; // too cold yet
    }
    // No temp data — calendar estimate: peak spring mid-Mar to mid-Apr
    if (m >= 2.3 && m < 4.0) return {active:true, intensity:0.8, label:"Spring run", mode:"stage"};
    return {active:true, intensity:0.4, label:"Spring run building", mode:"stage"};
  }
  return {active:false, intensity:0, label:"", mode:"none"};
}

// Compute staging likelihood from lake temp + wind + cloud + seasonal intensity
function computeStagingScore(lakeTempC, windDir, windSpeed, cloudPct, intensity, mouthFaces, tempIsEstimate) {
  var score = intensity; // base seasonal driver (0–0.8)
  var factors = [];
  var _tSuffix = tempIsEstimate ? " (seasonal est.)" : "";

  // Lake surface temp — staging fish hold in a thermal band ~10–17°C near mouths
  if (lakeTempC != null) {
    if (lakeTempC >= 10 && lakeTempC <= 17) { score += 0.25; factors.push("surface temp in staging band" + _tSuffix); }
    else if (lakeTempC > 17 && lakeTempC <= 20) { score += 0.10; factors.push("surface temp slightly warm" + _tSuffix); }
    else if (lakeTempC > 20) { score -= 0.10; factors.push("surface temp warm, fish holding deeper" + _tSuffix); }
    else if (lakeTempC < 10) { score += 0.05; factors.push("cool surface, fish may be shallow" + _tSuffix); }
  }

  // ── UPWELLING (Ekman transport) ──────────────────────────────────────────
  // Surface water moves ~90° to the RIGHT of the wind vector in the Northern
  // Hemisphere. When that transport points offshore, cold hypolimnetic water
  // replaces warm surface water at the river mouth — the single strongest
  // staging trigger. On Lake Ontario's north shore this means W winds upwell
  // and E winds downwell (TRCA western Durham nearshore monitoring).
  // mouthFaces is the offshore bearing (180 = mouth faces south into Lk Ontario,
  // 0 = faces north into Georgian Bay), so the same maths flips correctly there.
  var _upwell = null;
  if (windDir != null && mouthFaces != null && windSpeed != null) {
    var _ekman = (windDir + 270) % 360;                                   // transport bearing
    var _off   = Math.abs(((_ekman - mouthFaces + 540) % 360) - 180);     // 0 = fully offshore
    if (_off <= 45 && windSpeed >= 15)      { score += 0.25; _upwell = 'up-strong';  factors.push("upwelling, cold water pushing into the mouth"); }
    else if (_off <= 45 && windSpeed >= 8)  { score += 0.12; _upwell = 'up-light';   factors.push("light upwelling, water cooling at the mouth"); }
    else if (_off <= 75 && windSpeed >= 18) { score += 0.10; _upwell = 'up-light';   factors.push("some upwelling push"); }
    else if (_off >= 135 && windSpeed >= 15){ score -= 0.15; _upwell = 'down-strong';factors.push("downwelling, warm surface water piling up at the mouth"); }
    else if (_off >= 135 && windSpeed >= 8) { score -= 0.07; _upwell = 'down-light'; factors.push("mild downwelling, surface warming at the mouth"); }
    else {
      // Nothing crossed a scoring threshold — still surface a wind status line so the
      // card always tells the upwelling story, worded to what's actually happening.
      if (windSpeed < 8) { factors.push("wind light, little upwelling push either way"); }
      else { factors.push("wind mostly alongshore, little upwelling effect"); }
    }

    // During strong upwelling the OFFSHORE buoy often reads warm — that is where the
    // displaced surface water went. Nearshore water at the mouth is far colder than the
    // reading suggests, so undo the warm-water penalty applied above rather than letting
    // the two signals cancel each other out.
    if (_upwell === 'up-strong' && lakeTempC != null && lakeTempC > 20) {
      score += 0.10;
      factors.push("offshore reading warm but shore water cooling fast");
    }
  }

  // Onshore wind concentrates baitfish + cooler water toward the mouth
  if (windDir != null && mouthFaces != null) {
    var diff = Math.abs(((windDir - mouthFaces + 540) % 360) - 180);
    if (diff < 60 && windSpeed >= 10) { score += 0.15; factors.push("onshore wind stacking bait at the mouth"); }
    else if (diff < 90 && windSpeed >= 8) { score += 0.08; factors.push("some onshore push"); }
    else if (diff > 130 && windSpeed >= 15) { score -= 0.08; factors.push("offshore wind flattening the bite"); }
  }

  // Overcast pushes staging fish shallower / more catchable near surface
  if (cloudPct != null) {
    if (cloudPct >= 70) { score += 0.12; factors.push("overcast, fish holding higher in the water"); }
    else if (cloudPct <= 20) { score -= 0.05; factors.push("bright sun, fish sounding deeper"); }
  }

  score = Math.max(0, Math.min(1, score));
  // _upwell is surfaced so the hero's wind tile can label the actual mechanism
  // (upwelling / downwelling / alongshore) instead of just a wind speed.
  return {score: score, factors: factors, upwell: _upwell, windSpeed: windSpeed};
}

// Reduce a section name to the river system it belongs to, e.g.
//   "Lower-Mid Humber (Old Mill to Eglinton)"     -> "Humber"
//   "Middle Bowmanville Creek (Fish Ladder)"      -> "Bowmanville Creek"
//   "Ganaraska River — Lower (Lake to CNR Bridge)"-> "Ganaraska River"
// The old inline version stripped only the leading Upper/Middle/Lower prefix, so a
// trailing parenthetical survived and the substring match against STAGING_ZONES failed —
// which is why the Lower-Mid Humber and Middle Bowmanville had no staging awareness at all.
function riverSystemName(sectionName) {
  if (!sectionName) return '';
  return String(sectionName)
    .split(',')[0]
    .split(' \u2014 ')[0]                              // drop the em-dash qualifier
    .replace(/\s*\([^)]*\)\s*/g, ' ')                  // drop any parenthetical
    .replace(/^(Upper|Middle|Lower-Mid|Lower|Mid)\s+/i, '')
    .trim();
}

// Find the staging zone for whatever system this section sits on. Exact match wins;
// otherwise match on system name in either direction so "Humber" finds "Lower Humber River".
function stagingZoneForSection(sectionName) {
  if (typeof STAGING_ZONES === 'undefined' || !sectionName) return null;
  var base = String(sectionName).split(',')[0].trim();
  if (STAGING_ZONES[base]) return base;
  var core = riverSystemName(base);
  if (!core) return null;
  var found = null;
  Object.keys(STAGING_ZONES).forEach(function(z){
    if (found) return;
    if (z.indexOf(core) !== -1 || riverSystemName(z) === core) found = z;
  });
  return found;
}

// ── TROUT & SALMON SEASON BY REACH ────────────────────────────────────────────
// Ontario closes trout and salmon on most water on September 30, but named lower
// reaches of Great Lakes tributaries stay open — some to December 31, some all year.
// Getting this wrong sends anglers to closed water during the exact weeks the run peaks,
// so every section carries an explicit season band:
//
//   'all-year'  — open 365 days (lowest reaches, below the CNR / Hwy 2 / Eglinton line)
//   'extended'  — 4th Sat April to December 31 (middle reaches)
//   'standard'  — 4th Sat April to September 30 (everything else)
//
// Sources: Ontario Fishing Regulations Summary 2026, Zone 16 and Zone 17 Species
// Exceptions ("Additional Fishing Opportunities").
function seasonWindowFor(band, year) {
  var openD = _resolveClosureDate('FRI_BEFORE_4TH_SAT_APRIL', year);
  if (openD) { openD = new Date(openD); openD.setDate(openD.getDate() + 1); } // the Saturday
  if (band === 'all-year') return null;                       // never closed
  var close = (band === 'extended') ? new Date(year, 11, 31) : new Date(year, 8, 30);
  return { open: openD, close: close };
}

// Returns null when open, or {reason} when trout/salmon season is shut on this date.
function seasonClosureFor(cfg, dateStr) {
  if (!cfg || !dateStr) return null;
  // Default to 'standard' — the most restrictive band. A section with no explicit season
  // is treated as closing September 30, so a missing tag produces an over-cautious warning
  // rather than silently sending someone to closed water. All six currently-untagged
  // sections are upstream reaches where 'standard' is correct anyway.
  var band = cfg.season || 'standard';
  var parts = dateStr.split('-');
  var y = parseInt(parts[0], 10);
  var d = new Date(y, parseInt(parts[1],10) - 1, parseInt(parts[2],10));
  var w = seasonWindowFor(band, y);
  if (!w) return null;
  if (d >= w.open && d <= w.close) return null;
  var reopen = (d > w.close) ? (y + 1) : y;
  return {
    band: band,
    reason: band === 'extended'
      ? 'Trout and salmon season on this reach runs from the fourth Saturday in April to December 31.'
      : 'Trout and salmon season on this reach runs from the fourth Saturday in April to September 30.',
    reopens: reopen
  };
}

// Fishable means all three: the species lives in this section, the section's trout and
// salmon season is open on the date, and the species is in a good or peak window.
// Biological season alone is not enough — resident trout are "in season" in October on
// reaches where fishing for them closed on September 30.
function speciesFishableIn(sectionName, speciesName, dateStr) {
  var c = getRiverConfig(sectionName);
  if (!c || !c.species || c.species.indexOf(speciesName) === -1) return false;
  if (seasonClosureFor(c, dateStr)) return false;
  if (allAccessClosed(c, dateStr)) return false;
  var s = getCurrentSeason(speciesName, dateStr, sectionName);
  return !!s && (s.quality === 'peak' || s.quality === 'good');
}

// Other sections of the same river system, in RIVER_SECTIONS order.
function sectionSiblings(sectionName) {
  var base = String(sectionName || '').split(',')[0].trim();
  var out = [];
  Object.keys(RIVER_SECTIONS).forEach(function(parent) {
    var list = RIVER_SECTIONS[parent];
    if (list.indexOf(base) === -1) return;
    list.forEach(function(s) { if (s !== base) out.push(s); });
  });
  return out;
}

// Next reach upstream on each river. Geography only: whether a reach can be suggested is
// decided by speciesFishableIn() (season band, access closures, species in the river), and
// barriers are already encoded in each section's species list.
var UPSTREAM_OF = {
  'Ganaraska River \u2014 Lower (Lake to CNR Bridge)': 'Ganaraska River \u2014 Port Hope Sanctuary',
  'Ganaraska River \u2014 Port Hope Sanctuary': 'Ganaraska River \u2014 Upper & Conservation Areas',
  'Bowmanville Creek \u2014 River Mouth & Piers': 'Lower Bowmanville Creek',
  'Lower Bowmanville Creek': 'Middle Bowmanville Creek (Fish Ladder)',
  'Middle Bowmanville Creek (Fish Ladder)': 'Upper Bowmanville Creek',
  'Wilmot Creek \u2014 Mouth & Marsh (Lake Ontario)': 'Wilmot Creek \u2014 Lower River (to CN Rail Tracks)',
  'Wilmot Creek \u2014 Lower River (to CN Rail Tracks)': 'Wilmot Creek \u2014 Middle Section (Hwy 401 to Hwy 2)',
  'Wilmot Creek \u2014 Middle Section (Hwy 401 to Hwy 2)': 'Wilmot Creek \u2014 Upper Watershed & Orono Crown Lands',
  'Duffins Creek \u2014 Lower Section': 'Duffins Creek \u2014 Middle Section',
  'Duffins Creek \u2014 Middle Section': 'Duffins Creek \u2014 Upper Reaches',
  'Rouge River \u2014 Marsh & Mouth (Lake Ontario)': 'Rouge River \u2014 Mid-Section (Rouge National Urban Park)',
  'Rouge River \u2014 Mid-Section (Rouge National Urban Park)': 'Rouge River \u2014 Upper & Milne Dam (Markham)',
  'Lower Humber River': 'Lower-Mid Humber (Old Mill to Eglinton)',
  'Lower Don River (Lake to Eglinton)': 'Upper Don River (Eglinton to Hwy 407)',
  'Lower-Mid Humber (Old Mill to Eglinton)': 'Upper Humber River (Headwaters)',
  'Lower Credit River': 'Middle Credit River',
  'Middle Credit River': 'Upper Credit River',
  'Sixteen Mile Creek \u2014 Lower Reaches & Oakville Harbour': 'Sixteen Mile Creek \u2014 Middle Reaches & Main Valley',
  'Sixteen Mile Creek \u2014 Middle Reaches & Main Valley': 'Sixteen Mile Creek \u2014 Upper West Branch (Trout)',
  'Bronte Creek \u2014 Lower Estuary & Mouth': 'Bronte Creek \u2014 Mid-Section & Provincial Park',
  'Bronte Creek \u2014 Mid-Section & Provincial Park': 'Bronte Creek \u2014 Upper Headwaters',
  'Nottawasaga River \u2014 Lower Section (Boyne to Wasaga Beach)': 'Nottawasaga River \u2014 Middle Section (Alliston to Angus)',
  'Nottawasaga River \u2014 Middle Section (Alliston to Angus)': 'Nottawasaga River \u2014 Headwaters (Niagara Escarpment)',
  'Saugeen River \u2014 Lower Main Stem (Paisley to Southampton)': 'Saugeen River \u2014 Headwaters & Upper Tributaries',
  'Lower Beaver River (Thornbury)': 'Middle Beaver River (Clarksburg to Heathcote)',
  'Middle Beaver River (Clarksburg to Heathcote)': 'Upper Beaver River (Kimberley)'
};

// TJ's rule: when the run is in the river, fish as far upstream as the regulations allow.
// That's after September 30 (Oct 1 to Dec 31) and from the trout opener (fourth Saturday in
// April) to May 31. In between, fish are staging at the mouths or back in the lake.
function upstreamWindowOn(dateStr) {
  if (!dateStr) return false;
  var p = dateStr.split('-'), y = parseInt(p[0], 10);
  var d = new Date(y, parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  if (d.getMonth() >= 9) return true;                              // Oct 1 to Dec 31
  var opener = seasonWindowFor('standard', y);
  return !!(opener && d >= opener.open && d <= new Date(y, 4, 31)); // opener to May 31
}

// Returns the furthest reach above this one where one of the species is fishable on the
// date, as {section, species}, or null. Closed reaches in between are skipped, not a stop:
// fish pass through a sanctuary to the open water above it.
function furthestUpstreamOpen(sectionName, speciesNames, dateStr) {
  if (!dateStr || !speciesNames || !speciesNames.length) return null;
  if (!upstreamWindowOn(dateStr)) return null;
  var cur = String(sectionName || '').split(',')[0].trim(), best = null, seen = {};
  while (UPSTREAM_OF[cur] && !seen[cur]) {
    seen[cur] = true;
    cur = UPSTREAM_OF[cur];
    var ok = speciesNames.filter(function(n){ return speciesFishableIn(cur, n, dateStr); });
    if (ok.length) best = { section: cur, species: ok[0] };
  }
  return best;
}

// ── SEASONAL CLOSURES ─────────────────────────────────────────────────────────
// Fish sanctuaries from the MNR 2026 summary. Recommending a spot inside a closed
// sanctuary is the worst error this app can make, so closed spots are removed from
// recommendations entirely and shown with the reason rather than silently dropped.
//
// Dates are {from:'MM-DD', to:'MM-DD'} and may wrap the year end. Rules keyed to a
// floating date ("Friday before the fourth Saturday in April") are resolved per-year.
function _nthWeekdayOfMonth(year, month, weekday, n) { // month 1-12, weekday 0=Sun
  var d = new Date(year, month - 1, 1), count = 0;
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday) { count++; if (count === n) return new Date(d); }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function _resolveClosureDate(token, year) {
  // 'MM-DD' literal, or a named floating date
  if (/^\d{2}-\d{2}$/.test(token)) {
    return new Date(year, parseInt(token.slice(0,2),10) - 1, parseInt(token.slice(3),10));
  }
  if (token === 'FRI_BEFORE_4TH_SAT_APRIL') {
    var s = _nthWeekdayOfMonth(year, 4, 6, 4);           // 4th Saturday in April
    if (!s) return null;
    var f = new Date(s); f.setDate(f.getDate() - 1); return f;
  }
  if (token === 'FRI_BEFORE_2ND_SAT_MAY') {
    var s2 = _nthWeekdayOfMonth(year, 5, 6, 2);
    if (!s2) return null;
    var f2 = new Date(s2); f2.setDate(f2.getDate() - 1); return f2;
  }
  return null;
}

function accessClosureOn(spot, dateStr) {
  if (!spot || !spot.closed || !spot.closed.length || !dateStr) return null;
  var parts = dateStr.split('-');
  var y = parseInt(parts[0],10);
  var d = new Date(y, parseInt(parts[1],10) - 1, parseInt(parts[2],10));
  for (var i = 0; i < spot.closed.length; i++) {
    var win = spot.closed[i];
    if (win.allYear) return win;
    var from = _resolveClosureDate(win.from, y);
    var to   = _resolveClosureDate(win.to, y);
    if (!from || !to) continue;
    if (from <= to) { if (d >= from && d <= to) return win; }
    else { if (d >= from || d <= to) return win; }  // wraps the year end
  }
  return null;
}

function isAccessOpen(spot, dateStr) { return !accessClosureOn(spot, dateStr); }

// A section whose every listed access point is closed on the date is closed in practice,
// even when its season band says open (e.g. Middle Credit in October: Streetsville is in
// the Aug 15 sanctuary and Norval is above Hwy 407). Sections with no access list are
// judged on their season band alone.
function allAccessClosed(cfg, dateStr) {
  if (!cfg || !cfg.access || !cfg.access.length || !dateStr) return false;
  return !cfg.access.some(function(a){ return isAccessOpen(a, dateStr); });
}

// Does a RIVER_REGS species row cover this species key? Rows combine species
// ("Chinook / Coho Salmon", "Rainbow Trout (Steelhead)"), so match on the species word.
// Exact-name matching hid the Chinook row on every river, and "steelhead" had no
// entry at all, so it matched every row.
var REGS_ROW_PATTERNS = {
  brown: /brown/i, rainbow: /rainbow/i, brook: /brook/i,
  chinook: /chinook/i, coho: /coho/i, steelhead: /steelhead|rainbow/i
};

function regsRowMatches(rowName, speciesKey) {
  var re = REGS_ROW_PATTERNS[speciesKey];
  return re ? re.test(rowName || '') : false;
}

// The recommended access spot, shared by the hero headline and the access cards so they
// never name different spots. Pass open spots only.
// Staging: the mouth. Otherwise fish are IN THE RIVER, so prefer in-river spots and only
// fall back to a mouth spot if the section has nothing else. Picking by crowd alone sent
// people to the harbour after the fish had left it (the Ganaraska has two spots, both
// 'high', and index 0 is the harbour).
function bestAccessSpot(access, atMouth) {
  if (!access || !access.length) return null;
  if (atMouth) {
    return access.filter(function(a){ return a.mouth === true; })[0] ||
           access.find(function(a){ return a.crowd === 'low'; }) || access[0];
  }
  var inRiver = access.filter(function(a){ return a.mouth !== true; });
  var pool = inRiver.length ? inRiver : access;
  return pool.find(function(a){ return a.crowd === 'low'; }) ||
         pool.find(function(a){ return a.crowd === 'med'; }) ||
         pool[0];
}

// Closed to fishing on the date: season shut, or every access point closed. Anything that
// rates a section (the Conditions pill, the drive verdict) checks this first, because a
// water rating on closed water reads as a go.
function sectionClosedOn(cfg, dateStr) {
  return !!(seasonClosureFor(cfg, dateStr) || allAccessClosed(cfg, dateStr));
}

function mouthPreferenceFor(speciesName, dateStr) {
  var MIG = ['Chinook Salmon','Coho Salmon','Steelhead'];
  if (!speciesName || MIG.indexOf(speciesName) === -1) return 0;
  if (typeof getCurrentSeason !== 'function') return 0;
  var w = getCurrentSeason(speciesName, dateStr);
  if (!w) return 0;
  var lab = (w.label || '').toLowerCase();
  if (/in lake/.test(lab)) return 8;
  if (/harbour|staging|mouth/.test(lab)) return 6;
  if (/early run/.test(lab)) return 3;
  return 0;
}

function stagingPlausibleFor(speciesName, dateStr) {
  if (speciesName !== 'Chinook Salmon' && speciesName !== 'Coho Salmon') return false;
  if (typeof getCurrentSeason !== 'function') return false;
  var w = getCurrentSeason(speciesName, dateStr);
  return !!(w && /harbour|staging|mouth/i.test(w.label || ''));
}

// Monthly nearshore surface-temperature climatology (°C) used when the live feed is
// unavailable. Approximate means for western Lake Ontario / Georgian Bay nearshore water.
// Keeps the staging score meaningful instead of silently dropping the temperature factor.
var LAKE_TEMP_CLIMATOLOGY = {
  "Lake Ontario": [3, 2, 2, 5, 10, 16, 21, 22, 19, 14, 9, 5],
  "Georgian Bay": [2, 1, 2, 5, 10, 16, 20, 21, 18, 12, 7, 4],
  "Lake Huron":   [2, 1, 2, 5, 10, 16, 20, 21, 18, 12, 7, 4],
  "Lake Erie":    [3, 2, 3, 7, 13, 19, 23, 24, 21, 15, 9, 5]
};

function seasonalLakeTempEst(lakeName, monthIdx) {
  var series = LAKE_TEMP_CLIMATOLOGY[lakeName] || LAKE_TEMP_CLIMATOLOGY["Lake Ontario"];
  var m = (monthIdx == null) ? new Date().getMonth() : monthIdx;
  return series[Math.max(0, Math.min(11, m))];
}

// Resolve the harbour/mouth section for a river system: exact match first, else strip the
// Upper/Middle/Lower prefix and find the staging zone on the same river (Middle Credit → Lower Credit).
function resolveStagingSection(riverName) {
  if (!riverName || typeof STAGING_ZONES === 'undefined') return null;
  var base = riverName.split(',')[0].trim();
  if (STAGING_ZONES[base]) return base;
  var core = base.split(' \u2014 ')[0].replace(/^(Upper|Middle|Lower|Lower-Mid)\s+/i, '').trim();
  var found = null;
  Object.keys(STAGING_ZONES).forEach(function(z){ if (!found && core && z.indexOf(core) !== -1) found = z; });
  return found;
}

const TEMP_MIN = 8, TEMP_MAX = 14, TEMP_STRESS = 18;

var RIVER_CONFIG = {

  "Upper Grand River (Tailwater)": {
    season:'standard',
    // MNR 2026: Brook, Brown and Rainbow Trout are S-0 / C-0 here \u2014 catch and release only.
    catchRelease:['Brook Trout','Brown Trout','Rainbow Trout','Steelhead'],
    // MNR 2026: only artificial lures, one single-pointed barbless hook. Roe, worms and
    // all other organic bait are illegal here — no float/bait method may be recommended.
    artificialOnly:true,
    gauge:"02GA016", gaugeName:"Grand River below Shand Dam",
    sweetMin:8, sweetMax:12, flowLow:3, flowHigh:25,
    lat:43.700, lng:-80.280,
    loc:"Below Shand Dam through Elora Gorge to West Montrose",
    driveTime:{toronto:25,mississauga:15,brampton:20,oakville:15,burlington:25,milton:15,hamilton:35,guelph:45,cambridge:55,kitchener:65,waterloo:70,orangeville:50,'north york':30,scarborough:35,etobicoke:15,markham:45,'richmond hill':45,vaughan:40,ajax:65,pickering:60,oshawa:80,whitby:75,bowmanville:95,clarington:105,newcastle:105,cobourg:145,'port hope':130,barrie:100,collingwood:120,'owen sound':160},
    species:["Brown Trout","Rainbow Trout"],
    active:true,
    regs:[],
    methods:["fly","spin","float"],
    access:[
      {name:"Fergus Pool · Below Shand Dam",closed:[{from:'10-01',to:'12-31',why:'Trout season is closed Oct 1 to Dec 31 on this reach. It is catch and release, artificial lures and one barbless hook when open.'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Trout season is closed until the opener on the fourth Saturday in April'}],loc:"Fergus, ON · Below Shand Dam",crowd:"med",desc:"Closest tailwater to the dam. Cold, steady flows all year from bottom-draw releases make it prime summer water when other rivers are too warm."},
      {name:"Elora Gorge",closed:[{from:'10-01',to:'12-31',why:'Trout season is closed Oct 1 to Dec 31 on this reach. It is catch and release, artificial lures and one barbless hook when open.'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Trout season is closed until the opener on the fourth Saturday in April'}],loc:"Elora, ON · Below gorge on river-right",crowd:"high",desc:"Deep pools, limestone walls and predictable brown trout habitat. Heavy weekend pressure. The gorge walls throw shade even on sunny days, which helps at midday."},
      {name:"Racquet Club",closed:[{from:'10-01',to:'12-31',why:'Trout season is closed Oct 1 to Dec 31 on this reach. It is catch and release, artificial lures and one barbless hook when open.'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Trout season is closed until the opener on the fourth Saturday in April'}],loc:"Elora, ON · North of Quarry CA on Wellington Rd 18",crowd:"low",desc:"North of Elora on Wellington Rd 18. Turn right at the next road after the Quarry Conservation Area. Park here and follow the steep trail down to the river. It can be slippery in wet weather."},
      {name:"The Trestle",closed:[{from:'10-01',to:'12-31',why:'Trout season is closed Oct 1 to Dec 31 on this reach. It is catch and release, artificial lures and one barbless hook when open.'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Trout season is closed until the opener on the fourth Saturday in April'}],loc:"Elora, ON · Wellington Rd 18",crowd:"low",desc:"Past the railway trestle on Wellington Rd 18. Look for a sharp right turn, where a marked trail and stairs lead down to the river."},
      {name:"Wilson's Flats",closed:[{from:'10-01',to:'12-31',why:'Trout season is closed Oct 1 to Dec 31 on this reach. It is catch and release, artificial lures and one barbless hook when open.'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Trout season is closed until the opener on the fourth Saturday in April'}],loc:"Elora, ON · Grand River, Wilson's Flats",crowd:"low",desc:"Continue north on Wellington Rd 18 and turn left onto 2nd Line. Limited roadside parking, and the river is a short walk away."},
      {name:"Irvine Creek Confluence",closed:[{from:'10-01',to:'12-31',why:'Trout season is closed Oct 1 to Dec 31 on this reach. It is catch and release, artificial lures and one barbless hook when open.'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Trout season is closed until the opener on the fourth Saturday in April'}],loc:"Elora, ON · Where Irvine Creek meets the Grand",crowd:"low",desc:"Underused. The confluence concentrates baitfish and large browns. Most anglers don't walk past the gorge. Access is via the Wellington County trail system."},
      {name:"Elora Gorge Conservation Area",closed:[{from:'10-01',to:'12-31',why:'Trout season is closed Oct 1 to Dec 31 on this reach. It is catch and release, artificial lures and one barbless hook when open.'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Trout season is closed until the opener on the fourth Saturday in April'}],loc:"Elora, ON · GRCA managed access",crowd:"high",desc:"Managed access with day-use fee. Interior sections slightly less pressured. The upstream end near the lookout bridge consistently holds large fish."}
    ]
  },
  "Middle Grand River": {
    // MNR 2026: Brook, Brown and Rainbow Trout are S-0 / C-0 here \u2014 catch and release only.
    catchRelease:['Brook Trout','Brown Trout','Rainbow Trout','Steelhead'],
    // MNR 2026: only artificial lures, one single-pointed barbless hook. Roe, worms and
    // all other organic bait are illegal here — no float/bait method may be recommended.
    artificialOnly:true,
    gauge:"02GA016", gaugeName:"Grand River below Shand Dam",
    sweetMin:8, sweetMax:15, flowLow:3, flowHigh:30,
    lat:43.420, lng:-80.320,
    loc:"Waterloo through Cambridge, Paris, Brantford",
    driveTime:{ toronto:100,mississauga:90,brampton:65,oakville:55,burlington:50,milton:40,hamilton:45,guelph:15,cambridge:5,kitchener:15,waterloo:20,orangeville:65,markham:105,"richmond hill":100,vaughan:95,ajax:130,pickering:125,"north york":95,scarborough:105,etobicoke:85,oshawa:145,whitby:140,bowmanville:160,clarington:170,newcastle:170,cobourg:205,"port hope":195,barrie:135,collingwood:135,"owen sound":155 },
    species:["Brown Trout","Rainbow Trout"],
    active:false,
    regs:[],
    methods:["spin","float"],
    access:[]
  },
  "Lower Grand River": {
    season:'extended',
    // MNR 2026: catch and release (S-0 / C-0) applies from Paris to Brantford only. This
    // section's access points (Caledonia, Dunnville) are below Brantford, where Brown and
    // Rainbow Trout combined are S-1 / C-0 from Oct 1 to Dec 31 and zone limits otherwise.
    // So no catchRelease tag here; the regs line below carries the fall limit.
    gauge:"02GA016", gaugeName:"Grand River below Shand Dam",
    sweetMin:10, sweetMax:30, flowLow:5, flowHigh:60,
    lat:43.000, lng:-79.900,
    loc:"Caledonia through Dunnville to Lake Erie",
    driveTime:{ toronto:100,mississauga:100,brampton:90,oakville:60,burlington:40,milton:65,hamilton:30,guelph:75,cambridge:60,kitchener:80,waterloo:80,orangeville:115,markham:120,"richmond hill":120,vaughan:115,ajax:130,pickering:130,"north york":110,scarborough:115,etobicoke:95,oshawa:145,whitby:140,bowmanville:160,clarington:165,newcastle:165,cobourg:200,"port hope":185,barrie:175,collingwood:190,"owen sound":215 },
    species:["Steelhead"],
    active:true,
    regs:[{rule:'Paris to Lake Erie: open fourth Saturday in April to Dec 31. Below Brantford, Brown and Rainbow Trout are S-1 and C-0 from Oct 1 to Dec 31.',icon:'📋'},{rule:'Below the Caledonia dam: Walleye S-4 and C-2, any size. Walleye and Pike are closed Mar 1 to the Friday before the second Saturday in May.',icon:'📋'}],
    methods:["float","spin"],
    access:[
      {name:"Caledonia · Argyle Street Access",loc:"Caledonia, ON · Argyle Street bridge",crowd:"low",desc:"Good access to the lower Grand. Spring and fall steelhead runs from Lake Erie. Best fished from a kayak for this wider section of river."},
      {name:"Dunnville · Lower Grand",loc:"Dunnville, ON · Near Lake Erie mouth",crowd:"med",desc:"Near the mouth of the Grand at Lake Erie. Major steelhead staging area in spring and fall. Some access from shoreline but boat is preferred for best results."}
    ]
  },
  "Upper Credit River": {
    season:'standard',
    // MNR 2026: Brook, Brown and Rainbow Trout are S-0 / C-0 here \u2014 catch and release only.
    catchRelease:['Brook Trout','Brown Trout','Rainbow Trout','Steelhead'],
    // MNR 2026: only artificial lures, one single-pointed barbless hook. Roe, worms and
    // all other organic bait are illegal here — no float/bait method may be recommended.
    artificialOnly:true,
    gauge:"02HB001", gaugeName:"Credit River near Cataract",
    sweetMin:5, sweetMax:15, flowLow:1, flowHigh:25,
    lat:43.870, lng:-80.010,
    loc:"Headwaters to Inglewood (Erin, Mono, Orangeville)",
    driveTime:{ toronto:35,mississauga:35,brampton:20,oakville:30,burlington:35,milton:20,hamilton:40,guelph:20,cambridge:35,kitchener:35,waterloo:35,orangeville:5,markham:30,"richmond hill":30,vaughan:25,ajax:45,pickering:40,"north york":30,scarborough:35,etobicoke:30,oshawa:50,whitby:50,bowmanville:60,clarington:60,newcastle:65,cobourg:80,"port hope":80,barrie:35,collingwood:40,"owen sound":60 },
    species:["Brown Trout","Rainbow Trout","Brook Trout"],
    active:true,
    regs: [],
    methods: [],
    access:[
      {name:"Upper Credit Conservation Area",loc:"Caledon, ON · CVC managed · above Orangeville",crowd:"low",desc:"CVC-designated coldwater fishery on the upper Credit headwaters. Wild brook trout in the main river and feeder creeks. Catch-and-release only. Quieter than Belfountain. Bring waders, as bank access is limited."},
      {name:"Belfountain Conservation Area",loc:"Belfountain, ON · Above the falls",crowd:"med",desc:"Picturesque gorge setting above a small dam. Good dry fly water in low flows. The pool below the dam holds resident brown trout year-round. CVC managed, day-use fee applies."},
      {name:"Forks of the Credit Provincial Park",closed:[{from:'10-01',to:'12-31',why:'Fish sanctuary. No fishing Oct 1 to Dec 31 (Old Baseline Rd to Hwy 9)'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Fish sanctuary. Closed until the trout opener'}],loc:"Cataract, ON · Niagara Escarpment gorge",crowd:"med",desc:"Spectacular gorge section below the Cataract waterfalls. Wild brown trout in pools below the escarpment. Catch-and-release only in most sections. Hike-in required to the best water."},
      {name:"Belfountain to Inglewood Reach",loc:"Between Belfountain and Inglewood",crowd:"low",desc:"Walk-in access only along this productive section. Fewer anglers, quality fish. Brown trout and rainbow trout throughout. Road allowance access at several bridge crossings."}
    ]
  },
  "Middle Credit River": {
    season:'extended',
    gauge:"02HB001", gaugeName:"Credit River near Cataract",
    sweetMin:5, sweetMax:20, flowLow:1, flowHigh:40,
    lat:43.660, lng:-79.880,
    loc:"Norval Dam upstream to Inglewood",
    driveTime:{toronto:30,mississauga:5,brampton:15,oakville:20,burlington:30,milton:15,hamilton:40,guelph:35,cambridge:50,kitchener:60,waterloo:60,orangeville:35,'north york':35,scarborough:40,etobicoke:20,markham:45,'richmond hill':40,vaughan:35,ajax:65,pickering:60,oshawa:75,whitby:70,bowmanville:90,clarington:100,newcastle:100,cobourg:135,'port hope':125,barrie:90,collingwood:110,'owen sound':150},
    // Chinook and Coho removed: the Streetsville dam is their upstream limit, and the
    // CRAA fishway is deliberately closed during the chinook run so MNR can collect
    // eggs. Only Atlantic salmon, steelhead, brown trout and coaster brook trout are
    // lifted above it.
    species:["Brown Trout","Rainbow Trout","Steelhead"],
    active:true,
    regs:[{rule:"Britannia Rd to Hwy 407: open fourth Saturday in April to Dec 31. Hwy 403 to Britannia Rd is a sanctuary from Aug 15 to Dec 31. Above Hwy 407 (Norval) the season ends Sept 30.",icon:"📋"}],
    methods:["float"],
    access:[
      {name:"McNab Park",closed:[{from:'10-01',to:'12-31',why:'Norval is above Hwy 407, where the trout and salmon season ends Sept 30'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Fish sanctuary. Closed until the trout opener'}],loc:"Norval, ON \u00b7 Below Norval Dam",crowd:"low",desc:"Village park access on the Credit below the Norval dam. Migratory fish stack below the dam in fall, since the dam is the upstream limit for salmon on this system. Quieter than the Streetsville reaches. The season here ends Sept 30, so fish it in spring and September."},
      {name:"Streetsville Road Allowances",closed:[{from:'08-15',to:'12-31',why:'Part of this reach is below the Britannia Rd bridge, inside the Hwy 403–Britannia sanctuary, where there’s no fishing Aug 15 to Dec 31. Fish above Britannia only, and know exactly where the bridge is.'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Fish sanctuary. Closed until the trout opener'}],loc:"Streetsville, ON · Multiple road allowances",crowd:"low",desc:"Several road allowance access points through this reach. Quieter than the lower river access points."}
    ]
  },
  "Lower Credit River": {
    season:'all-year',
    // Cataract sits ~40 km upstream near the Forks and does not represent lower-river flow.
    gauge:"02HB029", gaugeName:"Credit River at Streetsville",
    sweetMin:5, sweetMax:30, flowLow:1, flowHigh:60,
    lat:43.560, lng:-79.720,
    // Reach now runs up to the Norval dam. Chinook and Coho still stop at the
    // Streetsville dam partway up it, so the access list stays below Streetsville —
    // Erindale and the river mouth — and never sends anyone to water salmon cannot reach.
    loc:"Norval Dam to Port Credit / Lake Ontario",
    driveTime:{ toronto:20,mississauga:15,brampton:10,oakville:5,burlington:15,milton:10,hamilton:20,guelph:25,cambridge:30,kitchener:35,waterloo:40,orangeville:30,markham:25,"richmond hill":25,vaughan:20,ajax:35,pickering:30,"north york":20,scarborough:25,etobicoke:15,oshawa:40,whitby:40,bowmanville:50,clarington:55,newcastle:55,cobourg:75,"port hope":70,barrie:50,collingwood:60,"owen sound":80 },
    species:["Steelhead","Chinook Salmon","Coho Salmon","Brown Trout"],
    active:true,
    regs:[{rule:"Check the regulations. This section has specific rules around the river mouth",icon:"📋"}],
    methods:["float","spin"],
    access:[
      {name:"Erindale Park",loc:"Mississauga, ON · Erindale",crowd:"med",desc:"Popular access point with parking. Good pool and run structure. Steelhead and salmon stack here during peak migrations."},
      {name:"Credit River Mouth · Port Credit",mouth:true,loc:"Mississauga, ON · Port Credit Harbour",crowd:"high",desc:"The river mouth at Port Credit Harbour. Very accessible but heavily pressured during peak salmon season. Best early morning on weekdays. Check water temperatures at the port, since cooler surface water increases fish activity."}
    ]
  },
  'Bronte Creek — Lower Estuary & Mouth': {
    season:'all-year',
    gauge:'02HB011', gaugeName:'Bronte Creek at Zimmerman',
    sweetMin:2, sweetMax:10, flowLow:0.5, flowHigh:20,
    lat:43.434, lng:-79.716,
    loc:'Lake Ontario to Lakeshore Road West (Bronte Harbour)',
    driveTime:{'toronto':35,'north york':35,'scarborough':40,'etobicoke':25,'markham':45,'richmond hill':45,'vaughan':40,'ajax':55,'pickering':50,'mississauga':30,'brampton':25,'oakville':5,'burlington':10,'milton':15,'hamilton':15,'guelph':35,'cambridge':35,'kitchener':45,'waterloo':50,'orangeville':45,'oshawa':65,'whitby':60,'bowmanville':75,'clarington':80,'newcastle':80,'cobourg':105,'port hope':95,'barrie':80,'collingwood':95,'owen sound':120},
    species:['Steelhead','Chinook Salmon','Coho Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'Generally open year-round. Standard FMZ limits and dates for trout and salmon apply.',icon:'📋'}],
    methods:['float','spin'],
    access:[
      {name:'Bronte Harbour / Pier',mouth:true,loc:'Bronte Harbour · Oakville, ON',crowd:'high',desc:'The staging area for fall salmon and spring steelhead coming in from Lake Ontario. Fishing spoons and crankbaits from the pier intercepts chrome fish before they push upriver. Very popular, so expect crowds on fall weekends.'},
      {name:'Petro-Canada Park (Petro Park)',loc:'Bronte · Below Lakeshore Road West',crowd:'high',desc:'One of the most heavily fished spots on the creek. Deep pools below Lakeshore Road hold staging fish throughout the run season. Float fishing with roe and beads most productive.'},
      {name:'Below Lakeshore Road West',loc:'Lakeshore Road West · Creek access',crowd:'med',desc:'Access point between the harbour and the mid-section. Good run and pool structure. Slightly less pressure than the pier or Petro Park.'}
    ]
  },
  'Bronte Creek — Mid-Section & Provincial Park': {
    season:'extended',
    gauge:'02HB011', gaugeName:'Bronte Creek at Zimmerman',
    sweetMin:2, sweetMax:10, flowLow:0.5, flowHigh:20,
    lat:43.465, lng:-79.735,
    loc:'Lakeshore Road West to Highway 407 (Bronte Creek Provincial Park)',
    driveTime:{'toronto':40,'north york':40,'scarborough':40,'etobicoke':25,'markham':45,'richmond hill':45,'vaughan':40,'ajax':60,'pickering':55,'mississauga':30,'brampton':25,'oakville':5,'burlington':15,'milton':10,'hamilton':20,'guelph':35,'cambridge':40,'kitchener':50,'waterloo':50,'orangeville':50,'oshawa':70,'whitby':70,'bowmanville':80,'clarington':90,'newcastle':90,'cobourg':115,'port hope':110,'barrie':85,'collingwood':100,'owen sound':130},
    species:['Steelhead','Chinook Salmon','Coho Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'Closed Jan 1 to Friday before 4th Saturday in April. Open 4th Saturday in April through Dec 31 for migratory species.',icon:'📋'}],
    methods:['float','fly'],
    access:[
      {name:'Bronte Creek Provincial Park',loc:'Burloak Drive · Oakville, ON · Ontario Parks managed',crowd:'med',desc:'Access via the Half Moon Valley Trail down into the shale bedrock valley. Deep, narrow holding water for migratory fish. Day-use fee applies. Popular for fly fishing and centrepin. The hike down filters out casual anglers, so expect a better fish-to-angler ratio than the lower section.'},
      {name:'Lowville Park',closed:[{from:'10-01',to:'12-31',why:'Fish sanctuary. No fishing Oct 1 to Dec 31 (Progreston CPR track to Hwy 407)'},{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'Fish sanctuary. Closed until the trout opener'}],loc:'Lowville, ON · Lowville Park Road',crowd:'high',desc:'The pool immediately below Lowville Falls concentrates fish during migrations. Very popular with centrepin and float fishermen. Can be crowded during peak runs, but fish are reliably present.'}
    ]
  },
  'Bronte Creek — Upper Headwaters': {
    season:'standard',
    gauge:'02HB022', gaugeName:'Bronte Creek at Carlisle',
    sweetMin:0.5, sweetMax:4, flowLow:0.1, flowHigh:8,
    lat:43.530, lng:-79.800,
    loc:'Upstream of Lowville to Progreston and Carlisle (Niagara Escarpment)',
    driveTime:{'toronto':45,'north york':45,'scarborough':50,'etobicoke':35,'markham':50,'richmond hill':50,'vaughan':45,'ajax':70,'pickering':65,'mississauga':35,'brampton':20,'oakville':15,'burlington':20,'milton':10,'hamilton':30,'guelph':35,'cambridge':45,'kitchener':55,'waterloo':55,'orangeville':50,'oshawa':85,'whitby':80,'bowmanville':95,'clarington':105,'newcastle':105,'cobourg':135,'port hope':125,'barrie':95,'collingwood':110,'owen sound':145},
    species:['Brook Trout','Brown Trout'],
    active:true,
    regs:[{rule:'Inland stream, open from the fourth Saturday in April to September 30. Catch-and-release and tackle restrictions may apply. Check the regulations for specific tributaries.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'Progreston Area · Road Allowances',loc:'Progreston, ON · Road allowance crossings',crowd:'low',desc:'Classic inland trout fishery in cool, spring-fed water near the Niagara Escarpment. Native brook trout and resident brown trout. Light spinning gear or dry fly fishing suits this narrow, intimate water. Minimal pressure compared to the lower sections.'},
      {name:'Carlisle Reach',loc:'Carlisle, ON · Upper creek',crowd:'low',desc:'Quieter, cooler water above the migratory barrier. The best brook trout habitat on the Bronte system. Road allowance access at bridge crossings. The Carlisle gauge (02HB022) is on this stretch, so its flow readings apply best here.'}
    ]
  },

  "Lower Humber River": {
    season:'all-year',
    gauge:"02HC025", gaugeName:"Humber River at Elder Mills",
    sweetMin:3, sweetMax:12, flowLow:1, flowHigh:25,
    lat:43.640, lng:-79.480,
    loc:"South of Lakeshore Blvd to Lake Ontario (Humber Bay)",
    driveTime:{ toronto:20,mississauga:40,brampton:30,oakville:30,burlington:50,milton:40,hamilton:60,guelph:70,cambridge:85,kitchener:95,waterloo:95,orangeville:65,markham:30,"richmond hill":35,vaughan:30,ajax:50,pickering:45,"north york":20,scarborough:25,etobicoke:15,oshawa:65,whitby:60,bowmanville:80,clarington:85,newcastle:85,cobourg:125,"port hope":115,barrie:95,collingwood:125,"owen sound":175 },
    species:["Brown Trout","Steelhead","Chinook Salmon"],
    active:true,
    regs:[{rule:"TRCA managed. Check catch regulations for this section",icon:"📋"}],
    methods:["float","spin"],
    access:[
      {name:"Humber River Mouth · Humber Bay Park",mouth:true,loc:"Etobicoke / Toronto · Lakeshore Blvd",crowd:"high",desc:"The gathering point for migratory fish entering the Humber. Very accessible with parking. Most fishing pressure in the system. Arrive before dawn during peak salmon and steelhead runs."},
      {name:"Humber Valley Heritage Trail · Lower",loc:"Etobicoke / North York · TRCA managed",crowd:"high",desc:"Urban lower Humber through Toronto. Receives large salmon and steelhead runs in fall and spring. Heavy pressure during peak runs. TRCA managed with catch regulations."}
    ]
  },
  "Lower-Mid Humber (Old Mill to Eglinton)": {
    season:'all-year',
    gauge:"02HC025", gaugeName:"Humber River at Elder Mills",
    sweetMin:3, sweetMax:12, flowLow:1, flowHigh:25,
    lat:43.670, lng:-79.490,
    loc:"Old Mill area north to Eglinton Avenue (Etienne Brulé Park)",
    driveTime:{ toronto:20,mississauga:40,brampton:30,oakville:30,burlington:50,milton:40,hamilton:60,guelph:70,cambridge:85,kitchener:95,waterloo:95,orangeville:60,markham:25,"richmond hill":30,vaughan:25,ajax:50,pickering:40,"north york":15,scarborough:25,etobicoke:15,oshawa:65,whitby:55,bowmanville:80,clarington:85,newcastle:85,cobourg:125,"port hope":115,barrie:90,collingwood:120,"owen sound":170 },
    species:["Steelhead","Chinook Salmon","Brown Trout"],
    active:true,
    regs:[{rule:"TRCA managed. Check the regulations",icon:"📋"}],
    methods:["float","spin"],
    access:[
      {name:"Etienne Brûlé Park",loc:"Etobicoke · Old Mill area",crowd:"med",desc:"Good park access to the lower-mid Humber. Steelhead and salmon push into this section. Trail access along the river for several kilometres north."},
      {name:"Scarlett Mills Park",loc:"North York · Eglinton Avenue",crowd:"med",desc:"Popular access point at the upper end of this section. Good pool structure where fish hold during migration runs."}
    ]
  },
  "Middle Humber (Black Creek to Woodbridge)": {
    season:'extended',
    gauge:"02HC025", gaugeName:"Humber River at Elder Mills",
    sweetMin:3, sweetMax:12, flowLow:1, flowHigh:25,
    lat:43.760, lng:-79.530,
    loc:"Highway 401 to Woodbridge and Kleinburg",
    driveTime:{ toronto:30,mississauga:55,brampton:25,oakville:45,burlington:65,milton:50,hamilton:70,guelph:65,cambridge:85,kitchener:90,waterloo:90,orangeville:50,markham:30,"richmond hill":30,vaughan:20,ajax:55,pickering:50,"north york":25,scarborough:35,etobicoke:30,oshawa:70,whitby:65,bowmanville:85,clarington:95,newcastle:95,cobourg:135,"port hope":125,barrie:80,collingwood:110,"owen sound":160 },
    species:[],
    active:false,
    regs:[],
    methods:[],
    access:[]
  },
  "Upper Humber River (Headwaters)": {
    season:'standard',
    gauge:"02HC025", gaugeName:"Humber River at Elder Mills",
    sweetMin:2, sweetMax:8, flowLow:0.5, flowHigh:15,
    lat:43.870, lng:-79.730,
    loc:"Above Highway 407 to Oak Ridges Moraine / Niagara Escarpment",
    driveTime:{ toronto:50,mississauga:60,brampton:30,oakville:50,burlington:70,milton:45,hamilton:75,guelph:60,cambridge:85,kitchener:85,waterloo:85,orangeville:35,markham:35,"richmond hill":30,vaughan:25,ajax:65,pickering:55,"north york":35,scarborough:45,etobicoke:45,oshawa:80,whitby:70,bowmanville:95,clarington:100,newcastle:100,cobourg:140,"port hope":130,barrie:65,collingwood:90,"owen sound":140 },
    species:["Brown Trout","Rainbow Trout","Brook Trout"],
    active:true,
    regs:[{rule:"Some sections are strictly catch-and-release. Check the regulations before fishing",icon:"📋"}],
    methods:["fly","float"],
    access:[
      {name:"Upper Humber · Mono / Orangeville Area",loc:"Mono Township · Above Bolton",crowd:"low",desc:"The most pristine section of the Humber. Wild brook trout in cold, spring-fed water. Forested banks, minimal angling pressure. Road allowance access at bridge crossings."},
      {name:"Humber River · Bolton Reach",loc:"Bolton, ON · Various road access points",crowd:"med",desc:"Good transition water between the small upper creek and the larger lower river. Brown trout and brook trout resident, steelhead and salmon in season. Multiple access points at bridge crossings."}
    ]
  },
  'Nottawasaga River — Headwaters (Niagara Escarpment)': {
    season:'standard',
    gauge:'02ED101', gaugeName:'Nottawasaga River near Angus',
    sweetMin:5, sweetMax:20, flowLow:1, flowHigh:40,
    lat:44.130, lng:-79.950,
    loc:'Niagara Escarpment and Hockley Valley, upstream of Alliston',
    driveTime:{'toronto':85,'north york':70,'scarborough':75,'etobicoke':85,'markham':65,'richmond hill':60,'vaughan':60,'ajax':90,'pickering':85,'mississauga':95,'brampton':65,'oakville':85,'burlington':100,'milton':75,'hamilton':110,'guelph':80,'cambridge':100,'kitchener':100,'waterloo':100,'orangeville':30,'oshawa':100,'whitby':95,'bowmanville':115,'clarington':125,'newcastle':125,'cobourg':160,'port hope':150,'barrie':40,'collingwood':50,'owen sound':105},
    species:['Rainbow Trout','Brown Trout','Brook Trout'],
    active:true,
    regs:[{rule:'FMZ 16. Most of this section is private land. Access only via the Bruce Trail or public road allowances, and respect no-trespassing signs.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'Bruce Trail Access Points · Upper Notty',loc:'Hockley Valley · Bruce Trail corridor',crowd:'low',desc:'Technical cold-water fishing in bouldery runs and small pools. The Bruce Trail is the only reliable public access through an otherwise private section. Resident rainbow, brown and brook trout. It takes stealth, light tackle and patience. The fish here see less pressure than downstream.'},
      {name:'Headwaters - Road Allowances',loc:'Hockley Valley · Road allowance crossings',crowd:'low',desc:'Limited bridge crossing access above Alliston. Cold, clean, clear water straight off the Niagara Escarpment. Best in spring before run-off warms the lower river and in fall when temperatures drop. Respect all posted no-trespassing signs strictly.'}
    ]
  },
  'Nottawasaga River — Middle Section (Alliston to Angus)': {
    season:'standard',
    gauge:'02ED101', gaugeName:'Nottawasaga River near Angus',
    sweetMin:5, sweetMax:20, flowLow:1, flowHigh:40,
    lat:44.150, lng:-79.900,
    loc:'Alliston through Angus: extended steelhead water, with the Pine and Boyne River confluences',
    driveTime:{'toronto':85,'north york':70,'scarborough':75,'etobicoke':85,'markham':60,'richmond hill':55,'vaughan':55,'ajax':85,'pickering':85,'mississauga':95,'brampton':65,'oakville':85,'burlington':105,'milton':80,'hamilton':110,'guelph':80,'cambridge':105,'kitchener':100,'waterloo':100,'orangeville':35,'oshawa':100,'whitby':90,'bowmanville':115,'clarington':120,'newcastle':120,'cobourg':160,'port hope':145,'barrie':35,'collingwood':50,'owen sound':105},
    species:['Steelhead','Chinook Salmon','Brown Trout'],
    active:true,
    regs:[
      {rule:'Boyne River to Pine River: Rainbow Trout CATCH AND RELEASE ONLY, open all year.',icon:'🔁'},
      {rule:'Sanctuary areas (Essa Township/Nicholson Dam): Closed Jan 1 to Friday before 2nd Saturday in May, and Oct 1–Dec 31.',icon:'🚫'},
      {rule:'Water is often coloured after rain, so adjust your tactics.',icon:'💧'}
    ],
    methods:['float','spin'],
    access:[
      {name:'Alliston · Main River Access',loc:'Alliston, ON · Town access points',crowd:'med',desc:'Start of the extended-season steelhead water. The sandy, clay-based banks colour the water after heavy rain, which is typical of the Notty’s middle section. Drift boats and canoes are common for covering water. Steelhead and Chinook push through here in season.'},
      {name:'Pine River Confluence',loc:'Pine River meets Nottawasaga · Below Alliston',crowd:'med',desc:'The Pine River is an important spawning tributary. Fish concentrate at the confluence during peak runs. Between the Boyne River and the Pine River, rainbow trout are catch-and-release only. Check posted signs carefully.'},
      {name:'Boyne River Confluence',loc:'Boyne River meets Nottawasaga · Angus area',crowd:'med',desc:'The Boyne is another major spawning tributary with its own fish runs. Below this confluence opens to the standard limit zone for rainbow trout (S-2, C-1). The Angus area has good drift access for float fishermen.'},
      {name:'Nicholson Dam / Essa Township Sanctuary',closed:[{from:'01-01',to:'FRI_BEFORE_2ND_SAT_MAY',why:'Fish sanctuary. No fishing Jan 1 to the Friday before the second Saturday in May'},{from:'10-01',to:'12-31',why:'Fish sanctuary. No fishing Oct 1 to Dec 31'}],loc:'Essa Township · Nicholson Dam area',crowd:'low',desc:'SANCTUARY area, closed Jan 1 to the Friday before the 2nd Saturday in May, and Oct 1 to Dec 31. When open, this is productive water for steelhead and brown trout. Check the current year’s dates before fishing, as the rules are strictly enforced.'}
    ]
  },
  'Nottawasaga River — Lower Section (Boyne to Wasaga Beach)': {
    season:'all-year',
    // MNR 2026: Rainbow Trout are S-0 / C-0 from the Boyne River down to the Pine River
    // only. Both access points here (McKinnon Road, confirmed below the Pine by TJ, and the
    // Wasaga Beach mouth) are below the Pine, where rainbows are S-2 / C-1. No C&R tag.
    gauge:'02ED101', gaugeName:'Nottawasaga River near Angus',
    sweetMin:8, sweetMax:30, flowLow:2, flowHigh:60,
    lat:44.300, lng:-79.980,
    loc:'Below the Boyne River confluence to Wasaga Beach (Georgian Bay mouth)',
    driveTime:{'toronto':105,'north york':85,'scarborough':90,'etobicoke':105,'markham':80,'richmond hill':75,'vaughan':75,'ajax':100,'pickering':100,'mississauga':115,'brampton':85,'oakville':105,'burlington':125,'milton':100,'hamilton':130,'guelph':100,'cambridge':120,'kitchener':115,'waterloo':115,'orangeville':50,'oshawa':110,'whitby':105,'bowmanville':125,'clarington':130,'newcastle':135,'cobourg':170,'port hope':155,'barrie':30,'collingwood':30,'owen sound':90},
    species:['Steelhead','Chinook Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'Pine River to Georgian Bay: Rainbow Trout open all year, limit S-2 C-1, no size limit. Salmon peak August–September.',icon:'📋'}],
    methods:['float','spin'],
    access:[
      {name:'McKinnon Road Access Point',loc:'McKinnon Road · Lower Nottawasaga',crowd:'med',desc:'One of the best-known access points on the lower Notty. Good drift water for steelhead and Chinook. The lower section is wider and easier to reach than upstream, and popular with drift boat and pontoon anglers covering long stretches.'},
      {name:'Wasaga Beach · River Mouth (Georgian Bay)',loc:'Wasaga Beach · Georgian Bay estuary',crowd:'high',desc:'The mouth of the Nottawasaga where it enters Georgian Bay. Chinook salmon peak here in August–September before pushing upstream. Steelhead return in spring. The wide, sandy-bottomed lower river transitions to the warm-water fishery with northern pike, musky, and bass in the slower sections near the bay.'}
    ]
  },

  'Duffins Creek — Lower Section': {
    season:'all-year',
    gauge:'02HC022', gaugeName:'Duffins Creek above Pickering',
    sweetMin:2, sweetMax:10, flowLow:0.5, flowHigh:20,
    lat:43.843, lng:-79.065,
    loc:'Lake Ontario to Highway 2 (Ajax / Pickering)',
    driveTime:{'toronto':40,'north york':35,'scarborough':20,'etobicoke':55,'markham':25,'richmond hill':35,'vaughan':45,'ajax':5,'pickering':5,'mississauga':85,'brampton':70,'oakville':75,'burlington':90,'milton':85,'hamilton':105,'guelph':115,'cambridge':130,'kitchener':140,'waterloo':140,'orangeville':95,'oshawa':20,'whitby':15,'bowmanville':35,'clarington':45,'newcastle':45,'cobourg':80,'port hope':70,'barrie':90,'collingwood':130,'owen sound':190},
    species:['Steelhead','Chinook Salmon','Coho Salmon'],
    active:true,
    regs:[{rule:'South of the CNR tracks: open all year. Between the CNR and Hwy 2: open fourth Saturday in April to Dec 31. Standard FMZ 17 limits.',icon:'📋'}],
    methods:['float','spin'],
    access:[
      {name:'Rotary Park',loc:'Ajax · Rotary Park near Lake Ontario',crowd:'high',desc:'Primary access for migratory runs entering from Lake Ontario. Heavy pressure during fall Chinook and Coho runs and spring steelhead. Float fishing with roe and beads most productive. Arrive before dawn on fall weekends.'},
      {name:'Duffins Creek Marsh',mouth:true,loc:'Ajax / Pickering · Duffins Creek marsh',crowd:'med',desc:'Estuary section holds staging fish before they push upstream. Good for casting spoons and crankbaits at chrome fish. Smallmouth bass and pike year-round for warmwater anglers.'},
      {name:'Below CNR Railway Line',loc:'South of CNR tracks · Lower Duffins',crowd:'med',desc:'Extended fall season applies south of the CNR track (Oct–Dec 31). Check boundary markers carefully. Good pool and run structure for float fishing.'}
    ]
  },
  'Duffins Creek — Middle Section': {
    // Greenwood and Whitevale are both north of Hwy 2. Durham's extended season only
    // covers Hwy 2 down to the CNR, so this reach closes Sept 30 like inland water.
    season:'standard',
    gauge:'02HC022', gaugeName:'Duffins Creek above Pickering',
    sweetMin:2, sweetMax:10, flowLow:0.5, flowHigh:20,
    lat:43.870, lng:-79.058,
    loc:'Highway 2 to the dams (Greenwood Conservation Area / Whitevale)',
    driveTime:{'toronto':45,'north york':40,'scarborough':20,'etobicoke':60,'markham':25,'richmond hill':40,'vaughan':45,'ajax':5,'pickering':5,'mississauga':85,'brampton':70,'oakville':75,'burlington':95,'milton':85,'hamilton':105,'guelph':115,'cambridge':130,'kitchener':140,'waterloo':140,'orangeville':95,'oshawa':15,'whitby':10,'bowmanville':35,'clarington':45,'newcastle':45,'cobourg':80,'port hope':70,'barrie':85,'collingwood':130,'owen sound':190},
    species:['Steelhead','Chinook Salmon','Coho Salmon','Rainbow Trout','Brown Trout'],
    active:true,
    regs:[{rule:'Fishing near Whitevale Dam and the barrier north of Church Street is prohibited. Both are fish sanctuaries. Check posted signs.',icon:'🚫'},{rule:'North of Hwy 2 the trout and salmon season ends Sept 30.',icon:'📋'}],
    methods:['float','fly','spin'],
    access:[
      {name:'Greenwood Conservation Area',loc:'Greenwood, ON · TRCA managed',crowd:'med',desc:'Deep valley lands with excellent holding water. Migratory salmon and steelhead push through in season. Resident rainbow and brown trout in cooler upper pools. TRCA managed with day-use fee.'},
      {name:'Whitevale · Below Dam',loc:'Whitevale, ON · Below Whitevale Dam',crowd:'high',desc:'Fish concentrate below the dam before the sanctuary zone. The dam separates migratory fish from resident trout upstream. Don’t fish inside the sanctuary boundary. It’s signed, and wardens patrol it.'}
    ]
  },
  'Duffins Creek — Upper Reaches': {
    season:'standard',
    gauge:'02HC022', gaugeName:'Duffins Creek above Pickering',
    sweetMin:0.5, sweetMax:4, flowLow:0.1, flowHigh:8,
    lat:43.940, lng:-79.040,
    loc:'Above the dams to the Oak Ridges Moraine (Glen Major / West Duffins headwaters)',
    driveTime:{'toronto':50,'north york':45,'scarborough':30,'etobicoke':70,'markham':30,'richmond hill':40,'vaughan':50,'ajax':10,'pickering':15,'mississauga':95,'brampton':80,'oakville':85,'burlington':100,'milton':90,'hamilton':115,'guelph':120,'cambridge':135,'kitchener':145,'waterloo':145,'orangeville':95,'oshawa':15,'whitby':10,'bowmanville':30,'clarington':40,'newcastle':40,'cobourg':80,'port hope':65,'barrie':80,'collingwood':125,'owen sound':185},
    species:['Brook Trout','Brown Trout'],
    active:true,
    regs:[{rule:'Cold-water habitat. Baitfish collection is heavily restricted and redside dace are present. Check the regulations for specific tributary rules.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'Glen Major · Seaton Hiking Trail',loc:'Glen Major · Trans Canada / Seaton Trail',crowd:'low',desc:'Cool tributary water on the Oak Ridges Moraine. Native brook trout in forested sections. Trail access keeps pressure low. Light dry fly or nymph fishing works well in this intimate water.'},
      {name:'West Duffins Headwaters',loc:'West Duffins · Headwater tributaries',crowd:'low',desc:'The most pristine section of the Duffins system. Spring-fed cool water with sensitive native brook trout. Baitfish collection is prohibited because this is redside dace habitat. Catch-and-release is strongly recommended even where it isn’t required.'}
    ]
  },

  'Ganaraska River — Lower (Lake to CNR Bridge)': {
    season:'all-year',
    gauge:'02HD012', gaugeName:'Ganaraska River above Dale',
    sweetMin:2, sweetMax:12, flowLow:0.5, flowHigh:25,
    lat:43.940, lng:-78.305,
    loc:'Lake Ontario to the CNR railway bridge (Port Hope harbour)',
    driveTime:{toronto:90,'north york':85,scarborough:75,etobicoke:100,markham:70,'richmond hill':75,vaughan:80,ajax:55,pickering:50,mississauga:120,brampton:105,oakville:110,burlington:120,milton:105,hamilton:130,guelph:140,cambridge:155,kitchener:165,waterloo:165,orangeville:125,oshawa:35,whitby:25,bowmanville:10,clarington:15,newcastle:15,cobourg:35,'port hope':5,barrie:110,collingwood:150,'owen sound':210},
    species:['Steelhead','Chinook Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'Open all year below the CNR. Upstream, Jocelyn St to the CNR is closed Sept 1 to Oct 14, and Hwy 401 to Jocelyn St is closed all year.',icon:'📋'}],
    methods:['float','spin'],
    access:[
      {name:'Port Hope Harbour · River Mouth',mouth:true,loc:'Port Hope, ON · Lake Ontario harbour',crowd:'high',desc:'Staging area for spring steelhead and fall Chinook coming in from Lake Ontario. Drift spawn sacks under a float, or cast spoons or spinners for chrome fish. Heavy pressure during peak runs, so arrive before dawn on fall weekends.'},
      {name:'Below CNR Railway Bridge',loc:'Port Hope · South of CNR tracks',crowd:'high',desc:'The first holding water above the harbour. Excellent pool structure for drifting roe under a float. Spring Brown Trout and Steelhead stack here before pushing through. Open year-round on this section.'}
    ]
  },
  'Ganaraska River — Port Hope Sanctuary': {
    season:'extended',
    gauge:'02HD012', gaugeName:'Ganaraska River above Dale',
    sweetMin:2, sweetMax:12, flowLow:0.5, flowHigh:25,
    lat:43.945, lng:-78.300,
    loc:'Jocelyn Street Bridge to the CNR bridge, through Port Hope',
    driveTime:{toronto:90,'north york':85,scarborough:75,etobicoke:100,markham:70,'richmond hill':75,vaughan:80,ajax:55,pickering:50,mississauga:120,brampton:105,oakville:110,burlington:120,milton:105,hamilton:130,guelph:140,cambridge:155,kitchener:165,waterloo:165,orangeville:125,oshawa:35,whitby:25,bowmanville:10,clarington:15,newcastle:15,cobourg:35,'port hope':5,barrie:110,collingwood:150,'owen sound':210},
    species:['Steelhead','Chinook Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'Jocelyn St bridge to the CNR: open fourth Saturday in April to Aug 31 and Oct 15 to Dec 31. Closed Sept 1 to Oct 14.',icon:'🚫'},{rule:'Fish south of the Jocelyn St bridge only. Upstream to Hwy 401 is a sanctuary, closed all year.',icon:'🚫'}],
    methods:['float','fly'],
    access:[
      {name:'Jocelyn Street Bridge Access',closed:[{from:'09-01',to:'10-14',why:'Fish sanctuary. No fishing Sep 1 to Oct 14 (Jocelyn St to CNR right-of-way)'}],loc:'Jocelyn Street · Port Hope',crowd:'med',desc:'Upstream end of the seasonal stretch. Fish the south side of the bridge only: above it, up to Hwy 401, is closed all year. Good pool and run structure. Open Oct 15 through December for the extended fall season. During open periods this stretch holds excellent numbers of Chinook and Coho waiting below Corbetts Dam.'},
      {name:'Port Hope Town Section · Sanctuary Area',closed:[{from:'09-01',to:'10-14',why:'Fish sanctuary. No fishing Sep 1 to Oct 14 (Jocelyn St to CNR right-of-way)'}],loc:'Port Hope · Through town',crowd:'high',desc:'When open (Oct 15 to Dec 31), this downtown stretch fishes surprisingly well, with fish stacked below the dam upstream. Fly fishing and centrepin work well in the deeper pools. Respect the Sep 1 to Oct 14 closure. Wardens patrol this section.'}
    ]
  },
  'Ganaraska River — Corbetts Dam (Closed Year-Round)': {
    gauge:'02HD012', gaugeName:'Ganaraska River above Dale',
    sweetMin:2, sweetMax:12, flowLow:0.5, flowHigh:25,
    lat:43.950, lng:-78.298,
    loc:'Highway 401 to the Jocelyn Street Bridge (Corbetts Dam and fishway)',
    driveTime:{toronto:95,'north york':90,scarborough:80,etobicoke:105,markham:75,'richmond hill':80,vaughan:85,ajax:60,pickering:55,mississauga:120,brampton:110,oakville:115,burlington:125,milton:110,hamilton:135,guelph:145,cambridge:160,kitchener:170,waterloo:170,orangeville:130,oshawa:40,whitby:30,bowmanville:15,clarington:20,newcastle:20,cobourg:40,'port hope':10,barrie:115,collingwood:155,'owen sound':215},
    species:['Steelhead','Chinook Salmon','Brown Trout'],
    active:false,
    regs:[{rule:'CLOSED TO FISHING ALL YEAR. Fish sanctuary protecting migrating salmon and trout at Corbetts Dam and fishway.',icon:'🚫'}],
    methods:[],
    access:[]
  },
  'Ganaraska River — Upper & Conservation Areas': {
    season:'standard',
    gauge:'02HD012', gaugeName:'Ganaraska River above Dale',
    sweetMin:1, sweetMax:8, flowLow:0.3, flowHigh:15,
    lat:43.980, lng:-78.290,
    loc:'North of Highway 401: Ganaraska Millennium CA, Sylvan Glen CA, Thurne Parks',
    driveTime:{toronto:95,'north york':90,scarborough:80,etobicoke:105,markham:75,'richmond hill':80,vaughan:85,ajax:60,pickering:55,mississauga:120,brampton:110,oakville:115,burlington:125,milton:110,hamilton:135,guelph:145,cambridge:160,kitchener:170,waterloo:170,orangeville:130,oshawa:40,whitby:30,bowmanville:15,clarington:20,newcastle:20,cobourg:40,'port hope':10,barrie:115,collingwood:155,'owen sound':215},
    species:['Steelhead','Rainbow Trout','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 17. Obey posted property lines and GRCA rules. The spring rainbow run is popular here.',icon:'📋'}],
    methods:['fly','float'],
    access:[
      {name:'Ganaraska Millennium Conservation Area',loc:'North of Hwy 401 · GRCA managed',crowd:'med',desc:'Upper section, popular during the spring rainbow trout run. Less pressure than downtown Port Hope. Fly fishing and drifting natural baits work well. GRCA managed, so respect all posted property lines and rules.'},
      {name:'Sylvan Glen Conservation Area',loc:'Sylvan Glen · Upper Ganaraska',crowd:'high',desc:'Quieter upper water with good pool structure. Spring rainbow trout push up from below during high flows. Forested banks and clear water make it good dry fly and nymph water once the heavy spring flows drop.'},
      {name:'Thurne Parks',loc:'Thurne · Upper Ganaraska valley',crowd:'low',desc:'Good access to upper holding water. Less frequented than the conservation areas. Best during peak spring Rainbow run when water is slightly off-colour and fish are actively pushing upstream.'}
    ]
  },

  "Lower Beaver River (Thornbury)": {
    season:'extended',
    gauge:"02FB009", gaugeName:"Beaver River near Clarksburg",
    sweetMin:2, sweetMax:10, flowLow:0.5, flowHigh:20,
    lat:44.563, lng:-80.457,
    loc:"Thornbury Dam to Georgian Bay",
    driveTime:{ toronto:155,mississauga:165,brampton:130,oakville:155,burlington:165,milton:140,hamilton:170,guelph:130,cambridge:150,kitchener:140,waterloo:135,orangeville:85,markham:135,"richmond hill":130,vaughan:130,ajax:155,pickering:150,"north york":140,scarborough:145,etobicoke:155,oshawa:165,whitby:160,bowmanville:175,clarington:185,newcastle:185,cobourg:220,"port hope":205,barrie:70,collingwood:25,"owen sound":45 },
    species:["Steelhead","Chinook Salmon"],
    active:true,
    regs:[{rule:"Extended fall season for trout and salmon. Check the regulations",icon:"📋"}],
    methods:["float","spin"],
    access:[
      {name:"Thornbury · Lower River / Harbour",loc:"Thornbury, ON · Georgian Bay mouth",crowd:"high",desc:"The lower Beaver near Thornbury receives strong Georgian Bay steelhead and salmon runs. The river mouth and lower pools are extremely popular during peak migrations. Outside of run season, smaller resident browns inhabit this section."},
      {name:"Thornbury Fishway",loc:"Thornbury, ON · Fish ladder at dam",crowd:"high",desc:"The fish ladder concentrates migrating fish. Very productive during peak runs. Heavy fishing pressure, so arrive before dawn on fall weekends."}
    ]
  },
  "Middle Beaver River (Clarksburg to Heathcote)": {
    season:'standard',
    gauge:"02FB009", gaugeName:"Beaver River near Clarksburg",
    sweetMin:2, sweetMax:10, flowLow:0.5, flowHigh:20,
    lat:44.520, lng:-80.430,
    loc:"Clarksburg to Heathcote",
    driveTime:{ toronto:150,mississauga:160,brampton:125,oakville:145,burlington:160,milton:135,hamilton:165,guelph:125,cambridge:145,kitchener:135,waterloo:130,orangeville:80,markham:130,"richmond hill":125,vaughan:125,ajax:150,pickering:145,"north york":135,scarborough:140,etobicoke:150,oshawa:160,whitby:155,bowmanville:170,clarington:180,newcastle:180,cobourg:215,"port hope":205,barrie:70,collingwood:20,"owen sound":45 },
    species:["Brown Trout","Steelhead"],
    active:true,
    regs:[],
    methods:["fly","float","spin"],
    access:[
      {name:"Below Kimberley · Mid-Beaver",loc:"Between Kimberley and Thornbury",crowd:"low",desc:"Less explored than the village reach. Walk-in access required for most of this section which keeps pressure low. Large brown trout, some reach trophy size in the deeper pools."}
    ]
  },
  "Beaver River Swamp (Heathcote to Kimberley)": {
    gauge:"02FB009", gaugeName:"Beaver River near Clarksburg",
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:10,
    lat:44.500, lng:-80.415,
    loc:"Heathcote to Kimberley, slow warm water",
    driveTime:{ toronto:150,mississauga:155,brampton:125,oakville:145,burlington:160,milton:130,hamilton:165,guelph:120,cambridge:145,kitchener:130,waterloo:130,orangeville:80,markham:125,"richmond hill":120,vaughan:120,ajax:150,pickering:145,"north york":130,scarborough:140,etobicoke:145,oshawa:160,whitby:150,bowmanville:170,clarington:175,newcastle:180,cobourg:215,"port hope":200,barrie:65,collingwood:20,"owen sound":45 },
    species:[],
    active:false,
    regs:[],
    methods:[],
    access:[]
  },
  "Upper Beaver River (Kimberley)": {
    season:'standard',
    gauge:"02FB009", gaugeName:"Beaver River near Clarksburg",
    sweetMin:1, sweetMax:6, flowLow:0.3, flowHigh:12,
    lat:44.490, lng:-80.400,
    loc:"Kimberley village up to Hogs Falls / Headwaters",
    driveTime:{ toronto:145,mississauga:155,brampton:120,oakville:145,burlington:155,milton:130,hamilton:160,guelph:120,cambridge:140,kitchener:130,waterloo:130,orangeville:75,markham:125,"richmond hill":120,vaughan:120,ajax:145,pickering:145,"north york":130,scarborough:135,etobicoke:145,oshawa:155,whitby:150,bowmanville:170,clarington:175,newcastle:175,cobourg:210,"port hope":200,barrie:65,collingwood:15,"owen sound":50 },
    species:["Brown Trout","Rainbow Trout","Brook Trout"],
    active:true,
    regs:[],
    methods:["fly","float"],
    access:[
      {name:"Kimberley · Village Reach",loc:"Kimberley, ON · Main village access",crowd:"med",desc:"The centrepiece of Beaver River fishing. Classic limestone pools and riffles through the village. Strong hatches of sulphurs, caddis and PMDs bring large browns to the surface. Several road allowance access points."}
    ]
  },
  'Saugeen River — Headwaters & Upper Tributaries': {
    season:'standard',
    gauge:'02FC016', gaugeName:'Saugeen River above Durham',
    sweetMin:8, sweetMax:25, flowLow:2, flowHigh:50,
    lat:44.100, lng:-80.750,
    loc:'Rocky Saugeen, North Saugeen, South Saugeen and Beatty Saugeen, above Hanover',
    driveTime:{'toronto':145,'north york':130,'scarborough':140,'etobicoke':135,'markham':130,'richmond hill':125,'vaughan':120,'ajax':160,'pickering':155,'mississauga':140,'brampton':110,'oakville':125,'burlington':130,'milton':105,'hamilton':130,'guelph':85,'cambridge':100,'kitchener':85,'waterloo':80,'orangeville':65,'oshawa':170,'whitby':165,'bowmanville':185,'clarington':195,'newcastle':195,'cobourg':230,'port hope':220,'barrie':100,'collingwood':70,'owen sound':60},
    species:['Brook Trout','Brown Trout','Rainbow Trout','Steelhead'],
    residentBrowns:true, // steelhead reach here in small numbers; the browns are stream residents,
    active:true,
    regs:[{rule:'FMZ 16. Check specific tributary regulations. The Rocky Saugeen is particularly sensitive, so practise catch-and-release and disturb as little as you can.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'Rocky Saugeen · Public Access',loc:'Rocky Saugeen River · Durham area',crowd:'low',desc:'A highly regarded spring-fed tributary with excellent resident brown trout. Beautiful clear water, so wade carefully. The Rocky Saugeen is the best cold-water tributary on the system. Stealth and light tackle are a must, because these fish are educated and spook easily.'},
      {name:'North Saugeen River',loc:'North Saugeen · Above main stem junction',crowd:'low',desc:'Smaller, winding cold-water with brook and brown trout. Best accessed from road allowances at bridge crossings. Fly fishing and light spinning. Less known than the Rocky Saugeen but holds quality fish in cooler sections.'},
      {name:'South Saugeen River',loc:'South Saugeen · Above Hanover',crowd:'low',desc:'Similar to the North Saugeen: small brook trout and brown trout water. Good in spring before temperatures rise. Access from municipal road bridges.'}
    ]
  },
  'Saugeen River — Middle Main Stem (Hanover to Paisley)': {
    season:'standard',
    gauge:'02FC016', gaugeName:'Saugeen River above Durham',
    sweetMin:8, sweetMax:25, flowLow:2, flowHigh:50,
    lat:44.220, lng:-81.000,
    loc:'Hanover through Walkerton to Paisley, a warm-water bass and pike fishery',
    driveTime:{'toronto':170,'north york':160,'scarborough':165,'etobicoke':160,'markham':155,'richmond hill':150,'vaughan':145,'ajax':185,'pickering':180,'mississauga':170,'brampton':135,'oakville':150,'burlington':155,'milton':135,'hamilton':160,'guelph':110,'cambridge':125,'kitchener':105,'waterloo':105,'orangeville':90,'oshawa':195,'whitby':190,'bowmanville':210,'clarington':220,'newcastle':220,'cobourg':255,'port hope':245,'barrie':120,'collingwood':80,'owen sound':45},
    species:[],
    active:false,
    regs:[],
    methods:[],
    access:[]
  },
  'Saugeen River — Lower Main Stem (Paisley to Southampton)': {
    season:'extended',
    gauge:'02FC016', gaugeName:'Saugeen River above Durham',
    sweetMin:10, sweetMax:40, flowLow:3, flowHigh:80,
    lat:44.400, lng:-81.200,
    loc:"Paisley to Southampton: Lake Huron mouth, Denny's Dam and the main migratory runs",
    driveTime:{'toronto':195,'north york':185,'scarborough':190,'etobicoke':190,'markham':180,'richmond hill':175,'vaughan':170,'ajax':205,'pickering':200,'mississauga':195,'brampton':165,'oakville':180,'burlington':185,'milton':160,'hamilton':185,'guelph':135,'cambridge':150,'kitchener':135,'waterloo':130,'orangeville':115,'oshawa':220,'whitby':210,'bowmanville':230,'clarington':240,'newcastle':240,'cobourg':275,'port hope':265,'barrie':135,'collingwood':90,'owen sound':30},
    species:['Steelhead','Chinook Salmon'],
    active:true,
    regs:[{rule:"FMZ 16. One of the largest steelhead and Chinook salmon runs in the Great Lakes. Walkerton to Denny's Dam: open fourth Saturday in April to Dec 31.",icon:'📋'},{rule:"Denny's Dam to the concrete abutments downstream: no night fishing Oct 1 to 31.",icon:'🚫'}],
    methods:['float','spin'],
    access:[
      {name:"Denny's Dam",loc:'Lower Saugeen · Below dam',crowd:'high',desc:"The focal point of the lower Saugeen and one of the best-known steelhead and Chinook spots in Ontario. Fish concentrate below the dam before the ladder. Heavy pressure during peak runs, so arrive before dawn. It marks the upper limit of the main migratory push."},
      {name:'Southampton · Lake Huron Mouth',loc:'Southampton, ON · Lake Huron',crowd:'high',desc:'Staging area for incoming steelhead and Chinook before they push upstream. Cast spoons and spinners for chrome fish off the pier or from shore during peak runs. Chinook and Coho peak August through October, steelhead in spring.'}
    ]
  },

  'Sixteen Mile Creek — Lower Reaches & Oakville Harbour': {
    season:'all-year',
    gauge:'02HB005', gaugeName:'Sixteen Mile Creek at Milton',
    sweetMin:1, sweetMax:6, flowLow:0.3, flowHigh:15,
    lat:43.440, lng:-79.672,
    loc:'Lake Ontario mouth to Lakeshore Road (Oakville Harbour)',
    driveTime:{'toronto':20,'north york':25,'scarborough':30,'etobicoke':20,'markham':30,'richmond hill':30,'vaughan':30,'ajax':40,'pickering':35,'mississauga':20,'brampton':20,'oakville':5,'burlington':10,'milton':10,'hamilton':15,'guelph':30,'cambridge':30,'kitchener':40,'waterloo':40,'orangeville':35,'oshawa':45,'whitby':40,'bowmanville':50,'clarington':60,'newcastle':60,'cobourg':75,'port hope':70,'barrie':60,'collingwood':70,'owen sound':90},
    species:['Steelhead','Chinook Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 16. Lakeshore Rd (Hwy 2) to Lake Ontario: open all year.',icon:'📋'}],
    methods:['spin','float'],
    access:[
      {name:'Lakeside Park · Creek Mouth',loc:'Lakeside Park · Oakville Harbour',crowd:'high',desc:'Where spring steelhead and fall Chinook enter from Lake Ontario. Rocky banks and harbour breakwalls hold staging fish. Cast spoons and spinners for chrome fish before they push upstream. Heavy fall salmon pressure, so arrive before dawn on weekends.'},
      {name:'Tannery Park',loc:'Tannery Park · Lower Sixteen Mile Creek',crowd:'med',desc:'Access to the lower creek just above the harbour. Good smallmouth bass fishing year-round along the rocky banks. Steelhead and salmon push through this section during peak migrations. Float fishing with roe or beads works well in the deeper runs.'}
    ]
  },
  'Sixteen Mile Creek — Middle Reaches & Main Valley': {
    season:'extended',
    gauge:'02HB005', gaugeName:'Sixteen Mile Creek at Milton',
    sweetMin:1, sweetMax:6, flowLow:0.3, flowHigh:15,
    lat:43.470, lng:-79.685,
    loc:'Rebecca Street to Dundas Street (Lions Valley Park, central Oakville)',
    driveTime:{'toronto':30,'north york':30,'scarborough':35,'etobicoke':20,'markham':35,'richmond hill':40,'vaughan':35,'ajax':45,'pickering':45,'mississauga':25,'brampton':20,'oakville':5,'burlington':10,'milton':10,'hamilton':20,'guelph':30,'cambridge':40,'kitchener':45,'waterloo':45,'orangeville':40,'oshawa':55,'whitby':55,'bowmanville':65,'clarington':70,'newcastle':70,'cobourg':95,'port hope':90,'barrie':70,'collingwood':85,'owen sound':110},
    species:['Steelhead','Chinook Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 16. Hwy 2 to Hwy 407: open fourth Saturday in April to Dec 31. Heavy fall rains trigger salmon and steelhead runs, and conditions can change quickly.',icon:'📋'}],
    methods:['float','fly'],
    access:[
      {name:'Lions Valley Park',loc:'Lions Valley Park · Central Oakville',crowd:'high',desc:'The most popular access point on Sixteen Mile Creek. Deep shale-bottom valley pools hold migratory salmon and steelhead well. Centrepin float fishing dominates here. Heavy pressure during peak runs, though the valley trail hike filters out some casual anglers.'},
      {name:'Rebecca Street to Dundas Street Reach',loc:'Central Oakville valley · Road access points',crowd:'med',desc:'Multiple access points through the valley between Rebecca and Dundas Streets. Deep holding pools and shale-bedrock runs hold fish throughout the migratory season. Resident smallmouth bass year-round in the deeper pools.'}
    ]
  },
  'Sixteen Mile Creek — Upper West Branch (Trout)': {
    // Road crossings are below Hwy 407 (extended, tributaries included); the Milton
    // headwaters are above it and carry their own Oct 1 closure.
    season:'extended',
    gauge:'02HB005', gaugeName:'Sixteen Mile Creek at Milton',
    sweetMin:0.5, sweetMax:3, flowLow:0.1, flowHigh:6,
    lat:43.530, lng:-79.750,
    loc:'North of Highway 407: West Branch, cold-water trout habitat',
    driveTime:{'toronto':45,'north york':45,'scarborough':55,'etobicoke':35,'markham':55,'richmond hill':55,'vaughan':50,'ajax':75,'pickering':70,'mississauga':35,'brampton':25,'oakville':10,'burlington':25,'milton':15,'hamilton':35,'guelph':45,'cambridge':55,'kitchener':70,'waterloo':70,'orangeville':55,'oshawa':90,'whitby':85,'bowmanville':105,'clarington':115,'newcastle':115,'cobourg':150,'port hope':140,'barrie':105,'collingwood':130,'owen sound':170},
    species:['Brook Trout','Brown Trout','Rainbow Trout'],
    active:true,
    regs:[{rule:'FMZ 16. Below Hwy 407: open fourth Saturday in April to Dec 31. Above Hwy 407 (Milton) the season ends Sept 30.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'West Branch · Road Allowance Crossings',loc:'West Branch · North Oakville / Milton border',crowd:'low',desc:'Cold-water habitat supporting resident brook, brown, and rainbow trout. The West Branch maintains cooler temperatures than the main creek, making it the only section with viable year-round trout habitat. Access via road allowances at bridge crossings. Light tackle and stealth required.'},
      {name:'Upper West Branch Tributaries',closed:[{from:'10-01',to:'12-31',why:'These headwaters are north of Hwy 407, where the trout and salmon season ends Sept 30'}],loc:'West Branch headwaters · Milton area',crowd:'low',desc:'Small stream fishing for resident trout in spring-fed water. The least pressured section of the entire Sixteen Mile Creek system. Brook trout in the coldest, most shaded sections.'}
    ]
  },
  'Sixteen Mile Creek — Upper Middle/East Branches': {
    gauge:'02HB005', gaugeName:'Sixteen Mile Creek at Milton',
    sweetMin:0.5, sweetMax:3, flowLow:0.1, flowHigh:6,
    lat:43.545, lng:-79.790,
    loc:'North of Highway 407: Middle and East branches, Mill Pond, warmwater fishery',
    driveTime:{'toronto':40,'north york':35,'scarborough':40,'etobicoke':25,'markham':40,'richmond hill':40,'vaughan':40,'ajax':60,'pickering':55,'mississauga':30,'brampton':20,'oakville':10,'burlington':20,'milton':10,'hamilton':25,'guelph':30,'cambridge':40,'kitchener':50,'waterloo':50,'orangeville':40,'oshawa':70,'whitby':70,'bowmanville':80,'clarington':85,'newcastle':90,'cobourg':115,'port hope':110,'barrie':80,'collingwood':95,'owen sound':125},
    species:[],
    active:false,
    regs:[],
    methods:[],
    access:[]
  },
  'Rouge River — Marsh & Mouth (Lake Ontario)': {
    season:'all-year',
    gauge:'02HC022', gaugeName:'Rouge River near Markham',
    sweetMin:1, sweetMax:6, flowLow:0.3, flowHigh:15,
    lat:43.803, lng:-79.134,
    loc:'Lake Ontario mouth (Rouge Beach, Pickering / Scarborough)',
    driveTime:{'toronto':30,'north york':30,'scarborough':10,'etobicoke':50,'markham':20,'richmond hill':30,'vaughan':40,'ajax':10,'pickering':5,'mississauga':75,'brampton':65,'oakville':65,'burlington':85,'milton':75,'hamilton':95,'guelph':105,'cambridge':120,'kitchener':130,'waterloo':130,'orangeville':85,'oshawa':25,'whitby':20,'bowmanville':45,'clarington':50,'newcastle':50,'cobourg':90,'port hope':75,'barrie':90,'collingwood':130,'owen sound':185},
    species:['Steelhead','Chinook Salmon'],
    active:true,
    regs:[{rule:'FMZ 16. Kingston Rd (Hwy 2) to Lake Ontario: open all year.',icon:'📋'}],
    methods:['spin','float'],
    access:[
      {name:'Rouge Beach · River Mouth',mouth:true,loc:'Rouge Beach Park · Pickering / Scarborough border',crowd:'high',desc:'Entry point for migratory Chinook, steelhead, and brown trout from Lake Ontario. Casting spoons and spinners around the rocks and under railway bridges near the mouth is highly productive during seasonal runs. Spring pike fishing in the shallow marsh areas with shiners or crankbaits.'},
      {name:'CNR Railway Bridge Area',loc:'Below CNR bridge · Lower Rouge',crowd:'high',desc:'Fish concentrate below structures near the mouth during the runs. Good holding water for steelhead in spring and Chinook in fall. Heavy pressure on peak run weekends, so arrive early.'},
    ]
  },
  'Rouge River — Mid-Section (Rouge National Urban Park)': {
    season:'extended',
    gauge:'02HC022', gaugeName:'Rouge River near Markham',
    sweetMin:1, sweetMax:6, flowLow:0.3, flowHigh:15,
    lat:43.835, lng:-79.142,
    loc:'Highway 2 (Kingston Road) north through Rouge National Urban Park and Toronto Zoo',
    driveTime:{'toronto':35,'north york':30,'scarborough':15,'etobicoke':50,'markham':15,'richmond hill':30,'vaughan':40,'ajax':10,'pickering':5,'mississauga':80,'brampton':65,'oakville':65,'burlington':85,'milton':80,'hamilton':100,'guelph':105,'cambridge':120,'kitchener':130,'waterloo':130,'orangeville':85,'oshawa':25,'whitby':20,'bowmanville':40,'clarington':50,'newcastle':50,'cobourg':90,'port hope':75,'barrie':85,'collingwood':125,'owen sound':185},
    species:['Steelhead','Chinook Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'Rouge National Urban Park, managed by Parks Canada. Respect all park rules. Hwy 2 to Hwy 407: open fourth Saturday in April to Dec 31 (FMZ 16).',icon:'📋'}],
    methods:['float','fly'],
    access:[
      {name:'Rouge National Urban Park · Main Access',loc:'Rouge National Urban Park · Parks Canada',crowd:'med',desc:'Cool to cold-water fishery best known for its fall and spring salmon and steelhead runs. Target deeper pools and runs below structures. Managed by Parks Canada, so respect all posted rules inside the park.'},
      {name:'Kingston Road (Hwy 2) Bridge Area',loc:'Kingston Road bridge · Lower mid-section',crowd:'med',desc:'Access at the southern boundary of the mid-section. Transition zone between the warm marsh and the cooler mid-river. Fish push through this zone on their way upstream. Float fishing with roe or beads under a centrepin setup works well.'},
      {name:'Toronto Zoo Valley',loc:'Behind Toronto Zoo · Rouge valley',crowd:'low',desc:'Less accessible than the main park entry points, which keeps pressure lower. Deep valley pools hold steelhead and salmon during runs. The tree canopy and valley walls create shaded, cooler water even in summer.'}
    ]
  },
  'Rouge River — Upper & Milne Dam (Markham)': {
    season:'standard',
    gauge:'02HC022', gaugeName:'Rouge River near Markham',
    sweetMin:0.5, sweetMax:4, flowLow:0.1, flowHigh:8,
    lat:43.880, lng:-79.250,
    loc:'Northern tributaries and Milne Dam Conservation Park (Markham)',
    driveTime:{'toronto':35,'north york':25,'scarborough':15,'etobicoke':50,'markham':10,'richmond hill':20,'vaughan':30,'ajax':20,'pickering':15,'mississauga':75,'brampton':55,'oakville':65,'burlington':85,'milton':70,'hamilton':95,'guelph':100,'cambridge':115,'kitchener':125,'waterloo':125,'orangeville':75,'oshawa':35,'whitby':30,'bowmanville':50,'clarington':60,'newcastle':60,'cobourg':100,'port hope':85,'barrie':75,'collingwood':115,'owen sound':175},
    species:['Rainbow Trout','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 16. North of Hwy 407 the trout and salmon season ends Sept 30. Urban watershed. Check TRCA rules for Milne Dam Conservation Park. Heavily influenced by urban development.',icon:'📋'}],
    methods:['spin','fly'],
    access:[
      {name:'Milne Dam Conservation Park',loc:'Milne Dam · Markham, ON · TRCA managed',crowd:'med',desc:'Resident rainbow and brown trout in the tailwater below Milne Dam. Slower, urban-influenced water but surprisingly productive for trout anglers in spring. The dam creates a barrier concentrating fish. Largemouth and smallmouth bass also present throughout.'},
      {name:'Toogood Pond Area',loc:'Toogood Pond · Unionville, Markham',crowd:'med',desc:'Slower, warmer impoundment water. Resident largemouth bass are the main draw, but rainbow trout are present, especially in spring before the water warms. An easy-to-reach urban fishery and a good start for newer anglers.'}
    ]
  },
  'Wilmot Creek — Mouth & Marsh (Lake Ontario)': {
    season:'all-year',
    gauge:'02HD009', gaugeName:'Wilmot Creek near Newcastle',
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:10,
    lat:43.890, lng:-78.594,
    loc:'Sir Samuel Wilmot Nature Area (Lake Ontario mouth, Cobbledick Road)',
    driveTime:{'toronto':80,'north york':80,'scarborough':60,'etobicoke':100,'markham':65,'richmond hill':80,'vaughan':85,'ajax':40,'pickering':45,'mississauga':125,'brampton':115,'oakville':110,'burlington':130,'milton':125,'hamilton':140,'guelph':155,'cambridge':170,'kitchener':180,'waterloo':180,'orangeville':135,'oshawa':25,'whitby':30,'bowmanville':10,'clarington':5,'newcastle':5,'cobourg':40,'port hope':30,'barrie':115,'collingwood':165,'owen sound':225},
    species:['Steelhead','Chinook Salmon','Coho Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 17. Standard trout and salmon limits apply. Sir Samuel Wilmot Nature Area is a provincially significant wetland, so respect all posted rules.',icon:'📋'}],
    methods:['float','spin'],
    access:[
      {name:'Sir Samuel Wilmot Nature Area',mouth:true,loc:'Cobbledick Road · South of CN tracks · Clarington',crowd:'high',desc:'The marsh and creek mouth where Wilmot Creek enters Lake Ontario through a provincially significant wetland. Excellent staging area for fall Chinook and Coho before they push upstream, and spring steelhead. Also holds northern pike, crappie, sunfish, and large carp year-round. Heavy pressure during peak fall salmon runs.'}
    ]
  },
  'Wilmot Creek — Lower River (to CN Rail Tracks)': {
    season:'all-year',
    gauge:'02HD009', gaugeName:'Wilmot Creek near Newcastle',
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:10,
    lat:43.900, lng:-78.592,
    loc:'Mouth to the CN railway tracks: gravel runs and holding pools',
    driveTime:{'toronto':80,'north york':80,'scarborough':60,'etobicoke':100,'markham':65,'richmond hill':80,'vaughan':85,'ajax':40,'pickering':45,'mississauga':125,'brampton':115,'oakville':115,'burlington':130,'milton':125,'hamilton':140,'guelph':155,'cambridge':170,'kitchener':180,'waterloo':185,'orangeville':135,'oshawa':25,'whitby':30,'bowmanville':10,'clarington':5,'newcastle':5,'cobourg':40,'port hope':30,'barrie':115,'collingwood':165,'owen sound':225},
    species:['Steelhead','Chinook Salmon','Coho Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 17. Heavy pressure during peak runs. Respect other anglers and release fish where you can.',icon:'📋'}],
    methods:['float','spin'],
    access:[
      {name:'Nature Preserve Trails · Lower Creek',loc:'Cobbledick Road · Nature preserve trail access',crowd:'high',desc:'Gravel runs, shallows and holding pools, the first river water above the marsh. It’s one of the first sections fish reach, so pressure is heavy during peak runs. Brown trout and steelhead are both targeted here during their runs. Float fishing with roe and beads dominates.'},
      {name:'CN Railway Track Crossing',loc:'CN Rail bridge · Lower Wilmot Creek',crowd:'med',desc:'The CN railway crossing marks the upper boundary of this section. Good pool structure below the bridge. Slightly less pressure than the very lowest water near the marsh, but still popular during peak season.'}
    ]
  },
  'Wilmot Creek — Middle Section (Hwy 401 to Hwy 2)': {
    season:'extended',
    gauge:'02HD009', gaugeName:'Wilmot Creek near Newcastle',
    sweetMin:1, sweetMax:4, flowLow:0.2, flowHigh:8,
    lat:43.915, lng:-78.585,
    loc:'Newcastle: wooded corridor with riffles and holding pools',
    driveTime:{'toronto':80,'north york':80,'scarborough':65,'etobicoke':100,'markham':70,'richmond hill':80,'vaughan':90,'ajax':40,'pickering':45,'mississauga':125,'brampton':115,'oakville':115,'burlington':130,'milton':125,'hamilton':145,'guelph':155,'cambridge':170,'kitchener':180,'waterloo':185,'orangeville':135,'oshawa':25,'whitby':30,'bowmanville':10,'clarington':5,'newcastle':5,'cobourg':40,'port hope':25,'barrie':115,'collingwood':165,'owen sound':225},
    species:['Steelhead','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 17. Water can get shallow depending on rainfall, so check conditions before making the trip.',icon:'📋'}],
    methods:['float','fly'],
    access:[
      {name:'Newcastle · Highway 401 to Highway 2 Reach',loc:'Newcastle, ON · Wooded valley corridor',crowd:'low',desc:'Houses give way to a wooded corridor with fast riffles and holding pools. Resident brown trout and migrating steelhead. Much less pressure than the lower stretches, and worth the walk if you want a quieter day. The water can get shallow in low-flow periods.'}
    ]
  },
  'Wilmot Creek — Upper Watershed & Orono Crown Lands': {
    season:'standard',
    gauge:'02HD009', gaugeName:'Wilmot Creek near Newcastle',
    sweetMin:0.5, sweetMax:3, flowLow:0.1, flowHigh:6,
    lat:43.960, lng:-78.575,
    loc:'North of Highway 2: Orono Crown Lands, cold-water headwaters',
    driveTime:{'toronto':85,'north york':85,'scarborough':65,'etobicoke':105,'markham':70,'richmond hill':80,'vaughan':90,'ajax':45,'pickering':50,'mississauga':130,'brampton':115,'oakville':115,'burlington':135,'milton':130,'hamilton':145,'guelph':160,'cambridge':175,'kitchener':185,'waterloo':185,'orangeville':135,'oshawa':30,'whitby':35,'bowmanville':10,'clarington':5,'newcastle':5,'cobourg':35,'port hope':25,'barrie':115,'collingwood':160,'owen sound':225},
    species:['Brook Trout','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 17. Cold-water, sensitive habitat. The Orono Crown Lands provide public access. Check for specific tributary restrictions.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'Orono Crown Lands',loc:'Orono, ON · Crown Land access',crowd:'low',desc:'The upper three-quarters of the Wilmot watershed feature cold-water, shaded stream conditions supporting sustained brook trout and brown trout populations. Crown Land designation provides public access in the Orono area. Light tackle and fly fishing for resident trout. Minimal angling pressure compared to the lower sections.'},
      {name:'Upper Wilmot Tributaries',loc:'Above Orono · Headwater tributaries',crowd:'low',desc:'Spring-fed cool water with native brook trout. Best in early season before temperatures rise. The least pressured section of the entire Wilmot system.'}
    ]
  },
  'Bowmanville Creek — River Mouth & Piers': {
    season:'all-year',
    gauge:'02HD006', gaugeName:'Bowmanville Creek at Bowmanville',
    sweetMin:1, sweetMax:8, flowLow:0.3, flowHigh:15,
    lat:43.893, lng:-78.685,
    loc:'Lake Ontario mouth · Darlington / Bowmanville Marina',
    driveTime:{'toronto':70,'north york':70,'scarborough':55,'etobicoke':90,'markham':60,'richmond hill':70,'vaughan':80,'ajax':30,'pickering':35,'mississauga':120,'brampton':105,'oakville':105,'burlington':125,'milton':115,'hamilton':135,'guelph':145,'cambridge':160,'kitchener':170,'waterloo':175,'orangeville':125,'oshawa':15,'whitby':25,'bowmanville':5,'clarington':10,'newcastle':10,'cobourg':45,'port hope':35,'barrie':110,'collingwood':155,'owen sound':220},
    species:['Steelhead','Chinook Salmon','Coho Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 17. South of the CNR: open all year.',icon:'📋'}],
    methods:['spin','float'],
    access:[
      {name:'Bowmanville Marina Pier',loc:'Bowmanville Marina · Lake Ontario',crowd:'med',desc:'Staging area for incoming salmon in late summer and fall, and steelhead in spring. Cast off the pier with spoons, crankbaits, or spawn sacks. Action can be explosive during peak staging.'},
      {name:'Creek Mouth · East Bank',loc:'South of CNR railway bridge · East bank',crowd:'high',desc:'Classic river mouth access. Bottom fishing with spawn sacks and beads, or casting spoons. Heavy pressure on fall weekends during peak Chinook runs, so arrive before dawn.'}
    ]
  },
  'Lower Bowmanville Creek': {
    season:'all-year',
    gauge:'02HD006', gaugeName:'Bowmanville Creek at Bowmanville',
    sweetMin:1, sweetMax:8, flowLow:0.3, flowHigh:15,
    lat:43.900, lng:-78.685,
    loc:'Lake Ontario to Baseline Road',
    driveTime:{'toronto':70,'north york':70,'scarborough':55,'etobicoke':90,'markham':60,'richmond hill':70,'vaughan':80,'ajax':30,'pickering':35,'mississauga':120,'brampton':105,'oakville':105,'burlington':125,'milton':120,'hamilton':135,'guelph':145,'cambridge':160,'kitchener':170,'waterloo':175,'orangeville':125,'oshawa':15,'whitby':25,'bowmanville':5,'clarington':10,'newcastle':10,'cobourg':45,'port hope':35,'barrie':110,'collingwood':155,'owen sound':220},
    species:['Steelhead','Chinook Salmon','Coho Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 17. Open all year south of the CNR bridge. Between the CNR and Hwy 2, including Baseline Rd, the season is the fourth Saturday in April to Dec 31.',icon:'📋'}],
    methods:['float','spin'],
    access:[
      {name:'Baseline Road Bridge · Parking Lot',closed:[{from:'01-01',to:'FRI_BEFORE_4TH_SAT_APRIL',why:'North of the CNR, where the season runs from the fourth Saturday in April to Dec 31'}],loc:'Baseline Road · East of Highway 57',crowd:'high',desc:'Most popular access on the lower creek. Deep pools and shallow runs hold fish through fall and spring runs. Float fishing with centrepin or spinning setup. Drift roe bags, jigs, or worms as fish push upstream.'},
      {name:'CNR Railway Bridge · South Side',loc:'South of CNR bridge · Lower creek',crowd:'med',desc:'Open year-round south of the railway bridge. Good pool structure. Salmon in fall, steelhead in spring. Less crowded than the Baseline Rd lot.'}
    ]
  },
  'Middle Bowmanville Creek (Fish Ladder)': {
    season:'extended',
    gauge:'02HD006', gaugeName:'Bowmanville Creek at Bowmanville',
    sweetMin:1, sweetMax:6, flowLow:0.3, flowHigh:12,
    lat:43.907, lng:-78.683,
    loc:'Baseline Road to Goodyear / Vanstone Dam (Fish Ladder)',
    driveTime:{'toronto':75,'north york':70,'scarborough':55,'etobicoke':90,'markham':60,'richmond hill':70,'vaughan':80,'ajax':30,'pickering':40,'mississauga':120,'brampton':105,'oakville':105,'burlington':125,'milton':120,'hamilton':135,'guelph':150,'cambridge':160,'kitchener':170,'waterloo':175,'orangeville':125,'oshawa':15,'whitby':25,'bowmanville':5,'clarington':10,'newcastle':10,'cobourg':45,'port hope':35,'barrie':110,'collingwood':155,'owen sound':220},
    species:['Steelhead','Chinook Salmon','Coho Salmon','Brown Trout'],
    active:true,
    regs:[{rule:'Fishing is prohibited at the fish ladder and dam, and sanctuary signs are posted. No fishing within 23 m below a fishway entrance. FMZ 17: open fourth Saturday in April to Dec 31 between the CNR and Hwy 2.',icon:'🚫'}],
    methods:['float','fly'],
    access:[
      {name:'Bowmanville Valley Trail Access',loc:'Bowmanville Valley Trail · Middle creek',crowd:'high',desc:'Fish concentrate in the pools below the Goodyear Dam, waiting to pass the fish ladder. Heavy pressure during peak fall runs. Respect the sanctuary signs. Wardens patrol regularly during salmon season.'},
      {name:'Goodyear Dam Lower Pools',loc:'Below Vanstone / Goodyear Dam',crowd:'high',desc:'Fish stall before ascending the fish ladder. Productive for centrepin and fly fishing in the pools below. Do not fish within the sanctuary boundary marked with posted signs.'}
    ]
  },
  'Upper Bowmanville Creek': {
    season:'standard',
    gauge:'02HD006', gaugeName:'Bowmanville Creek at Bowmanville',
    sweetMin:0.5, sweetMax:4, flowLow:0.1, flowHigh:8,
    lat:43.930, lng:-78.680,
    loc:'Above Goodyear Dam to Oak Ridges Moraine headwaters',
    driveTime:{'toronto':75,'north york':70,'scarborough':55,'etobicoke':95,'markham':60,'richmond hill':70,'vaughan':80,'ajax':30,'pickering':40,'mississauga':120,'brampton':110,'oakville':110,'burlington':125,'milton':120,'hamilton':135,'guelph':150,'cambridge':165,'kitchener':175,'waterloo':175,'orangeville':125,'oshawa':15,'whitby':25,'bowmanville':5,'clarington':5,'newcastle':10,'cobourg':45,'port hope':35,'barrie':105,'collingwood':155,'owen sound':215},
    species:['Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 17. North of Hwy 2 the trout and salmon season ends Sept 30. Critical spawning habitat. Check for seasonal closures and C&R requirements above the dam.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'Upper Creek · Road Allowance Crossings',loc:'Above Goodyear Dam · Various bridge crossings',crowd:'low',desc:'Narrow, shallow, cool water with resident brown trout. Fly fishing with dry flies and nymphs, or light spinning with small spinners. Critical spawning habitat, so handle fish carefully and check for closures.'},
      {name:'Oak Ridges Moraine Headwaters',loc:'Upper watershed · Headwater tributaries',crowd:'low',desc:'Most pristine section of the Bowmanville system. Small stream fishing for resident Brown Trout. Minimal pressure, forested banks, spring-fed cool water. Road allowance access at bridge crossings.'},
      {name:'Headwaters near Enniskillen',loc:'Near Enniskillen · Upper Bowmanville Creek watershed',crowd:'low',desc:'Upper watershed access near Enniskillen. Remote and lightly pressured. Brook trout habitat in the cooler headwater reaches.'}
    ]
  },
  'Speed River — Upper (Above Guelph Lake)': {
    season:'standard',
    gauge:'02GA029', gaugeName:'Eramosa River above Guelph',
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:10,
    lat:43.640, lng:-80.220,
    loc:'Wellington County rural reaches flowing into Guelph Lake reservoir',
    driveTime:{'toronto':85,'north york':80,'scarborough':90,'etobicoke':75,'markham':85,'richmond hill':80,'vaughan':75,'ajax':110,'pickering':105,'mississauga':75,'brampton':45,'oakville':55,'burlington':55,'milton':35,'hamilton':55,'guelph':15,'cambridge':35,'kitchener':35,'waterloo':35,'orangeville':35,'oshawa':125,'whitby':120,'bowmanville':140,'clarington':150,'newcastle':150,'cobourg':190,'port hope':175,'barrie':105,'collingwood':105,'owen sound':130},
    species:['Brook Trout','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 16. Cold-water trout habitat. Check the regulations and GRCA rules for Wellington County tributaries.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'Wellington County Road Bridge Crossings',loc:'Upper Speed River · Wellington County rural',crowd:'low',desc:'Cool, spring-fed, clear water with quality brook and brown trout habitat. Fly fishing and light spinning tackle work best in these tight, rural stretches. Access via road allowances at bridge crossings throughout Wellington County. Smallmouth bass and white sucker also present in the slower sections.'},
      {name:'Guelph Lake Reservoir Inflow',loc:'Upper Speed near Guelph Lake · GRCA managed',crowd:'low',desc:'The upper river as it approaches the Guelph Lake reservoir. GRCA managed conservation land provides some access. Cold tributary water holds resident trout before they enter the warmer reservoir. Best in spring and fall when temperatures are optimal.'}
    ]
  },
  'Speed River — Middle (Guelph Lake to Downtown Guelph)': {
    season:'standard',
    gauge:'02GA029', gaugeName:'Eramosa River above Guelph',
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:10,
    lat:43.570, lng:-80.250,
    loc:'Guelph Lake reservoir through Riverside Park to downtown Guelph',
    driveTime:{'toronto':85,'north york':85,'scarborough':95,'etobicoke':75,'markham':90,'richmond hill':85,'vaughan':80,'ajax':115,'pickering':110,'mississauga':80,'brampton':50,'oakville':55,'burlington':50,'milton':35,'hamilton':50,'guelph':5,'cambridge':25,'kitchener':25,'waterloo':30,'orangeville':45,'oshawa':130,'whitby':125,'bowmanville':145,'clarington':155,'newcastle':155,'cobourg':195,'port hope':180,'barrie':115,'collingwood':115,'owen sound':140},
    species:[],
    active:false,
    regs:[],
    methods:[],
    access:[]
  },
  'Speed River — Lower (Guelph to Cambridge Confluence)': {
    season:'standard',
    gauge:'02GA029', gaugeName:'Eramosa River above Guelph',
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:10,
    lat:43.430, lng:-80.310,
    loc:'Southern Guelph through Puslinch and Hespeler to the Grand River confluence (Cambridge)',
    driveTime:{'toronto':95,'north york':95,'scarborough':105,'etobicoke':85,'markham':100,'richmond hill':100,'vaughan':95,'ajax':130,'pickering':120,'mississauga':85,'brampton':65,'oakville':55,'burlington':50,'milton':40,'hamilton':45,'guelph':15,'cambridge':10,'kitchener':15,'waterloo':20,'orangeville':65,'oshawa':145,'whitby':135,'bowmanville':160,'clarington':165,'newcastle':165,'cobourg':205,'port hope':190,'barrie':130,'collingwood':135,'owen sound':155},
    species:[],
    active:false,
    regs:[],
    methods:[],
    access:[]
  },
  'Eramosa River — Upper Headwaters (Above Rockwood)': {
    season:'standard',
    gauge:'02GA029', gaugeName:'Eramosa River above Guelph',
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:8,
    lat:43.615, lng:-80.148,
    loc:'Above Rockwood to the headwaters: cold water, road bridge access',
    driveTime:{'toronto':80,'north york':70,'scarborough':85,'etobicoke':65,'markham':80,'richmond hill':75,'vaughan':70,'ajax':105,'pickering':100,'mississauga':70,'brampton':40,'oakville':45,'burlington':50,'milton':25,'hamilton':50,'guelph':15,'cambridge':35,'kitchener':35,'waterloo':40,'orangeville':40,'oshawa':120,'whitby':115,'bowmanville':135,'clarington':145,'newcastle':145,'cobourg':185,'port hope':170,'barrie':105,'collingwood':110,'owen sound':140},
    species:['Brook Trout','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 16 seasonal dates apply. Access from municipal road bridges only, as most of this section flows through private land.',icon:'📋'}],
    methods:['fly','spin'],
    access:[
      {name:'Municipal Road Bridge Crossings · Upper',loc:'Above Rockwood · Road allowances',crowd:'low',desc:'Wild brook and brown trout in cold, clear water. Wading from road allowances at bridge crossings is the only legal access through private land. Stealth required: tight quarters, clear water and spooky fish. Light tackle or dry flies work best.'},
      {name:'Headwaters Tributaries',loc:'Upper Eramosa watershed',crowd:'low',desc:'The most pristine section of the system. Native brook trout in spring-fed tributaries. Very limited access, road allowances only. Fish carefully and release everything.'}
    ]
  },
  'Eramosa River — Mid-Section (Rockwood to Eden Mills)': {
    season:'standard',
    gauge:'02GA029', gaugeName:'Eramosa River above Guelph',
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:10,
    lat:43.595, lng:-80.195,
    loc:'Rockwood Conservation Area to Eden Mills: limestone bluffs and glacial potholes',
    driveTime:{'toronto':85,'north york':75,'scarborough':85,'etobicoke':70,'markham':85,'richmond hill':80,'vaughan':75,'ajax':110,'pickering':105,'mississauga':75,'brampton':45,'oakville':50,'burlington':50,'milton':30,'hamilton':50,'guelph':10,'cambridge':30,'kitchener':30,'waterloo':35,'orangeville':40,'oshawa':125,'whitby':120,'bowmanville':140,'clarington':150,'newcastle':150,'cobourg':190,'port hope':175,'barrie':110,'collingwood':115,'owen sound':140},
    species:['Rainbow Trout','Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 16 seasonal dates apply. GRCA manages Rockwood Conservation Area, and there’s a day-use fee.',icon:'📋'}],
    methods:['spin','fly','float'],
    access:[
      {name:'Rockwood Conservation Area',loc:'Rockwood, ON · GRCA managed',crowd:'high',desc:'Known for its steep limestone bluffs, glacial potholes and the Rockwood millpond. The MNR stocks rainbow and brown trout here every year, so spring fishing is excellent. Day-use fee applies. Northern pike and smallmouth bass hold in the slower pockets.'},
      {name:'Eden Mills · Lower Mid-Section',loc:'Eden Mills, ON · Village access',crowd:'med',desc:'Scenic village section with good pool structure. Stocked trout move through from Rockwood. Northern pike and smallmouth bass present in slower water. Accessible from village road allowances.'}
    ]
  },
  'Eramosa River — Lower Stretches (Eden Mills to Guelph)': {
    gauge:'02GA029', gaugeName:'Eramosa River above Guelph',
    sweetMin:1, sweetMax:5, flowLow:0.2, flowHigh:10,
    lat:43.565, lng:-80.225,
    loc:'Eden Mills to Guelph, a warm-water bass and pike fishery',
    driveTime:{'toronto':85,'north york':80,'scarborough':90,'etobicoke':75,'markham':85,'richmond hill':85,'vaughan':75,'ajax':115,'pickering':110,'mississauga':75,'brampton':50,'oakville':50,'burlington':50,'milton':30,'hamilton':50,'guelph':5,'cambridge':25,'kitchener':30,'waterloo':30,'orangeville':45,'oshawa':130,'whitby':125,'bowmanville':145,'clarington':155,'newcastle':155,'cobourg':190,'port hope':180,'barrie':115,'collingwood':115,'owen sound':140},
    species:[],
    active:false,
    regs:[],
    methods:[],
    access:[]
  },
  // Don River (TJ, 2026-10-21). Chinook only (TJ); salmon run usually a little after the Humber's (TJ). TRCA has rebuilt
  // the Pottery Road weir as a rock ramp and removed other barriers since 1996; Chinook reach about 20 km up the East Don.
  // No mouth spot: the new Port Lands mouth is left out for now (TJ). MNR 2026 Zone 16: Lake to Eglinton (and tributaries)
  // open all year; Eglinton to Hwy 407 extended. Gauge 02HC024: base flow about 4 m3/s, very flashy after rain.
  "Lower Don River (Lake to Eglinton)": {
    season:'all-year',
    gauge:"02HC024", gaugeName:"Don River at Todmorden",
    sweetMin:2.5, sweetMax:8, flowLow:1.5, flowHigh:20,
    lat:43.690, lng:-79.358,
    loc:"Lake Ontario to Eglinton Avenue: Todmorden Mills, Crothers Woods and E.T. Seton Park",
    driveTime:{ toronto:15,mississauga:35,brampton:40,oakville:40,burlington:55,milton:50,hamilton:65,guelph:80,cambridge:90,kitchener:100,waterloo:100,orangeville:70,markham:25,"richmond hill":30,vaughan:30,ajax:35,pickering:30,"north york":15,scarborough:20,etobicoke:25,oshawa:50,whitby:45,bowmanville:65,clarington:70,newcastle:70,cobourg:105,"port hope":95,barrie:90,collingwood:125,"owen sound":175 },
    species:["Chinook Salmon"],
    active:true,
    regs:[{rule:"FMZ 16. Don River and its tributaries from Lake Ontario to Eglinton Avenue: trout and salmon open all year. Urban river: it rises fast and turns brown after heavy rain.",icon:"📋"}],
    methods:["float","spin"],
    access:[
      {name:"Todmorden Mills · Pottery Road",loc:"East York · 67 Pottery Rd",crowd:"high",desc:"Free parking at the heritage site. The weir north of Pottery Road was rebuilt as a rock ramp so salmon can pass, and Chinook are often seen moving up through it. The Don's run usually comes a little after the Humber's, from late September into October. Busy with salmon watchers in the fall."},
      {name:"Crothers Woods · Lower Don Trail",loc:"East York · off Bayview Ave",crowd:"med",desc:"Parking lot past the Loblaws off Bayview Avenue. Trails drop to the Lower Don Trail and the river between Pottery Road and the Forks of the Don. Less pressure than Pottery Road, but the banks are steep in places."},
      {name:"E.T. Seton Park · West Don",loc:"East York · Thorncliffe Park Dr or Leslie St",crowd:"med",desc:"Big park with parking off Thorncliffe Park Drive and off Leslie Street. The West Don runs through it from the Forks up to Eglinton, and salmon pass through on their way to the upper river."}
    ]
  },
  "Upper Don River (Eglinton to Hwy 407)": {
    season:'extended',
    gauge:"02HC024", gaugeName:"Don River at Todmorden",
    sweetMin:2.5, sweetMax:8, flowLow:1.5, flowHigh:20,
    lat:43.726, lng:-79.343,
    loc:"Eglinton Avenue to Highway 407: Sunnybrook Park on the West Don, Charles Sauriol on the East Don",
    driveTime:{ toronto:20,mississauga:35,brampton:35,oakville:40,burlington:55,milton:50,hamilton:65,guelph:80,cambridge:90,kitchener:100,waterloo:100,orangeville:65,markham:20,"richmond hill":25,vaughan:25,ajax:35,pickering:30,"north york":10,scarborough:20,etobicoke:25,oshawa:50,whitby:45,bowmanville:65,clarington:70,newcastle:70,cobourg:105,"port hope":95,barrie:85,collingwood:120,"owen sound":170 },
    species:["Chinook Salmon"],
    active:true,
    regs:[{rule:"FMZ 16. Don River and its tributaries from Eglinton Avenue to Highway 407: trout and salmon open from the fourth Saturday in April to December 31.",icon:"📋"}],
    methods:["float","spin"],
    access:[
      {name:"Charles Sauriol · East Don",loc:"North York · 1191 Lawrence Ave E",crowd:"med",desc:"Small lot on Lawrence Avenue East that fills up on weekends. A flat trail follows the East Don, and salmon are seen here in October. TRCA has tracked Chinook about 20 km up the East Don, well above Lawrence. North of Eglinton, so the season closes December 31."},
      {name:"Sunnybrook Park · West Don",loc:"North York · Leslie St north of Eglinton",crowd:"med",desc:"Parking off Leslie Street just north of Eglinton. The West Don is smaller here and sees fewer anglers than the lower river. North of Eglinton, so the season closes December 31."}
    ]
  },
  'Black Creek — Upper Reaches (Vaughan to North York)': {
    season:'standard',
    gauge:'02HC025', gaugeName:'Humber River at Elder Mills',
    sweetMin:1, sweetMax:6, flowLow:0.2, flowHigh:12,
    lat:43.760, lng:-79.490,
    loc:'North of Finch Avenue: Downsview, York University area, naturalized ravines',
    driveTime:{'toronto':25,'north york':10,'scarborough':20,'etobicoke':25,'markham':20,'richmond hill':20,'vaughan':15,'ajax':45,'pickering':40,'mississauga':50,'brampton':30,'oakville':40,'burlington':60,'milton':45,'hamilton':70,'guelph':75,'cambridge':90,'kitchener':100,'waterloo':100,'orangeville':55,'oshawa':60,'whitby':50,'bowmanville':75,'clarington':85,'newcastle':85,'cobourg':120,'port hope':110,'barrie':80,'collingwood':115,'owen sound':165},
    species:['Brown Trout'],
    active:true,
    regs:[{rule:'FMZ 16. Urban waterway with flashy flows. Water levels can surge after rain, so check conditions before you go.',icon:'📋'}],
    methods:['spin','fly'],
    access:[
      {name:'Black Creek Parkland · Upper',loc:'North York · Black Creek Parkland',crowd:'low',desc:'Naturalized ravines and wooded parklands with undercut stream banks and riffle-pool sequences. Brown trout present along with smallmouth bass, rock bass, and carp. A surprising urban fishery for those willing to explore. Best in early spring before water temperatures rise.'},
      {name:'Downsview Park Area',loc:'Downsview · Near York University',crowd:'low',desc:'A more natural upper section with some good structure. Brown trout are the main draw for trout anglers. Access via parkland trails. Flashy flows, so avoid it after heavy rain, when the creek turns chocolate brown and rises fast.'}
    ]
  },
  'Black Creek — Concrete Channel (Central North York)': {
    gauge:'02HC025', gaugeName:'Humber River at Elder Mills',
    sweetMin:1, sweetMax:6, flowLow:0.2, flowHigh:12,
    lat:43.720, lng:-79.490,
    loc:'Wilson Avenue to Eglinton Avenue: flood control concrete channel',
    driveTime:{'toronto':20,'north york':15,'scarborough':20,'etobicoke':20,'markham':20,'richmond hill':25,'vaughan':20,'ajax':45,'pickering':40,'mississauga':45,'brampton':30,'oakville':35,'burlington':55,'milton':45,'hamilton':65,'guelph':70,'cambridge':85,'kitchener':95,'waterloo':100,'orangeville':60,'oshawa':60,'whitby':55,'bowmanville':75,'clarington':85,'newcastle':85,'cobourg':125,'port hope':110,'barrie':85,'collingwood':115,'owen sound':170},
    species:[],
    active:false,
    regs:[],
    methods:[],
    access:[]
  },
  'Black Creek — Lower Watershed & Humber Confluence': {
    // The all-year rule covers the Humber main stem below Eglinton, not its tributaries.
    season:'standard',
    gauge:'02HC025', gaugeName:'Humber River at Elder Mills',
    sweetMin:1, sweetMax:6, flowLow:0.2, flowHigh:12,
    lat:43.670, lng:-79.500,
    loc:'South of Eglinton Avenue: Smythe Park to the Humber River junction, Etobicoke',
    driveTime:{'toronto':20,'north york':15,'scarborough':25,'etobicoke':15,'markham':30,'richmond hill':30,'vaughan':25,'ajax':50,'pickering':45,'mississauga':40,'brampton':30,'oakville':30,'burlington':50,'milton':40,'hamilton':60,'guelph':70,'cambridge':85,'kitchener':95,'waterloo':95,'orangeville':60,'oshawa':65,'whitby':55,'bowmanville':80,'clarington':85,'newcastle':90,'cobourg':125,'port hope':115,'barrie':90,'collingwood':120,'owen sound':170},
    species:['Steelhead','Chinook Salmon'],
    active:true,
    regs:[{rule:'FMZ 16. Trout and salmon season on Black Creek ends Sept 30; the Humber main stem below Eglinton is open all year. Highly accessible urban fishery. Migratory fish push up from the Humber during spring and fall runs.',icon:'📋'}],
    methods:['float','spin'],
    access:[
      {name:'Smythe Park',loc:'Smythe Park · Etobicoke near Eglinton',crowd:'med',desc:'Where the creek regains its natural banks with deep pools, overhanging vegetation, and natural structure. Migratory steelhead and Chinook push up from the Humber during spring and fall runs. Brown bullhead, pumpkinseed, panfish, and carp year-round. Highly accessible urban spot.'},
      {name:'Humber Marshes · Black Creek Confluence',loc:'Humber Marshes · Black Creek meets Humber River',crowd:'med',desc:'The confluence of Black Creek and the main Humber River. Fish moving up the Humber system enter Black Creek here during migrations. Good pool and slack-water structure at the junction. Accessible from the Humber Valley trail system.'}
    ]
  },

  // Default fallback for rivers without full config
  "default": {
    gauge: null, gaugeName: "No gauge available", gaugeUrl: null,
    lat: 43.7, lng: -79.4,
    sweetMin: 5, sweetMax: 15,
    flowLow: 2, flowHigh: 25,
    species: ["Trout", "Salmon"],
    routine: [{ t: "Check the local Conservation Authority", d: "Each watershed has a Conservation Authority that tracks conditions and may issue flow or flood advisories." },
      { t: "Review recent rain in the upstream watershed", d: "Most Southern Ontario rivers respond to rain within 6\u201324 hours. A modest rain 24\u201348 hrs prior often produces ideal, slightly-stained conditions." },
      { t: "Make your go/no-go call based on flow direction", d: "A rising flow is almost always better than a falling one at the same level. Direction matters more than the number." }
    ],
    dam: {
      icon: "\U0001f4e1",
      label: "Data \u00b7 Environment Canada Water Office",
      title: "Check live flow data for this river",
      desc: "For rivers not yet in the HereFishyFishy database, check the Environment Canada Water Office for the nearest active gauge. Real-time data is updated hourly.",
      links: [
        { text: "Water Office Search", url: "https://wateroffice.ec.gc.ca/search/real_time_e.html" },
        { text: "OMNR Regulations", url: "https://www.ontario.ca/page/sport-fishing-ontario" }
      ]
    },
    access: [
      { name: "Check local conservation area access", crowd: "med", crowdLabel: "Varies", loc: "See local Conservation Authority website", desc: "Access points and regulations vary by river. Check the local Conservation Authority website for current access information and any seasonal closures.", tags: ["Check Local CA","Access Varies"], best: "Conditions vary, so check local sources before your trip." }
    ]
  }
};

// ── REGULATIONS DATA (2026 Ontario Fishing Regulations) ─────────────────────
var RIVER_REGS = {
  "Grand River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2 (aggregate trout)",
        "notes": "Fergus\u2013Elora reach: catch & release only (S-0, C-0). Artificial lure only. One barbless hook only."
      },
      {
        "name": "Rainbow Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-2 / C-1",
        "notes": "Same C&R restriction as brown trout in Fergus\u2013Elora reach. Artificial only."
      },
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Catch & release only in Fergus\u2013Elora designated reach."
      }
    ],
    "special": [
      "Fergus–Elora reach: ARTIFICIAL LURES ONLY, no bait of any kind",
      "ONE barbless hook maximum throughout designated reach",
      "Brown, Rainbow & Brook Trout: S-0 / C-0 (catch & release only) in Fergus\u2013Elora",
      "Paris to Brantford: Fish Sanctuary: no fishing March 1 \u2013 Fri. before 4th Sat. in April",
      "Southern Bait Management Zone: no live baitfish transport"
    ]
  },
  "Credit River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Chinook / Coho Salmon",
        "season": "4th Sat. April \u2013 Sept. 30 (zone-wide)",
        "limit": "S-5 / C-2",
        "notes": "Pacific salmon count toward the S-5 / C-2 trout and salmon aggregate."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2 (aggregate trout)",
        "notes": "Upper reach (above Old Baseline Rd.): artificial only, barbless hook, C&R only (S-0/C-0)."
      },
      {
        "name": "Rainbow Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-2 / C-1",
        "notes": "Varies by reach. Check specific section regulations."
      },
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Upper Credit (above Old Baseline Rd.): S-0 / C-0."
      }
    ],
    "special": [
      "Above Old Baseline Road, Town of Caledon: ARTIFICIAL LURE ONLY, one barbless hook, trout C&R only",
      "Different reaches have different fish sanctuary periods. Check your exact location",
      "Britannia Rd. to Hwy 407: open 4th Sat. April \u2013 Dec. 31 (extended fall season)",
      "Britannia to Old Baseline Rd.: sanctuary Jan. 1 \u2013 Fri. before 4th Sat. April",
      "Old Baseline Rd. to Hwy 9: sanctuary Jan. 1\u2013Fri. before 4th Sat. April & Oct. 1\u2013Dec. 31",
      "Hwy 403 to Britannia Rd.: sanctuary Jan. 1\u2013Apr. & Aug. 15\u2013Dec. 31",
      "Southern Bait Management Zone"
    ]
  },
  "Bronte Creek": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30 (zone-wide)",
        "limit": "S-5 / C-2",
        "notes": ""
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30; open all year near mouth (Hwy 2 to Lake)",
        "limit": "S-5 / C-2",
        "notes": "Lower reach (Hwy 2 to Lake Ontario): open all year with extended season."
      },
      {
        "name": "Rainbow Trout",
        "season": "4th Sat. April \u2013 Sept. 30; open all year near mouth",
        "limit": "S-2 / C-1",
        "notes": "Extended open season applies to Hwy 2\u2013Lake Ontario section."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year near Lake Ontario; 4th Sat. April \u2013 Sept. 30 inland",
        "limit": "S-5 / C-2 (Pacific Salmon)",
        "notes": "Best fishing in fall run (Sept\u2013Nov)."
      }
    ],
    "special": [
      "Progreston CPR track to Hwy 407, including Lowville: sanctuary Jan. 1\u2013Fri. before 4th Sat. April & Oct. 1\u2013Dec. 31",
      "Lower reach (Hwy 2 to Lake Ontario): open all year for Atlantic/Brown/Rainbow/Pacific Salmon",
      "Southern Bait Management Zone: no live baitfish transport",
      "Aggregate trout and salmon limit: S-5 / C-2 combined"
    ]
  },
  "Don River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (Lake Ontario to Eglinton Ave.); 4th Sat. April \u2013 Dec. 31 (Eglinton to Hwy 407)",
        "limit": "S-5 / C-2",
        "notes": "Zone-wide limits apply. Counts toward the S-5 / C-2 trout and salmon aggregate."
      }
    ],
    "special": [
      "Don River and tributaries (Lake Ontario to Eglinton Ave., City of Toronto): open all year for Atlantic Salmon, Brown Trout, Pacific Salmon and Rainbow Trout",
      "Don River and tributaries (Eglinton Ave. to Hwy 407): open 4th Sat. April \u2013 Dec. 31 (extended fall season)",
      "Aggregate trout & salmon limit: S-5 / C-2 combined",
      "Southern Bait Management Zone"
    ]
  },
  "Humber River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "4th Sat. April \u2013 Sept. 30 (zone-wide)",
        "limit": "S-2 / C-1",
        "notes": "Counts toward the S-5 / C-2 trout and salmon aggregate."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-2 / C-1 (combined with Brook & Rainbow upstream of Eglinton)",
        "notes": "Upper Humber (above Eglinton Ave.): combined Brook, Brown & Rainbow limit S-2/C-1."
      },
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-2 / C-1 combined (above Eglinton)",
        "notes": "Combined limit with Brown and Rainbow Trout above Eglinton Ave."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (Eglinton to Lake Ontario)",
        "limit": "S-5 / C-2",
        "notes": "Lower Humber extended season applies."
      }
    ],
    "special": [
      "Above Hwy 407 (York/Peel/Dufferin/Simcoe): sanctuary Jan. 1\u2013Fri. before 4th Sat. April & Oct. 1\u2013Dec. 31",
      "Above Eglinton Ave.: Brook, Brown & Rainbow combined limit S-2 / C-1",
      "Eglinton to Lake Ontario: open all year for Atlantic/Brown/Rainbow/Pacific Salmon",
      "Southern Bait Management Zone"
    ]
  },
  "Nottawasaga River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Headwaters and upper tributaries. Standard FMZ 16 season."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Extended fall season applies to lower reaches toward Georgian Bay."
      },
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "4th Sat. April \u2013 Sept. 30 (inland); open all year (lower toward Georgian Bay)",
        "limit": "S-2 / C-1",
        "notes": "Lower Nottawasaga (Boyne River to Georgian Bay): open all year."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (lower)",
        "limit": "S-5 / C-2",
        "notes": "Best in fall (Sept\u2013Nov) in lower river toward Georgian Bay."
      }
    ],
    "special": [
      "Nicholson Dam (Hwy 89 down to near the Boyne): sanctuary Jan. 1\u2013Fri. before 2nd Sat. in May & Oct. 1\u2013Dec. 31",
      "Lower Nottawasaga (Boyne to Georgian Bay): open all year for Brown, Rainbow & Pacific Salmon",
      "Boyne River to Pine River: Rainbow Trout catch and release only (S-0 / C-0)",
      "Southern Bait Management Zone"
    ]
  },
  "Duffins Creek": {
    "zone": "FMZ 17",
    "species": [
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30 (zone-wide)",
        "limit": "S-2 / C-1",
        "notes": "Zone 17 brook trout limit is S-2 / C-1."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (lower, south of CNR)",
        "limit": "S-5 / C-2",
        "notes": "Lower section (south of CNR right-of-way to Lake Ontario): open all year."
      },
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (lower)",
        "limit": "S-2 / C-1",
        "notes": "Extended season south of CNR."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (lower); 4th Sat. April \u2013 Sept. 30 (inland)",
        "limit": "S-5 / C-2",
        "notes": "Fall run (Sept\u2013Nov) is peak season."
      }
    ],
    "special": [
      "Durham Region waters between Hwy 2 and the CNR: open 4th Sat. April \u2013 Dec. 31 (extended fall season)",
      "Durham Region waters between CNR right-of-way and Lake Ontario: open all year",
      "Aggregate trout and salmon limit applies: S-5 / C-2 combined",
      "Southern Bait Management Zone",
      "Check TRCA for any additional local closures or sanctuary areas"
    ]
  },
  "Ganaraska River": {
    "zone": "FMZ 17",
    "species": [
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (Ganaraska, CNR to Lake Ontario)",
        "limit": "S-5 / C-2",
        "notes": "The Ganaraska between CNR right-of-way and Lake Ontario is open all year."
      },
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (lower)",
        "limit": "S-2 / C-1",
        "notes": "Open all year below the CNR. Jocelyn St to the CNR is open from the fourth Saturday in April to Aug 31 and Oct 15 to Dec 31."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (lower reach)",
        "limit": "S-5 / C-2",
        "notes": "Peak fall run Sept\u2013Nov. One of the most accessible salmon rivers near Toronto."
      }
    ],
    "special": [
      "Ganaraska River (CNR right-of-way to Lake Ontario): open all year for all salmonids",
      "Aggregate trout & salmon limit: S-5 / C-2 combined",
      "Southern Bait Management Zone",
      "Jocelyn St bridge to CNR: closed Sept. 1 \u2013 Oct. 14; open 4th Sat. April \u2013 Aug. 31 and Oct. 15 \u2013 Dec. 31",
      "Hwy 401 to Jocelyn St bridge (Corbetts Dam): fish sanctuary closed all year",
      "Check Ganaraska Region CA for current access"
    ]
  },
  "Beaver River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Inland reaches above Thornbury Dam. Standard FMZ 16 season."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30; extended fall season (Thornbury Dam to Georgian Bay)",
        "limit": "S-5 / C-2",
        "notes": "Thornbury Dam to Georgian Bay: extended season open 4th Sat. April to Dec. 31."
      },
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (lower near Georgian Bay)",
        "limit": "S-2 / C-1",
        "notes": "Lower river and Georgian Bay mouth area regulations may differ."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (lower, Georgian Bay tributaries)",
        "limit": "S-5 / C-2",
        "notes": "Georgian Bay mouth area open all year for Pacific Salmon."
      }
    ],
    "special": [
      "Thornbury Dam to Georgian Bay: open 4th Sat. April \u2013 Dec. 31 (extended fall)",
      "Zone 13/14 regulations may apply at the Georgian Bay mouth. Check your exact location",
      "Southern Bait Management Zone",
      "Beaver River at Kimberley: standard Zone 16 seasons apply to inland reaches"
    ]
  },
  "Saugeen River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Headwaters and upper tributaries. Standard FMZ 16 season."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Standard Zone 16 seasons. Extended fall season may apply to lower reaches toward Lake Huron."
      },
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (near Lake Huron)",
        "limit": "S-2 / C-1",
        "notes": "Lake Huron tributaries Zone 13 regulations apply to the mouth area."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (lower, near Lake Huron)",
        "limit": "S-5 / C-2",
        "notes": "Exceptional fall Chinook and Coho runs. Zone 13 applies at Lake Huron end."
      }
    ],
    "special": [
      "Denny's Dam section: sanctuary closed to night fishing Oct. 1\u2013Oct. 31",
      "Maple Hill Dam section: fish sanctuary closed all year",
      "Zone 13 (Lake Huron) regulations apply at the river mouth. Check which zone you are in",
      "Southern Bait Management Zone inland",
      "Aggregate trout & salmon limit: S-5 / C-2 combined"
    ]
  },
  "Sixteen Mile Creek": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30 (zone-wide)",
        "limit": "S-5 / C-2",
        "notes": ""
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (Hwy 2 to Lake Ontario)",
        "limit": "S-5 / C-2",
        "notes": "Lower reach (Oakville, Hwy 2 to Lake): open all year. Extended opportunity."
      },
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "Open all year (lower reach to Lake Ontario)",
        "limit": "S-2 / C-1",
        "notes": "Best in spring (steelhead) and fall. Lower reach open all year."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (lower reach)",
        "limit": "S-5 / C-2",
        "notes": "Fall run (Sept\u2013Nov) is the primary draw."
      }
    ],
    "special": [
      "Sixteen Mile Creek and tributaries (Hwy 2 to Hwy 407): open 4th Sat. April \u2013 Dec. 31 (extended fall season)",
      "Lower reach (Hwy 2 to Lake Ontario): open all year for Atlantic/Brown/Rainbow/Pacific Salmon",
      "Southern Bait Management Zone",
      "Aggregate trout & salmon limit: S-5 / C-2 combined"
    ]
  },
  "Rouge River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (Hwy 2 to Lake Ontario)",
        "limit": "S-5 / C-2",
        "notes": "Rouge River (Hwy 2/Kingston Rd. to Lake Ontario) open all year."
      },
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "Open all year (lower reach)",
        "limit": "S-2 / C-1",
        "notes": "Extended season applies in the lower Rouge."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (lower reach)",
        "limit": "S-5 / C-2",
        "notes": "Fall run (Sept\u2013Nov) is peak. Lower reach open all year."
      }
    ],
    "special": [
      "Rouge River (Kingston Rd. to Lake Ontario, City of Toronto): open all year for salmonids",
      "Rouge River (Kingston Rd. to Hwy 407): open 4th Sat. April \u2013 Dec. 31 (extended fall season)",
      "Rouge National Urban Park: check Parks Canada for any extra access restrictions",
      "Aggregate trout & salmon limit: S-5 / C-2 combined",
      "Southern Bait Management Zone"
    ]
  },
  "Wilmot Creek": {
    "zone": "FMZ 17",
    "species": [
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30 (zone-wide)",
        "limit": "S-2 / C-1",
        "notes": "Zone 17 brook trout limit is S-2 / C-1."
      },
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (lower reach south of CNR)",
        "limit": "S-2 / C-1",
        "notes": "Durham Region waters between CNR and Lake Ontario open all year."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (lower reach)",
        "limit": "S-5 / C-2",
        "notes": "Best in fall Oct\u2013Nov."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Resident fish in upper reaches."
      }
    ],
    "special": [
      "Durham Region waters between Hwy 2 and the CNR: open 4th Sat. April \u2013 Dec. 31 (extended fall season)",
      "Durham Region, all waters between the CNR right-of-way and Lake Ontario: open all year",
      "Aggregate trout & salmon limit: S-5 / C-2 combined",
      "Southern Bait Management Zone"
    ]
  },
  "Bowmanville Creek": {
    "zone": "FMZ 17",
    "species": [
      {
        "name": "Rainbow Trout (Steelhead)",
        "season": "4th Sat. April \u2013 Sept. 30; open all year (lower reach)",
        "limit": "S-2 / C-1",
        "notes": "Durham Region lower reach open all year."
      },
      {
        "name": "Chinook / Coho Salmon",
        "season": "Open all year (lower reach)",
        "limit": "S-5 / C-2",
        "notes": "Fall Chinook & Coho Oct\u2013Nov is peak season."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Upper creek resident fish."
      }
    ],
    "special": [
      "Durham Region waters between Hwy 2 and the CNR: open 4th Sat. April \u2013 Dec. 31 (extended fall season)",
      "Durham Region waters between CNR and Lake Ontario: open all year",
      "Aggregate trout & salmon limit: S-5 / C-2 combined",
      "Southern Bait Management Zone",
    ]
  },
  "Speed River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Standard Zone 16 regulations apply to the Speed River through Guelph."
      },
      {
        "name": "Rainbow Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-2 / C-1",
        "notes": "Standard Zone 16 regulations."
      },
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Upper Speed River may have additional restrictions."
      }
    ],
    "special": [
      "Standard Zone 16 trout seasons apply",
      "Southern Bait Management Zone",
      "Aggregate trout & salmon limit: S-5 / C-2 combined",
      "Check GRCA for any local waterbody exceptions on the Speed"
    ]
  },
  "Eramosa River": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Rainbow Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-2 / C-1",
        "notes": ""
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Standard Zone 16 regulations. The river stays cold, so it fishes through the whole season."
      },
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Wild brook trout in upper reaches. Handle carefully."
      }
    ],
    "special": [
      "Standard Zone 16 trout seasons apply",
      "Rockwood Conservation Area: check Conservation Halton for any local rules",
      "Southern Bait Management Zone",
      "Wild brook trout present. Catch and release strongly encouraged"
    ]
  },
  "Black Creek": {
    "zone": "FMZ 16",
    "species": [
      {
        "name": "Chinook / Coho Salmon",
        "season": "4th Sat. April \u2013 Sept. 30 (zone-wide)",
        "limit": "S-5 / C-2",
        "notes": "Pacific salmon count toward the S-5 / C-2 trout and salmon aggregate."
      },
      {
        "name": "Brown Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Standard Zone 16 regulations apply."
      },
      {
        "name": "Brook Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-5 / C-2",
        "notes": "Wild brook trout. Catch & release strongly recommended for this fragile population."
      },
      {
        "name": "Rainbow Trout",
        "season": "4th Sat. April \u2013 Sept. 30",
        "limit": "S-2 / C-1",
        "notes": "Some rainbow trout present."
      }
    ],
    "special": [
      "Standard Zone 16 trout seasons apply",
      "Southern Bait Management Zone",
      "Wild brook trout present. Catch and release strongly recommended",
      "No real-time gauge. Contact TRCA for conditions"
    ]
  }
};

function getRiverRegs(riverName) {
  if (!riverName) return null;
  var name = riverName.split(",")[0].trim();
  // 1. Exact match
  if (RIVER_REGS[name]) return RIVER_REGS[name];
  // 2. Strip " — section" suffix (e.g. "Ganaraska River — Upper" → "Ganaraska River")
  if (name.indexOf(" — ") !== -1) {
    var p1 = name.split(" — ")[0].trim();
    if (RIVER_REGS[p1]) return RIVER_REGS[p1];
  }
  // 3. Strip leading Upper/Middle/Lower/Lower-Mid prefix
  //    e.g. "Upper Credit River" → "Credit River"
  //         "Lower-Mid Humber (Old Mill to Eglinton)" → "Humber River"
  var stripped = name
    .replace(/^(Upper|Middle|Lower-Mid|Lower|Mid)\s+/i, '')  // remove prefix
    .replace(/\s*\([^)]*\)\s*$/, '')                          // remove trailing (...)
    .trim();
  if (RIVER_REGS[stripped]) return RIVER_REGS[stripped];
  // 4. Also try stripping prefix then adding "River" if not already there
  //    e.g. "Upper Beaver" → "Beaver River"
  if (!/river|creek/i.test(stripped)) {
    var withRiver = stripped + ' River';
    if (RIVER_REGS[withRiver]) return RIVER_REGS[withRiver];
  }
  // 5. Try extracting just "X River" or "X Creek" from the stripped name
  //    e.g. "Beaver River Swamp" → "Beaver River"
  var riverMatch = stripped.match(/^(.+?(?:River|Creek|Brook))/i);
  if (riverMatch) {
    var coreRiver = riverMatch[1].trim();
    if (RIVER_REGS[coreRiver]) return RIVER_REGS[coreRiver];
  }
  return null;
}

// ── ACCESS POINT COORDINATES ─────────────────────────────────────────────────
var ACCESS_COORDS = {
  "Upper Grand River (Tailwater)": [
    {lat:43.7073,lng:-80.3767}, // Fergus Pool · Below Shand Dam
    {lat:43.6812,lng:-80.4312}, // Elora Gorge
    {lat:43.691044,lng:-80.412394}, // Racquet Club
    {lat:43.690579,lng:-80.39624}, // The Trestle
    {lat:43.624724,lng:-80.447657}, // Wilson
    {lat:43.6789,lng:-80.4334}, // Irvine Creek Confluence
    {lat:43.6823,lng:-80.4289}, // Elora Gorge Conservation Area
  ],
  "Lower Grand River": [
    {lat:43.0734,lng:-79.9543}, // Caledonia · Argyle Street Access
    {lat:42.9034,lng:-79.6189}, // Dunnville · Lower Grand
  ],
  "Upper Credit River": [
    {lat:43.8851,lng:-80.0456}, // Upper Credit Conservation Area
    {lat:43.7935,lng:-80.0023}, // Belfountain Conservation Area
    {lat:43.7994,lng:-80.0289}, // Forks of the Credit Provincial Park
    {lat:43.8098,lng:-79.982}, // Belfountain to Inglewood Reach
  ],
  "Middle Credit River": [
    {lat:43.6473977,lng:-79.8569259}, // McNab Park
    {lat:43.5868,lng:-79.7158}, // Streetsville Road Allowances
  ],
  "Lower Credit River": [
    {lat:43.5465,lng:-79.6587}, // Erindale Park
    {lat:43.5489787,lng:-79.5837633}, // Credit River Mouth · Port Credit  [mouth]
  ],
  "Bronte Creek — Lower Estuary & Mouth": [
    {lat:43.3934,lng:-79.7234}, // Bronte Harbour / Pier  [mouth]
    {lat:43.3956,lng:-79.7267}, // Petro-Canada Park (Petro Park)
    {lat:43.3919,lng:-79.7134}, // Below Lakeshore Road West
  ],
  "Bronte Creek — Mid-Section & Provincial Park": [
    {lat:43.4423,lng:-79.7567}, // Bronte Creek Provincial Park
    {lat:43.4912,lng:-79.7934}, // Lowville Park
  ],
  "Bronte Creek — Upper Headwaters": [
    {lat:43.3993,lng:-79.9581}, // Progreston Area · Road Allowances
    {lat:43.3907,lng:-79.9843}, // Carlisle Reach
  ],
  "Lower Humber River": [
    {lat:43.6267,lng:-79.4734}, // Humber River Mouth · Humber Bay Park  [mouth]
    {lat:43.6523,lng:-79.5123}, // Humber Valley Heritage Trail · Lower
  ],
  "Lower-Mid Humber (Old Mill to Eglinton)": [
    {lat:43.6634,lng:-79.5123}, // Etienne Brûlé Park
    {lat:43.6756,lng:-79.5034}, // Scarlett Mills Park
  ],
  "Upper Humber River (Headwaters)": [
    {lat:43.9368,lng:-79.8634}, // Upper Humber · Mono / Orangeville Area
    {lat:43.8756,lng:-79.7312}, // Humber River · Bolton Reach
  ],
  "Nottawasaga River — Headwaters (Niagara Escarpment)": [
    {lat:44.3114,lng:-79.8625}, // Bruce Trail Access Points · Upper Notty
    {lat:44.0595,lng:-79.8104}, // Headwaters - Road Allowances
  ],
  "Nottawasaga River — Middle Section (Alliston to Angus)": [
    {lat:44.1534,lng:-79.8712}, // Alliston · Main River Access
    {lat:44.2123,lng:-79.9034}, // Pine River Confluence
    {lat:44.1721,lng:-79.8131}, // Boyne River Confluence
    {lat:44.2567,lng:-79.9456}, // Nicholson Dam / Essa Township Sanctuary
  ],
  "Nottawasaga River — Lower Section (Boyne to Wasaga Beach)": [
    {lat:44.3325,lng:-79.8782}, // McKinnon Road Access Point
    {lat:44.5212,lng:-80.0167}, // Wasaga Beach · River Mouth (Georgian Bay)
  ],
  "Duffins Creek — Lower Section": [
    {lat:43.8378,lng:-79.0289}, // Rotary Park
    {lat:43.8334,lng:-79.0312}, // Duffins Creek Marsh  [mouth]
    {lat:43.8396,lng:-79.0406}, // Below CNR Railway Line
  ],
  "Duffins Creek — Middle Section": [
    {lat:43.9023,lng:-79.0934}, // Greenwood Conservation Area
    {lat:43.9156,lng:-79.1234}, // Whitevale · Below Dam
  ],
  "Duffins Creek — Upper Reaches": [
    {lat:43.9567,lng:-79.1456}, // Glen Major · Seaton Hiking Trail
    {lat:43.9205,lng:-79.1206}, // West Duffins Headwaters
  ],
  "Ganaraska River — Lower (Lake to CNR Bridge)": [
    {lat:43.9423674,lng:-78.290492}, // Port Hope Harbour · River Mouth  [mouth]
    {lat:43.9545,lng:-78.2956}, // Below CNR Railway Bridge
  ],
  "Ganaraska River — Port Hope Sanctuary": [
    {lat:43.9612,lng:-78.2934}, // Jocelyn Street Bridge Access
    {lat:43.946,lng:-78.299}, // Port Hope Town Section · Sanctuary Area
  ],
  "Ganaraska River — Upper & Conservation Areas": [
    {lat:44.0234,lng:-78.3456}, // Ganaraska Millennium Conservation Area
    {lat:44.0512,lng:-78.3789}, // Sylvan Glen Conservation Area
    {lat:44.0097,lng:-78.3705}, // Thurne Parks
  ],
  "Lower Beaver River (Thornbury)": [
    {lat:44.5623,lng:-80.4523}, // Thornbury · Lower River / Harbour
    {lat:44.5634,lng:-80.4512}, // Thornbury Fishway
  ],
  "Middle Beaver River (Clarksburg to Heathcote)": [
    {lat:44.4925,lng:-80.4912}, // Below Kimberley · Mid-Beaver
  ],
  "Upper Beaver River (Kimberley)": [
    {lat:44.49,lng:-80.4}, // Kimberley · Village Reach
  ],
  "Saugeen River — Headwaters & Upper Tributaries": [
    {lat:44.2302,lng:-80.8324}, // Rocky Saugeen · Public Access
    {lat:44.285,lng:-80.91}, // North Saugeen River
    {lat:44.155,lng:-80.945}, // South Saugeen River
  ],
  "Saugeen River — Lower Main Stem (Paisley to Southampton)": [
    {lat:44.2934,lng:-81.2123}, // Denny
    {lat:44.5034,lng:-81.3712}, // Southampton · Lake Huron Mouth
  ],
  "Sixteen Mile Creek — Lower Reaches & Oakville Harbour": [
    {lat:43.4378,lng:-79.6823}, // Lakeside Park · Creek Mouth
    {lat:43.4423,lng:-79.6867}, // Tannery Park
  ],
  "Sixteen Mile Creek — Middle Reaches & Main Valley": [
    {lat:43.4712,lng:-79.7034}, // Lions Valley Park
    {lat:43.4545,lng:-79.73}, // Rebecca Street to Dundas Street Reach
  ],
  "Sixteen Mile Creek — Upper West Branch (Trout)": [
    {lat:43.5427,lng:-79.813}, // West Branch · Road Allowance Crossings
    {lat:43.5949,lng:-79.9082}, // Upper West Branch Tributaries
  ],
  "Rouge River — Marsh & Mouth (Lake Ontario)": [
    {lat:43.8034,lng:-79.1312}, // Rouge Beach · River Mouth  [mouth]
    {lat:43.8056,lng:-79.1323}, // CNR Railway Bridge Area
  ],
  "Rouge River — Mid-Section (Rouge National Urban Park)": [
    {lat:43.8289,lng:-79.1456}, // Rouge National Urban Park · Main Access
    {lat:43.8178,lng:-79.1389}, // Kingston Road (Hwy 2) Bridge Area
    {lat:43.8178,lng:-79.1823}, // Toronto Zoo Valley
  ],
  "Rouge River — Upper & Milne Dam (Markham)": [
    {lat:43.8645,lng:-79.2734}, // Milne Dam Conservation Park
    {lat:43.881,lng:-79.249}, // Toogood Pond Area
  ],
  "Wilmot Creek — Mouth & Marsh (Lake Ontario)": [
    {lat:43.9123,lng:-78.5978}, // Sir Samuel Wilmot Nature Area  [mouth]
  ],
  "Wilmot Creek — Lower River (to CN Rail Tracks)": [
    {lat:43.9234,lng:-78.5923}, // Nature Preserve Trails · Lower Creek
    {lat:43.9053,lng:-78.6011}, // CN Railway Track Crossing
  ],
  "Wilmot Creek — Middle Section (Hwy 401 to Hwy 2)": [
    {lat:43.9099,lng:-78.608}, // Newcastle · Highway 401 to Highway 2 Reach
  ],
  "Wilmot Creek — Upper Watershed & Orono Crown Lands": [
    {lat:43.9856,lng:-78.6234}, // Orono Crown Lands
    {lat:44.0258,lng:-78.6494}, // Upper Wilmot Tributaries
  ],
  "Bowmanville Creek — River Mouth & Piers": [
    {lat:43.8934,lng:-78.6923}, // Bowmanville Marina Pier
    {lat:43.8893,lng:-78.664}, // Creek Mouth · East Bank
  ],
  "Lower Bowmanville Creek": [
    {lat:43.9056,lng:-78.6867}, // Baseline Road Bridge · Parking Lot
    {lat:43.8956,lng:-78.6775}, // CNR Railway Bridge · South Side
  ],
  "Middle Bowmanville Creek (Fish Ladder)": [
    {lat:43.9134,lng:-78.6812}, // Bowmanville Valley Trail Access
    {lat:43.908,lng:-78.682}, // Goodyear Dam Lower Pools
  ],
  "Upper Bowmanville Creek": [
    {lat:43.9864,lng:-78.7327}, // Upper Creek · Road Allowance Crossings
    {lat:44.005,lng:-78.76}, // Oak Ridges Moraine Headwaters
    {lat:44.0173,lng:-78.7808}, // Headwaters near Enniskillen
  ],
  "Speed River — Upper (Above Guelph Lake)": [
    {lat:43.6281,lng:-80.1861}, // Wellington County Road Bridge Crossings
    {lat:43.6234,lng:-80.2056}, // Guelph Lake Reservoir Inflow
  ],
  "Eramosa River — Upper Headwaters (Above Rockwood)": [
    {lat:43.6617,lng:-80.1533}, // Municipal Road Bridge Crossings · Upper
    {lat:43.7106,lng:-80.2399}, // Headwaters Tributaries
  ],
  "Eramosa River — Mid-Section (Rockwood to Eden Mills)": [
    {lat:43.6123,lng:-80.1523}, // Rockwood Conservation Area
    {lat:43.5756,lng:-80.1834}, // Eden Mills · Lower Mid-Section
  ],
  "Lower Don River (Lake to Eglinton)": [
    {lat:43.6865,lng:-79.3601}, // Todmorden Mills · Pottery Road
    {lat:43.6970,lng:-79.3590}, // Crothers Woods · Lower Don Trail
    {lat:43.7038,lng:-79.3369}, // E.T. Seton Park · West Don
  ],
  "Upper Don River (Eglinton to Hwy 407)": [
    {lat:43.7288,lng:-79.3212}, // Charles Sauriol · East Don
    {lat:43.7231,lng:-79.3626}, // Sunnybrook Park · West Don
  ],
  "Black Creek — Upper Reaches (Vaughan to North York)": [
    {lat:43.763,lng:-79.5071}, // Black Creek Parkland · Upper
    {lat:43.7434,lng:-79.4756}, // Downsview Park Area
  ],
  "Black Creek — Lower Watershed & Humber Confluence": [
    {lat:43.6712,lng:-79.4934}, // Smythe Park
    {lat:43.6634,lng:-79.4867}, // Humber Marshes · Black Creek Confluence
  ],
};

// ── LAKE-RUN BROWN TROUT ─────────────────────────────────────────────────────
// Below the first impassable barrier (Norval on the Credit, Whitevale on Duffins, Milne
// Dam on the Rouge, above Bolton on the Humber...), browns are lake-run fish, not stream
// residents. The section species lists already follow those barriers: a section that
// lists Steelhead or salmon is below one. Timing is TJ's (2026-10-13): they push in with
// cooler water in October and November, earlier (September) on the FMZ 17 rivers, hold
// over through winter, spike again in March and April, and are out in the lake in summer.
// TJ also confirmed lake-run browns in the Credit and the Humber. On the Rouge they are minimal,
// so the Rouge mouth does not list them.
var LAKE_RUN_BROWN_WINDOWS = [
  { months: [9,10], quality: "good",   label: "Fall Run",   note: "Lake-run browns push in as the water cools. Drift roe bags under a float." },
  { months: [11,1], quality: "good",   label: "Winter",     note: "Lake-run browns hold over in the deeper pools through winter. Slow float with roe." },
  { months: [2,3],  quality: "good",   label: "Spring Run", note: "A second push of lake-run browns in March and April, alongside the steelhead." },
  { months: [4,7],  quality: "absent", label: "Lake",       note: "Lake-run browns are out in the lake. They enter the river in October and November." }
];

var LAKE_RUN_BROWN_SEPT = {
  early: { months: [8,8], quality: "good",   label: "Early Fall Run", note: "On the eastern rivers lake-run browns can start in September. Drift roe bags under a float." },
  late:  { months: [8,8], quality: "absent", label: "Lake",           note: "Lake-run browns are out in the lake. They enter the river in October and November." }
};

function sectionBaseName(section) { return String(section || '').split(',')[0].trim(); }

function isLakeRunBrownSection(section) {
  var c = RIVER_CONFIG[sectionBaseName(section)];
  var sp = (c && c.species) || [];
  if (!c || c.residentBrowns) return false; // a few migratory fish pass, but the browns are residents
  return sp.indexOf('Brown Trout') !== -1 &&
    sp.some(function(n){ return n === 'Steelhead' || n === 'Chinook Salmon' || n === 'Coho Salmon'; });
}

function lakeRunBrownWindows(section) {
  var regs = (typeof getRiverRegs === 'function') ? getRiverRegs(sectionBaseName(section)) : null;
  var fmz17 = !!(regs && regs.zone === 'FMZ 17');
  return LAKE_RUN_BROWN_WINDOWS.concat([fmz17 ? LAKE_RUN_BROWN_SEPT.early : LAKE_RUN_BROWN_SEPT.late]);
}

function getRiverConfig(riverName) {
  if (!riverName) return RIVER_CONFIG["default"];
  var name = riverName.split(",")[0].trim();
  // Exact match only against known operational config keys (not RIVER_REGS)
  // Derived from RIVER_CONFIG itself rather than maintained by hand. The old hardcoded
  // list had drifted: 11 real sections were missing from it (all four Bowmanville
  // sections, three Saugeen, three Eramosa, one Humber) and silently fell through to the
  // default config — no gauge, wrong sweet spot, generic access text, and species
  // reported as "not in this section". Three stale entries pointed at configs that no
  // longer exist. Generating the list makes that class of drift impossible.
  var validKeys = getRiverConfig._keys || (getRiverConfig._keys = Object.keys(RIVER_CONFIG)
    .filter(function(k){ return k !== 'default' && RIVER_CONFIG[k] && RIVER_CONFIG[k].lat !== undefined; }));
  // Exact match
  if (validKeys.indexOf(name) !== -1 && RIVER_CONFIG[name] && RIVER_CONFIG[name].lat !== undefined) {
    return RIVER_CONFIG[name];
  }
  // Partial match against valid keys only
  for (var i = 0; i < validKeys.length; i++) {
    var k = validKeys[i];
    if (name.toLowerCase().indexOf(k.toLowerCase()) !== -1 ||
        k.toLowerCase().indexOf(name.toLowerCase()) !== -1) {
      if (RIVER_CONFIG[k] && RIVER_CONFIG[k].lat !== undefined) return RIVER_CONFIG[k];
    }
  }
  return RIVER_CONFIG["default"];
}

// ── CLASSIFY ──────────────────────────────────────────────────────────────────
function clsFlow(f,cfg){
  var lo=cfg?cfg.flowLow:6, mn=cfg?cfg.sweetMin:8, mx=cfg?cfg.sweetMax:12, hi=cfg?cfg.flowHigh:20;
  return f<lo?"bad":f<mn?"warn":f<=mx?"good":f<=hi?"warn":"bad";
}

function clsTemp(t){return t<TEMP_MIN-2?"bad":t<TEMP_MIN?"warn":t<=TEMP_MAX?"good":t<TEMP_STRESS?"warn":"bad";}

function clsSky(c){return c>=70?"good":c>=40?"warn":"bad";}

var GROUNDWATER_C = 8.5;   // shallow groundwater in southern Ontario, about the mean annual air temperature plus a little

// Midpoint of the air-to-water curve. Fitted to CVC's Credit stations on 2026-10-16 (four stations, mean error
// 0.4 °C vs 1.3 °C at 14). One fall evening only: refit from the Worker's wt:log:* history as seasons pass.
var WATER_CURVE_MID = 12.5;

// Per-reach settings. gw: pull toward groundwater temperature (0 = none, 1 = spring water);
// tau: how many days of weather the water "remembers" (small creeks react faster).
// Defaults come from the reach's position; overrides are reaches we know behave differently.
var WATER_MODEL_OVERRIDES = {
  'Lower Humber River': { gw: 0.05 },                                    // urban runoff, warm
  'Black Creek \u2014 Lower Watershed & Humber Confluence': { gw: 0.05 },
  'Lower Don River (Lake to Eglinton)': { gw: 0.05 },                           // urban runoff, warm
  'Upper Don River (Eglinton to Hwy 407)': { gw: 0.1 },
  'Black Creek \u2014 Upper Reaches (Vaughan to North York)': { gw: 0.15 },
  'Upper Grand River (Tailwater)': { gw: 0.35, tau: 5 },                  // cold bottom release from the dam, not springs
  'Lower Grand River': { gw: 0.05, tau: 6 },                              // big, runoff-fed river
  // Bowmanville: small, short creek. TJ sees it cool faster than other rivers (unverified, no public data).
  'Bowmanville Creek \u2014 River Mouth & Piers': { tau: 3 },
  'Lower Bowmanville Creek': { tau: 3 },
  'Middle Bowmanville Creek (Fish Ladder)': { tau: 2.5 },
  'Upper Bowmanville Creek': { tau: 2 }
};

function waterModelParams(section) {
  var s = String(section || '').split(',')[0].trim();
  var p;
  if (/mouth|harbour|estuary|marsh|pier/i.test(s)) p = { gw: 0.10, tau: 5 };
  else if (/lower-mid|middle|mid-/i.test(s))      p = { gw: 0.25, tau: 4 };
  else if (/lower/i.test(s))                       p = { gw: 0.15, tau: 5 };
  else if (/upper|headwater/i.test(s))             p = { gw: 0.40, tau: 3 };
  else                                             p = { gw: 0.25, tau: 4 };
  var o = WATER_MODEL_OVERRIDES[s];
  if (o) { if (o.gw != null) p.gw = o.gw; if (o.tau != null) p.tau = o.tau; }
  return p;
}

// series: daily mean air temperatures, oldest first, ending on the trip date.
function modelWaterTemp(series, p) {
  var vals = (series || []).filter(function(t){ return t != null && !isNaN(t); });
  if (vals.length < 7) return null;
  var k = 1 - Math.exp(-1 / p.tau);
  var a = vals.slice(0, 7).reduce(function(x, y){ return x + y; }, 0) / 7;  // warm start
  var w = null;
  vals.forEach(function(t) {
    a += (t - a) * k;
    // Equilibrium temperature of open water for this smoothed air temperature: near 0 in
    // winter, close to the air in spring and fall, flattening out in the mid 20s.
    var surf = 26 / (1 + Math.exp(0.18 * (WATER_CURVE_MID - a)));
    var target = p.gw * GROUNDWATER_C + (1 - p.gw) * surf;
    w = (w == null) ? target : Math.max(w - 1.5, Math.min(w + 1.5, target));
  });
  return Math.round(Math.max(0, w) * 10) / 10;
}

var SPECIES_SEASONS = {
  "Brown Trout": {
    latin: "Salmo trutta",
    type: "resident",
    // Resident year-round but feeding windows are seasonal
    windows: [
      { months: [3,4],   quality: "peak",    label: "Spring",   note: "Post-ice-off, active feeding. Best dry fly and nymph of the year." },
      { months: [5,5],   quality: "good",    label: "June",     note: "Good early season. Evenings best before summer heat." },
      { months: [6,7],   quality: "slow",    label: "Summer",   note: "Heat stress risk above 18\u00b0C. Early morning only. Consider C&R moratorium." },
      { months: [8,9],   quality: "peak",    label: "Fall",     note: "Feeding ramps up. Streamers and nymphs. Best streamer fishing of the year." },
      { months: [10,10], quality: "good",    label: "Late Fall", note: "Still active but slowing. Slow nymphing near bottom." },
      { months: [11,2],  quality: "slow",    label: "Winter",   note: "Lethargic. Very slow nymph on the bottom. Closed season most sections." }
    ]
  },
  "Rainbow Trout": {
    latin: "Oncorhynchus mykiss",
    type: "resident",
    windows: [
      { months: [3,5],   quality: "peak",    label: "Spring",     note: "Resident rainbow active post-steelhead season. Nymphs and emerging dries." },
      { months: [5,6],   quality: "good",    label: "Late Spring",note: "Good evening dry fly fishing. Find fish in riffles and runs." },
      { months: [6,7],   quality: "slow",    label: "Summer",     note: "Seek cold headwaters. Early morning essential above 18°C." },
      { months: [8,9],   quality: "good",    label: "Fall",       note: "Resident fish feeding hard pre-winter. Nymphs and streamers." },
      { months: [10,11], quality: "slow",    label: "Late Fall",  note: "Cooling water slows residents. Fish deep slow pools." },
      { months: [11,2],  quality: "slow",    label: "Winter",     note: "Very slow. Residents hold in deepest pools. Closed most sections." }
    ]
  },
  "Steelhead": {
    latin: "Oncorhynchus mykiss (anadromous)",
    type: "migratory",
    windows: [
      { months: [2,4],   quality: "peak",    label: "Spring Run",  note: "Peak spring steelhead run from Lake Ontario and Georgian Bay. Best of the year." },
      { months: [5,8],   quality: "absent",  label: "Lake",        note: "Steelhead have dropped back to the lake. Target resident rainbow instead." },
      { months: [9,10],  quality: "good",    label: "Fall Return", note: "Early steelhead begin entering rivers. Numbers build through October." },
      { months: [11,1],  quality: "good",    label: "Winter Run",  note: "Winter steelhead in larger rivers. Slow float with roe or beads. Hardy angling." }
    ]
  },
  "Brook Trout": {
    latin: "Salvelinus fontinalis",
    type: "resident",
    windows: [
      { months: [3,5],   quality: "peak",    label: "Spring",    note: "Best brook trout season. Post-ice-off feeding frenzy. Dry fly and small nymphs." },
      { months: [5,6],   quality: "good",    label: "Late Spring", note: "Still active. Small dry flies and midges in evenings." },
      { months: [7,8],   quality: "slow",    label: "Summer",    note: "Heat sensitive. Only cold spring-fed streams are productive. Early morning essential." },
      { months: [8,10],  quality: "peak",    label: "Fall",      note: "Fall spawning colours. Active feeding pre-spawn. Most beautiful time of year." },
      { months: [10,11], quality: "good",    label: "Spawn",     note: "Spawning activity. Handle with care. Some sections closed." },
      { months: [11,2],  quality: "slow",    label: "Winter",    note: "Cold water reduces activity. Closed season most sections." }
    ]
  },
  "Chinook Salmon": {
    latin: "Oncorhynchus tshawytscha",
    type: "migratory",
    windows: [
      { months: [0,6],   quality: "absent",  label: "In Lake",   note: "Chinook in Lake Ontario / Georgian Bay. Not accessible from rivers." },
      { months: [7,7],   quality: "slow",    label: "Harbour Mouth", note: "Early Chinook staging near harbour mouths in late July–August. A few enter rivers mid-August." },
      { months: [8,8],   quality: "good",    label: "Early Run", note: "Chinook entering rivers through September. Numbers building toward peak." },
      { months: [9,9],   quality: "peak",    label: "Peak Run",  note: "Peak Chinook run. Best of the year. Fish stacked in pools." },
      { months: [10,10], quality: "good",    label: "Late Run",  note: "Run tapering. Spawned-out fish. Still worth fishing early October." },
      { months: [11,11], quality: "slow",    label: "Post-Spawn", note: "Run over. Occasional late fish. Most have spawned out." }
    ]
  },
  "Coho Salmon": {
    latin: "Oncorhynchus kisutch",
    type: "migratory",
    windows: [
      { months: [0,8],   quality: "absent",  label: "In Lake",   note: "Coho in Lake Ontario. Not accessible from rivers." },
      { months: [9,9],   quality: "good",    label: "Early Run", note: "Coho enter rivers October. Bright fish, aggressive fighters." },
      { months: [10,10], quality: "peak",    label: "Peak Run",  note: "Peak Coho run. More willing to take flies and lures than Chinook." },
      { months: [11,11], quality: "good",    label: "Late Run",  note: "Late Coho still in system. Slowing but fish present." }
    ]
  }
};

function getCurrentSeason(speciesName, dateStr, section) {
  // Use trip date if provided, else today
  var now = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  var month = now.getMonth(); // 0-indexed
  var data = SPECIES_SEASONS[speciesName];
  if (!data) return null;
  var windows = data.windows;
  // Brown Trout below a barrier are lake-run fish with their own calendar. Section defaults
  // to the one being viewed; callers looking at another section pass it.
  if (speciesName === 'Brown Trout') {
    var sec = (section !== undefined) ? section : (typeof selectedRiver !== 'undefined' ? selectedRiver : null);
    if (sec && isLakeRunBrownSection(sec)) windows = lakeRunBrownWindows(sec);
  }
  // Find the window that contains current month
  for (var i = 0; i < windows.length; i++) {
    var w = windows[i];
    var start = w.months[0], end = w.months[1];
    if (start <= end) {
      if (month >= start && month <= end) return w;
    } else {
      // Wraps year (e.g. Nov-Feb)
      if (month >= start || month <= end) return w;
    }
  }
  return windows[0]; // fallback
}

// ── LIVE CONDITIONS SCORING ───────────────────────────────────────────────────
function liveConditionsScore(flow, sweetMin, sweetMax, flowLow, flowHigh, tempC, cloudPct) {
  var s = 0;
  // Flow
  if (flow != null) {
    if (flow >= sweetMin && flow <= sweetMax)         s += 5;  // in sweet spot
    else if (flow >= flowLow && flow <= flowHigh)     s += 0;  // fishable but not ideal
    else                                              s -= 4;  // blown or too low
  }
  // Temperature
  if (tempC != null) {
    if (tempC >= 8  && tempC <= 14)  s += 3;  // prime
    else if (tempC >= 4  && tempC < 8)  s += 1;
    else if (tempC > 14 && tempC <= 18) s += 1;
    else                                s -= 3;  // too cold or too warm
  }
  // Sky
  if (cloudPct != null) {
    if (cloudPct >= 60)  s += 2;  // overcast — ideal
    else if (cloudPct >= 30) s += 1;
    // clear = 0 bonus
  }
  return s;
}

function scoreToConfidence(score) {
  if (score >= 10) return { label: '\u2605\u2605\u2605', stars: 3, cls: 'conf-excellent', word: 'Excellent' };
  if (score >= 6)  return { label: '\u2605\u2605\u2606', stars: 2, cls: 'conf-good',      word: 'Good' };
  if (score >= 2)  return { label: '\u2605\u2606\u2606', stars: 1, cls: 'conf-marginal',  word: 'Marginal' };
  return              { label: '\u2606\u2606\u2606', stars: 0, cls: 'conf-tough',     word: 'Tough' };
}

// Live readings: Credit Valley Conservation, via the Worker's /water-temps.
var LIVE_WATER_STATIONS = {
  'Lower Credit River':  { station: 'Credit River at Mississaugua Golf and Country Club', place: 'Mississauga' },
  'Middle Credit River': { station: 'Credit River at Old Derry Road', place: 'Meadowvale' },
  'Upper Credit River':  { station: 'Credit River at Cataract Falls', place: 'Cataract' }
};

function salmonMethodMode(opts) {
  opts = opts || {};
  var speciesKey = opts.speciesKey || null;
  var fam        = opts.fam || '';
  var cfg        = opts.cfg || null;
  var staging    = !!opts.stagingModeActive;
  var blocked    = !!opts.migratoryBlocked;
  // section and dateStr: the app leaves them out (the viewed section and trip date); the Worker passes them.
  var section    = opts.section !== undefined ? opts.section : (typeof selectedRiver !== 'undefined' ? selectedRiver : null);
  var dateStr    = opts.dateStr || (typeof getTripDateStr === 'function' ? getTripDateStr() : null);

  var isSalmon = speciesKey === 'chinook' || speciesKey === 'coho';
  // Lake-run browns are fished like steelhead: roe bags drifted under a float (TJ).
  var isSteelhead = speciesKey === 'steelhead' ||
    (speciesKey === 'brown' && !!section && isLakeRunBrownSection(section));
  if (!isSalmon && !isSteelhead) return null;
  // The angler forced fly gear: respect their kit over our preference.
  if (fam === 'fly') return null;
  // Species can't physically reach this section, so we're recommending a fallback
  // species and the salmon method must not be applied to it.
  if (blocked) return null;
  // Artificial lures only: roe, beads and worms are illegal, so no float recommendation.
  if (cfg && cfg.artificialOnly) return null;
  // Steelhead and lake-run browns in a river are float-fishing fish. The staging-spoons
  // call is a salmon phase, so it only applies when the deciding species is a salmon.
  // Spinning picked: fish in the river still want a float and roe, which a spinning rod can
  // fish (TJ). Staging salmon stay on spoons, which is spinning gear already. When the lake
  // data is missing the staging model can't run, so spinning also stays on lures while the
  // calendar says the fish are at the mouth.
  if (fam === 'spin' && typeof mouthPreferenceFor === 'function') {
    var _nm = {chinook:'Chinook Salmon', coho:'Coho Salmon', steelhead:'Steelhead'}[speciesKey];
    if (_nm && mouthPreferenceFor(_nm, dateStr) > 0) return null;
  }
  if (isSteelhead) return fam === 'spin' ? 'spin-float' : 'float';
  if (staging) return 'spin';
  return fam === 'spin' ? 'spin-float' : 'float';
}


// Method names for the two migratory modes, shared by the Technique panel and the weekly email.
var SALMON_MODE_METHOD = {
  spin: 'Throwing spoons at the river mouth',
  float: 'Float Fishing · Roe & Beads'
};

// What to bring, from the method name. The hero says "Bring your <phrase>".
// Compound method names carry their own gear noun, so the generic branches below would
// stutter ("spinning gear and spinning · spoons & lures"). Handle them explicitly. Spinning
// takes either separator (the copy pass swapped the em dash for a middot).
// "Float rod" means different things to different anglers. Float fishing for salmon,
// steelhead and lake-run browns is done on a centrepin or a long spinning rod (TJ), so say so.
// spinFloat: Spin Fishing picked, so it's the spinning rod with float gear.
function bringPhraseFor(topMethod, spinFloat) {
  var methodPhrase = String(topMethod || '').toLowerCase();
  if (/^spinning\s*[—·]/i.test(topMethod)) return 'spinning gear with spoons & lures';
  if (spinFloat && /float/i.test(topMethod)) return 'spinning rod with float gear';
  if (/^float fishing\s*[—·]\s*roe/i.test(topMethod)) return 'centrepin or spinning rod with float gear';
  if (/nymphing|dry fly|streamer|midge/i.test(topMethod)) return 'fly rod and ' + methodPhrase + ' setup';
  if (/spinner|spoon|crankbait|jig|lure|plug/i.test(topMethod)) return 'spinning gear and ' + methodPhrase;
  if (/float/i.test(topMethod)) return 'centrepin or spinning rod with a float and bait';
  if (/bait|drift/i.test(topMethod)) return 'spinning rod with bait';
  return methodPhrase + ' gear';
}

// Staging read for a river mouth on a date: which fish are staging and how strongly (0 to 100).
// null when the section isn't a staging zone or nothing is active. lakeTemp may be null, in
// which case the monthly climatology stands in. Shared by the staging card and the weekly email.
function stagingRead(sectionName, dateStr, wantsSalmon, wantsSteelhead, lakeTemp, cloudPct, windDir, windSpd) {
  var zone = STAGING_ZONES[sectionName];
  if (!zone || (!wantsSalmon && !wantsSteelhead)) return null;
  var now = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
  var month = now.getMonth(), day = now.getDate();
  var groupKey = STAGING_GROUP[zone.key] || 'central';
  var mouthFaces = zone.lake === "Georgian Bay" ? 0 : 180;
  // Live satellite feed is unavailable: fall back to monthly climatology so the
  // staging score keeps its temperature input instead of silently dropping it.
  var tempIsEstimate = false;
  if (lakeTemp == null) {
    lakeTemp = seasonalLakeTempEst(zone.lake, now.getMonth());
    tempIsEstimate = true;
  }
  // Decide which fish story to tell. Prefer salmon in summer/fall, steelhead otherwise.
  var salmonPhase = wantsSalmon ? getSalmonPhase(groupKey, month, day) : {active:false};
  var steelPhase  = wantsSteelhead ? getSteelheadPhase(month, day, lakeTemp) : {active:false};
  // Choose the dominant active phase (higher intensity wins when both active)
  var which, phase, species;
  if (salmonPhase.active && (!steelPhase.active || salmonPhase.intensity >= steelPhase.intensity)) {
    which = 'salmon'; phase = salmonPhase; species = 'Salmon';
  } else if (steelPhase.active) {
    which = 'steelhead'; phase = steelPhase; species = 'Steelhead';
  } else {
    return null; // nothing active
  }
  var res = computeStagingScore(lakeTemp, windDir, windSpd, cloudPct, phase.intensity, mouthFaces, tempIsEstimate);
  return { zone: zone, groupKey: groupKey, lakeTemp: lakeTemp, tempIsEstimate: tempIsEstimate,
           salmonPhase: salmonPhase, steelPhase: steelPhase,
           which: which, phase: phase, species: species, res: res, pct: Math.round(res.score * 100) };
}

// Modelled water temperature on dateStr from daily mean air (hist: {time, mean}, 30 days back
// plus the forecast). With a live reading for today, the gap between it and the model fades over
// a few days. null when there isn't enough history. Shared by the app and the weekly email.
function waterTempFromHistory(section, hist, dateStr, todayStr, liveVal) {
  if (!hist) return null;
  var p = waterModelParams(String(section || '').split(',')[0].trim());
  var seriesTo = function(d) { var i = hist.time.indexOf(d); return i === -1 ? null : hist.mean.slice(0, i + 1); };
  var model = modelWaterTemp(seriesTo(dateStr), p);
  if (model == null) return null;
  if (liveVal != null && todayStr) {
    var mToday = modelWaterTemp(seriesTo(todayStr), p);
    var days = Math.round((new Date(dateStr + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000);
    if (mToday != null && days > 0) model = Math.round((model + (liveVal - mToday) * Math.exp(-days / 4)) * 10) / 10;
  }
  return model;
}


// The staging zone whose read applies to a section: the mouth of its river system. Migratory fish
// can only be reported for sections they can actually reach. The Upper Credit sits above the
// Norval dam, so salmon never get there, but the system-wide match would find the Credit staging
// zone and report a run on water that has no salmon in it. Gate on the section's own species
// list, which already encodes every barrier correctly. A section with no species list keeps the
// zone. Shared by the app (staging card) and the weekly email.
function stagingSectionFor(sectionName) {
  var base = String(sectionName || '').split(',')[0].trim();
  var zone = stagingZoneForSection(base);
  if (!zone) return null;
  var secCfg = RIVER_CONFIG[base];
  var secSpecies = (secCfg && secCfg.species) || [];
  var MIG = ['Chinook Salmon','Coho Salmon','Steelhead'];
  var hasMig = secSpecies.some(function(s){ return MIG.indexOf(s) !== -1; });
  if (!hasMig && secSpecies.length) return null;
  return zone;
}

// ── SHARED SCORE ────────────────────────────────────────────────────────────────
// Score for a section and its target species on a date, before drive time and live water:
// species present, season window, where the fish are (mouth or river) and legality.
// rankRivers adds drive time on top; conditionsScore adds the water. seasonSection is passed
// to getCurrentSeason (lake-run brown trout); the app leaves it out so the viewed section is used.
function sectionSeasonScore(sectionName, targetSpeciesNames, dateStr, seasonSection) {
  var cfg = getRiverConfig(sectionName);
  var score = 0;
  var notes = [];
  var warnings = [];
  targetSpeciesNames = targetSpeciesNames || [];
  var targetSpeciesName = targetSpeciesNames.length === 1 ? targetSpeciesNames[0] : null;

  // Species present?
  var hasSpecies=targetSpeciesNames.length===0||targetSpeciesNames.some(function(n){return cfg.species&&cfg.species.indexOf(n)!==-1;});
  if (!hasSpecies) { score -= 20; warnings.push(targetSpeciesName + ' not on this river'); }
  // Species in season?
  var _MIG = ['Chinook Salmon','Coho Salmon','Steelhead'];
  var _isMigTarget = targetSpeciesName && _MIG.indexOf(targetSpeciesName) !== -1;
  // Is this section the harbour/mouth where migratory fish stage?
  var _isMouthSection = (typeof STAGING_ZONES !== 'undefined') && !!STAGING_ZONES[sectionName];

  if (hasSpecies && targetSpeciesName) {
    var seasonal = getCurrentSeason(targetSpeciesName, dateStr, seasonSection);
    if (seasonal) {
      var _q = seasonal.quality;
      if (_q === 'peak')        { score += 10; notes.push('Peak season'); }
      else if (_q === 'good')   { score += 6;  notes.push('In season'); }
      else if (_q === 'absent') {
        if (_isMigTarget) { score -= 8; warnings.push('Staging in the lake, not in the river yet'); }
        else { score -= 15; warnings.push('Out of season'); }
      }
      else { score += 1; notes.push('Present but slow'); }

      // ── Where are the fish RIGHT NOW? ──────────────────────────────────
      // Season quality alone ranked a mid-river reach level with the harbour, because
      // both read "in season" in September. But early in the run most fish are still
      // stacked off the mouth, so the mouth is the better destination even though the
      // window says the run has started. The preference fades as the run builds and
      // disappears at peak, when fish really are spread through the river.
      // Gate on the window LABEL (mouthPreferenceFor), not stagingPlausibleFor(): that helper
      // only matches "Harbour Mouth"-style labels, so it reads false in September when the label
      // is "Early Run", which is exactly the case that sent people to Streetsville.
      if (_isMigTarget) {
        var _mouthBonus = mouthPreferenceFor(targetSpeciesName, dateStr);
        if (_mouthBonus) {
          if (_isMouthSection) {
            score += _mouthBonus;
            notes.push(_q === 'good' ? 'Fish still concentrated at the mouth' : 'Staging at the mouth');
          } else {
            score -= _mouthBonus;
            warnings.push(_q === 'good' ? 'Most fish still at the mouth' : 'Fish at the mouth, not this reach');
          }
        }
      }
    }
  } else if (!targetSpeciesName) {
    // No species filter: find the best in-season species
    var bestQuality = 'absent';
    var bestSpecies = null;
    (cfg.species || []).forEach(function(s) {
      var w = getCurrentSeason(s, dateStr, seasonSection);
      if (w) {
        if (w.quality === 'peak' && bestQuality !== 'peak') { bestQuality = 'peak'; bestSpecies = s; }
        else if (w.quality === 'good' && bestQuality !== 'peak') { bestQuality = 'good'; bestSpecies = s; }
        else if (w.quality === 'slow' && bestQuality === 'absent') { bestQuality = 'slow'; bestSpecies = s; }
      }
    });
    if (bestSpecies) {
      if (bestQuality === 'peak') { score += 10; notes.push(bestSpecies + ', peak'); }
      else if (bestQuality === 'good') { score += 6; notes.push(bestSpecies + ', in season'); }
      else { score += 2; }
    }
  }

  // Legally closed on this date. Outweighs everything above, including the species not
  // being here at all, so a closed reach never outranks open water nearby.
  if (seasonClosureFor(cfg, dateStr)) {
    score -= 30;
    warnings.unshift('Season closed on this reach');
  } else if (allAccessClosed(cfg, dateStr)) {
    score -= 30;
    warnings.unshift('Every access point on this reach is closed on this date');
  }
  return { score: score, notes: notes, warnings: warnings, cfg: cfg };
}

// Adds the water to a base score. While a run is on, the day is rated on run strength (lake
// temperature, wind at the mouth). River flow doesn't matter to fish still in the lake
// (fishInLake: staging, and you're at the mouth), but it does once they're in the river (TJ,
// 2026-10-23): flow outside the sweet spot caps the day at Marginal, and blown out or too low
// caps it at Tough, the same flow bands that rate a trout day.
var FLOW_CAP_MARGINAL = 5, FLOW_CAP_TOUGH = 1;
function conditionsScore(baseScore, cfg, flow, waterTemp, cloudPct, stagingPct, fishInLake) {
  if (stagingPct != null) {
    var s = stagingPct >= 65 ? 8 : stagingPct >= 40 ? 5 : 2;
    if (!fishInLake && cfg && flow != null) {
      if (flow < cfg.flowLow || flow > cfg.flowHigh) s = Math.min(s, FLOW_CAP_TOUGH);
      else if (flow < cfg.sweetMin || flow > cfg.sweetMax) s = Math.min(s, FLOW_CAP_MARGINAL);
    }
    return s;
  }
  if (cfg && flow != null) {
    return baseScore + liveConditionsScore(flow, cfg.sweetMin, cfg.sweetMax, cfg.flowLow, cfg.flowHigh, waterTemp, cloudPct);
  }
  return baseScore;
}

// One day on one section: what the weekly email scores. The app builds the same number from
// rankRivers (which adds drive time) and conditionsScore.
// o: {section, species: [names], date, flow, waterTemp, cloudPct, stagingPct, fishInLake}
function scoreDay(o) {
  var base = sectionSeasonScore(o.section, o.species || [], o.date, o.section);
  var closed = sectionClosedOn(base.cfg, o.date);
  var score = conditionsScore(base.score, base.cfg, o.flow, o.waterTemp, o.cloudPct, o.stagingPct, o.fishInLake);
  return { section: o.section, date: o.date, closed: closed, score: score,
           confidence: closed ? null : scoreToConfidence(score), notes: base.notes, warnings: base.warnings };
}

// Is the drive worth it? Combines the score with the drive time in minutes.
function driveVerdict(score, driveMin, closed) {
  if (closed) return { text: '✕ Closed on this date', cls: 'verdict-no' };
  if (score >= 10 && driveMin <= 60) return { text: '✓ Worth the drive', cls: 'verdict-yes' };
  if (score >= 6 && driveMin <= 90) return { text: '✓ Worth the drive', cls: 'verdict-yes' };
  if (score >= 6 && driveMin <= 150) return { text: '✓ Conditions good, but a long drive', cls: 'verdict-maybe' };
  if (score >= 2 && driveMin <= 60) return { text: '~ Marginal conditions. Short drive, your call', cls: 'verdict-maybe' };
  if (score < 2) return { text: '✕ Tough day. Consider staying local', cls: 'verdict-no' };
  return { text: '~ Long drive for current conditions', cls: 'verdict-maybe' };
}

// The Worker imports this file as a module, where the declarations above are not globals.
if (typeof globalThis !== 'undefined') {
  globalThis.HFF_CORE = {
    RIVER_SECTIONS: RIVER_SECTIONS, RIVER_CONFIG: RIVER_CONFIG, RIVER_REGS: RIVER_REGS, ACCESS_COORDS: ACCESS_COORDS,
    SPECIES_SEASONS: SPECIES_SEASONS, STAGING_ZONES: STAGING_ZONES, STAGING_GROUP: STAGING_GROUP, UPSTREAM_OF: UPSTREAM_OF,
    secDisplay: secDisplay, secLabel: secLabel, secShort: secShort,
    getRiverConfig: getRiverConfig, getRiverRegs: getRiverRegs, getCurrentSeason: getCurrentSeason,
    seasonClosureFor: seasonClosureFor, accessClosureOn: accessClosureOn, isAccessOpen: isAccessOpen,
    allAccessClosed: allAccessClosed, sectionClosedOn: sectionClosedOn, speciesFishableIn: speciesFishableIn,
    furthestUpstreamOpen: furthestUpstreamOpen, bestAccessSpot: bestAccessSpot, isLakeRunBrownSection: isLakeRunBrownSection,
    stagingZoneForSection: stagingZoneForSection, computeStagingScore: computeStagingScore, seasonalLakeTempEst: seasonalLakeTempEst,
    getSalmonPhase: getSalmonPhase, getSteelheadPhase: getSteelheadPhase, mouthPreferenceFor: mouthPreferenceFor,
    clsFlow: clsFlow, clsTemp: clsTemp, clsSky: clsSky, waterModelParams: waterModelParams, modelWaterTemp: modelWaterTemp,
    liveConditionsScore: liveConditionsScore, scoreToConfidence: scoreToConfidence,
    LIVE_WATER_STATIONS: LIVE_WATER_STATIONS, salmonMethodMode: salmonMethodMode, SALMON_MODE_METHOD: SALMON_MODE_METHOD,
    stagingSectionFor: stagingSectionFor, bringPhraseFor: bringPhraseFor, stagingRead: stagingRead, waterTempFromHistory: waterTempFromHistory,
    regsRowMatches: regsRowMatches, upstreamWindowOn: upstreamWindowOn,
    sectionSeasonScore: sectionSeasonScore, conditionsScore: conditionsScore, scoreDay: scoreDay, driveVerdict: driveVerdict
  };
}
