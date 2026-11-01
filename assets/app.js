// The query string as the page was opened (the app clears it later; the home-screen hint reads this).
var _initialSearch = location.search;


// ── STREAMCAST PROXY WORKER ─────────────────────────────────────────────────
// Set this to your deployed Worker URL after running: npx wrangler deploy
// Example: "https://streamcast-proxy.YOUR-SUBDOMAIN.workers.dev"
// Leave as null to use direct EC API calls (works on pages.dev, may CORS on localhost)
var RIVER_STOCKING = {"Credit River": [{"species": "Brook Trout", "year": 2025, "stage": "Yearlings", "quantity": 3975, "qtyStr": "4k", "primeYear": 2026, "status": "now", "label": "Prime this season"}, {"species": "Coho Salmon", "year": 2024, "stage": "Fingerlings", "quantity": 45000, "qtyStr": "45k", "primeYear": 2026, "status": "now", "label": "Fall 2026 run"}, {"species": "Rainbow Trout", "year": 2025, "stage": "Yearlings", "quantity": 193759, "qtyStr": "194k", "primeYear": 2026, "status": "now", "label": "Spring 2026 run"}, {"species": "Chinook Salmon", "year": 2025, "stage": "Fingerlings", "quantity": 120018, "qtyStr": "120k", "primeYear": 2028, "status": "future", "label": "Fall 2028 run"}, {"species": "Brown Trout", "year": 2017, "stage": "Yearlings", "quantity": 1100, "qtyStr": "1k", "primeYear": 2018, "status": "past", "label": "Class of 2017, established fish"}], "Grand River": [{"species": "Brook Trout", "year": 2025, "stage": "Yearlings", "quantity": 272, "qtyStr": "272", "primeYear": 2026, "status": "now", "label": "Prime this season"}, {"species": "Rainbow Trout", "year": 2025, "stage": "Yearlings", "quantity": 300, "qtyStr": "300", "primeYear": 2026, "status": "now", "label": "Spring 2026 run"}, {"species": "Brown Trout", "year": 2025, "stage": "Adult", "quantity": 6, "qtyStr": "6", "primeYear": 2025, "status": "past", "label": "Class of 2025, established fish"}], "Humber River": [{"species": "Chinook Salmon", "year": 2025, "stage": "Fingerlings", "quantity": 30135, "qtyStr": "30k", "primeYear": 2028, "status": "future", "label": "Fall 2028 run"}, {"species": "Brook Trout", "year": 2023, "stage": "Yearlings", "quantity": 5603, "qtyStr": "6k", "primeYear": 2024, "status": "past", "label": "Class of 2023, established fish"}, {"species": "Brown Trout", "year": 2025, "stage": "Adult", "quantity": 302, "qtyStr": "302", "primeYear": 2025, "status": "past", "label": "Class of 2025, established fish"}], "Bronte Creek": [{"species": "Rainbow Trout", "year": 2025, "stage": "Yearlings", "quantity": 54474, "qtyStr": "54k", "primeYear": 2026, "status": "now", "label": "Spring 2026 run"}, {"species": "Chinook Salmon", "year": 2025, "stage": "Fingerlings", "quantity": 80047, "qtyStr": "80k", "primeYear": 2028, "status": "future", "label": "Fall 2028 run"}], "Rouge River": [{"species": "Rainbow Trout", "year": 2024, "stage": "Fingerlings", "quantity": 16000, "qtyStr": "16k", "primeYear": 2026, "status": "now", "label": "Spring 2026 run"}], "Beaver River": [{"species": "Brook Trout", "year": 2025, "stage": "Yearlings", "quantity": 1200, "qtyStr": "1k", "primeYear": 2026, "status": "now", "label": "Prime this season"}], "Saugeen River": [{"species": "Brown Trout", "year": 2025, "stage": "Adult", "quantity": 50, "qtyStr": "50", "primeYear": 2025, "status": "past", "label": "Class of 2025, established fish"}], "Bowmanville Creek": [{"species": "Chinook Salmon", "year": 2025, "stage": "Fingerlings", "quantity": 31261, "qtyStr": "31k", "primeYear": 2028, "status": "future", "label": "Fall 2028 run"}, {"species": "Brown Trout", "year": 2023, "stage": "Fingerlings", "quantity": 40000, "qtyStr": "40k", "primeYear": 2025, "status": "past", "label": "Class of 2023, established fish"}]};

var DEFAULT_RIVERS = [
  { name:'Upper Credit River', gauge:'02HB001', sweetMin:1.4, sweetMax:2.8, lat:43.870,lng:-80.010 },
  { name:'Upper Grand River (Tailwater)', gauge:'02GA016', sweetMin:8, sweetMax:12, lat:43.703,lng:-80.274 },
  { name:'Lower Humber River', gauge:'02HC025', sweetMin:3,  sweetMax:12, lat:43.640,lng:-79.480 },
  { name:'Bronte Creek',       gauge:'02HB022', sweetMin:2,  sweetMax:8,  lat:43.51, lng:-79.82 },
  { name:'Duffins Creek',      gauge:'02HC019', sweetMin:2,  sweetMax:10, lat:43.87, lng:-79.12 },
  { name:'Ganaraska River',    gauge:'02HD012', sweetMin:2,  sweetMax:12, lat:43.95, lng:-78.30 }];

// ── ANALYTICS HELPER ───────────────────────────────────────────────────────
// Provider-agnostic on purpose. Every call site uses track(name, props); swapping
// analytics vendors again should mean editing only this function and the script tag
// in <head>, not the six call sites scattered through the app.
//
// Umami takes a flat data object: umami.track(name, data)
// Plausible took a nested one:   plausible(name, { props: data })
// Both are handled so nothing breaks while the website ID is being set up.
function track(event, props) {
  var data = props || {};
  try {
    if (typeof umami !== "undefined" && umami && typeof umami.track === "function") {
      umami.track(event, data);
      return;
    }
    if (typeof plausible === "function") {
      plausible(event, { props: data });
      return;
    }
  } catch (e) {
    // Analytics must never break the app. Swallow and carry on.
  }
}
// Analytics funnel (Umami):
//   page view -> River Viewed (results shown) -> engagement (Regs Details Opened, Gauge Link
//   Clicked, Full Regs Clicked) -> Navigate Clicked (the angler is heading out).
//   Side path: Notify Bar Shown -> Email Signup | Email Signup Failed | Notify Bar Dismissed.
// Every results render goes through trackRiverViewed(), so this is the one place the
// "results shown" event fires. Callers set window._viewSource first.
var _lastViewKey = '';
function trackRiverViewed() {
  try {
    var river = selectedRiver ? selectedRiver.split(',')[0].trim() : 'unknown';
    var species = (selectedSpecies && selectedSpecies.length) ? selectedSpecies.join(',') : 'any';
    var td = document.getElementById('trip-date');
    var ds = td && td.value ? td.value : '';
    var day = 'today';
    if (ds) {
      var n = new Date(), t = n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
      var diff = Math.round((new Date(ds + 'T12:00:00') - new Date(t + 'T12:00:00')) / 86400000);
      day = diff <= 0 ? 'today' : diff === 1 ? 'tomorrow' : 'later';
    }
    var key = river + '|' + species + '|' + ds;
    if (key === _lastViewKey) return;          // a re-render of the same view, not a new view
    _lastViewKey = key;
    track('River Viewed', { river: river, species: species, source: window._viewSource || 'search', day: day });
    window._viewSource = null;
  } catch (e) {}
}

// Clicks that show intent, wired once at the document so cards rendered later are covered.
document.addEventListener('click', function(e) {
  try {
    var el = e.target.closest && e.target.closest('a, button');
    if (!el) return;
    var river = (typeof selectedRiver !== 'undefined' && selectedRiver) ? selectedRiver.split(',')[0].trim() : 'unknown';
    var href = el.getAttribute('href') || '';
    if (/maps\.google\.com/.test(href)) {
      track('Navigate Clicked', { river: river, spot: (el.textContent || '').replace(/^\W*Navigate to\s*/, '').trim() });
    } else if (el.closest('#flow-gauge-link') || /wateroffice\.ec\.gc\.ca/.test(href)) {
      track('Gauge Link Clicked', { river: river });
    } else if (el.classList.contains('regs-link')) {
      track('Full Regs Clicked', { river: river });
    } else if (el.classList.contains('regs-details-toggle')) {
      // The inline handler has already run, so the label shows the new state.
      if (/\u2212/.test(el.textContent)) track('Regs Details Opened', { river: river });
    } else if (el.classList.contains('gcard') || el.classList.contains('gmini')) {
      track('Guide Card Clicked', { url: href, slot: el.classList.contains('gmini') ? 'list' : 'card' });
    }
  } catch (err) {}
}, false); // bubble phase, so inline handlers (the regs toggle) have already run
// ── END ANALYTICS HELPER ────────────────────────────────────────────────────


// ── BEST SECTION FOR SPECIES ──────────────────────────────────────────────────
// Picking a section is the judgement the app should be making, not the user. Someone who
// already knows the salmon are in the Lower Credit doesn't need us; the person who knows
// "Credit River" and "salmon" is exactly who we're for — and asking them to choose was
// how they ended up on the Upper Credit, above a dam salmon can't pass.
//
// Migratory fish: take the LOWEST section that lists the species. Barriers and staging
// zones make this close to deterministic.
// Resident trout: take the section with the best odds of actually connecting, which on a
// mixed river means going UP, away from the migratory-dominated lower reaches. Brown Trout
// on the Credit should send you to the Forks, not to Port Credit.
var _MIGRATORY_SPECIES = ['Chinook Salmon','Coho Salmon','Steelhead'];
// Rivers that get run alerts (notify bar, see initNotifyBar). Defined up here because the deep-link
// handler opens the notify bar while the file is still loading. Same list as RUN_RIVERS in worker.js.
var RUN_ALERT_RIVERS = ['Beaver River','Black Creek','Bowmanville Creek','Bronte Creek','Credit River','Don River','Duffins Creek',
  'Ganaraska River','Grand River','Humber River','Nottawasaga River','Rouge River','Saugeen River',
  'Sixteen Mile Creek','Wilmot Creek'];
// When true, selectedRiver was chosen by us and should be re-resolved whenever the
// species changes — otherwise picking a species after a river would leave a stale section.
var selectedRiverIsAuto = false;
var selectedRiverParent = null;

function resolveAutoSection(riverName) {
  var sections = RIVER_SECTIONS[riverName] || [];
  var sp = (typeof selectedSpecies !== 'undefined' && selectedSpecies.length) ? selectedSpecies[0] : null;
  var best = sp ? bestSectionForSpecies(riverName, sp) : null;
  // When the run is in the river (from Oct 1, and from the trout opener to May 31), the pick
  // moves to the furthest reach upstream that is open on the trip date (TJ's rule). Same check as the hero's
  // upstream pass, so the two never disagree.
  if (best) {
    var _keyName = {steelhead:'Steelhead', chinook:'Chinook Salmon', coho:'Coho Salmon'};
    var _mig = selectedSpecies.map(function(k){ return _keyName[k]; }).filter(Boolean);
    if (_mig.length && _MIGRATORY_SPECIES.indexOf(_keyName[sp]) !== -1) {
      var _up = furthestUpstreamOpen(best, _mig, getTripDateStr());
      if (_up) best = _up.section;
    }
  }
  if (!best && !sp) best = autoSectionNoSpecies(riverName);
  // Species absent from every section: never land on a closed reach when an open one exists.
  if (!best) {
    var _t = getTripDateStr();
    best = sections.filter(function(s){ return !sectionClosedOn(getRiverConfig(s), _t); })[0] || null;
  }
  return best || sections[0] || null;
}

// "Best for species" with no species picked: take the species with the best season on the
// trip date that is fishable on some reach of this river, and that species' best reach.
// This used to return the first section in the list (the Upper Credit, closed after Sep 30)
// without checking it was open.
function autoSectionNoSpecies(riverName) {
  var sections = RIVER_SECTIONS[riverName] || [];
  var trip = getTripDateStr();
  var keyOf = {'Brown Trout':'brown','Rainbow Trout':'rainbow','Brook Trout':'brook',
               'Steelhead':'steelhead','Chinook Salmon':'chinook','Coho Salmon':'coho'};
  var names = [];
  sections.forEach(function(s){
    var c = RIVER_CONFIG[s];
    ((c && c.species) || []).forEach(function(n){ if (keyOf[n] && names.indexOf(n) === -1) names.push(n); });
  });
  var pick = null, pickScore = -1;
  names.forEach(function(n){
    var sec = bestSectionForSpecies(riverName, keyOf[n]);
    if (!sec || !speciesFishableIn(sec, n, trip)) return;
    var q = (getCurrentSeason(n, trip, sec) || {}).quality;
    var score = (q === 'peak' ? 2 : 1) * 10 + (_MIGRATORY_SPECIES.indexOf(n) !== -1 ? 1 : 0);
    if (score > pickScore) { pickScore = score; pick = {sec: sec, name: n}; }
  });
  if (!pick) return null;
  if (_MIGRATORY_SPECIES.indexOf(pick.name) !== -1) {
    var up = furthestUpstreamOpen(pick.sec, [pick.name], trip);
    if (up) return up.section;
  }
  return pick.sec;
}


// Keep the auto chip accurate about which reach it picked.
function updateAutoChipSub() {
  var el = document.getElementById('rc-auto-sub');
  if (!el) return;
  if (!selectedRiverIsAuto || !selectedRiver) { el.textContent = 'We\u2019ll pick the reach'; return; }
  var label = selectedRiver.indexOf(' \u2014 ') !== -1
    ? secShort(selectedRiver)
    : selectedRiver.replace(/ River$| Creek$/, '');
  el.textContent = label;
}

// Called when the species selection changes so an auto-picked section follows suit.
function refreshAutoSection() {
  if (!selectedRiverIsAuto || !selectedRiverParent) return;
  var next = resolveAutoSection(selectedRiverParent);
  if (next && next !== selectedRiver) {
    selectedRiver = next;
    try { setResHeader(selectedRiver); } catch(_e) {}
  }
  updateAutoChipSub();
}

function bestSectionForSpecies(riverName, speciesKey) {
  var sections = RIVER_SECTIONS[riverName];
  if (!sections || !sections.length) return null;
  var spMap = {brown:'Brown Trout', rainbow:'Rainbow Trout', brook:'Brook Trout',
               steelhead:'Steelhead', chinook:'Chinook Salmon', coho:'Coho Salmon'};
  var want = spMap[speciesKey];
  if (!want) return sections[0];

  // Only consider sections that actually list the species and have a real config.
  var candidates = sections.filter(function(s){
    var cfg = RIVER_CONFIG[s];
    return cfg && cfg.species && cfg.species.indexOf(want) !== -1;
  });
  if (!candidates.length) return null;   // species not present anywhere on this river
  // Never pick a reach where the species can't be fished on the trip date when another reach
  // can (the Upper Credit for browns in October). If none can, keep them all and let the
  // hero explain the closure.
  var _trip = getTripDateStr();
  var _open = candidates.filter(function(s){ return speciesFishableIn(s, want, _trip); });
  if (_open.length) candidates = _open;

  // Rank by position in the system. Lower numbers are further downstream.
  function reach(s) {
    if (/mouth|harbour|estuary|marsh|pier/i.test(s)) return 0;
    if (/lower-mid/i.test(s)) return 2;
    if (/lower/i.test(s))     return 1;
    if (/middle|mid-section|mid-/i.test(s)) return 3;
    if (/upper|headwater/i.test(s)) return 4;
    return 2;
  }
  var isMigratory = _MIGRATORY_SPECIES.indexOf(want) !== -1;
  candidates.sort(function(a,b){
    return isMigratory ? reach(a) - reach(b) : reach(b) - reach(a);
  });
  return candidates[0];
}

// ── EXPERT MODE ───────────────────────────────────────────────────────────────
function initExpertMode() {
  var sel = document.getElementById('expert-river-select');
  if (sel && !sel._wired) {
    // Populate options
    if (sel.options.length <= 1) { sel.add(new Option('Beaver River','Beaver River'));sel.add(new Option('Black Creek','Black Creek'));sel.add(new Option('Bowmanville Creek','Bowmanville Creek'));sel.add(new Option('Bronte Creek','Bronte Creek'));sel.add(new Option('Credit River','Credit River'));sel.add(new Option('Don River','Don River'));sel.add(new Option('Duffins Creek','Duffins Creek'));sel.add(new Option('Eramosa River','Eramosa River'));sel.add(new Option('Ganaraska River','Ganaraska River'));sel.add(new Option('Grand River','Grand River'));sel.add(new Option('Humber River','Humber River'));sel.add(new Option('Nottawasaga River','Nottawasaga River'));sel.add(new Option('Rouge River','Rouge River'));sel.add(new Option('Saugeen River','Saugeen River'));sel.add(new Option('Sixteen Mile Creek','Sixteen Mile Creek'));sel.add(new Option('Speed River','Speed River'));sel.add(new Option('Wilmot Creek','Wilmot Creek')); }
    sel._wired = true;
    sel.addEventListener('change', function() {
      var river = this.value;
      var secPicker = document.getElementById('river-section-picker');
      var chips = document.getElementById('river-chips');
      if (!river || !RIVER_SECTIONS[river]) { secPicker.style.display='none'; selectedRiver=null; return; }
      var sections = RIVER_SECTIONS[river];
      if (sections.length === 1) {
        selectedRiver = sections[0];
        setResHeader(selectedRiver);
        secPicker.style.display = 'none'; return;
      }
      // "Best for species" leads and is selected by default. Specific reaches stay
      // available for anglers who want a particular stretch — we make the call, we don't
      // take the choice away.
      var autoChip = '<div class="river-chip active rc-auto" data-rname="__auto__">' +
                     '<div class="rc-name">Best for species</div>' +
                     '<div class="rc-sub" id="rc-auto-sub">We\u2019ll pick the reach</div></div>';
      chips.innerHTML = autoChip + sections.map(function(s) {
        var label = secShort(s);
        return '<div class="river-chip" data-rname="'+s+'">' +
               '<div class="rc-name">'+label+'</div></div>';
      }).join('');
      chips.querySelectorAll('.river-chip').forEach(function(el) {
        el.addEventListener('click', function() {
          chips.querySelectorAll('.river-chip').forEach(function(c){c.classList.remove('active');});
          this.classList.add('active');
          var v = this.getAttribute('data-rname');
          if (v === '__auto__') {
            selectedRiverIsAuto = true;
            selectedRiverParent = river;
            selectedRiver = resolveAutoSection(river);
          } else {
            selectedRiverIsAuto = false;
            selectedRiverParent = null;
            selectedRiver = v;
          }
          setResHeader(selectedRiver);
        });
      });
      selectedRiverIsAuto = true;
      selectedRiverParent = river;
      selectedRiver = resolveAutoSection(river);
      setResHeader(selectedRiver);
      updateAutoChipSub();
      secPicker.style.display = 'block';
    });
  }
  var tiles = document.querySelectorAll('#expert-method-tiles .tech-family-btn');
  tiles.forEach(function(tile) {
    if (tile._wired) return; tile._wired = true;
    tile.addEventListener('click', function() {
      tiles.forEach(function(t){t.classList.remove('active');}); this.classList.add('active');
    });
  });
}
function getExpertMethod() {
  var a = document.querySelector('#expert-method-tiles .tech-family-btn.active');
  return a ? (a.getAttribute('data-value') || 'any') : 'any';
}
// ── END EXPERT MODE ───────────────────────────────────────────────────────────








// Fetch cached lake temps from worker (daily ERDDAP/GLSEA cache); graceful fallback
var _lakeTempCache = null;
function fetchLakeTemps() {
  if (_lakeTempCache !== null) return Promise.resolve(_lakeTempCache);
  return fetch(PROXY_URL + "/lake-temps")
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ _lakeTempCache = (d && d.temps) ? d.temps : (d || {}); return _lakeTempCache; })
    .catch(function(){ _lakeTempCache = {}; return _lakeTempCache; });
}

// ── STAGING HELPERS (shared by river picker, access filter, bestSpot, technique) ──
// Staging is "plausible" when the species' CURRENT season window describes harbour/mouth
// activity — e.g. Chinook in August = "Harbour Mouth". July = "In Lake" (nothing staging yet),
// September = "Early Run" (fish are in the river, normal access points apply).









// Trout and salmon season for every reach of the selected river, from the same season
// bands and closure checks that decide recommendations. The regs panel used to show only
// the river-wide row ("Open all year (lower reach)"), which never said that other
// reaches of the same river close on September 30.
var SEASON_BAND_TEXT = {
  'all-year': 'open all year',
  'extended': 'open from the fourth Saturday in April to December 31',
  'standard': 'open from the fourth Saturday in April to September 30'
};
function reachSeasons(sectionName, dateStr) {
  var base = String(sectionName || '').split(',')[0].trim();
  var list = null;
  Object.keys(RIVER_SECTIONS).forEach(function(parent) {
    if (!list && RIVER_SECTIONS[parent].indexOf(base) !== -1) list = RIVER_SECTIONS[parent];
  });
  if (!list) list = [base];
  return list.map(function(name) {
    var cfg = (typeof getRiverConfig === 'function') ? getRiverConfig(name) : RIVER_CONFIG[name];
    var band = (cfg && cfg.season) || 'standard';
    var closure = dateStr ? seasonClosureFor(cfg, dateStr) : null;
    var allShut = !closure && dateStr ? allAccessClosed(cfg, dateStr) : false;
    var someShut = !closure && !allShut && dateStr && cfg && cfg.access
      ? cfg.access.some(function(a){ return !isAccessOpen(a, dateStr); }) : false;
    var status, why = '';
    if (closure) {
      status = 'closed';
      var d = new Date(dateStr + 'T12:00:00');
      why = (d.getMonth() >= 8) ? (band === 'extended' ? 'season ended December 31' : 'season ended September 30')
                                : 'opens the fourth Saturday in April';
    } else if (allShut) { status = 'closed'; why = 'every access point we list is closed on this date'; }
    else { status = 'open'; if (someShut) why = 'some access points are closed on this date'; }
    return {
      name: name,
      label: secShort(name),
      band: band, bandText: SEASON_BAND_TEXT[band] || SEASON_BAND_TEXT.standard,
      status: status, why: why, here: name === base
    };
  });
}

// How strongly should we steer people to the river MOUTH right now?
// Returns 8/6/3/0. Keyed on the season window LABEL, because quality alone cannot tell
// "Early Run" (fish still stacked at the mouth) from "Late Run" (fish spread through the
// river) — both are quality 'good'. stagingPlausibleFor() is deliberately not used: it
// only matches harbour-style labels and reads false all through September.
// Prefer the RESOLVED phase over the month window. SPECIES_SEASONS labels all of
// September "Early Run", but the staging model reads Sep 30 as Peak Run — fish are in the
// river. Trusting the calendar there sent people to the harbour while the technique panel
// correctly said to float-fish the pools.
function shouldPointAtMouth(speciesName, dateStr) {
  if (_stagingPhaseResolved) return _stagingModeActive;
  return mouthPreferenceFor(speciesName, dateStr) > 0;
}





// Rewrite the Technique & Gear panel for staging fish. Staging salmon are in the LAKE,
// not the river — fly/nymph recommendations are wrong here regardless of river flow or
// clarity. Called from both the headline override path and the staging-card path so the
// two can never disagree with each other.
var _stagingTechApplied = false;
// Set as soon as the staging phase is known. renderResults now awaits the staging read
// before rendering anything, so this is settled by the time updateMethods and buildTopPick
// run — one ordering rather than a race between them.
var _stagingModeActive = false;
// True once the staging card has actually computed a phase for this render. Until then,
// consumers must fall back to the month-window heuristic; afterwards the resolved phase
// is authoritative because it accounts for lake temperature, not just the calendar.
var _stagingPhaseResolved = false;
function applyStagingTechniqueOverride() {
  // Spoons at the mouth are for staging fish. If the angler picked only non-migratory species
  // (e.g. Brown Trout in August), the Technique panel stays on their species. Both callers
  // go through here, so neither can skip this.
  var _selST = (typeof selectedSpecies !== 'undefined' && selectedSpecies) ? selectedSpecies : [];
  if (_selST.length && !_selST.some(function(k){ return k === 'chinook' || k === 'coho' || k === 'steelhead'; })) return;
  var _cfgST = (typeof getRiverConfig === 'function') ? getRiverConfig(selectedRiver) : null;
  renderTechniquePillars({
    name: 'Throwing spoons at the river mouth',
    desc: 'Fish aren’t in the river yet. They’re staging out front, so cast from the pier, beach or river mouth, fan casting and varying your retrieve depth.',
    chips: ['Best: Dawn / dusk', 'From pier or beach', 'Overcast opens the day'],
    subtitle: 'Staging fish are in the lake, so spinning gear from shore is the method.',
    gearMethod: 'Spinning · Spoons & Lures',
    gearFam: 'spin',
    conditions: {cold:false, high:false, low:true},
    baitMethod: 'Little Cleo staging harbour',
    shownSpecies: window._shownSpeciesName || null,
    cfg: _cfgST
  });
  try { updateConditionsSubtitle(null, true); } catch(_csErr) {}
  _stagingTechApplied = true;
}

// Render the Lake Staging card for a mouth section during the staging window
// The River Conditions subtitle used to be hardcoded to "whether browns are feeding",
// which is wrong for every other target and actively misleading during staging — when the
// fish are still in the lake, in-river flow is not what decides the day.
function updateConditionsSubtitle(speciesName, isStaging) {
  var el = document.getElementById('cond-subtitle');
  if (!el) return;
  if (isStaging) {
    el.textContent = 'Lake temperature, wind and sky decide staging. River flow matters once fish push in, so watch it for the first rise.';
    return;
  }
  var _plural = {
    'Brown Trout':'browns', 'Rainbow Trout':'rainbows', 'Brook Trout':'brookies',
    'Steelhead':'steelhead', 'Chinook Salmon':'chinook', 'Coho Salmon':'coho'
  };
  var who = (speciesName && _plural[speciesName]) || 'fish';
  el.textContent = 'Flow, water temperature and sky. These three decide whether ' + who + ' are feeding.';
}

function renderStagingCard(sectionName, weather) {
  var container = document.getElementById("staging-card-slot");
  if (container) container.innerHTML = "";  // clear any prior card
  window._stagingPct = null; // reset — only set again below if a staging card actually renders
  window._stagingInLake = false; // fish staging and the angler at the mouth: river flow doesn't rate the day
  _stagingModeActive = false; // recomputed below; must not leak from the previous river
  _stagingPhaseResolved = false;
  window._salmonInRiver = false;
  window._stagingElsewhere = null;
  var zone = STAGING_ZONES[sectionName];
  if (!zone || !container) return Promise.resolve();

  var _di = document.getElementById("trip-date");
  var now = (_di && _di.value) ? new Date(_di.value + "T12:00:00") : new Date();
  var month = now.getMonth(), day = now.getDate();

  // What species is the user targeting?
  var _spLbl = (typeof selectedSpeciesLabel !== "undefined" && selectedSpeciesLabel) ? selectedSpeciesLabel : "";
  var _isAny = (!_spLbl || _spLbl === "Any Species");
  var wantsSalmon    = _isAny || /Chinook|Coho/i.test(_spLbl);
  var wantsSteelhead = _isAny || /Steelhead/i.test(_spLbl);
  if (!wantsSalmon && !wantsSteelhead) return Promise.resolve();

  return fetchLakeTemps().then(function(temps){
    var cloudPct = weather && weather.cloudPct != null ? weather.cloudPct : null;
    var windDir  = weather && weather.windDir  != null ? weather.windDir  : null;
    var windSpd  = weather && weather.windSpeed!= null ? weather.windSpeed : null;
    // Phase, lake temperature and strength: stagingRead() in conditions-core.js, shared with the weekly email.
    var _dateStr = (_di && _di.value) ? _di.value : null;
    var st = stagingRead(sectionName, _dateStr, wantsSalmon, wantsSteelhead,
      (temps && temps[zone.key] != null) ? temps[zone.key] : null, cloudPct, windDir, windSpd);
    if (!st) return; // nothing active, no card
    var lakeTemp = st.lakeTemp, _tempIsEstimate = st.tempIsEstimate;
    var which = st.which, phase = st.phase, species = st.species;
    var res = st.res, pct = st.pct;
    window._stagingPct = pct; // expose for drive-time verdict — staging strength, not trout live-conditions score
    // Re-render the confidence pill, drive-time verdict, AND headline now that staging strength
    // is known — buildTopPick already ran synchronously before this promise resolved.
    (function(){
      // Staging strength, with the same flow cap as the pill once the fish are in the river
      var _cfgRe = getRiverConfig(selectedRiver);
      var _reRate = window._pillFlow != null
        ? { score: conditionsScore(null, _cfgRe, window._pillFlow, null, null, pct, window._stagingInLake), potential: false }
        : rateWithFlowEstimate(function(f){ return conditionsScore(null, _cfgRe, f, null, null, pct, window._stagingInLake); }, window._flowEst);
      var _newScore = _reRate.score;

      // Headline: if this was a slow-season salmon target and staging turned out Fair/Strong,
      // rewrite the headline to point at the staging opportunity instead of the stale "slow" copy.
      if (pct >= 40 && (which === 'salmon')) {
        var _hEl = document.getElementById('tp-headline');
        var _tgtSp = (typeof selectedSpeciesLabel !== 'undefined') ? selectedSpeciesLabel : null;
        var _isSalmonTgt = _tgtSp === 'Chinook Salmon' || _tgtSp === 'Coho Salmon';
        // A legal-season redirect already names where to go; staging strength doesn't change that.
        if (_hEl && _isSalmonTgt && !_hEl.querySelector('[data-goto-section]')) {
          var _isAtMouthNow = selectedRiver && STAGING_ZONES[selectedRiver];
          if (!_isAtMouthNow) {
            var _curName = selectedRiver ? selectedRiver.split(',')[0].split(' \u2014 ')[0].trim() : '';
            var _coreN = riverSystemName(_curName);
            var _sysSec = null;
            Object.keys(STAGING_ZONES).forEach(function(z){ if (!_sysSec && _coreN && z.indexOf(_coreN) !== -1) _sysSec = z; });
            if (_sysSec) {
              _hEl.innerHTML = '<em>' + _tgtSp + '</em> are starting to push in. See the staging report below. '
                + 'Best water is the <em>' + secLabel(_sysSec) + '</em>.';
            }
          }
        }
      }

      // Staging strength rates the lake, not legality. Leave a closed section's pill and verdict alone.
      if (sectionClosedOn(getRiverConfig(selectedRiver), getTripDateStr())) return;
      var _confEl2 = document.getElementById('tp-confidence');
      if (_confEl2) {
        var _conf2 = scoreToConfidence(_newScore);
        _confEl2.textContent = 'Conditions: ' + confidenceWord(_conf2, _reRate.potential);
        _confEl2.className = 'tp-confidence ' + _conf2.cls;
      }

      var _driveEl2 = document.getElementById('tp-drive-time');
      if (_driveEl2) {
        var _verdictEl = _driveEl2.querySelector('.drive-verdict');
        if (_verdictEl) {
          // Re-derive drive time from the same element's existing text — parse isn't reliable,
          // so just recompute the class/label using the known distance already rendered.
          var _dtMatch = _driveEl2.textContent.match(/(\d+)\s*(min|hr)/);
          var _dt2 = _dtMatch ? (_dtMatch[2] === 'hr' ? parseInt(_dtMatch[1])*60 : parseInt(_dtMatch[1])) : 999;
          var _dv2 = driveVerdict(_newScore, _dt2, false); // closed sections returned above
          _verdictEl.textContent = _dv2.text;
          _verdictEl.className = 'drive-verdict ' + _dv2.cls;
        }
      }
    })();
    // If this card is telling the user the fish are STAGING in the lake, the Technique &
    // Gear panel must not still be recommending in-river nymphing. The headline path only
    // fires when the season window reads 'absent'; a 'slow' window reaches here instead,
    // which is exactly the case that was leaking fly recommendations through.
    if (which === 'salmon') _stagingPhaseResolved = true;
    // The staging section is resolved SYSTEM-WIDE: viewing the Middle Credit finds the
    // Lower Credit staging zone. That's right for reporting "the fish are staging" but
    // wrong for recommending a method, because you cannot throw spoons at a river mouth
    // from an inland park. Staging methods only apply when you are AT the staging section.
    var _selBase = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
    var _atStagingSection = (sectionName === _selBase);
    window._stagingInLake = (phase.mode === 'stage' && _atStagingSection);
    window._stagingElsewhere = null;
    if (phase.mode === 'stage' && which === 'salmon' && !_atStagingSection) {
      // Fish are staging, but not on the water being viewed. Say where they actually are
      // instead of prescribing pier tactics for a spot with no pier.
      window._stagingElsewhere = sectionName;
    }
    if (phase.mode === 'stage' && which === 'salmon' && _atStagingSection) {
      _stagingModeActive = true;
      window._salmonInRiver = false;
      if (!_stagingTechApplied) {
        try { applyStagingTechniqueOverride(); } catch(_stErr) { console.warn('staging technique override failed:', _stErr); }
      }
    } else if (phase.mode === 'run' && which === 'salmon') {
      // Fish are in the river — the headline must recommend float fishing, matching the
      // Technique panel rather than contradicting it.
      window._salmonInRiver = true;
    }

    var rating = pct >= 65 ? "Strong" : pct >= 40 ? "Fair" : "Slow";
    var ratingColor = pct >= 65 ? "#6dbf8a" : pct >= 40 ? "#e8a85a" : "#b0b0b0";

    var tempLine = _tempIsEstimate
      ? "~" + Math.round(lakeTemp * 10)/10 + "°C surface (" + zone.lake + "), seasonal average, live feed unavailable"
      : Math.round(lakeTemp * 10)/10 + "°C surface (" + zone.lake + ")";

    var factorsHtml = res.factors.length
      ? '<ul style="margin:.5rem 0 0;padding-left:1.1rem;font-size:.82rem;color:#cfe6e6;line-height:1.5">' +
        res.factors.map(function(f){ return "<li>" + f + "</li>"; }).join("") + '</ul>'
      : '';

    // Mode-specific guidance copy
    var guidance, headerLabel;
    if (which === 'salmon') {
      if (phase.mode === 'stage') {
        headerLabel = phase.label + " · staging";
        guidance = "Chinook and Coho aren't in the river yet. They're staging in the lake near this mouth. Cast spoons and lures with a spinning rod from the pier, beach and river mouth, especially on overcast days with an onshore wind.";
      } else {
        headerLabel = phase.label + " · in river";
        guidance = "Salmon are pushing into the river. Fish the lower river, pools and holding water, best early in the morning and after rain. Fresh fish move on rising water.";
      }
    } else {
      // steelhead
      if (phase.label.indexOf("Pre-run") !== -1) {
        headerLabel = "Steelhead · pre-run";
        guidance = "Water's still too cold for the spring push. A few fish may stage at the mouth, but the run kicks off once the surface warms into the 5–10°C band. Watch for the first warm spell.";
      } else if (phase.label.indexOf("Spring") !== -1) {
        headerLabel = phase.label;
        guidance = "Steelhead stage and run in spring as the water warms into the 5–10°C band. Target the mouth and lower river. They move on warming, stable water.";
      } else if (phase.label === "Fall run") {
        headerLabel = "Steelhead fall run";
        guidance = "Steelhead are following the salmon in. Fish behind spawning salmon with eggs and beads in the lower and mid river.";
      } else {
        headerLabel = "Steelhead · winter";
        guidance = "A few steelhead hold over through winter. Slow, deep presentations in the lower river on milder days. The main push comes in spring.";
      }
    }

    // ── HERO INTEGRATION ────────────────────────────────────────────────────
    // The separate staging card is gone. Two competing summary blocks made it unclear
    // which to trust, so the staging read now writes straight into the hero tiles and
    // the strength bar. Lures and technique are NOT repeated here — they already live in
    // Technique & Gear further down, which applyStagingTechniqueOverride() has rewritten.
    container.innerHTML = '';
    container.style.display = 'none';

    // Once fish are IN THE RIVER the hero must stop talking about the lake. Only the
    // staging phase gets lake temp / wind / staging-strength tiles; in run mode the river
    // tiles that renderConditionTiles already wrote are the correct read, and we just
    // relabel the strength bar to describe run strength.
    try {
      if (phase.mode === 'stage') {
        renderStagingHero({
          pct: pct,
          rating: rating,
          lakeTemp: lakeTemp,
          lakeName: zone.lake ? zone.lake.replace('Lake ', '') : null,
          cloudPct: (weather && weather.cloudPct != null) ? weather.cloudPct : window._lastCloudPct,
          windSpeed: (res.windSpeed != null) ? res.windSpeed
                   : ((weather && weather.windSpeed != null) ? weather.windSpeed : null),
          upwell: res.upwell || null,
          phaseLabel: headerLabel
        });
      } else {
        renderStagingStrength({
          pct: pct, rating: rating,
          lakeName: null,
          barLabel: 'Run strength \u00b7 ' + (phase.label || 'in river')
        });
      }
    } catch (_shErr) { console.warn('renderStagingHero failed:', _shErr); }

    // Keep the narrative guidance, but as a single line under the hero rather than
    // inside a second card competing with it.
    var _gEl = document.getElementById('tp-staging-note');
    if (_gEl) { _gEl.textContent = guidance; _gEl.style.display = 'block'; }
  });
}
// ── END STAGING ───────────────────────────────────────────────────────────────

var PROXY_URL = "https://streamcast-proxy.tnt-tarun.workers.dev";

// ── MODE STATE ────────────────────────────────────────────────────────────────
var appMode = 'beginner'; // 'beginner' | 'expert'
var selectedTechFamily = []; // array of: 'spin', 'float', 'fly' (empty = any)
var nearbyRivers = []; // populated when location entered

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const LAT_DEFAULT = 43.703, LNG_DEFAULT = -80.274;
const FLOW_MIN_DEFAULT = 8, FLOW_MAX_DEFAULT = 12;

// ── PER-RIVER CONFIG ──────────────────────────────────────────────────────────
// Each river has:
//   gauge:   Environment Canada station number (or null if no real-time gauge)
//   lat/lng: coordinates for weather lookup
//   sweetMin/sweetMax: ideal flow range in m³/s
//   flowLow: below this = poor fishing
//   flowHigh: above this = unsafe/unproductive
//   routine: 4 pre-trip steps specific to this river
//   access:  array of access point objects
//   dam:     key dam/reservoir info (or null)
//   species: primary target species list





// ── FLOW NOTES (extracted from config for syntax safety) ─────────────────────
function getAccessFlowNote(riverName, spotIndex, flow) {
  if(flow == null) return "Check the gauge link below for current flow.";
  var r = riverName ? riverName.split(",")[0].trim() : "";
  var notes = {
    "Grand River": [
      flow<6?"Low release. Tailwater still fishable, cold water persists.":flow<=12?"Ideal. Current seam below outflow active.":"High release. Prime time here.",
      flow<6?"Too low. Fish scattered and ultra-wary.":flow<=12?"Ideal. Pools defined, fish predictable.":flow<=18?"Elevated. Fish slower edges.":"Too high. Gorge unsafe.",
      flow<6?"Reduced mixing. Fish may spread.":flow<=15?"Confluence concentrated and productive.":"High flow. Harder to read.",
      flow<6?"Too low. Pool loses definition.":flow<=10?"Ideal. Pool well-defined.":flow<=14?"Slightly high. Focus on back half.":"Too high. Try elsewhere.",
      flow<6?"Low release. Less current near outflow.":flow<=12?"Good. Fish stacked in transition zone.":"High release. Prime time here.",
      flow<6?"Low. Go small and slow.":flow<=12?"Ideal. Gorge walls give shadow all day.":"Elevated. Fish shadow lines."
    ],
    "Credit River": [
      flow<3?"Too low. Fish in the deepest pools only.":flow<=10?"Good. Pool below the dam is productive.":"Elevated. Stick to the flats.",
      flow<3?"Low. Pools are defined and fish are visible.":flow<=12?"Good. Work the pool below each waterfall.":"Elevated. Stay cautious in the gorge.",
      flow<3?"Low. Focus on the main pools.":flow<=10?"Good all-around conditions.":"Higher flows. Fish the edges.",
      flow<3?"Very clear. Fish are wary, so use long leaders.":flow<=10?"Prime conditions.":"Higher water. Fish the seams."
    ],
    "Bronte Creek": [
      flow<1?"Very low. Fish are spooky.":flow<=8?"Good conditions. Fish holding in pools below falls.":"Elevated and muddy. Wait for clarity.",
      flow<1?"Too low. Fish may have moved.":flow<=6?"Ideal. Fish stacked in the pool below the falls.":"High. Centrepin edge walking most effective.",
      flow<1?"Very low but may still hold fish in pools.":flow<=5?"Good. Finesse nymphing and dry fly.":"Higher than normal for upper sections."
    ],
    "Humber River": [
      flow<2?"Low. Fish are cautious. Go small and slow.":flow<=8?"Prime conditions for upper Humber.":"Elevated. Fish the slower inside bends.",
      flow<2?"Low. Fish are cautious.":flow<=12?"Good. Work runs and pools.":"High. Fish the slower edges.",
      flow<2?"Low. Fish may not have moved in.":flow<=15?"Fishable. Check for active run reports.":"Very high. Bank fishing only."
    ],
    "Nottawasaga River": [
      flow<4?"Low. Fish in deeper pools.":flow<=18?"Good conditions.":"Elevated. Float fishing best.",
      flow<4?"Low. Confluence mixing reduced.":flow<=15?"Good. Concentration zone active.":"High. Fish the slower water.",
      flow<5?"Low. Run may not be in yet.":flow<=20?"Active. Check for run reports.":"High. Fish may have pushed upstream."
    ],
    "Duffins Creek": [
      flow<1?"Very low. Fish may have moved back.":flow<=10?"Active conditions. Fish the runs.":"High and dirty. Wait for clarity.",
      flow<0.5?"Very low. Fish pools only.":flow<=5?"Perfect small-stream conditions.":"Higher than normal. Be cautious."
    ],
    "Ganaraska River": [
      flow<1?"Low. Check for rain upstream.":flow<=12?"Active. Fish the pools below riffles.":"High. Fish pushed upstream.",
      flow<1?"Low but the forest reach holds fish.":flow<=8?"Excellent conditions for dry fly.":"Higher flows. Nymph through main seams."
    ],
    "Beaver River": [
      flow<2?"Low and clear. Go fine and long.":flow<=12?"Ideal. Work each pool.":"Elevated. Target slower water near banks.",
      flow<2?"Very low. Target pools only.":flow<=12?"Good. Productive all day in overcast.":"Higher flows. Streamer fishing can be great.",
      flow<2?"Low. Check for active run reports.":flow<=12?"Fishable. Fish the pools near the harbour.":"High. Fish may be spread through the lower river."
    ],
    "Saugeen River": [
      flow<6?"Low for the Saugeen but upper sections fishable.":flow<=20?"Good conditions.":"High and likely turbid. Wait 24–48 hrs.",
      flow<8?"Lower than ideal. Fish the pools.":flow<=30?"Prime wade fishing conditions.":"High. Consider float fishing.",
      flow<10?"Low. Fish may not be in.":flow<=40?"Active fishing conditions.":"Very high. Float fishing only."
    ]
  };
  var riverNotes = notes[r];
  if(!riverNotes) return "Check the local gauge for current conditions.";
  return riverNotes[Math.min(spotIndex, riverNotes.length-1)] || "Check current conditions.";
}

// ── GET CONFIG FOR SELECTED RIVER ─────────────────────────────────────────────
// Every config knows its own section name, so code holding only a cfg (recommendSpecies on a
// sibling section, a shadowed cfg in buildTopPick) can still ask section-specific questions.
Object.keys(RIVER_CONFIG).forEach(function(k){ if (RIVER_CONFIG[k]) RIVER_CONFIG[k]._section = k; });



// ── RENDER RIVER-SPECIFIC UI ───────────────────────────────────────────────────
function renderRiverUI(cfg) {
  if (!cfg) cfg = RIVER_CONFIG['default'] || {};

  // Pre-compute recommended species BEFORE access cards render, so regs sync correctly.
  // (buildTopPick runs later and sets this too, but the access/regs cards render first.)
  (function() {
    try {
      var _bka2 = (typeof selectedSpecies !== 'undefined' && selectedSpecies) ? selectedSpecies : [];
      var _spMap = {brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'};
      var _tNames = _bka2.map(function(k){ return _spMap[k]; }).filter(Boolean);
      var _rSpecies = (cfg && cfg.species) || [];
      var _onRiver = _tNames.filter(function(n){ return _rSpecies.indexOf(n) !== -1; });
      var _fishable = _onRiver.filter(function(n){
        var w = getCurrentSeason(n, getTripDateStr());
        return w && w.quality !== 'absent';
      });
      if (_fishable.length === 0) _fishable = _onRiver;
      var _pre = null;
      if (_fishable.length === 1) _pre = _fishable[0];
      else if (_fishable.length >= 2) _pre = _fishable.join(' + ');
      else {
        // No selected species on river — use top recommended species for this section
        var _recs = (typeof recommendSpecies === 'function') ? recommendSpecies(cfg) : [];
        if (_recs && _recs.length > 0) _pre = _recs[0].name;
      }
      window._effectiveRecommendedSpecies = _pre;
    } catch(_preErr) { /* leave previous value; buildTopPick will set it */ }
  })();
  // Flow gauge label + dynamic sweet spot range
  var _flowLbl = document.getElementById("flow-gauge-lbl");
  if (_flowLbl) _flowLbl.textContent = "Flow \u00b7 " + (cfg.gaugeName || cfg.gauge || 'local gauge');

  // Show gauge link in flow column
  var glinkWrap = document.getElementById("flow-gauge-link");
  var glinkAnchor = document.getElementById("flow-gauge-anchor");
  if (glinkWrap && glinkAnchor) {
    var _gUrl = cfg.gaugeUrl || (cfg.gauge ? "https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=" + cfg.gauge : null);
    if (_gUrl) {
      glinkAnchor.href = _gUrl;
      glinkAnchor.textContent = "\u2197 " + (cfg.gaugeName || cfg.gauge);
      glinkWrap.style.display = "block";
    } else {
      glinkWrap.style.display = "none";
    }
  }
  var srLbl=document.getElementById("sweet-range-lbl");
  var srAxis=document.getElementById("sweet-range-axis");
  if(srLbl) srLbl.textContent=cfg.sweetMin+"\u2013"+cfg.sweetMax;
  if(srAxis) srAxis.textContent="Prime "+cfg.sweetMin+"\u2013"+cfg.sweetMax;
  // The bar runs from 0 to the blown-out flow, so the axis end is that river's flowHigh (it used to say 20+ everywhere).
  var fxMax=document.getElementById("flow-axis-max");
  if(fxMax&&cfg.flowHigh) fxMax.textContent=cfg.flowHigh+"+";

  // Routine
  var steps = document.getElementById("routine-steps");
  var _rLinks = {'cvc.ca':'https://cvc.ca','grca.on.ca':'https://www.grandriver.ca','grandriver.ca':'https://www.grandriver.ca','trca.ca':'https://trca.ca','saugeen.on.ca':'https://www.saugeenconservation.ca','cloca.com':'https://www.cloca.com','nvca.on.ca':'https://nvca.on.ca'};
  function _linkify(t){
    t=t.replace(/\b(https?:\/\/[^\s<"']+)/g,'<a href="$1" target="_blank" rel="noopener" style="color:var(--fern)">$1</a>');
    Object.keys(_rLinks).forEach(function(d){
      t=t.replace(new RegExp(d.replace(/\./g,'\\.'),'g'),
        '<a href="'+_rLinks[d]+'" target="_blank" rel="noopener" style="color:var(--fern)">'+d+'</a>');
    }); return t;
  }
  // Fall back to parent river routine if section has none
  var _routine = cfg.routine;
  if (!_routine || !_routine.length) {
    var _pname = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
    var _parent = _pname.indexOf(' — ') !== -1 ? _pname.split(' — ')[0].trim() : _pname;
    var _pcfg = RIVER_CONFIG[_parent];
    _routine = (_pcfg && _pcfg.routine) || (RIVER_CONFIG['default'] && RIVER_CONFIG['default'].routine) || [];
  }
  steps.innerHTML = (_routine||[]).map(function(s, i) {
    return '<div class="rs"><div class="rn">' + (i+1) + '</div>' +
           '<div><div class="rt">' + s.t + '</div><div class="rd">' + _linkify(s.d) + '</div></div></div>';
  }).join("");

  // Access points
  var grid = document.getElementById("access-grid");
  var riverName = selectedRiver ? selectedRiver.split(",")[0].trim() : "";
  var regs = getRiverRegs(selectedRiver);
  var coords = ACCESS_COORDS[riverName] || [];

  // Sort access cards: recommended spot (low crowd, best match) first
  // During salmon staging (fish in the lake, not yet in the river), only show
  // harbour/port mouth spots — inland pools have nothing to catch yet.
  var _tripDateAcc = (typeof getTripDateStr === 'function') ? getTripDateStr() : null;
  var _closedSpots = (cfg && cfg.access ? cfg.access : []).filter(function(a){
    return !isAccessOpen(a, _tripDateAcc);
  });
  // Closed spots are removed from the ranked list entirely and surfaced separately below,
  // so an angler sees WHY a spot they know is missing rather than assuming we forgot it.
  var _accessSorted = (cfg && cfg.access ? cfg.access.filter(function(a){
    return isAccessOpen(a, _tripDateAcc);
  }) : []);
  // An empty access list means a blank section with no explanation, which is worse than
  // slightly generic guidance. Fall back to the parent river's config, then the default.
  // Only when the section has no spots at all: if its spots exist but are all closed, the
  // closed-spots notice explains that, and borrowing another config's spots would put
  // open-looking cards on closed water.
  if (!_accessSorted.length && !_closedSpots.length) {
    var _apName = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
    var _apParent = _apName.indexOf(' \u2014 ') !== -1 ? _apName.split(' \u2014 ')[0].trim() : _apName;
    var _apCfg = RIVER_CONFIG[_apParent];
    _accessSorted = (_apCfg && _apCfg.access ? _apCfg.access.slice() : [])
      || [];
    if (!_accessSorted.length && RIVER_CONFIG['default'] && RIVER_CONFIG['default'].access) {
      _accessSorted = RIVER_CONFIG['default'].access.slice();
    }
    if (_accessSorted.length) console.warn('access: fell back for "' + _apName + '"');
  }
  var _cardsAtMouth = false;
  (function() {
    var _stgSp = window._effectiveRecommendedSpecies;
    if (!_stgSp && selectedSpecies && selectedSpecies.length === 1) {
      var _sm3 = {brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'};
      _stgSp = _sm3[selectedSpecies[0]];
    }
    if (!_stgSp || !selectedRiver || typeof STAGING_ZONES === 'undefined') return;
    if (!STAGING_ZONES[selectedRiver.split(',')[0].trim()]) return;
    // Was gated on stagingPlausibleFor(), which reads false through September — so the
    // mouth filter never ran during the early run and an inland pool got recommended
    // while the technique panel said to fish the harbour.
    if (!shouldPointAtMouth(_stgSp, getTripDateStr())) return;
    var _mouthOnly = _accessSorted.filter(function(a){ return a.mouth === true; });
    if (_mouthOnly.length > 0) _accessSorted = _mouthOnly;
    _cardsAtMouth = true;
  })();
  // Recommended spot first. Same pick as the hero headline in buildTopPick.
  var _bestIdx = _accessSorted.indexOf(bestAccessSpot(_accessSorted, _cardsAtMouth));
  if (_bestIdx > 0) {
    // Move best spot to front
    var _best = _accessSorted.splice(_bestIdx, 1)[0];
    _accessSorted.unshift(_best);
  }
  // Build access cards
  grid.innerHTML = _accessSorted.map(function(a, idx) {
    var tags = (a.tags||[]).map(function(t) { return '<span class="atag">' + t + '</span>'; }).join("");

    // Filter regs to selected species only.
    // This block is guarded because it runs INSIDE the access-card map: an exception here
    // used to propagate out of renderRiverUI, get swallowed by the caller's try/catch, and
    // leave the entire access section blank while the rest of the page rendered normally.
    // A regs problem should cost us the regs panel, not every access point on the river.
    var regsHtml = "";
    try {
    if (regs && regs.species) {
      // Use the effective recommended species (set by buildTopPick) if it differs from user selection
      // This ensures regs match the species in the headline (e.g. Rainbow Trout when brown/brook were selected)
      var _effSp = window._effectiveRecommendedSpecies;
      var _effKey = _effSp ? ({"Brown Trout":"brown","Rainbow Trout":"rainbow","Brook Trout":"brook","Steelhead":"rainbow","Chinook Salmon":"chinook","Coho Salmon":"coho"}[_effSp] || null) : null;
      var _regsSpeciesKeys = (_effKey && selectedSpecies.indexOf(_effKey) === -1) ? [_effKey] : selectedSpecies;
      var speciesFilter = _regsSpeciesKeys;
      var speciesMap2 = { brown:"Brown Trout", rainbow:"Rainbow Trout", brook:"Brook Trout", chinook:"Chinook Salmon", coho:"Coho Salmon" };

      var filteredSpecies = regs.species.filter(function(s) {
        if (_regsSpeciesKeys.length===0) return true;
        return _regsSpeciesKeys.some(function(k){ return regsRowMatches(s.name, k); });
      });
      // Fallback: if filter yields nothing, leave empty so the "no specific regs" message shows

      var speciesRows;
      if (filteredSpecies.length === 0 && selectedSpecies.length > 0) {
        var _noRegNames = selectedSpecies.map(function(k){ return speciesMap2[k]||k; }).join(', ');
        speciesRows = '<div class="reg-row reg-row-empty">No specific regulations listed for <strong>' + _noRegNames + '</strong> on this river. Check <a href="https://www.ontario.ca/page/ontario-fishing-regulations" target="_blank" style="color:var(--fern)">Ontario Fishing Regulations</a> for general FMZ rules.</div>';
      } else {
        speciesRows = filteredSpecies.map(function(s) {
          return '<div class="reg-row">' +
            '<div class="reg-species">' + s.name + '</div>' +
            '<div class="reg-season">' + s.season + '</div>' +
            '<div class="reg-limit">' + s.limit + '</div>' +
            (s.notes ? '<div class="reg-note">' + s.notes + '</div>' : '') +
          '</div>';
        }).join("");
      }

      // When the river has several reaches, the reach table above gives each reach's season, so
      // the river-wide season text ("Sept. 30; open all year (lower)") and season notes would
      // repeat it in a vaguer, sometimes contradictory form. Keep the species and its limit.
      var _multiReach = reachSeasons(selectedRiver, '').length > 1;
      var _seasonNote = /season|open all year|closed|sept|dec\.? 31|april/i;
      var rows = filteredSpecies.map(function(s) {
        var note = s.notes && !(_multiReach && _seasonNote.test(s.notes)) ? s.notes : '';
        return '<div class="reg-row' + (_multiReach ? ' reg-row-nos' : '') + '">' +
          '<div class="reg-species">' + s.name + '</div>' +
          (_multiReach ? '' : '<div class="reg-season">' + s.season + '</div>') +
          '<div class="reg-limit">' + reachLimitText(selectedRiver, s) + '</div>' +
          (note ? '<div class="reg-note">' + note + '</div>' : '') +
        '</div>';
      }).join("");
      // Use effective recommended species for label if it differs from selection
      var _effSpLabel = window._effectiveRecommendedSpecies || null;
      // For multi-species label (e.g. "Brown Trout + Brook Trout"), use the selected keys directly
      var _isMultiLabel = _effSpLabel && _effSpLabel.indexOf(' + ') !== -1;
      var _labelSpecies = _isMultiLabel
        ? selectedSpecies.map(function(k){return{brown:'Brown',rainbow:'Rainbow',brook:'Brook',chinook:'Chinook',coho:'Coho'}[k]||k;})
        : (_effSpLabel
          ? [_effSpLabel.replace(/ Trout| Salmon/g,'')]
          : (selectedSpecies.length > 0 ? selectedSpecies.map(function(k){return{brown:'Brown',rainbow:'Rainbow',brook:'Brook',chinook:'Chinook',coho:'Coho'}[k]||k;}) : []));
      var regsLabel = '2026 Regs' + (_labelSpecies.length > 0 ? ' · ' + _labelSpecies.join('/') : '');
      regsHtml = (function() {
        var _tripDS = document.getElementById('trip-date') ? document.getElementById('trip-date').value : '';
        var _reaches = reachSeasons(selectedRiver, _tripDS);
        var _bullets = buildRegsBullets(regs, filteredSpecies, window._effectiveRecommendedSpecies, _reaches, selectedRiver, _tripDS);
        var _reachHtml = _reaches.length > 1
          ? '<div class="regs-reaches"><div class="regs-glossary-title">Trout and salmon season by reach</div>' +
            '<div class="rr-list">' + _reaches.map(function(rc) {
              // One aligned row per reach: name on the left, today's status and the season band on the right.
              var band = rc.band === 'all-year' ? 'Season: open all year'
                : 'Season: ' + rc.bandText.replace(/^open from (the )?/, '');
              var status = _tripDS
                ? '<div class="rr-status ' + (rc.status === 'open' ? 'rr-open' : 'rr-closed') + '"><span class="rr-dot" aria-hidden="true"></span>' +
                    (rc.status === 'open' ? 'Open' : 'Closed') + ' on this date' + (rc.why ? '<span class="rr-why">, ' + rc.why + '</span>' : '') + '</div>'
                : '';
              return '<div class="rr-row' + (rc.here ? ' rr-here' : '') + '">' +
                '<div class="rr-name">' + rc.label + (rc.here ? ' <span class="rr-tag">This reach</span>' : '') + '</div>' +
                '<div class="rr-info">' + status + '<div class="rr-band">' + band + '</div></div>' +
              '</div>';
            }).join('') + '</div></div>'
          : '';
        var _detailsId = 'regs-det-' + idx;
        return '<div class="regs-panel">' +
          '<div class="regs-header">' +
            '<span class="regs-zone">' + regs.zone + '</span>' +
            '<span class="regs-title">' + regsLabel + '</span>' +
            '<a class="regs-link" href="https://www.ontario.ca/page/ontario-fishing-regulations-summary" target="_blank">Full Regs ↗</a>' +
          '</div>' +
          (_bullets.length ? '<ul class="regs-bullets">' + _bullets.map(function(it){
              return '<li' + (it.sp ? ' data-sp="' + it.sp.replace(/"/g, '&quot;') + '"' : '') + '>' + it.html + '</li>'; }).join('') + '</ul>'
            : '<p class="regs-plain">No specific rules listed for this species here. Check the full regulations.</p>') +
          '<p class="regs-foot">' + regs.zone + ' rules from the 2026 Ontario Fishing Regulations Summary. Check posted signs where you fish.</p>' +
          (_reachHtml
            ? '<button class="regs-details-toggle" onclick="(function(b){var d=document.getElementById(\'' + _detailsId + '\');var o=d.style.display!==\'none\';d.style.display=o?\'none\':\'block\';b.textContent=o?\'Season by reach +\':\'Season by reach \u2212\';})(this)">Season by reach +</button>' +
              '<div id="' + _detailsId + '" style="display:none">' + _reachHtml + '</div>'
            : '') +
        '</div>';
      })()
    }
    } catch(_regsErr) {
      console.warn('regs panel failed for access card, continuing without it:', _regsErr);
      regsHtml = "";
    }

    var isRecommended = idx === 0;
    var recBadge = isRecommended ? '<div class="acard-rec-badge">★ Recommended spot</div>' : '';
    var detailHtml = '<div class="adesc">' + a.desc + '</div>' +
        '<div class="atags">' + tags + '</div>' +
        '<div class="abest">' + (a.best || '') + '</div>' +
        '<div class="afnote" data-access-idx="' + idx + '">\u2026</div>' +
        regsHtml;
    if (isRecommended) {
      return '<div class="ac acard-recommended" data-spot-idx="' + idx + '">' +
        recBadge +
        '<div class="act"><div class="aname">' + a.name + '</div>' +
        '<div class="acrowd ' + a.crowd + '">' + (a.crowdLabel && a.crowdLabel !== 'Varies' ? a.crowdLabel : a.crowd === 'low' ? 'Low pressure' : a.crowd === 'med' ? 'Med. pressure' : a.crowd === 'high' ? 'High pressure' : (a.crowd || '')) + '</div></div>' +
        '<div class="aloc">' + a.loc + '</div>' +
        detailHtml +
      '</div>';
    } else {
      return '<div class="ac ac-collapsed" data-spot-idx="' + idx + '">' +
        '<div class="act ac-summary" onclick="toggleAcard(this)">' +
          '<div>' +
            '<div class="aname">' + a.name + '</div>' +
            '<div class="aloc">' + a.loc + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">' +
            '<div class="acrowd ' + a.crowd + '">' + (a.crowdLabel && a.crowdLabel !== 'Varies' ? a.crowdLabel : a.crowd === 'low' ? 'Low pressure' : a.crowd === 'med' ? 'Med. pressure' : a.crowd === 'high' ? 'High pressure' : (a.crowd || '')) + '</div>' +
            '<span class="ac-chevron">'+ '\u25b8' +'</span>' +
          '</div>' +
        '</div>' +
        '<div class="ac-detail" style="display:none">' +
          detailHtml +
        '</div>' +
      '</div>';
    }
  }).join("");

  // Build map with OpenStreetMap iframe
  // Sanctuary notice — say plainly which spots are shut and why.
  (function(){
    var host = document.getElementById('access-grid');
    if (!host) return;
    // A notice from a previous search must not survive into this one.
    var _old = host.parentNode.querySelectorAll('.closed-notice');
    Array.prototype.forEach.call(_old, function(n){ n.parentNode.removeChild(n); });
    if (!_closedSpots.length) return;
    var seen = {};
    var rows = _closedSpots.map(function(s){
      var win = accessClosureOn(s, _tripDateAcc);
      var why = (win && win.why) || 'Fish sanctuary. Closed to fishing';
      var k = s.name + '|' + why;
      if (seen[k]) return '';
      seen[k] = 1;
      return '<li><strong>' + s.name + '</strong>: ' + why + '</li>';
    }).join('');
    if (!rows) return;
    var box = document.createElement('div');
    box.className = 'closed-notice';
    box.innerHTML = '<div class="cn-lbl">\u26a0 Closed on this date</div><ul>' + rows + '</ul>' +
      '<div class="cn-foot">Sanctuary closures from the Ontario 2026 regulations. ' +
      'Always confirm the exact boundary before you fish.</div>';
    // Top of the cards column, not beside it (the parent is the cards/map grid), and first
    // so it isn't hidden below the fold of the scrolling card list.
    host.insertBefore(box, host.firstChild);
  })();

  // Reorder coords to match _accessSorted (recommended spot first)
  var _sortedCoords = _accessSorted.map(function(a) {
    var origIdx = cfg.access.indexOf(a);
    return coords[origIdx] || null;
  }).filter(Boolean);
  // Pass sorted access order via cfg so updateMapPin uses correct names
  cfg._sortedAccess = _accessSorted;
  renderAccessMap(cfg, _sortedCoords);

  // Stocking section
  renderStockingSection(selectedRiver);

  // Species rail
  renderSpeciesRail(cfg);

  // Reorder sections based on mode: expert sees Conditions first, beginner sees Access first
  (function() {
    var sa = document.getElementById('section-access');
    var sc = document.getElementById('section-conditions');
    var numA = document.getElementById('sec-num-access');
    var numC = document.getElementById('sec-num-conditions');
    if (!sa || !sc) return;
    // Reorder via actual DOM movement (robust — doesn't rely on flex order)
    if (appMode === 'expert') {
      // Expert: Conditions before Access. Move section-conditions before section-access.
      sa.parentNode.insertBefore(sc, sa);
      if (numA) numA.textContent = '2';
      if (numC) numC.textContent = '1';
    } else {
      // Beginner: Access before Conditions. Move section-access before section-conditions.
      sc.parentNode.insertBefore(sa, sc);
      if (numA) numA.textContent = '1';
      if (numC) numC.textContent = '2';
    }
  })();

  // Dam section removed — info is covered in Top Pick summary
  if (false && cfg.dam) {
    document.getElementById("dam-icon").textContent = cfg.dam.icon;
    document.getElementById("dam-lbl").textContent = cfg.dam.label;
    document.getElementById("dam-title").textContent = cfg.dam.title;
    document.getElementById("dam-desc").textContent = cfg.dam.desc;
    document.getElementById("dam-links").innerHTML = (cfg.dam&&cfg.dam.links||[]).map(function(l) {
      return '<a class="dl" href="' + l.url + '" target="_blank">' + l.text + '</a>';
    }).join("");
  }
}

function updateAccessFlowNotes(cfg, flow) {
  var notes = document.querySelectorAll(".afnote[data-access-idx]");
  var riverName = selectedRiver ? selectedRiver.split(",")[0].trim() : "";
  notes.forEach(function(el) {
    var idx = parseInt(el.getAttribute("data-access-idx"), 10);
    el.textContent = getAccessFlowNote(riverName, idx, flow);
  });
}

// ── LOCATION / RIVER SELECTION (from landing page) ────────────────────────────
var RIVERS_DB = [
    { name:"Ganaraska River — Lower (Lake to CNR Bridge)", gauge:"02HD012", sweetMin:2.5, sweetMax:4, lat:43.940, lng:-78.305 },
    { name:"Ganaraska River — Port Hope Sanctuary",        gauge:"02HD012", sweetMin:2, sweetMax:3.5, lat:43.945, lng:-78.300 },
    { name:"Ganaraska River — Corbetts Dam (Closed Year-Round)", gauge:"02HD012", sweetMin:2, sweetMax:12, lat:43.950, lng:-78.298 },
    { name:"Ganaraska River — Upper & Conservation Areas", gauge:"02HD003", sweetMin:0.7, sweetMax:1.1,  lat:43.980, lng:-78.290 },
    { name:"Duffins Creek — Lower Section",  gauge:"02HC049", sweetMin:2,   sweetMax:5.5, lat:43.843, lng:-79.065 },
    { name:"Duffins Creek — Middle Section", gauge:"02HC049", sweetMin:1.6,   sweetMax:4, lat:43.870, lng:-79.058 },
    { name:"Duffins Creek — Upper Reaches",  gauge:"02HC049", sweetMin:1.6, sweetMax:4,  lat:43.940, lng:-79.040 },
    { name:"Bronte Creek — Lower Estuary & Mouth",           gauge:"02HB011", sweetMin:3.5,   sweetMax:7.5, lat:43.434, lng:-79.716 },
    { name:"Bronte Creek — Mid-Section & Provincial Park",   gauge:"02HB011", sweetMin:3,   sweetMax:6, lat:43.465, lng:-79.735 },
    { name:"Bronte Creek — Upper Headwaters",                gauge:"02HB022", sweetMin:1.4, sweetMax:4,  lat:43.530, lng:-79.800 },
    { name:"Bowmanville Creek — River Mouth & Piers", gauge:"02HD006", sweetMin:1.1,   sweetMax:2,  lat:43.893, lng:-78.685 },
    { name:"Lower Bowmanville Creek",                 gauge:"02HD006", sweetMin:1.1,   sweetMax:2,  lat:43.900, lng:-78.685 },
    { name:"Middle Bowmanville Creek (Fish Ladder)",  gauge:"02HD006", sweetMin:0.9,   sweetMax:1.7,  lat:43.907, lng:-78.683 },
    { name:"Upper Bowmanville Creek",                 gauge:"02HD006", sweetMin:0.8, sweetMax:1.8,  lat:43.930, lng:-78.680 },
    { name:"Upper Credit River",       gauge:"02HB001", sweetMin:1.4, sweetMax:2.8, lat:43.870, lng:-80.010 },
    { name:"Middle Credit River",      gauge:"02HB025", sweetMin:4.5, sweetMax:9, lat:43.660, lng:-79.880 },
    { name:"Lower Credit River",       gauge:"02HB029", sweetMin:6,   sweetMax:13, lat:43.560, lng:-79.720 },
    { name:"Upper Grand River (Tailwater)", gauge:"02GA016", sweetMin:8, sweetMax:12, lat:43.700, lng:-80.280 },
    { name:"Middle Grand River",       gauge:"02GA016", sweetMin:8,  sweetMax:15, lat:43.420, lng:-80.320 },
    { name:"Lower Grand River",        gauge:"02GA016", sweetMin:10, sweetMax:30, lat:43.000, lng:-79.900 },
    { name:"Lower Humber River",       gauge:"02HC025", sweetMin:3,  sweetMax:12, lat:43.640, lng:-79.480 },
    { name:"Lower-Mid Humber (Old Mill to Eglinton)", gauge:"02HC003", sweetMin:4, sweetMax:8.5, lat:43.670, lng:-79.490 },
    { name:"Upper Humber River (Headwaters)", gauge:"02HC047", sweetMin:1, sweetMax:2, lat:43.870, lng:-79.730 },
    { name:"Lower Don River (Lake to Eglinton)", gauge:"02HC024", sweetMin:1.9, sweetMax:3.5, lat:43.690, lng:-79.358 },
    { name:"Upper Don River (Eglinton to Hwy 407)", gauge:"02HC024", sweetMin:1.7, sweetMax:3, lat:43.726, lng:-79.343 },
    { name:"Lower Beaver River (Thornbury)", gauge:"02FB009", sweetMin:9, sweetMax:19, lat:44.563, lng:-80.457 },
    { name:"Middle Beaver River (Clarksburg to Heathcote)", gauge:"02FB009", sweetMin:9, sweetMax:20, lat:44.520, lng:-80.430 },
    { name:"Upper Beaver River (Kimberley)", gauge:"02FB013", sweetMin:3.5, sweetMax:6, lat:44.490, lng:-80.400 },
  { name:"Sixteen Mile Creek — Lower Reaches & Oakville Harbour", gauge:"02HB005", sweetMin:0.9,   sweetMax:2.5, lat:43.440, lng:-79.672 },
    { name:"Sixteen Mile Creek — Middle Reaches & Main Valley",      gauge:"02HB005", sweetMin:0.8,   sweetMax:1.9, lat:43.470, lng:-79.685 },
    { name:"Sixteen Mile Creek — Upper West Branch (Trout)",         gauge:"02HB005", sweetMin:0.8, sweetMax:1.9, lat:43.530, lng:-79.750 },
    { name:"Sixteen Mile Creek — Upper Middle/East Branches",        gauge:"02HB005", sweetMin:0.5, sweetMax:3, lat:43.545, lng:-79.790 },
  { name:"Nottawasaga River — Headwaters (Niagara Escarpment)", gauge:"02ED026", sweetMin:1.2, sweetMax:2, lat:44.130, lng:-79.950 },
    { name:"Nottawasaga River — Middle Section (Alliston to Angus)",        gauge:"02ED003", sweetMin:6.5, sweetMax:15, lat:44.150, lng:-79.900 },
    { name:"Nottawasaga River — Lower Section (Boyne to Wasaga Beach)",     gauge:"02ED101", sweetMin:8, sweetMax:30, lat:44.300, lng:-79.980 },
  { name:"Saugeen River — Headwaters & Upper Tributaries",            gauge:"02FC016", sweetMin:2.5,  sweetMax:8.5, lat:44.100, lng:-80.750 },
    { name:"Saugeen River — Middle Main Stem (Hanover to Paisley)",    gauge:"02FC016", sweetMin:8,  sweetMax:25, lat:44.220, lng:-81.000 },
    { name:"Saugeen River — Lower Main Stem (Paisley to Southampton)", gauge:"02FC016", sweetMin:10, sweetMax:40, lat:44.400, lng:-81.200 },
  { name:"Rouge River — Marsh & Mouth (Lake Ontario)",              gauge:"02HC022", sweetMin:1,   sweetMax:2, lat:43.803, lng:-79.134 },
    { name:"Rouge River — Mid-Section (Rouge National Urban Park)",  gauge:"02HC022", sweetMin:0.8,   sweetMax:1.7, lat:43.835, lng:-79.142 },
    { name:"Rouge River — Upper & Milne Dam (Markham)",              gauge:"02HC022", sweetMin:0.7, sweetMax:1.8, lat:43.880, lng:-79.250 },
  { name:"Wilmot Creek — Mouth & Marsh (Lake Ontario)",          gauge:"02HD009", sweetMin:0.9,   sweetMax:1.7, lat:43.890, lng:-78.594 },
    { name:"Wilmot Creek — Lower River (to CN Rail Tracks)",        gauge:"02HD009", sweetMin:0.9,   sweetMax:1.7, lat:43.900, lng:-78.592 },
    { name:"Wilmot Creek — Middle Section (Hwy 401 to Hwy 2)",     gauge:"02HD009", sweetMin:0.7,   sweetMax:1.4, lat:43.915, lng:-78.585 },
    { name:"Wilmot Creek — Upper Watershed & Orono Crown Lands",   gauge:"02HD021", sweetMin:0.3, sweetMax:0.5, lat:43.960, lng:-78.575 },
  { name:"Speed River — Upper (Above Guelph Lake)",              gauge:"02GA040", sweetMin:1.2, sweetMax:3, lat:43.640, lng:-80.220 },
    { name:"Speed River — Middle (Guelph Lake to Downtown Guelph)", gauge:"02GA029", sweetMin:1, sweetMax:5, lat:43.570, lng:-80.250 },
    { name:"Speed River — Lower (Guelph to Cambridge Confluence)",  gauge:"02GA029", sweetMin:1, sweetMax:5, lat:43.430, lng:-80.310 },
  { name:"Eramosa River — Upper Headwaters (Above Rockwood)",      gauge:"02GA029", sweetMin:1.6, sweetMax:4, lat:43.615, lng:-80.148 },
    { name:"Eramosa River — Mid-Section (Rockwood to Eden Mills)",   gauge:"02GA029", sweetMin:1.6, sweetMax:4, lat:43.595, lng:-80.195 },
    { name:"Eramosa River — Lower Stretches (Eden Mills to Guelph)", gauge:"02GA029", sweetMin:1, sweetMax:5, lat:43.565, lng:-80.225 },
  { name:"Black Creek — Upper Reaches (Vaughan to North York)", gauge:"02HC027", sweetMin:0.3, sweetMax:0.8, lat:43.760, lng:-79.490 },
    { name:"Black Creek — Concrete Channel (Central North York)",  gauge:"02HC025", sweetMin:1, sweetMax:6, lat:43.720, lng:-79.490 },
    { name:"Black Creek — Lower Watershed & Humber Confluence",    gauge:"02HC027", sweetMin:0.3, sweetMax:0.8, lat:43.670, lng:-79.500 }
  ];

var LOC_MAP = {
  "toronto":"toronto","northyork":"toronto","etobicoke":"toronto",
  "scarborough":"scarborough",
  "mississauga":"mississauga","streetsville":"mississauga","portcredit":"mississauga",
  "brampton":"brampton","bramalea":"brampton",
  "milton":"milton","oakville":"oakville","burlington":"burlington",
  "hamilton":"hamilton","stoneycreek":"hamilton","ancaster":"hamilton",
  "guelph":"guelph","cambridge":"cambridge","galt":"cambridge","hespeler":"cambridge",
  "kitchener":"kitchener","waterloo":"waterloo","orangeville":"orangeville",
  "barrie":"barrie","innisfil":"barrie","collingwood":"collingwood",
  "ajax":"ajax","pickering":"pickering","markham":"markham",
  "richmondhill":"richmondhill","richmond hill":"richmondhill",
  "vaughan":"vaughan","woodbridge":"vaughan","maple":"vaughan",
  "oshawa":"oshawa","whitby":"whitby","cobourg":"cobourg",
  "porthope":"porthope","port hope":"porthope","newcastle":"newcastle",
  "bowmanville":"bowmanville","clarington":"clarington",
  "owensound":"owensound","owen sound":"owensound",
  "l9t":"milton","l9e":"milton","l5a":"mississauga","l5b":"mississauga",
  "l6t":"brampton","l6s":"brampton","m1":"scarborough","m2":"toronto",
  "m3":"toronto","m4":"toronto","m5":"toronto","m6":"toronto","m9":"toronto",
  "n1h":"guelph","n1e":"guelph","l4n":"barrie","l4m":"barrie",
  "l9y":"collingwood","l9z":"collingwood","l6h":"oakville","l6j":"oakville",
  "l6l":"oakville","l6k":"oakville","l7j":"orangeville"
};

function resolveLocation(input) {
  var s = input.toLowerCase().trim().replace(/[\s\-]/g,"");
  if (LOC_MAP[s]) return LOC_MAP[s];
  var prefix = s.slice(0,3);
  if (LOC_MAP[prefix]) return LOC_MAP[prefix];
  var keys = Object.keys(LOC_MAP);
  for (var i=0;i<keys.length;i++) {
    var k=keys[i];
    if (s.length>=3&&(k.indexOf(s)!==-1||s.indexOf(k)!==-1)) return LOC_MAP[k];
  }
  return null;
}

// driveTime objects use spaced keys ("port hope", "richmond hill", etc.)
// but LOC_MAP normalises to no-space ("porthope", "richmondhill", etc.)
// This map restores the spaced form for driveTime lookups.
var LOC_KEY_ALIASES = {
  "porthope":    "port hope",
  "richmondhill":"richmond hill",
  "owensound":   "owen sound",
  "northyork":   "north york"
};
function driveKeyFor(locKey) {
  return LOC_KEY_ALIASES[locKey] || locKey;
}

// The 6 nearest sections within maxMinutes (the chips), or `limit` of them. "Find my best spot"
// ranks every section in range: capped at 6, a Toronto steelhead or coho search could find only
// rivers without that fish nearby and fall back to one of them.
function getRivers(locKey, maxMinutes, limit) {
  var max = maxMinutes || 180;
  var dk = driveKeyFor(locKey);
  return RIVERS_DB
    .filter(function(r){
      var cfg = RIVER_CONFIG[r.name];
      if (cfg && cfg.active === false) return false;
      var t = (r.times && (r.times[locKey] || r.times[dk])) || (cfg && cfg.driveTime && (cfg.driveTime[locKey] || cfg.driveTime[dk]));
      return t !== undefined && t <= max;
    })
    .sort(function(a,b){
    var cfgA = RIVER_CONFIG[a.name], cfgB = RIVER_CONFIG[b.name];
    var tA = (a.times && (a.times[locKey]||a.times[dk])) || (cfgA && cfgA.driveTime && (cfgA.driveTime[locKey]||cfgA.driveTime[dk])) || 999;
    var tB = (b.times && (b.times[locKey]||b.times[dk])) || (cfgB && cfgB.driveTime && (cfgB.driveTime[locKey]||cfgB.driveTime[dk])) || 999;
    return tA - tB;
  })
    .slice(0, limit || 6);
}

function fmtDrive(m) {
  if(m<60) return m+" min";
  var h=Math.floor(m/60),mn=m%60;
  return mn===0?h+" hr":h+" hr "+mn+" min";
}

function titleCase(s) {
  return s.replace(/\w\S*/g,function(w){return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();});
}

var selectedRiver = null;
var selectedSpecies = [];
var selectedSpeciesLabel = "Any Species";
var inputTimer = null;

function onLocationInput(val) {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(function(){updateRivers(val);},280);
}

function updateRivers(val) {
  var sec=document.getElementById("river-section");
  var placeholder=document.getElementById("river-placeholder");
  var chips=document.getElementById("river-chips");
  var lbl=document.getElementById("rivers-lbl");

  if(!val||val.trim().length<2){
    sec.style.display="none"; placeholder.style.display="flex";
    placeholder.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a7a52" stroke-width="1.5" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg><span class="ph-text">Enter your location to see nearby rivers</span>';
    selectedRiver=null; return;
  }

  var loc=resolveLocation(val);
  if(!loc){
    sec.style.display="none"; placeholder.style.display="flex";
    placeholder.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b87333" stroke-width="1.5" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg><span class="ph-text" style="color:#b87333">Try a city: Milton, Toronto, Guelph, Barrie, Oshawa\u2026</span>';
    selectedRiver=null; return;
  }

  var _travelMax = parseInt((document.getElementById('travel-range')||{value:'180'}).value)||180;
  var rivers=getRivers(loc, appMode==='expert'?180:_travelMax);
  if(rivers.length===0){
    sec.style.display="none";placeholder.style.display="flex";
    placeholder.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b87333" stroke-width="1.5" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg><span class="ph-text" style="color:#b87333">No rivers within your travel limit. Try increasing the range.</span>';
    selectedRiver=null;return;
  }

  placeholder.style.display="none";
  if(lbl) lbl.textContent="Rivers near "+titleCase(val.trim());

  chips.innerHTML=rivers.map(function(r,i){
    var _cfg_r=RIVER_CONFIG[r.name]; var _dk2=driveKeyFor(loc); var drive=fmtDrive((r.times&&(r.times[loc]||r.times[_dk2]))||(_cfg_r&&_cfg_r.driveTime&&(_cfg_r.driveTime[loc]||_cfg_r.driveTime[_dk2]))||60);
    var active=i===0?" active":"";
    var safeLoc=(r.loc||"").replace(/–/g,"-");
    return '<div class="river-chip'+active+'" data-rname="'+r.name+'" data-rloc="'+safeLoc+'">' +
      '<div class="rc-time">'+drive+' <span style="font-size:.62rem;opacity:.5">est.</span></div>' +
      '<div class="rc-name">'+r.name+'</div>' +
      '<div class="rc-loc">'+r.loc+'</div>' +
    '</div>';
  }).join("");
  chips.querySelectorAll(".river-chip").forEach(function(el){
    el.addEventListener("click",function(){
      selectRiver(this,this.getAttribute("data-rname"),this.getAttribute("data-rloc"));
    });
  });

  // Don't change the pick once results are showing: a late city change (the 280 ms timer above)
  // used to land after "Find my best spot" and swap its pick for the nearest river.
  var _resEl = document.getElementById("results");
  if (!(_resEl && _resEl.classList.contains("active"))) {
    selectedRiver=rivers[0].name+(rivers[0].loc?", "+rivers[0].loc.replace(/\u2013/g,"-"):"");
    setResHeader(selectedRiver);
  }
  sec.style.display="block";
}

function selectRiver(el,name,loc){
  document.querySelectorAll(".river-chip").forEach(function(c){c.classList.remove("active");});
  el.classList.add("active");
  selectedRiver=name+", "+loc;
  setResHeader(selectedRiver);
}

function toggleTech(el){el.classList.toggle("active");}
function clearTech(){document.querySelectorAll(".tech-chip").forEach(function(c){c.classList.remove("active");});}

function goToResults(){
  try { hideInstallHint(); } catch (e) {}
  // Track search
  (function(){
    var _loc = (document.getElementById('loc-input-field')||{}).value || 'unknown';
    var _spp = Array.from(document.querySelectorAll('.species-btn.active')).map(function(b){ return b.getAttribute('data-label'); }).filter(Boolean).join(',') || 'any';
    track('Search', { location: _loc, species: _spp, mode: appMode });
  })();
  // Resolve location — needed in both beginner and expert mode
  var locInp = document.getElementById('loc-input-field');
  // On iPhone the city picker's change event can fire as the button is tapped, so its 280 ms
  // nearby-rivers timer used to run after this search and reset the pick to the nearest river
  // (Lower Don for a Toronto steelhead search, TJ 2026-10-27). Run it now instead.
  if (inputTimer) {
    clearTimeout(inputTimer); inputTimer = null;
    var _keepRiver = selectedRiver;   // expert mode keeps the river it picked
    if (locInp) updateRivers(locInp.value);
    if (appMode === 'expert') selectedRiver = _keepRiver;
  }
  var locKey = resolveLocation(locInp ? locInp.value : '');
  if (locKey) window._beginnerLocKey = locKey;
  if (!locKey && appMode !== 'expert') {
    locInp.style.outline="2px solid #b87333";
    setTimeout(function(){locInp.style.outline="";},2000);
    return;
  }

  // In expert mode, validate a river is selected
  if (appMode === 'expert' && !selectedRiver) {
    var rsel = document.getElementById('expert-river-select');
    if (rsel) { rsel.style.outline='2px solid #b87333'; setTimeout(function(){ rsel.style.outline=''; }, 2000); }
    return;
  }
  // Capture technique family — beginner uses tech-family-btn, expert uses tech-chip
  if (appMode === 'beginner') {
    selectedTechFamily = Array.from(document.querySelectorAll('.tech-family-btn.active'))
      .map(function(b){ return b.getAttribute('data-family')||''; })
      .filter(function(v){ return v !== ''; });
  } else {
    // Map expert tech chip selections to family values used by updateMethods
    var _chipFamilyMap = {
      'Dry Fly':'fly','Nymphing':'fly','Streamers':'fly',
      'Float / Centrepin':'float','Bait Fishing':'float','Spin / Lure':'spin'
    };
    // Read directly from DOM — window._selectedTechs isn't set until renderResults
    var _activeTechs = Array.from(document.querySelectorAll('.tech-chip.active'))
      .map(function(el){ return el.getAttribute('data-tech'); });
    var _families = _activeTechs.map(function(t){ return _chipFamilyMap[t]||''; })
      .filter(function(v,i,a){ return v && a.indexOf(v)===i; });
    selectedTechFamily = _families.length ? [_families[0]] : [];
  }

  // Beginner mode: pick top-ranked nearby river automatically

  // Capture species selection
  var activeBtn=document.querySelector(".species-btn.active");
  selectedSpecies=activeBtn?(activeBtn.getAttribute("data-value")||""):"";
  // Multi-select capture
  var _sm={"brown":"Brown Trout","rainbow":"Rainbow Trout","brook":"Brook Trout","steelhead":"Steelhead","chinook":"Chinook Salmon","coho":"Coho Salmon"};
  selectedSpecies=Array.from(document.querySelectorAll(".species-btn.active"))
    .map(function(b){return b.getAttribute("data-value");}).filter(function(v){return v!=="";});
  selectedSpeciesLabel=selectedSpecies.length===0?"Any Species":selectedSpecies.length===1?(_sm[selectedSpecies[0]]||"Any"):selectedSpecies.map(function(k){return _sm[k];}).join(" + ");
  // Expert mode: if the section was auto-picked, re-resolve it now that species is known.
  // Species is captured after the river is chosen, so without this the auto section would
  // be stale — resolved against whatever species was selected on a previous search.
  try { refreshAutoSection(); } catch(_rasErr) {}
  if(appMode === 'beginner') { // always re-rank in beginner mode to respect species selection
    selectedRiver = null; // reset so a stale value from a previous search can't bleed through
      var _maxMin = parseInt((document.getElementById('travel-range')||{value:'60'}).value)||60;
    var rivers = getRivers(locKey, _maxMin, Infinity);
    rivers.forEach(function(r){ var _cfg=RIVER_CONFIG[r.name]; var _dk3=driveKeyFor(locKey); r.driveTime=(r.times&&(r.times[locKey]||r.times[_dk3]))||(_cfg&&_cfg.driveTime&&(_cfg.driveTime[locKey]||_cfg.driveTime[_dk3]))||60; });
    var _tripDate = document.getElementById('trip-date').value||(function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
    var ranked = rankRivers(rivers, selectedSpecies, _tripDate);
    // If species selected, prefer a river that has ALL selected species, then fall back to ANY
    var bestPick = ranked[0];
    if (selectedSpecies.length > 0) {
      var _sm = {brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'};
      var targetSpeciesNames = selectedSpecies.map(function(k){ return _sm[k]; });
      // Determine which selected species are currently fishable (not staging/absent)
      var _tripDateBP = document.getElementById('trip-date') ? document.getElementById('trip-date').value : '';
      var fishableSpecies = targetSpeciesNames.filter(function(n) {
        var w = getCurrentSeason(n, _tripDateBP);
        return w && w.quality !== 'absent';
      });
      // If no selected species are fishable right now, fall back to full list
      if (fishableSpecies.length === 0) fishableSpecies = targetSpeciesNames;

      // If ALL selected species are absent (not just slow/staging) and at least one is a
      // migratory salmon species, prefer rivers with an actual staging zone (harbour mouth
      // section) — that's the only place the app can give a meaningful answer (staging report
      // or honest "not accessible yet"). Otherwise the user lands on a random inland section
      // that has no staging context and gets a confusing generic recommendation.
      var _allAbsent = targetSpeciesNames.length > 0 && targetSpeciesNames.every(function(n) {
        var w = getCurrentSeason(n, _tripDateBP);
        return w && w.quality === 'absent';
      });
      // Staging season (e.g. Chinook in August, label "Harbour Mouth") is quality 'slow',
      // not 'absent' — so check plausibility directly rather than relying on _allAbsent.
      // Fourth caller of the same helper. Use the shared mouth preference so the beginner
      // river pick agrees with the ranking, the access filter and the hero spot.
      var _anyStagingPlausible = targetSpeciesNames.some(function(n) {
        return typeof mouthPreferenceFor === 'function' && mouthPreferenceFor(n, _tripDateBP) > 0;
      });
      var _hasSalmonTarget = targetSpeciesNames.some(function(n){ return n === 'Chinook Salmon' || n === 'Coho Salmon'; });
      var _stagingZonePick = null;
      if ((_anyStagingPlausible || _allAbsent) && _hasSalmonTarget && typeof STAGING_ZONES !== 'undefined') {
        var withStagingZone = ranked.filter(function(r){ return !!STAGING_ZONES[r.name]; });
        if (withStagingZone.length > 0) _stagingZonePick = withStagingZone[0];
      }

      // Tier 1: rivers that have EVERY selected species (ideal)
      var withAllSpecies = ranked.filter(function(r){
        var cfg = getRiverConfig(r.name);
        return cfg && cfg.species && targetSpeciesNames.every(function(n){ return cfg.species.indexOf(n) !== -1; });
      });
      // Tier 1.5: rivers that have ALL currently FISHABLE selected species
      // e.g. Brook Trout + Coho in June → Coho is staging so fishable = [Brook Trout]
      // Duffins Upper has Brook Trout → wins over Duffins Middle which only has Coho
      var withAllFishable = ranked.filter(function(r){
        var cfg = getRiverConfig(r.name);
        return cfg && cfg.species && fishableSpecies.every(function(n){ return cfg.species.indexOf(n) !== -1; });
      });
      // Tier 2: rivers that have AT LEAST ONE selected species (fallback)
      var withAnySpecies = ranked.filter(function(r){
        var cfg = getRiverConfig(r.name);
        return cfg && cfg.species && targetSpeciesNames.some(function(n){ return cfg.species.indexOf(n) !== -1; });
      });
      if (withAllSpecies.length > 0) bestPick = withAllSpecies[0];
      else if (withAllFishable.length > 0) bestPick = withAllFishable[0];
      else if (withAnySpecies.length > 0) bestPick = withAnySpecies[0];

      // Staging-zone preference wins last — species being "in the species list" doesn't
      // matter if it's fully absent everywhere; a staging-zone river gives a real answer.
      if (_stagingZonePick) bestPick = _stagingZonePick;

      // Safety net: if bestPick doesn't actually have the target species, look for a
      // sibling section on the same river system that does. Prevents geographic mismatches
      // like picking Middle Credit (no Brook Trout) when Upper Credit has them.
      if (bestPick && targetSpeciesNames.length > 0) {
        var _bpCfg = getRiverConfig(bestPick.name);
        var _bpHasTarget = _bpCfg && _bpCfg.species && targetSpeciesNames.some(function(n){ return _bpCfg.species.indexOf(n) !== -1; });
        if (!_bpHasTarget) {
          // Find a sibling section with the target species
          var _bpCoreName = bestPick.name.replace(/^(Upper|Middle|Lower|Lower-Mid)\s+/i, '').trim();
          var _siblingWithSpecies = ranked.find(function(r) {
            if (r.name === bestPick.name) return false;
            var _rCore = r.name.replace(/^(Upper|Middle|Lower|Lower-Mid)\s+/i, '').trim();
            if (_rCore !== _bpCoreName) return false;
            var _rCfg = getRiverConfig(r.name);
            return _rCfg && _rCfg.species && targetSpeciesNames.some(function(n){ return _rCfg.species.indexOf(n) !== -1; });
          });
          if (_siblingWithSpecies) bestPick = _siblingWithSpecies;
        }
      }
    }
    if (bestPick) {
      selectedRiver = bestPick.name + (bestPick.loc ? ', ' + bestPick.loc.replace(/–/g,'-') : '');
      setResHeader(selectedRiver);
      window._beginnerLocKey = locKey;
    }
  }
  // Always expose ranked list for drive time (works in both modes)
  if (typeof ranked !== "undefined") nearbyRivers = ranked;
  if(!selectedRiver){
    var inp=document.getElementById("loc-input-field");
    inp.style.outline="2px solid #b87333";
    setTimeout(function(){inp.style.outline="";},2000);
    return;
  }
    setResHeader(selectedRiver);
  document.getElementById("landing").style.display="none";
  document.getElementById("results").style.display=""; document.getElementById("results").classList.add("active");
  window.scrollTo(0,0);
  initNotifyBar();
  window._viewSource = 'search';
  // Push history state so browser back button returns to dashboard
  history.pushState({ page: "results", river: selectedRiver }, "", window.location.pathname + "#river");
  renderResults();
  setTimeout(loadBaitImages, 800);
}

// Follow a "head there" redirect from the headline: load that section's results, and
// switch the target species when the suggestion is a different fish.
function goToSection(section, speciesName) {
  var keyMap = {'Brown Trout':'brown','Rainbow Trout':'rainbow','Steelhead':'steelhead',
    'Brook Trout':'brook','Chinook Salmon':'chinook','Coho Salmon':'coho'};
  var key = keyMap[speciesName];
  if (key) {
    selectedSpecies = [key];
    selectedSpeciesLabel = speciesName;
    document.querySelectorAll('.species-btn').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-value') === key);
    });
  }
  var loc = null;
  (nearbyRivers || []).forEach(function(r) { if (!loc && r.name === section && r.loc) loc = r.loc; });
  selectedRiver = section + (loc ? ', ' + loc.replace(/–/g, '-') : '');
  selectedRiverIsAuto = false;
  track('Redirect Followed', { river: section, species: speciesName || '' });
  window._viewSource = 'redirect';
  setResHeader(selectedRiver);
  history.pushState({ page: 'results', river: selectedRiver }, '', window.location.pathname + '#river');
  window.scrollTo(0, 0);
  renderResults();
}
document.addEventListener('click', function(e) {
  var st = e.target.closest && e.target.closest('[data-stay-section]');
  if (st) {
    e.preventDefault();
    var from = st.getAttribute('data-stay-section');
    (window._upstreamStay || (window._upstreamStay = {}))[from] = true;
    track('Upstream Stay Clicked', { river: from });
    goToSection(from, null);
    return;
  }
  var t = e.target.closest && e.target.closest('[data-goto-section]');
  if (!t) return;
  e.preventDefault();
  goToSection(t.getAttribute('data-goto-section'), t.getAttribute('data-goto-species'));
});

function goBack(){
  track('Back to Search', {});
  document.getElementById("results").style.display=""; document.getElementById("results").classList.remove("active");
  var _bar = document.getElementById("notify-bar"); if (_bar) { _bar.classList.remove("visible"); }
  document.getElementById("landing").style.display="block";
  window.scrollTo(0,0);
  // Update URL back to base without adding another history entry
  if (history.state && history.state.page === "results") {
    history.replaceState({ page: "landing" }, "", window.location.pathname);
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
(function(){
  var d=document.getElementById("trip-date");
  // Use local date for date picker — UTC causes off-by-one after 8PM Eastern
  var today=(function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
  d.value=today; d.min=today;
  var max=new Date(); max.setDate(max.getDate()+5); d.max=(function(){var n=max;return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
  var ld=document.getElementById("land-date");
  if(ld) ld.textContent=new Date().toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"}).toUpperCase();

  // Wire up all event handlers via addEventListener (no inline onclick/oninput)
  function wire(id, evt, fn){ var el=document.getElementById(id); if(el) el.addEventListener(evt,fn); }
  function wireAll(sel, evt, fn){ document.querySelectorAll(sel).forEach(function(el){ el.addEventListener(evt,fn); }); }

  // Mode toggle buttons
  wire("mode-btn-beginner", "click", function(){ setMode('beginner'); });
  wire("mode-btn-expert",   "click", function(){ setMode('expert'); });
  setMode('beginner'); // default

  // Travel time slider
  var travelRange = document.getElementById("travel-range");
  var travelLbl   = document.getElementById("travel-lbl");
  function updateTravelLabel(v) {
    v = parseInt(v);
    travelLbl.textContent = v < 60 ? "Up to " + v + " min away"
      : v === 60 ? "Up to 1 hr away"
      : v < 120  ? "Up to 1 hr " + (v-60) + " min away"
      : v === 120 ? "Up to 2 hrs away"
      : "Up to " + Math.floor(v/60) + " hr " + (v%60 ? (v%60)+" min " : "") + "away";
  }
  if (travelRange) {
    travelRange.addEventListener("input", function(){ updateTravelLabel(this.value); });
    updateTravelLabel(travelRange.value);
  }

  // Location input
  wire("loc-input-field", "change", function(){ onLocationInput(this.value); });

  // Technique family buttons — multi-select
  wireAll(".tech-family-btn", "click", function(){
    var val = this.getAttribute("data-family") || "";
    var anyBtn = document.querySelector('.tech-family-btn[data-family=""]');
    if (val === "") {
      // "Any" tapped — clear all specific, activate Any
      document.querySelectorAll(".tech-family-btn").forEach(function(b){ b.classList.remove("active"); });
      this.classList.add("active");
    } else {
      // Specific family — deactivate Any, toggle this one
      if (anyBtn) anyBtn.classList.remove("active");
      this.classList.toggle("active");
      // If nothing selected, fall back to Any
      if (document.querySelectorAll(".tech-family-btn.active").length === 0) {
        if (anyBtn) anyBtn.classList.add("active");
      }
    }
  });

  // Species buttons — multi-select
  wireAll(".species-btn", "click", function(){
    var val = this.getAttribute("data-value");
    var anyBtn = document.querySelector('.species-btn[data-value=""]');
    if (val === "") {
      document.querySelectorAll(".species-btn").forEach(function(b){ b.classList.remove("active"); });
      this.classList.add("active");
    } else {
      if (anyBtn) anyBtn.classList.remove("active");
      this.classList.toggle("active");
      if (document.querySelectorAll(".species-btn.active").length === 0) {
        if (anyBtn) anyBtn.classList.add("active");
      }
    }
  });

  // Tech chips - toggle on click
  wireAll(".tech-chip", "click", function(){ toggleTech(this); });

  // Clear all button
  wire("clear-tech-btn", "click", clearTech);

  // Forecast button
  wire("forecast-btn-el", "click", goToResults);

  // Back button
  wire("back-btn-el", "click", goBack);

  // Bait tabs
  document.querySelectorAll(".btab").forEach(function(btn){
    btn.addEventListener("click", function(){ showTab(this.getAttribute("data-tab"), this); });
  });

  // ── DEEP LINK HANDLER ─────────────────────────────────────────────────────
  // Reads ?river= and ?species= URL params from SSR landing pages.
  // Runs inside the main IIFE so all globals are guaranteed available.
  // e.g. herefishyfishy.ca/?river=Upper+Credit+River&species=brown
  (function() {
    var _params = new URLSearchParams(window.location.search);
    var _river  = _params.get('river');
    var _sp     = _params.get('species');
    if (!_river) return;

    // Resolve the incoming param to a real RIVER_CONFIG section key.
    // Guides link with friendly names like "Ganaraska River", but the app keys everything
    // (ACCESS_COORDS, STAGING_ZONES, RIVER_CONFIG.access) by full section name. An
    // unresolved parent name silently yields no access points and no staging match.
    (function(){
      var _want = _river.split(',')[0].trim().toLowerCase();
      if (typeof RIVER_CONFIG !== 'undefined' && RIVER_CONFIG[_river.split(',')[0].trim()]
          && RIVER_CONFIG[_river.split(',')[0].trim()].access) return; // already a section key
      if (typeof RIVERS_DB === 'undefined') return;
      var _exact = null, _partial = [];
      RIVERS_DB.forEach(function(r){
        var n = r.name.toLowerCase();
        if (n === _want) _exact = r.name;
        else if (n.indexOf(_want) === 0 || n.indexOf(' ' + _want) !== -1) _partial.push(r.name);
      });
      // Prefer the lower/mouth section for a bare river name — that's the reach a salmon
      // or steelhead guide is sending people to, and it's the one with harbour access.
      var _pick = _exact || _partial.filter(function(n){ return /lower|mouth/i.test(n); })[0] || _partial[0];
      if (_pick) _river = _pick;
    })();

    // Set global state
    selectedRiver      = _river; // URLSearchParams.get() already decodes
    // Links can carry more than one species: ?species=steelhead,chinook
    selectedSpecies    = _sp ? _sp.split(',').map(function(x){ return x.trim(); }).filter(Boolean) : [];
    // The banner name comes from this label. Deep links (emails, guide buttons) left it at "Any Species"
    // while the photo and headline showed the species from the link.
    var _lblMap = {brown:'Brown Trout',rainbow:'Rainbow Trout',brook:'Brook Trout',steelhead:'Steelhead',chinook:'Chinook Salmon',coho:'Coho Salmon'};
    selectedSpecies = selectedSpecies.filter(function(k){ return _lblMap[k]; });
    selectedSpeciesLabel = selectedSpecies.length === 0 ? 'Any Species'
      : selectedSpecies.map(function(k){ return _lblMap[k]; }).join(' + ');
    selectedTechFamily = [];
    appMode            = 'expert';

    // Pre-select species button visually
    if (_sp) {
      document.querySelectorAll('.species-btn').forEach(function(b) {
        b.classList.toggle('active', selectedSpecies.indexOf(b.getAttribute('data-value')) !== -1);
      });
    }

    // Show results, hide landing
    var _landing = document.getElementById('landing');
    var _results = document.getElementById('results');
    if (!_landing || !_results) return;
    _landing.style.display = 'none';
    _results.style.display = '';
    _results.classList.add('active');
    window.scrollTo(0, 0);
    // ?date=YYYY-MM-DD (the weekly email links straight to a day)
    var _dParam = _params.get('date');
    var _tdEl = document.getElementById('trip-date');
    if (_tdEl && /^\d{4}-\d{2}-\d{2}$/.test(_dParam || '')) _tdEl.value = _dParam;
    initNotifyBar();
    window._viewSource = 'deep-link';
    history.replaceState({ page: 'results', river: selectedRiver }, '', window.location.pathname + '#river');
    renderResults();
    setTimeout(loadBaitImages, 800);
  })();
  // ── END DEEP LINK HANDLER ──────────────────────────────────────────────────

})();

function clsLbl(c){
  var dot = '<span class="status-dot '+( c==="good"?"dot-good":c==="warn"?"dot-warn":"dot-bad")+'"></span>';
  var lbl = c==="good"?"Ideal":c==="warn"?"Marginal":"Poor";
  return dot+lbl;
}
function clsIcon(c){return c==="good"?"\u2713":c==="warn"?"\u25b3":"\u2715";}
// Flow card for a future date (see fetchFlowForecastDay). Days 1 to 2: a number and a likely range.
// Days 3 to 7: the range only, since a storm the forecast hasn't seen can still change it (TJ, 2026-10-24).
var FLOW_BAND_WORD = {low:"too low",normal:"normal",prime:"prime",high:"high",blown:"blown out"};
function renderFlowEstimate(est, cfg, dateStr){
  var band = flowBand(est.q, cfg);
  var c = band==="prime"||band==="normal" ? "good" : band==="high" ? "warn" : "bad";
  var day = new Date(dateStr+"T12:00:00").toLocaleDateString("en-CA",{weekday:"long",month:"short",day:"numeric"});
  var range = est.lo+" to "+est.hi+" m\u00b3/s";
  var rain = est.rainMm==null ? "" : est.rainMm>=1 ? " Rain forecast that day: "+Math.round(est.rainMm)+" mm." : " Little or no rain forecast that day.";
  document.getElementById("fval").textContent = est.showNumber ? "~"+est.q : est.lo+"\u2013"+est.hi;
  document.getElementById("ftrend").textContent = "";
  document.getElementById("ftrend").className = "trd";
  document.getElementById("flbl").textContent = est.showNumber
    ? "Estimate for "+day+": about "+est.q+" m\u00b3/s, likely "+range+". That's "+FLOW_BAND_WORD[band]+" for this river (prime is "+cfg.sweetMin+"\u2013"+cfg.sweetMax+")."+rain
    : "Estimate for "+day+": likely "+range+", most likely "+FLOW_BAND_WORD[band]+" (prime is "+cfg.sweetMin+"\u2013"+cfg.sweetMax+"). A storm the forecast hasn't picked up can still change it."+rain;
  document.getElementById("fgv").textContent = (est.showNumber ? "~"+est.q : est.lo+"\u2013"+est.hi)+" m\u00b3/s";
  var fb=document.getElementById("fbar"); fb.style.width=barW(est.q,0,cfg.flowHigh)+"%"; fb.className="gf "+c;
  var fs=document.getElementById("fstat"); fs.innerHTML='<span class="status-dot dot-'+c+'"></span>EST. '+FLOW_BAND_WORD[band].toUpperCase(); fs.className="gs "+c;
  var _fd=document.getElementById("flow-dot"); if(_fd){_fd.className="col-status-dot visible dot-"+c;}
  document.getElementById("fcl").innerHTML=[
    {t:"Estimate, not a gauge reading. Built from today's flow and the rain forecast.",c:"warn"},
    {t:"Likely range: "+range+" ("+(est.lead===1?"tomorrow":est.lead+" days out")+")",c:c},
    {t:"Check the gauge on the morning you go.",c:"warn"}
  ].map(function(i){return "<li><span class=\"ci "+i.c+"\">"+clsIcon(i.c)+"</span><span>"+i.t+"</span></li>";}).join("");
}
function barW(v,mn,mx){return Math.min(100,Math.max(2,((v-mn)/(mx-mn))*100));}

// ── WEATHER ───────────────────────────────────────────────────────────────────
async function fetchWeather(cfg){
  var lat=cfg?cfg.lat:LAT_DEFAULT, lng=cfg?cfg.lng:LNG_DEFAULT;
  var dateStr=document.getElementById("trip-date").value||(function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
  // Use local date not UTC — after 8PM Eastern, UTC is already "tomorrow"
  var today=(function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
  if(dateStr===today){
    var r=await fetch("https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lng+"&current=temperature_2m,cloudcover,winddirection_10m,windspeed_10m&hourly=cloudcover&timezone=America%2FToronto&forecast_days=1");
    var d=await r.json();
    // Build period cloud from hourly forecast for today (same logic as forecast branch)
    var _hc = d.hourly && d.hourly.cloudcover ? d.hourly.cloudcover : null;
    var _pc = null;
    if (_hc && _hc.length >= 20) {
      var avg6 = function(h,s,e){var sl=h.slice(s,e+1);return Math.round(sl.reduce(function(a,v){return a+v;},0)/sl.length);};
      _pc = { morning: avg6(_hc,5,9), midday: avg6(_hc,10,14), evening: avg6(_hc,15,20) };
    }
    return{airTemp:d.current.temperature_2m,cloudPct:d.current.cloudcover,periodCloud:_pc,windDir:d.current.winddirection_10m,windSpeed:d.current.windspeed_10m};
  } else {
    var r=await fetch("https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lng+"&daily=temperature_2m_max,temperature_2m_min,cloudcover_mean,winddirection_10m_dominant,windspeed_10m_max&hourly=cloudcover&timezone=America%2FToronto&start_date="+dateStr+"&end_date="+dateStr);
    var d=await r.json();
    var avg=(d.daily.temperature_2m_max[0]+d.daily.temperature_2m_min[0])/2;
    // Compute per-period cloud cover from hourly data (hours are 0-23 for that day)
    var _hourlyCloud = d.hourly && d.hourly.cloudcover ? d.hourly.cloudcover : null;
    var _periodCloud = null;
    if (_hourlyCloud && _hourlyCloud.length >= 20) {
      // Morning: 5-9 AM (hours 5-9), Midday: 10 AM-2 PM (hours 10-14), Evening: 3-8 PM (hours 15-20)
      var avg6 = function(h,s,e){var sl=h.slice(s,e+1);return Math.round(sl.reduce(function(a,v){return a+v;},0)/sl.length);};
      _periodCloud = {
        morning: avg6(_hourlyCloud, 5, 9),
        midday:  avg6(_hourlyCloud, 10, 14),
        evening: avg6(_hourlyCloud, 15, 20)
      };
    }
    return{airTemp:Math.round(avg*10)/10,cloudPct:d.daily.cloudcover_mean[0],periodCloud:_periodCloud,windDir:(d.daily.winddirection_10m_dominant?d.daily.winddirection_10m_dominant[0]:null),windSpeed:(d.daily.windspeed_10m_max?d.daily.windspeed_10m_max[0]:null)};
  }
}

// ── WATER TEMPERATURE ──────────────────────────────────────────────────────────
// Rivers don't follow today's air temperature. Water carries the weather of the last week
// or two, spring-fed reaches are pulled toward groundwater temperature (cooler than the air
// in summer, warmer in winter), and it rarely moves more than a degree or so a day.
// Order of preference: a live reading (CVC on the Credit, today only), the model below run
// over recent daily air temperatures plus the forecast to the trip date, then the old rough
// rule if the weather history can't be fetched.

// Last resort: air temperature plus a seasonal offset, keyed to the trip month.
function waterTempEst(airTemp, dateStr){
  var m=(dateStr ? new Date(dateStr+'T12:00:00') : new Date()).getMonth();
  var off=(m>=5&&m<=8)?-4:(m>=3&&m<=10)?-1:1;
  return Math.round((airTemp+off)*10)/10;
}


var _liveWaterPromise = null;
function fetchLiveWaterTemps() {
  if (!_liveWaterPromise) {
    _liveWaterPromise = fetch(PROXY_URL + '/water-temps')
      .then(function(r){ return r.ok ? r.json() : null; })
      .catch(function(){ return null; });
  }
  return _liveWaterPromise;
}
var _airHistoryCache = {};
function fetchAirHistory(lat, lng) {
  var key = lat + ',' + lng;
  if (!_airHistoryCache[key]) {
    _airHistoryCache[key] = fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng +
        '&daily=temperature_2m_mean&past_days=30&forecast_days=16&timezone=America%2FToronto')
      .then(function(r){ return r.json(); })
      .then(function(d){ return d && d.daily ? { time: d.daily.time, mean: d.daily.temperature_2m_mean } : null; })
      .catch(function(){ return null; });
  }
  return _airHistoryCache[key];
}
// Returns { value, kind: 'measured' | 'model' | 'rough', place }.
async function waterTempFor(section, cfg, dateStr, isToday, airTemp) {
  var base = String(section || '').split(',')[0].trim();
  var live = LIVE_WATER_STATIONS[base];
  var liveVal = null;
  if (live) {
    var lw = await fetchLiveWaterTemps();
    var rd = lw && lw.water && lw.water[live.station];
    var fresh = lw && lw.updated && (Date.now() - Date.parse(lw.updated) < 6 * 3600 * 1000);
    if (rd && fresh && rd.latest != null) liveVal = rd.latest;
  }
  if (liveVal != null && isToday) return { value: liveVal, kind: 'measured', place: live.place };

  var hist = cfg ? await fetchAirHistory(cfg.lat, cfg.lng) : null;
  // A future date on a river with a live station: start from today's reading and let the
  // difference from the model fade over a few days (waterTempFromHistory in conditions-core.js).
  var todayStr = (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
  var model = waterTempFromHistory(base, hist, dateStr, todayStr, liveVal);
  if (model != null) return { value: model, kind: 'model', place: null };
  return { value: waterTempEst(airTemp, dateStr), kind: 'rough', place: null };
}
function waterTempSourceText(info, airTemp) {
  if (!info) return 'Est. water temp (air: ' + airTemp + '\u00b0C). ';
  if (info.kind === 'measured') return 'Measured water temp, ' + info.place + ' (Credit Valley Conservation, live). ';
  if (info.kind === 'model') return 'Est. water temp from the last few weeks of weather (air: ' + airTemp + '\u00b0C). ';
  return 'Rough est. water temp (air: ' + airTemp + '\u00b0C). ';
}

// ── FLOW ──────────────────────────────────────────────────────────────────────
// Estimated flow for the next 7 days (Worker /flow-forecast, worker/flowforecast.js). One call per gauge
// per page load. Returns the day matching dateStr, or null (no model, too far out, or the call failed).
var _flowForecastCache = {};
async function fetchFlowForecastDay(gaugeId, dateStr) {
  if (!gaugeId || !PROXY_URL) return null;
  try {
    if (!_flowForecastCache[gaugeId]) {
      _flowForecastCache[gaugeId] = fetch(PROXY_URL + '/flow-forecast?station=' + gaugeId, { headers: { 'Accept': 'application/json' } })
        .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
    }
    var d = await _flowForecastCache[gaugeId];
    if (!d || !d.days) return null;
    return d.days.find(function(x){ return x.date === dateStr; }) || null;
  } catch (e) { return null; }
}

async function fetchFlow(gaugeId) {
  if (!gaugeId) return null;
  try {
    // Use proxy Worker if configured, otherwise call EC directly
    if (PROXY_URL) {
      var proxyUrl = PROXY_URL + '/flow?station=' + gaugeId;
      var proxyRes = await fetch(proxyUrl, { headers: { 'Accept': 'application/json' } });
      if (proxyRes.ok) {
        var proxyData = await proxyRes.json();
        if (proxyData && proxyData.flow != null) {
          console.log('[fetchFlow] proxy: ' + gaugeId + ' ' + proxyData.flow + ' m3/s ' + proxyData.trend);
          return { flow: proxyData.flow, trend: proxyData.trend || 'stable', at: proxyData.at };
        }
      }
    }
    // Try JSON API first with both sort param variants
    var url = 'https://api.weather.gc.ca/collections/hydrometric-realtime/items' +
      '?STATION_NUMBER=' + gaugeId +
      '&sortby=-DATETIME&limit=5&f=json';
    var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      // Try lowercase datetime sort
      url = url.replace('sortby=-DATETIME', 'sortby=-datetime');
      res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    var data = await res.json();
    var features = (data.features || []);
    console.log('[fetchFlow] ' + gaugeId + ': ' + features.length + ' features');
    if (features.length === 0) return null;

    // Log all property keys from first feature for debugging
    var props0 = features[0].properties || {};
    var keys = Object.keys(props0);
    console.log('[fetchFlow] keys:', keys.join(', '));
    console.log('[fetchFlow] sample:', JSON.stringify(props0).slice(0, 200));

    // Dynamically find discharge field (DISCHARGE, LEVEL, VALUE, value, discharge, level)
    function pick(obj, candidates) {
      for (var i = 0; i < candidates.length; i++) {
        var k = candidates[i];
        if (obj[k] != null && obj[k] !== '') return { k: k, v: parseFloat(obj[k]) };
        // case-insensitive fallback
        for (var kk in obj) {
          if (kk.toLowerCase() === k.toLowerCase() && obj[kk] != null && obj[kk] !== '')
            return { k: kk, v: parseFloat(obj[kk]) };
        }
      }
      return null;
    }

    var dischargeKeys = ['DISCHARGE', 'discharge', 'FLOW', 'flow', 'LEVEL', 'level', 'VALUE', 'value'];
    var datetimeKeys  = ['DATETIME', 'datetime', 'DATE', 'date', 'TIMESTAMP', 'timestamp'];

    var dtField = pick(props0, datetimeKeys);
    var dfField = pick(props0, dischargeKeys);

    console.log('[fetchFlow] discharge field:', dfField ? dfField.k + '=' + dfField.v : 'NOT FOUND');
    console.log('[fetchFlow] datetime field:', dtField ? dtField.k : 'NOT FOUND');

    if (!dfField) {
      console.warn('[fetchFlow] no discharge/level field found for ' + gaugeId);
      return null;
    }

    // Collect up to 3 valid readings
    var readings = [];
    for (var i = 0; i < features.length && readings.length < 3; i++) {
      var p = features[i].properties || {};
      var df = pick(p, dischargeKeys);
      if (df && !isNaN(df.v)) {
        var dt = pick(p, datetimeKeys);
        readings.push({ flow: df.v, at: dt ? dt.v : null });
      }
    }

    if (readings.length === 0) { console.warn('[fetchFlow] all null for ' + gaugeId); return null; }

    var flow  = Math.round(readings[0].flow * 100) / 100;
    var prev  = readings.length > 1 ? readings[1].flow : null;
    var trend = prev != null ? (flow > prev + 0.05 ? 'up' : flow < prev - 0.05 ? 'down' : 'stable') : 'stable';
    console.log('[fetchFlow] ' + gaugeId + ': ' + flow + ' m3/s ' + trend);
    // Show in debug panel
    var dbg = document.getElementById('flow-debug');
    if (dbg) { dbg.style.display='block'; dbg.textContent += '✓ ' + gaugeId + ': ' + flow + ' m³/s ' + trend + '\n'; }
    return { flow: flow, trend: trend, at: readings[0].at };

  } catch(e) {
    console.warn('[fetchFlow] error ' + gaugeId + ':', e.message);
    var dbg = document.getElementById('flow-debug');
    if (dbg) { dbg.style.display='block'; dbg.textContent += '✗ ' + gaugeId + ': ' + e.message + '\n'; }
    return null;
  }
}

// ── METHODS ───────────────────────────────────────────────────────────────────

// ── SALMON METHOD: SINGLE SOURCE OF TRUTH ─────────────────────────────────────
// The hero (buildTopPick) and the Technique panel (updateMethods) both have to answer
// "what method for a salmon target on this water today". That decision used to live in
// two hand-maintained copies, which drifted apart four separate times — spinning in the
// hero while the panel said float, roe recommended for a Brown Trout fallback, roe
// headlined on artificial-only water. Both callers now ask this function instead.
//
// Returns one of:
//   'spin'   — fish are staging in the lake at THIS section; spoons from shore
//   'float'  — fish are in the river here; roe or beads under a float
//   null     — no salmon-specific override; use the normal flow/temperature branches

// ── TECHNIQUE PILLAR RENDERING: SINGLE PATH ───────────────────────────────────
// updateMethods and applyStagingTechniqueOverride both wrote the three pillars, by hand,
// in slightly different ways. Beyond the drift that caused, the override rewrote the
// chip row wholesale — which silently erased the catch-and-release chip on water that is
// both a staging zone AND C-0. Both callers now
// go through here, and the C&R notice is applied last so it can never be overwritten.
function applyCatchReleaseNotice(shownSpeciesName, cfg) {
  var cr = (cfg && cfg.catchRelease) || null;
  if (!cr || !cr.length || !shownSpeciesName) return false;
  if (cr.indexOf(shownSpeciesName) === -1) return false;
  var chips = document.getElementById('m1c');
  if (chips && chips.innerHTML.indexOf('Catch &amp; release') === -1
            && chips.innerHTML.indexOf('Catch & release') === -1) {
    chips.innerHTML = '<span class="chip-cr">\u21ba Catch &amp; release only</span>' + chips.innerHTML;
  }
  var note = document.getElementById('tg-gear-note');
  if (note) {
    var msg = shownSpeciesName + ' is catch and release only on this stretch (S-0, C-0). '
            + 'Keep them wet, unhook in the water where you can, and bring pliers.';
    if ((note.textContent || '').indexOf('catch and release only') === -1) {
      note.textContent = note.textContent ? (note.textContent + ' ' + msg) : msg;
    }
    note.style.display = 'block';
  }
  return true;
}

// spec: { name, desc, chips[], subtitle, gearMethod, gearFam, conditions, baitMethod,
//         shownSpecies, cfg }
function renderTechniquePillars(spec) {
  spec = spec || {};
  var n = document.getElementById('m1n');
  var d = document.getElementById('m1d');
  var ch = document.getElementById('m1c');
  if (n) n.textContent = spec.name || '';
  if (d) d.textContent = spec.desc || '';
  if (ch) ch.innerHTML = (spec.chips || []).map(function(t){ return '<span>' + t + '</span>'; }).join('');
  var sub = document.getElementById('tg-subtitle');
  if (sub && spec.subtitle) sub.textContent = spec.subtitle;
  var tip = document.getElementById('m1tip'); if (tip) tip.textContent = '';

  try { buildGearSetup(spec.gearMethod || spec.name, spec.gearFam || '',
        spec.conditions || {cold:false, high:false, low:false}); }
  catch(e) { console.warn('gear pillar failed:', e); }

  try { renderBaitPillar(spec.baitMethod || spec.name); }
  catch(e) { console.warn('bait pillar failed:', e); }

  // Last, so nothing downstream can overwrite it.
  try { applyCatchReleaseNotice(spec.shownSpecies, spec.cfg); } catch(e) {}
}

// Which selected species decides the gear. The method code used to read only
// selectedSpecies[0], so "Steelhead + Chinook" was judged on steelhead alone and the
// Chinook was ignored. Salmon lead (their staging phase changes the method), then
// steelhead, then whatever was picked first. Species the section can't hold are skipped.
// The species the hero names when the angler hasn't picked one ("Try Chinook Salmon at...").
// Top of recommendSpecies() over the spots open on the trip date, without trout when the
// water is thermally stressful, peak or good season only, and none on a closed section.
// While salmon are staging at this section, the staging salmon comes first.
// buildTopPick names it, and renderResults stores it in window._defaultTargetSpecies
// before updateMethods so the gear matches. Without it the Technique panel fell back to trout nymphing for Chinook.
var TROUT_NAMES = ['Brown Trout', 'Rainbow Trout', 'Brook Trout'];
function defaultTargetSpecies(cfg, wt) {
  if (!cfg) return null;
  var trip = (typeof getTripDateStr === 'function') ? getTripDateStr() : null;
  if (sectionClosedOn(cfg, trip)) return null; // nothing to recommend on closed water
  // Staging at this section: the Technique panel is already on spoons at the mouth
  // (applyStagingTechniqueOverride), so the species is the salmon that is staging, even
  // while its season window still reads 'slow'.
  if (_stagingModeActive) {
    var stg = ['Chinook Salmon', 'Coho Salmon'].filter(function(n){
      return cfg.species && cfg.species.indexOf(n) !== -1;
    })[0];
    if (stg) return stg;
  }
  var open = Object.create(cfg);
  open.access = (cfg.access || []).filter(function(a){ return isAccessOpen(a, trip); });
  var thermal = wt != null && wt >= 18 && window._weatherOk !== false;
  var recs = recommendSpecies(open).filter(function(r){
    if (thermal && TROUT_NAMES.indexOf(r.name) !== -1) return false;
    return r.seasonal && (r.seasonal.quality === 'peak' || r.seasonal.quality === 'good');
  });
  return recs.length ? recs[0].name : null;
}

function methodSpeciesKey(sectionName) {
  var sel = (typeof selectedSpecies !== 'undefined' && selectedSpecies) ? selectedSpecies : [];
  var cfg = (typeof getRiverConfig === 'function' && sectionName) ? getRiverConfig(sectionName) : null;
  // Only if it lives here: a value left over from the previous river must not set the gear.
  if (!sel.length && window._defaultTargetSpecies && cfg && cfg.species &&
      cfg.species.indexOf(window._defaultTargetSpecies) !== -1) {
    var dk = {'Brown Trout':'brown','Rainbow Trout':'rainbow','Brook Trout':'brook','Steelhead':'steelhead',
              'Chinook Salmon':'chinook','Coho Salmon':'coho'}[window._defaultTargetSpecies];
    if (dk) sel = [dk];
  }
  var has = function(k) {
    var nm = {chinook:'Chinook Salmon', coho:'Coho Salmon', steelhead:'Steelhead'}[k];
    return !cfg || !cfg.species || !nm || cfg.species.indexOf(nm) !== -1;
  };
  var order = ['chinook', 'coho', 'steelhead'];
  for (var i = 0; i < order.length; i++) {
    if (sel.indexOf(order[i]) !== -1 && has(order[i])) return order[i];
  }
  return sel[0] || '';
}


// Bait/organic-bait methods that cannot stand on artificial-only water.
var BAIT_METHOD_RE = /roe|bead|bait|worm|centrepin|float fishing|drift bait|stationary/i;
// Final legality pass — applied to whatever the flow/temperature branches produced.
function legalMethodName(methodName, cfg) {
  if (cfg && cfg.artificialOnly && BAIT_METHOD_RE.test(methodName || '')) return 'Nymphing';
  return methodName;
}

function updateMethods(fc,tc,sc,flow,wt){
  var high=flow!=null&&flow>12,low=flow!=null&&flow<3,overcast=sc==="good",cold=wt<8;
  // Resolve array to single family for method rendering (first non-empty, or '')
  var fam=selectedTechFamily.length===1?selectedTechFamily[0]:selectedTechFamily.length>1?selectedTechFamily[0]:'';
  var m1,m2,m3;

  // Species context — drives method choice when no technique family is forced
  var _sp = methodSpeciesKey(selectedRiver ? selectedRiver.split(',')[0].trim() : '');
  var isSalmonSp = _sp === 'chinook' || _sp === 'coho';
  var isResidentTrout = _sp === 'brown' || _sp === 'rainbow' || _sp === 'brook';
  var warmEnoughForDries = wt != null && wt >= 10;

  // Helper: translate method names to the selected technique family
  function adapt(flyName, spinName, floatName) {
    if(fam==='spin')  return spinName;
    if(fam==='float') return floatName;
    return flyName; // fly or any
  }
  function adaptCard(flyCard, spinCard, floatCard) {
    if(fam==='spin')  return spinCard;
    if(fam==='float') return floatCard;
    return flyCard;
  }

  if(high){
    m1={n:adapt("Streamer Fishing","Heavy Spinners & Spoons","Drift Fishing · Fast Water"),
        d:adapt("Elevated flow pushes fish to edges. Swing heavy patterns through slower water.",
                "High water concentrates fish on edges. Use heavy spinners and spoons in the current seams.",
                "High flow. Drift bait or roe along the bottom in the slower edge water."),
        c:adapt("<span>Swing or strip along slower edges</span><span>Target: Undercut banks, log jams</span><span>Leader: 9 ft · 2x–3x</span>",
                "<span>Lures: Blue Fox #4, Kastmaster</span><span>Cast across, slow retrieve on edges</span><span>Heavier lure to stay down</span>",
                "<span>Bait: Roe, worms, spawn sacs</span><span>Float high to clear debris</span><span>Edge water and back eddies</span>"),
          tip:'Cast at 45° downstream and mend right away to slow the swing. Let the fly hang at the end of the drift, because fish often strike there.'};
    m2={n:adapt("Heavy Nymphing","Crankbaits & Plugs","Jigging · Slow Pools"),
        d:adapt("Go heavy, with tungsten to punch through the current. Fish the seams between fast and slow water.",
                "Crankbaits that dive deep work well in high flow. Target transition zones.",
                "Jig bait or leeches slowly through deeper holding pools out of main current."),
        c:adapt("<span>Flies: Stonefly, tungsten caddis</span><span>Extra split shot</span><span>Set indicator high</span>",
                "<span>Lures: Rapala CD7, Flatfish</span><span>Dive into the current seams</span><span>Slow retrieve, let it bump bottom</span>",
                "<span>Bait: Leeches, nightcrawlers</span><span>Fish: Deep pools, slow eddies</span><span>Very slow presentation</span>"),
          tip:'Stack-mend heavily to keep the fly vertical. Add weight until you feel it ticking bottom. If it’s not near the bottom, you won’t catch fish.'};
    m3={n:adapt("Dry Fly","Surface Lures","Surface Float · Back Eddies"),
        d:adapt("Difficult in high flow. Only in back-eddies and slow edge water.",
                "Popping lures in back-eddies can trigger strikes. Mostly a secondary option in high water.",
                "Find calm back-eddies. Float a worm or roe near the surface in these slack spots."),
        c:adapt("<span>Back-eddies only</span><span>Watch for rises first</span>",
                "<span>Target: Back-eddies only</span><span>Lures: Small poppers, stick baits</span>",
                "<span>Float: Back-eddies and slack water</span><span>Bait: Roe, small worms</span>"),
          tip:'Ignore the main current. Find back-eddies behind boulders or along the bank, cast tight to the seam and keep all line on slow water.'};
  } else if(low){
    m1={n:adapt("Finesse Nymphing","Light Spinners · Slow & Small","Tight-Line Float · Clear Water"),
        d:adapt("Low clear water demands finesse. Long leaders, fine tippet, small flies. Stealth is everything.",
                "Low clear water means go small and slow. Light spinners cast well upstream and retrieved slowly.",
                "Low, clear water makes fish spooky. Use a small float, fine line and natural bait drifted naturally."),
        c:adapt("<span>Flies: Midge, PT #18–22</span><span>Leader: 12–15 ft · 5x–6x</span><span>Sight-fish visible trout</span>",
                "<span>Lures: Mepps #1, small Vibrax</span><span>Cast upstream, slow retrieve</span><span>Use 4 lb fluorocarbon</span>",
                "<span>Bait: Small worms, maggots, roe</span><span>Fine leader: 4–6 lb</span><span>Small float, minimal weight</span>")};
    m2={n:adapt("Dry Fly","Micro Jigs & Small Plugs","Natural Drift · Bait"),
        d:adapt("Low water can trigger excellent dry fly action especially in evenings.",
                "Small micro-jigs and inline spinners work well in low clear water when retrieved very slowly.",
                "Natural bait drifted drag-free through pools is ideal in low clear conditions."),
        c:adapt("<span>Best: Evenings, overcast</span><span>Flies: Caddis, midge, Adams</span>",
                "<span>Lures: 1/32 oz jig, small Rapala</span><span>Ultra-slow retrieve</span>",
                "<span>Bait: Worms, roe, minnows</span><span>No weight if possible</span>"),
          tip:'Use a longer tippet (5x–6x) and smaller flies. Stay low and make your first cast count, because fish are spooky in clear, shallow water.'};
    m3={n:adapt("Streamer Fishing","Larger Spoons · Deep Pools","Drift Fishing · Pools"),
        d:adapt("Low water makes streamers harder. Small profiles, very slow retrieves.",
                "In low water, larger spoons can still work in the deepest pools with a slow flutter retrieve.",
                "Drop bait into the deep holes and let it sit. Don't move it. Let the fish come to you."),
        c:adapt("<span>Flies: Small woolly bugger, sculpin</span><span>Very slow retrieve</span>",
                "<span>Lures: Kastmaster 1/4 oz</span><span>Flutter down into pools</span>",
                "<span>Bait: Nightcrawler, minnow</span><span>Fish: Deepest holding pools</span>"),
          tip:'Downsize to size 4–6 streamers, fish very slowly. Strip once, pause 3–4 seconds. Target deeper undercut banks and slow tailouts.'};
  } else if(overcast&&tc==="good"){
    m1={n:adapt("Nymphing","Spinner Fishing","Float Fishing · Runs"),
        d:adapt("Prime conditions. Dead-drift through the feeding lanes all day, since overcast keeps fish feeding.",
                "Overcast = active fish all day. Spinners retrieved through runs and riffles will draw strikes.",
                "Overcast opens the full day. Float fish runs and riffles from first light through evening."),
        c:adapt("<span>Best: All day in overcast</span><span>Fish: Head of runs, tailouts</span><span>Leader: 9–12 ft · 4x–5x</span>",
                "<span>Lures: Mepps #2–3, Blue Fox</span><span>Cast across and downstream</span><span>Vary retrieve speed</span>",
                "<span>Bait: Roe, worms, minnows</span><span>Float: Medium to large</span><span>Work every run systematically</span>"),
          tip:'Work the seam between fast and slow water, drifting your nymph along that edge at exactly the speed of the current. No drag, no slack.'};
    m2={n:adapt("Dry Fly","Crankbaits · Subsurface","Jigging · Pools"),
        d:adapt("Overcast opens the full-day dry fly window. Watch for hatches from mid-morning on.",
                "Crankbaits worked just below the surface imitate baitfish. Overcast = reaction strikes.",
                "Jig bait slowly through pools. Active fish in overcast will move to investigate."),
        c:adapt("<span>Best: Mid-morning to evening</span><span>Watch: Sulphurs, caddis, PMDs</span>",
                "<span>Lures: Rapala CD5, Flatfish</span><span>Just below surface</span>",
                "<span>Bait: Worms, leeches</span><span>Slow hop along bottom</span>"),
          tip:'Watch the water before you cast, because rising fish tell you where to go. Cast 2 feet upstream of the rise and drift drag-free over the fish.'};
    m3={n:adapt("Streamer Fishing","Heavy Spoons · Deep","Drift Bait · Deep Runs"),
        d:adapt("Excellent in overcast, when fish are less wary and hit big patterns harder.",
                "Heavy spoons worked deep in overcast conditions draw aggressive strikes from big fish.",
                "Drift heavier bait deep through the main runs. Fish are actively feeding."),
        c:adapt("<span>Best: All day in overcast</span><span>Fish: Deep pools, undercut banks</span>",
                "<span>Lures: Kastmaster 3/8 oz, Crocodile</span><span>Count down to depth</span>",
                "<span>Bait: Large worms, spawn bags</span><span>Keep bait near bottom</span>"),
          tip:'Cover water quickly, with one or two casts per spot before moving downstream. Strip fast and erratically. Aggressive fish don’t want a slow meal.'};
  } else if(cold){
    m1={n:adapt("Slow Nymphing","Slow Jigs · Bottom","Stationary Bait · Pools"),
        d:adapt("Cold water means slow metabolism. Fish near the bottom, because they won't chase.",
                "Cold water fish are sluggish. Jig a lure extremely slowly along the bottom. Long pauses.",
                "Cold water fish won't move far. Set bait on the bottom in a pool and let it sit."),
        c:adapt("<span>Flies: Small hare, PT, midge #16–20</span><span>Right on the bottom</span><span>Long drifts in slow water</span>",
                "<span>Lures: Small jig 1/16 oz</span><span>Crawl it along bottom</span><span>10+ second pauses</span>",
                "<span>Bait: Worm, roe, minnow</span><span>No float, bottom rig</span><span>Deepest, slowest pools</span>"),
          tip:'Add extra weight and set your indicator at only 1.5x the water depth. Slow your drift right down, because cold fish barely move to take a fly.'};
    m2={n:adapt("Streamer (Slow)","Very Slow Spoon","Slow Float · Deep"),
        d:adapt("Slow, short strips near the bottom with long pauses. The fish won't move far.",
                "Flutter a spoon slowly down into deep pools. Very slow, very deliberate.",
                "Float a bait very slowly through the deepest pools. Small float, minimal movement."),
        c:adapt("<span>Very slow retrieve, long pauses</span><span>Fish: Deep slow pools</span>",
                "<span>Lures: Small Kastmaster</span><span>Flutter retrieve, 5 sec pauses</span>",
                "<span>Small float, heavy weight</span><span>Fish the deepest hole</span>"),
          tip:'Cast tight to the bank and let the fly sink to the bottom before the first strip. Strip once, count to 5, strip again. Patience wins.'};
    m3={n:adapt("Dry Fly","Surface Lures","Surface Float"),
        d:adapt("Unlikely in cold water. Skip unless you see active rises.",
                "Surface lures won't work in cold water. Skip this unless the sun warms things up.",
                "Surface presentations unlikely in cold water. Focus on bottom rigs instead."),
        c:adapt("<span>Skip unless you see rises</span><span>Water below 8°C: fish bottom</span>",
                "<span>Skip in cold water</span><span>Return to jig or bottom rig</span>",
                "<span>Switch to bottom rig</span><span>Not worth it below 8°C</span>"),
          tip:'Only worth trying if you see active rises. If you do, match the smallest insect on the water and use a long, fine tippet.'};
  } else {
    // ── NORMAL CONDITIONS — recommendation adapts to target species ──────────
    if (isSalmonSp && fam !== 'fly' && fam !== 'spin') {
      // Salmon: float fishing with roe/beads is the standard Ontario approach
      m1={n:'Float Fishing · Roe & Beads',
          d:'For salmon in the river, drift roe bags or beads under a float through holding water. This is the most productive salmon method on Ontario rivers.',
          tip:'Set your float so the bait drifts just above the bottom. Cast upstream, keep the line tight and watch for the float to dip. That’s your bite.',
          c:'<span>Bait: Roe bags, soft beads</span><span>Float: Match depth to pool</span><span>Fish: Deep pools, tailouts, current seams</span>'};
      m2={n:'Bottom Bouncing',
          d:'Drift roe or beads along the bottom without a float in faster runs. Effective when fish hold deep.',
          tip:'Use enough weight to feel the bottom every other tap. Keep the rod tip high, follow the drift, and set on any pause or tick.',
          c:'<span>Bait: Roe, beads, yarn</span><span>Add split shot to reach bottom</span><span>Fish: Fast runs, deep pockets</span>'};
      m3={n:'Swung Streamers / Spoons',
          d:'Swing large streamers or cast spoons through runs to trigger aggressive salmon. Works best on fresh, active fish.',
          tip:'Take one step downstream after each cast and cover the run systematically. Active salmon will be somewhere in the run, and you need to find them.',
          c:'<span>Lures: Spoons, large streamers</span><span>Swing across current</span><span>Best on fresh-run fish</span>'};
    } else if (isResidentTrout && warmEnoughForDries && overcast) {
      // Resident trout + warm water + overcast \u2014 prime dry fly conditions
      m1={n:adapt("Dry Fly","Surface Lures","Float Fishing"),
          d:adapt("Warm water and overcast sky mean active surface feeding. Match the hatch and fish the rises.",
                  "Topwater lures can draw aggressive strikes in warm overcast conditions.",
                  "Drift natural bait through feeding lanes where you see surface activity."),
          c:adapt("<span>Flies: Adams, Elk Hair Caddis #14\u201316</span><span>Watch for rising fish</span><span>Leader: 12 ft \u00b7 5x</span>",
                  "<span>Lures: Small surface plugs</span><span>Twitch over likely lies</span>",
                  "<span>Bait: Worms, small roe</span><span>Drift through rises</span>"),
          tip:adapt('Look for fish rising and cast your fly 2 feet upstream of the rise. Let it drift naturally over the fish without dragging it. If nothing happens after a few drifts, try a different fly.',
                    'Cast surface lures near rises or overhanging banks. Let it sit still for a moment, then twitch gently.',
                    'Watch for feeding fish near the surface and drift your bait through those areas.')};
      m2={n:adapt("Nymphing","Spinner Fishing","Tight-Line Drift"),
          d:adapt("Dead-drift nymphs through seams when fish aren't looking up. The reliable producer.",
                  "Spinners cover water and find active trout through runs and seams.",
                  "Drift bait naturally along the bottom through holding water."),
          c:adapt("<span>Flies: Hare's Ear, PT #14\u201318</span><span>Fish: Seams, tailouts</span><span>Leader: 9\u201312 ft \u00b7 4x\u20135x</span>",
                  "<span>Lures: Mepps #2\u20133, Vibrax</span><span>Cast across and down</span>",
                  "<span>Bait: Roe, worms</span><span>Dead drift through runs</span>")};
      m3={n:adapt("Streamer Fishing","Spoons & Crankbaits","Jig Fishing"),
          d:adapt("Swing streamers through deeper pools for larger fish, especially in low light.",
                  "Spoons and crankbaits target bigger fish holding in pools.",
                  "Jig soft plastics or bait through deeper pools."),
          c:adapt("<span>Best: Dawn, dusk, overcast</span><span>Fish: Deep pools, undercuts</span>",
                  "<span>Lures: Kastmaster, Rapala</span><span>Work the pools</span>",
                  "<span>Lure: 1/8 oz jig + worm</span><span>Hop through pools</span>")};
    } else {
      // Default resident-trout / general approach \u2014 nymphing leads, dry fly secondary
      m1={n:adapt("Nymphing","Spinner Fishing","Float Fishing"),
          d:adapt("The reliable starting point for resident trout. Dead-drift subsurface flies through seams and feeding lanes.",
                  "Spinners are the go-to for Southern Ontario rivers. Cast across, retrieve through current seams.",
                  "Float fishing with bait or roe is one of the most effective methods on Ontario rivers."),
          c:adapt("<span>Best: 8\u201314\u00b0C, moderate flow</span><span>Fish: Head of runs, tailouts, seams</span><span>Leader: 9\u201312 ft \u00b7 4x\u20135x</span>",
                  "<span>Lures: Mepps #2\u20133, Blue Fox Vibrax</span><span>Cast across and down</span><span>Vary retrieve, match current speed</span>",
                  "<span>Bait: Roe, worms, minnows</span><span>Float: Match depth to water</span><span>Dead drift through runs and pools</span>"),
          tip:adapt('Cast upstream into the fast water and let the fly drift naturally into the slower pool below. Keep your line off the water so the fly moves with the current, with no drag.',
                    'Cast across the river and let the current swing your spinner downstream. A slow, steady retrieve works best.',
                    'Set the float so the bait hangs 6 inches off the bottom. Cast upstream and let it drift naturally through the run.')};
      m2={n:adapt("Dry Fly","Spoons & Crankbaits","Jig Fishing"),
          d:adapt("When fish are rising or water is warm, switch to dries. Especially good mornings and evenings.",
                  "Spoons and crankbaits cover water fast and target feeding fish in pools and runs.",
                  "Jigging bait or soft plastics through pools is highly effective and easy to learn."),
          c:adapt("<span>Flies: Adams, Caddis #14\u201318</span><span>Best: Rising fish, evenings</span>",
                  "<span>Lures: Kastmaster, Rapala Original</span><span>Work pools and deeper runs</span>",
                  "<span>Lure: 1/8\u20131/4 oz jig + worm</span><span>Hop along bottom through pools</span>")};
      m3={n:adapt("Streamer Fishing","Surface Lures","Bottom Bouncing"),
          d:adapt("Swing or strip through deeper pools and undercut banks. Most effective in low light.",
                  "Surface lures draw reaction strikes from aggressive fish in low light.",
                  "Drift bait along the bottom through deeper holding water."),
          c:adapt("<span>Best: Low light, overcast, rising flow</span><span>Fish: Deep pools, undercut banks</span>",
                  "<span>Lures: Surface plugs, poppers</span><span>Dawn and dusk</span>",
                  "<span>Bait: Roe, worms + split shot</span><span>Fish: Deep runs</span>")};
    }
  }

  // ── SALMON IN RIVER — float fishing leads, always ─────────────────────────
  // Once Chinook/Coho are in the river, float-fished roe bags or beads are the most
  // productive method on Ontario rivers by a wide margin. The flow/clarity branches
  // above are tuned for resident trout and will otherwise hand back nymphing or
  // streamers, which under-serve salmon. Lures and streamers stay available as
  // secondary and tertiary options because they do produce on fresh, aggressive fish.
  // Skipped when the angler has explicitly forced fly or spin gear — respect their kit.
  // Also skipped while salmon are STAGING: those fish are still in the lake, so float-fished
  // roe is the wrong answer no matter what the river flow says.
  // Bait is illegal on artificial-only water, so a roe-and-beads recommendation there is
  // not merely suboptimal — it tells the angler to break the regs.
  // updateMethods has no `cfg` in scope — it takes only (fc,tc,sc,flow,wt). Referencing
  // one threw a ReferenceError that killed the whole function, blanking the hero and the
  // Technique panel. Resolve the section config here instead.
  var _cfgUM = (typeof getRiverConfig === 'function') ? getRiverConfig(selectedRiver) : null;
  var _artificialOnly = !!(_cfgUM && _cfgUM.artificialOnly);
  var _salmonMode = salmonMethodMode({
    speciesKey: _sp, fam: fam, cfg: _cfgUM,
    stagingModeActive: _stagingModeActive,
    migratoryBlocked: window._migratoryBlockedSection
  });
  // Handle BOTH modes the shared function can return. Previously only 'float' was acted
  // on and 'spin' was silently dropped, leaving updateMethods to produce trout nymphing
  // for staging salmon and depending on applyStagingTechniqueOverride running afterwards
  // to correct it. Correct-by-ordering is what caused the earlier drift bugs; this is now
  // correct standalone, and the override is belt-and-braces rather than load-bearing.
  if (_salmonMode === 'spin') {
    m1 = {n:SALMON_MODE_METHOD.spin,
          d:'Fish aren’t in the river yet. They’re staging out front, so cast from the pier, beach or river mouth, fan casting and varying your retrieve depth.',
          tip:'Fish aren’t in the river yet. They’re staging out front, so cast from the pier, beach or river mouth, fan casting and varying your retrieve depth.',
          c:''};
    m2 = {n:'Trolling', d:'Troll spoons parallel to shore at harbour depth.', c:''};
    m3 = {n:'Jigging', d:'Vertical jig near structure at the harbour mouth.', c:''};
    fam = 'spin';
  } else if (_salmonMode === 'float' || _salmonMode === 'spin-float') {
    var _fDepth = high ? 'Run deeper and heavier. High water pushes fish to the edges.'
                : low  ? 'Downsize and lengthen your leader. Low, clear water makes fish spooky.'
                : 'Set the float so the bait drifts just above the bottom.';
    var _fWhere = high ? 'Fish: Slower edge water, seams, back eddies'
                : low  ? 'Fish: Deepest pools and tailouts'
                : 'Fish: Deep pools, tailouts, current seams';
    var _fishWord = _sp === 'steelhead' ? 'steelhead' : 'salmon';
    var _onSpin = _salmonMode === 'spin-float';
    m1 = {n:_onSpin ? 'Float Fishing on a Spinning Rod · Roe & Beads' : SALMON_MODE_METHOD.float,
          d:(_onSpin ? 'Your spinning rod works for this. ' : '') + 'For ' + _fishWord + ' in the river, drift roe bags or beads under a float through holding water. This is the most productive ' + _fishWord + ' method on Ontario rivers.',
          tip:_fDepth + ' Cast upstream, keep the line tight and watch for the float to dip. That’s your bite.',
          c:'<span>Bait: Roe bags, soft beads</span><span>Float: Match depth to pool</span><span>' + _fWhere + '</span>'};
    m2 = {n:'Bottom Bouncing',
          d:'Drift roe or beads along the bottom without a float in faster runs. Effective when fish hold deep.',
          tip:'Use enough weight to feel the bottom every other tap. Keep the rod tip high, follow the drift, and set on any pause or tick.',
          c:'<span>Bait: Roe, beads, yarn</span><span>Add split shot to reach bottom</span><span>Fish: Fast runs, deep pockets</span>'};
    m3 = {n:'Swung Streamers / Spoons',
          d:'Swing large streamers or cast spoons through runs to trigger aggressive fish. Usually less consistent than float fishing, but it can be the better choice on fresh, active fish.',
          tip:'Take one step downstream after each cast and cover the run systematically. Active fish will be somewhere in the run, and you need to find them.',
          c:'<span>Lures: Spoons, large streamers</span><span>Swing across current</span><span>Best on fresh-run fish</span>'};
  }

  // Final legality pass. Whatever the flow/temperature branches chose, a bait or roe method
  // cannot stand on artificial-only water. Swap to the nearest legal equivalent rather
  // than showing nothing.
  if (_artificialOnly) {
    var _legal = function(m) {
      if (!m || legalMethodName(m.n, _cfgUM) === m.n) return m;
      return {n:'Nymphing', d:'Artificial lures only on this water. Fish nymphs on a dead drift through runs and seams.',
              tip:'Only artificial lures and one single-pointed barbless hook are permitted here. No roe, worms or other organic bait.',
              c:'<span>Artificial lures only</span><span>Single barbless hook</span><span>Fish: Runs and seams</span>'};
    };
    m1 = _legal(m1); m2 = _legal(m2); m3 = _legal(m3);
  }

  // Clear any staging override left over from a previous search before writing fresh methods
  _stagingTechApplied = false;
  // Default the conditions subtitle to the real target. The staging path overrides this
  // afterwards if the fish turn out to still be in the lake.
  var _spNameMap = {brown:'Brown Trout', rainbow:'Rainbow Trout', brook:'Brook Trout',
                    steelhead:'Steelhead', chinook:'Chinook Salmon', coho:'Coho Salmon'};
  try { updateConditionsSubtitle(_spNameMap[_sp] || null, false); } catch(_csErr2) {}
  var _tgSubReset = document.getElementById('tg-subtitle');
  if (_tgSubReset) _tgSubReset.textContent = 'Primary method with recommended setup and baits. Tap alternatives to expand.';

  // Same renderer the staging override uses — see renderTechniquePillars. The C&R notice
  // is applied inside it, last, so nothing can overwrite the chip.
  var _spNameC = {brown:'Brown Trout', rainbow:'Rainbow Trout', brook:'Brook Trout',
                  steelhead:'Steelhead', chinook:'Chinook Salmon', coho:'Coho Salmon'};
  renderTechniquePillars({
    name: m1.n,
    desc: m1.tip || m1.d,
    chips: [],
    gearMethod: m1.n,
    gearFam: _salmonMode === 'spin-float' ? 'spin-float' : fam,
    conditions: {cold:cold, high:high, low:low},
    baitMethod: m1.n,
    shownSpecies: (typeof window._shownSpeciesName === 'string' && window._shownSpeciesName)
                  || (_sp ? _spNameC[_sp] : null),
    cfg: _cfgUM
  });

  setTimeout(function(){
    // Read the CURRENT method from the DOM, not the closed-over m1.n. If the staging
    // override landed in the intervening 50 ms, m1.n is stale and re-rendering from it
    // silently replaced the salmon spoons with trout nymphs.
    try {
      var _live = document.getElementById('m1n');
      renderBaitPillar((_live && _live.textContent) || m1.n);
    } catch(_bp2) {}
  }, 50);
}

// ── BAIT TABS ─────────────────────────────────────────────────────────────────
function showTab(tab,btn){
  // Only affect primary bait tabs (not cloned secondary/tertiary ones)
  var primaryBtabs = btn.closest(".btabs:not([id])");
  var primaryBsec  = document.querySelector(".tg-baits:not([id])");
  if (primaryBtabs) primaryBtabs.querySelectorAll(".btab").forEach(function(b){b.classList.remove("active");});
  else document.querySelectorAll(".btabs:not([id]) .btab").forEach(function(b){b.classList.remove("active");});
  btn.classList.add("active");
  // Only toggle primary bpanels (those with single-word ids like "p-nymphs")
  ["p-nymphs","p-streamers","p-dries","p-lures","p-float","p-salmon-lures"].forEach(function(id){
    var el=document.getElementById(id); if(el) el.classList.remove("active");
  });
  var target = document.getElementById("p-"+tab);
  if (target) target.classList.add("active");
}

// ── RENDER RESULTS ────────────────────────────────────────────────────────────
// In upstreamWindowOn() dates, open the furthest reach upstream that is open on the trip date for a
// migratory species the reader is after, instead of suggesting it in the headline (TJ, 2026-10-25; was
// "suggest, not switch" from 2026-10-16). Runs before anything renders, so there's one render. Not when
// the fish are still in the lake off this mouth (the staging headline), and not after "Stay on ...".
// (Deep links render before this line runs, so the stay list lives on window.)
function autoUpstreamSection() {
  var stay = window._upstreamStay || (window._upstreamStay = {});
  var here = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
  var cfg = here ? getRiverConfig(here) : null;
  if (!cfg || stay[here]) return null;
  var trip = getTripDateStr();
  var mig = ['Steelhead', 'Chinook Salmon', 'Coho Salmon'];
  if (isLakeRunBrownSection(here)) mig.push('Brown Trout');
  var names = {brown:'Brown Trout',rainbow:'Rainbow Trout',brook:'Brook Trout',steelhead:'Steelhead',chinook:'Chinook Salmon',coho:'Coho Salmon'};
  var picked = (selectedSpecies || []).map(function(k){ return names[k]; }).filter(Boolean);
  var want = picked.length ? picked
    : (cfg.species || []).filter(function(n){ var q = getCurrentSeason(n, trip, here); return q && q.quality !== 'absent'; });
  want = want.filter(function(n){ return mig.indexOf(n) !== -1; });
  if (!want.length) return null;
  // Same test as the hero's staging headline: a picked run species that is out of season, at a mouth.
  if (picked.length === 1 && STAGING_ZONES[here] && /Chinook|Coho|Steelhead/.test(picked[0])) {
    var sw = getCurrentSeason(picked[0], trip);
    if (sw && sw.quality === 'absent') return null;
  }
  var up = furthestUpstreamOpen(here, want, trip);
  return up ? { from: here, section: up.section, species: up.species } : null;
}

async function renderResults(){
  window._upstreamFrom = null;
  var _au = autoUpstreamSection();
  if (_au) {
    var _loc = null;
    (nearbyRivers || []).forEach(function(r) { if (!_loc && r.name === _au.section && r.loc) _loc = r.loc; });
    selectedRiver = _au.section + (_loc ? ', ' + _loc.replace(/–/g, '-') : '');
    selectedRiverIsAuto = false;
    window._upstreamFrom = _au;
    track('Upstream Auto Switch', { from: _au.from, river: _au.section });
  }
  var cfg = getRiverConfig(selectedRiver);
  trackRiverViewed();
  // Keep the header in sync on every path. Deep links set selectedRiver and call
  // renderResults directly without going through selectRiver, which previously left
  // the hardcoded "Grand River, Fergus" placeholder showing.
  try { setResHeader(selectedRiver); } catch(_shErr) {}
  // renderRiverUI moved below the staging await — the access list needs the resolved
  // phase to decide whether to show mouth spots only.


  var dateStr=document.getElementById("trip-date").value||(function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
  // Compare using local Eastern date, not UTC — after 8PM ET the UTC date is already "tomorrow"
  var _localToday=(function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
  var isToday=dateStr===_localToday;
  var now=new Date();
  var _vtime=document.getElementById("vtime"); if(_vtime && _vtime.textContent !== undefined) _vtime.textContent=now.toLocaleTimeString("en-CA",{hour:"2-digit",minute:"2-digit"});
  var _vhrd=document.getElementById("vhead"); if(_vhrd) _vhrd.textContent="Reading conditions\u2026";
  var _vsig=document.getElementById("vsig"); if(_vsig){_vsig.className="vsig"; _vsig.textContent="\u2026";}

  var airTemp=null, cloudPct=null, weatherOk=false, _stagingWeather=null;
  try{
    var wx=await fetchWeather(cfg);
    if(wx && wx.airTemp!=null && !isNaN(wx.airTemp)){
      airTemp=wx.airTemp; cloudPct=wx.cloudPct; weatherOk=true;
      _stagingWeather = {cloudPct:wx.cloudPct, windDir:wx.windDir, windSpeed:wx.windSpeed};
      window._periodCloud = wx.periodCloud || null;
    }
  } catch(e){ console.warn("Weather failed",e); }
  // Fall back to seasonal-typical only if the fetch genuinely failed
  if(!weatherOk){ airTemp=12; cloudPct=50; }
  window._weatherOk = weatherOk; // expose — used to avoid false-confidence thermal reads on stale/fallback data
  var _wtInfo = null;
  try { _wtInfo = await waterTempFor(selectedRiver, cfg, dateStr, isToday, airTemp); } catch(_wtErr) { _wtInfo = null; }
  var wt = (_wtInfo && _wtInfo.value != null) ? _wtInfo.value : waterTempEst(airTemp, dateStr);
  window._waterTempInfo = _wtInfo;
  // Salmon staging card (mouth sections, staging species, in-season)
  var _stagingPromise = null;
  try {
    if (typeof renderStagingCard==="function" && selectedRiver && typeof STAGING_ZONES !== "undefined") {
      // Resolve the staging section system-wide: exact match first, else find the
      // mouth section on the same river system (Middle Credit → Lower Credit).
      var _srBase = selectedRiver.split(',')[0].trim();
      // stagingSectionFor() in conditions-core.js (shared with the weekly email).
      var _stgSection = stagingSectionFor(_srBase);
      window._migratoryBlockedSection = (!_stgSection && stagingZoneForSection(_srBase)) ? _srBase : null;
      // Only render for salmon/steelhead intent — the card itself also checks season windows
      // Kick the staging read off now but keep the promise: it is awaited below, before
      // anything renders. Previously this was fire-and-forget and raced the main render,
      // which is what let the hero, the technique panel and the bait list disagree.
      if (_stgSection) { _stagingPromise = renderStagingCard(_stgSection, _stagingWeather); }
      else { _stagingModeActive = false; }
    }
  } catch(e){ console.warn("staging card",e); }

  var flow=null,trend="stable",flowAt=null,flowEst=null;
  if(isToday){
    var lf=await fetchFlow(cfg.gauge);
    if(lf){flow=lf.flow;trend=lf.trend;flowAt=lf.at;}
  } else {
    // Future date: an estimate from today's flow and the rain forecast, up to 7 days out. It is shown
    // in the flow card only; the rating for a future date still leaves flow out.
    flowEst=await fetchFlowForecastDay(cfg.gauge, dateStr);
  }
  window._flowEst=flowEst;   // the summary tile reads it

  // Must sit OUTSIDE the isToday branch: a forecast date skipped both of these, which
  // left the access grid empty and the staging phase unresolved, so the hero fell back to
  // the calendar and pointed at the harbour on a date the fish are in the river.
  if (_stagingPromise) {
    try { await _stagingPromise; }
    catch(_spErr) { console.warn('staging read failed, rendering without it:', _spErr); }
  }
  try { renderRiverUI(cfg); } catch(_ruErr) {
    console.error('renderRiverUI failed:', _ruErr);
    var _agFallback = document.getElementById('access-grid');
    if (_agFallback && !_agFallback.innerHTML.trim()) {
      _agFallback.innerHTML = '<div class="ac"><div class="acard-body">' +
        '<strong>Access points couldn\u2019t load for this river.</strong>' +
        '<p style="margin-top:.4rem">Check the Conservation Authority website for this watershed, ' +
        'and verify current regulations before heading out.</p></div></div>';
    }
  }

  var skyl=cloudPct>=80?"Overcast":cloudPct>=50?"Mostly Cloudy":cloudPct>=20?"Partly Cloudy":"Clear";
  var fc=flow!=null?clsFlow(flow,cfg):"warn";
  var tc=weatherOk?clsTemp(wt):"warn"; var sc=weatherOk?clsSky(cloudPct):"warn";
  var score=[fc,tc,sc].reduce(function(a,c){return a+(c==="good"?2:c==="warn"?1:0);},0);
  var vl=flow!=null?(score>=5?"good":score>=3?"warn":"bad"):"warn";

  // Species display
  document.getElementById("species-display").textContent = selectedSpeciesLabel;

  // Species photo in banner circle — always matches what the user selected,
  // so the photo and name label are always consistent. The headline + badge
  // explain any substitution (e.g. "NOT IN THIS SECTION").
  (function() {
    var _fishEl = document.getElementById("species-banner-fish");
    if (!_fishEl) return;
    var _nameToKey = {"Brown Trout":"brown","Rainbow Trout":"rainbow","Brook Trout":"brook","Steelhead":"steelhead","Chinook Salmon":"chinook","Coho Salmon":"coho"};
    var _photoKey = null;
    // Use the selected species (matches the name label in the banner)
    if (selectedSpecies && selectedSpecies.length > 0) {
      _photoKey = selectedSpecies[0]; // already a key like "chinook"
    } else if (window._effectiveRecommendedSpecies) {
      // No explicit selection — use the recommendation (Any Species mode)
      var _eff = window._effectiveRecommendedSpecies;
      if (_eff.indexOf(" + ") === -1 && _nameToKey[_eff]) _photoKey = _nameToKey[_eff];
    }
    if (_photoKey && SPECIES_PHOTOS[_photoKey]) {
      _fishEl.innerHTML = '<img src="' + SPECIES_PHOTOS[_photoKey] + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block">';
    } else {
      _fishEl.innerHTML = ''; // placeholder (empty circle) for Any Species / unknown
    }
  })();

  // ── SPECIES SEASONAL CHECK ───────────────────────────────────────────────
  // Get current seasonal status for the selected species on this river
  var _sm2={"brown":"Brown Trout","rainbow":"Rainbow Trout","brook":"Brook Trout","steelhead":"Steelhead","chinook":"Chinook Salmon","coho":"Coho Salmon"};
  var targetNames=selectedSpecies.map(function(k){return _sm2[k];}).filter(Boolean);
  var targetName=targetNames.length===1?targetNames[0]:null;
  var riverSpeciesList=cfg.species||[];
  var allMissing=targetNames.length>0&&targetNames.every(function(n){return riverSpeciesList.indexOf(n)===-1;});
  var speciesOnRiver=targetNames.length===0||!allMissing;
  var qualOrd=['peak','good','slow','absent'];
  var speciesSeasonal=null,speciesQuality=null;
  var _checkList=targetNames.length>0?targetNames.filter(function(n){return riverSpeciesList.indexOf(n)!==-1;}):riverSpeciesList;
  _checkList.forEach(function(n){
    var w=getCurrentSeason(n, getTripDateStr());if(!w)return;
    if(!speciesSeasonal||qualOrd.indexOf(w.quality)<qualOrd.indexOf(speciesSeasonal.quality)){
      speciesSeasonal=w;speciesQuality=w.quality;
      if(targetNames.length===1)targetName=n;
    }
  });

  // Species season badge in header
  var badge = document.getElementById("species-season-badge");
  if (badge) {
    if (targetNames.length === 0) {
      badge.textContent = '';
    } else if (!speciesOnRiver) {
      // ALL selected species missing from this section
      badge.textContent = 'Not in this section';
      badge.dataset.state = 'bad';
    } else {
      // At least one selected species is on this river/section
      var _migratory = ['Chinook Salmon','Coho Salmon','Steelhead'];

      // For multi-species: note which are missing from this section
      var _missingSection = targetNames.filter(function(n){ return riverSpeciesList.indexOf(n) === -1; });
      var _allMigratoryAbsent = targetNames.every(function(n){
        var w = getCurrentSeason(n, getTripDateStr());
        return _migratory.indexOf(n) !== -1 && w && w.quality === 'absent';
      });

      if (_missingSection.length > 0 && _missingSection.length < targetNames.length) {
        // Partial miss — some present, some not in this section
        var _shortNames = _missingSection.map(function(n){ return n.replace(' Salmon','').replace(' Trout',''); });
        badge.textContent = _shortNames.join('+') + ' not in this section';
        badge.dataset.state = 'warn';
      } else if (speciesQuality === 'absent') {
        // All on-river species are absent/staging
        var _anyMigratorySelected = targetNames.some(function(n){ return _migratory.indexOf(n) !== -1; });
        badge.textContent = _anyMigratorySelected ? 'Staging in the lake, not in the river yet' : 'Out of season';
        badge.dataset.state = 'warn';
      } else if (speciesQuality === 'peak') {
        badge.textContent = '★ Peak season now';
        badge.dataset.state = 'good';
      } else if (speciesQuality === 'good') {
        badge.textContent = '● In season';
        badge.dataset.state = 'good';
      } else if (speciesQuality === 'slow') {
        badge.textContent = '● Slow season';
        badge.dataset.state = 'warn';
      } else {
        badge.textContent = speciesSeasonal ? speciesSeasonal.label : '';
        badge.dataset.state = '';
      }
    }
  }
  // Build a species-aware prefix for the plain summary
  var speciesPrefix = "";
  var speciesOverride = false; // if true, species situation overrides weather verdict

  if (targetNames.length > 0) {
    var absentSpecies = [], offRiverSpecies = [], slowSpecies = [], goodSpecies = [], peakSpecies = [];
    targetNames.forEach(function(n) {
      if (riverSpeciesList.indexOf(n) === -1) {
        offRiverSpecies.push(n);
      } else {
        var w = getCurrentSeason(n);
        var q = w ? w.quality : 'slow';
        if (q === 'absent')    absentSpecies.push({name:n, w:w});
        else if (q === 'slow') slowSpecies.push({name:n, w:w});
        else if (q === 'good') goodSpecies.push({name:n, w:w});
        else                   peakSpecies.push({name:n, w:w});
      }
    });
    var parts = [];
    if (offRiverSpecies.length > 0) {
      parts.push("🚫 " + offRiverSpecies.join(" and ") + " not found on the " +
        (selectedRiver ? selectedRiver.split(",")[0] : "river") + ".");
      speciesOverride = true;
    }
    if (absentSpecies.length > 0) {
      absentSpecies.forEach(function(s) {
        var up = getUpcomingPeak(s.name);
        var ps = up ? " Peak in " + MONTH_FULL[(new Date().getMonth()+up.monthsAway)%12] + " (" + up.monthsAway + " mo)." : "";
        parts.push("🟠 " + s.name + " not in river now. " + (s.w ? s.w.note : "out of season") + ps);
      });
      speciesOverride = true;
    }
    if ((offRiverSpecies.length > 0 || absentSpecies.length > 0) && (goodSpecies.length > 0 || peakSpecies.length > 0)) {
      var inSeas = peakSpecies.concat(goodSpecies).map(function(s){return s.name;});
      parts.push("✅ " + inSeas.join(" and ") + " are in season now.");
    }
    if (offRiverSpecies.length === 0 && absentSpecies.length === 0) {
      if (peakSpecies.length > 0) {
        parts.push("🎯 " + peakSpecies.map(function(s){return s.name;}).join(" and ") + " at peak. " + (peakSpecies[0].w ? peakSpecies[0].w.note : ""));
      } else if (goodSpecies.length > 0) {
        parts.push("✅ " + goodSpecies.map(function(s){return s.name;}).join(" and ") + " in season. " + (goodSpecies[0].w ? goodSpecies[0].w.note : ""));
      } else if (slowSpecies.length > 0) {
        parts.push("⚠️ " + slowSpecies.map(function(s){return s.name;}).join(" and ") + " slow. " + (slowSpecies[0].w ? slowSpecies[0].w.note : ""));
      }
    }
    speciesPrefix = parts.join(" ");
  }

  // ── BUILD PLAIN-ENGLISH SUMMARY ──────────────────────────────────────────
  var plainSummary = "";

  // If species is absent or not on river, lead with that — it overrides everything
  if (speciesOverride) {
    plainSummary = speciesPrefix;
    // Still append a brief conditions note
    var condNote = vl === "good" ? " River conditions are otherwise good."
      : vl === "warn" ? " River conditions are also marginal today."
      : " River conditions are also poor today.";
    plainSummary += condNote;

  } else {
    // Normal conditions-first summary, with species note appended
    if (!isToday) {
      var dn = new Date(dateStr+"T12:00:00").toLocaleDateString("en-CA",{weekday:"long",month:"short",day:"numeric"});
      plainSummary = dn + " \u2014 " + (vl==="good"?"Looks Good":vl==="warn"?"Marginal":"Looks Tough") + ". ";
      plainSummary += vl==="good"
        ? "Forecast shows favourable temp and sky. Check flow the morning of your trip."
        : vl==="warn"
        ? "Mixed forecast. Flow will decide it, so check the gauge before you drive."
        : "Forecast conditions look challenging. Monitor closer to the date.";
    } else if (flow == null) {
      plainSummary = tc==="good"&&sc!=="bad"
        ? "\u2705 Temperature and sky look good. Check the "+cfg.gaugeName+" gauge for current flow before heading out."
        : "\u26a0\ufe0f Temperature or sky are marginal. Check the "+cfg.gaugeName+" gauge for flow before deciding.";
    } else if (vl === "good") {
      var _noSpecRec = '';
      if (targetNames.length === 0) {
        var _recs2 = recommendSpecies(cfg);
        if (_recs2.length > 0) {
          _noSpecRec = ' Best species right now: ' + _recs2.slice(0,2).map(function(r){
            return r.name + ' (' + (r.reasons[0]||r.seasonal.label) + ')';
          }).join(', ') + '.';
        }
      }
      plainSummary = "\u2705 Great conditions right now on the "+(selectedRiver?selectedRiver.split(",")[0]:"river")+". "+(flowBand(flow,cfg)==="prime"?"Flow is prime":"Flow is normal")+", and temperature and sky are working in your favour." + _noSpecRec;
    } else if (vl === "bad") {
      var reason = fc==="bad"&&flow<cfg.flowLow
        ? "water is too low at "+flow+" m³/s, so fish are scattered and very wary"
        : wt>=TEMP_STRESS ? "water is above 18°C. Please stop fishing, as heat stress kills fish"
        : tc==="bad" ? "water temp is outside the feeding range at "+wt+"\u00B0C"
        : "multiple conditions are off today";
      plainSummary = "❌ Not ideal: "+reason+". Consider another day or stretch of water.";
    } else {
      var issues = [];
      if (fc!=="good") issues.push(flow<cfg.sweetMin?"flow is low at "+flow+" m\u00B3/s":"flow is elevated at "+flow+" m\u00B3/s");
      if (tc!=="good") issues.push(wt<TEMP_MIN?"water is cold at "+wt+"\u00B0C":"water is warm at "+wt+"\u00B0C");
      if (sc!=="good") issues.push("sky is "+skyl.toLowerCase());
      var _noSpecRec2 = '';
      if (targetNames.length === 0) {
        var _recs3 = recommendSpecies(cfg);
        if (_recs3.length > 0) _noSpecRec2 = ' Best bet today: ' + _recs3[0].name + '.';
      }
      plainSummary = "⚠️ Marginal: "+issues.join(", ")+". Target the "+tw+" window and focus on prime lies." + _noSpecRec2;
    }
    // Append species note if we have one
    if (speciesPrefix) plainSummary += " " + speciesPrefix;
  }

  document.getElementById("plain-summary").textContent = plainSummary;

  // Show/hide the Flow/Window/Method stat boxes
  var statsEl = document.getElementById("summary-stats");
  if (statsEl) {
    // Hide stats when species situation dominates — they're irrelevant
    var hideStats = speciesOverride; // species not on river OR migratory + out of season
    statsEl.style.display = hideStats ? "none" : "";
  }
  // Quick stats in banner
  // Use period cloud data for summary card if available
  var _pcSumm = window._periodCloud;
  var tw, _twColor, _twNote;
  if (_pcSumm) {
    var _g = function(c){ return c>=70?'good':c>=30?'warn':'bad'; };
    var _periods = [{l:'AM',g:_g(_pcSumm.morning)},{l:'Mid',g:_g(_pcSumm.midday)},{l:'PM',g:_g(_pcSumm.evening)}];
    var _good = _periods.filter(function(p){return p.g==='good';}).map(function(p){return p.l;});
    var _ok   = _periods.filter(function(p){return p.g==='warn';}).map(function(p){return p.l;});
    var _all  = _good.concat(_ok);
    if (_all.length===3){ tw='All day'; _twColor='#6dbf8a'; _twNote='Full day'; }
    else if (_all.length===0){ tw='Dawn only'; _twColor='#e07070'; _twNote='Dawn only'; }
    else { tw=_all.join('+')+' best'; _twColor='#e8a85a'; _twNote=_all.length===1?'Narrow window':'Mixed'; }
  } else {
    tw=sc==="good"?"All Day":sc==="warn"?"6–9 AM & 6–8 PM":"6–8:30 AM only";
    _twColor=sc==="good"?"#6dbf8a":sc==="warn"?"#e8a85a":"#e07070";
    _twNote=sc==="good"?"Full day":sc==="warn"?"Compressed":"Dawn only";
  }
  // Flow stat box removed from banner - data lives in conditions section below
  document.getElementById("sum-window").textContent=tw;
  document.getElementById("sum-window").style.color=_twColor;
  document.getElementById("sum-window-note").textContent=_twNote;
  var _fl2=({'':{h:'Streamers',c:'Slow Nymphing',n:'Nymphing'},fly:{h:'Streamer fishing',c:'Slow nymphing',n:'Nymphing'},spin:{h:'Heavy Spinners',c:'Slow Jig',n:'Spinner Fishing'},float:{h:'Drift Fishing',c:'Bottom Bait',n:'Float Fishing'}})[selectedTechFamily.length>0?selectedTechFamily[0]:'']||{h:'Streamers',c:'Slow Nymphing',n:'Nymphing'};
  var topMethod=flow!=null&&flow>cfg.flowHigh*0.6?_fl2.h:wt<8?_fl2.c:_fl2.n;
  // Override: salmon STAGING in the lake call for spin/lures, not trout nymphing.
  // This originally fired for any salmon target on a staging-zone river, which was wrong
  // once the fish moved in — the hero said "spinning gear \u2014 spoons & lures" while the
  // Technique panel below correctly said float fishing with roe and beads. Being a
  // staging *zone* is a property of the river; being in a staging *phase* is a property
  // of the date, and only the latter should change the recommended method.
  (function(){
    var _sk = methodSpeciesKey(selectedRiver ? selectedRiver.split(',')[0].trim() : '');
    var _mm = salmonMethodMode({ speciesKey:_sk, fam:(selectedTechFamily[0]||''), cfg:cfg,
      stagingModeActive:_stagingModeActive, migratoryBlocked:window._migratoryBlockedSection });
    // Same decision as the hero and the Technique panel. This tile used to keep its own
    // rule (float only if window._salmonInRiver), so it could disagree with both.
    if (_mm === 'spin')  topMethod = 'Spinning · Spoons & Lures';   // fish still in the lake
    if (_mm === 'float' || _mm === 'spin-float') topMethod = 'Float Fishing · Roe & Beads'; // fish in the river
  })();
  document.getElementById("sum-method").textContent=topMethod;
  document.getElementById("sum-method-note").textContent="Current pick";

  // Verdict
  var vh,vb,sweetRange=cfg.sweetMin+"\u2013"+cfg.sweetMax;
  if(!isToday){
    var dn=new Date(dateStr+"T12:00:00").toLocaleDateString("en-CA",{weekday:"long",month:"short",day:"numeric"});
    vh=dn+" \u2014 "+(vl==="good"?"Looks Good":vl==="warn"?"Marginal":"Looks Tough");
    vb=vl==="good"?"Forecast shows favourable temp and sky. Check flow the morning of your trip."
      :vl==="warn"?"Mixed forecast. Flow will decide it, so check the gauge before you drive."
      :"Forecast conditions look challenging. Monitor closer to the date.";
  } else if(flow==null){
    // Flow unavailable — base verdict on temp and sky only, don't lead with gauge error
    var tcsc_score = [tc,sc].reduce(function(a,c){return a+(c==='good'?2:c==='warn'?1:0);},0);
    if(tcsc_score>=3){ vh="Likely fishable."; vb="Temperature and sky look good. Check the "+cfg.gaugeName+" gauge for current flow before heading out."; vl="warn"; }
    else if(tcsc_score>=2){ vh="Conditions mixed."; vb="Temperature or sky are marginal. Check the "+cfg.gaugeName+" gauge for flow before deciding."; vl="warn"; }
    else { vh="Tough conditions."; vb="Temperature and sky are unfavourable. Check the "+cfg.gaugeName+" gauge for flow."; vl="bad"; }
  } else {
    if(vl==="good"){vh="Go. Conditions are live.";vb="Flow, temperature, and sky all support active feeding. Get out there.";}
    else if(vl==="bad"){
      if(fc==="bad"&&flow<cfg.flowLow){vh="No-Go. Water too low.";vb="Flow at "+flow+" m³/s, below the ideal "+cfg.sweetMin+"\u2013"+cfg.sweetMax+" m\u00b3/s range. Fish spread and ultra-wary.";}
      else if(wt>=TEMP_STRESS){vh="Conservation Advisory.";vb="Water above 18°C. Please stop fishing, because stress mortality rises sharply.";}
      else if(tc==="bad"){vh="No-Go. Temperature off.";vb="Water temp outside the 8\u201314\u00b0C prime window.";}
      else{vh="Poor conditions today.";vb="Multiple factors are off. Best to wait and check tomorrow.";}
    } else {vh="Marginal. Fish selectively.";vb="Some factors are off. Target the best window of the day and focus on prime lies.";}
  }

  var sig=document.getElementById("vsig"); if(sig){sig.textContent=clsIcon(vl); sig.className="vsig "+vl;}
  var _vh=document.getElementById("vhead"); if(_vh)_vh.textContent=vh;
  var _vb=document.getElementById("vbody"); if(_vb)_vb.textContent=vb;

  // Flow column
  if(flow!=null){
    var ta=trend==="up"?"up":trend==="down"?"down":"stable";
    document.getElementById("fval").textContent=flow;
    document.getElementById("ftrend").textContent=trend==="up"?"\u2191":trend==="down"?"\u2193":"\u2192";
    document.getElementById("ftrend").className="trd "+ta;
    var fd=flow<cfg.flowLow?flow+" m³/s, below the ideal range. Fish scattered."
      :flow<cfg.sweetMin?flow+" m³/s, normal flow. Fishable; prime is "+sweetRange+", a few days after rain."
      :flow<=cfg.sweetMax?flow+" m³/s, prime flow ("+sweetRange+")."
      :flow<=cfg.flowHigh?flow+" m³/s, elevated. Target the slower edges."
      :flow+" m³/s, too high for safe wading.";
    document.getElementById("flbl").textContent=fd+(flowAt?" \u00b7 Obs: "+flowAt.slice(0,16).replace("T"," "):"");
    document.getElementById("fgv").textContent=flow+" m\u00b3/s";
    var fb=document.getElementById("fbar");fb.style.width=barW(flow,0,cfg.flowHigh)+"%";fb.className="gf "+fc;
    var _fb=flowBand(flow,cfg);document.getElementById("fstat").innerHTML=(_fb==="normal"||_fb==="prime")?clsLbl(fc).replace("Ideal",_fb==="prime"?"Prime":"Normal"):clsLbl(fc);document.getElementById("fstat").className="gs "+fc;
    var _fd=document.getElementById("flow-dot");
    if(_fd){_fd.className="col-status-dot visible dot-"+(fc==="good"?"good":fc==="warn"?"warn":"bad");}
    document.getElementById("fcl").innerHTML=[
      {t:"Flow "+flow+" m\u00b3/s ("+({low:"too low",normal:"normal",prime:"prime",high:"high",blown:"blown out"}[flowBand(flow,cfg)]||"")+"; prime: "+sweetRange+")",c:fc},
      {t:"Trend: "+(trend==="up"?"Rising ↑, a good sign":trend==="down"?"Falling ↓, keep an eye on it":"Stable \u2192 watch for changes"),c:trend==="up"?"good":"warn"},
      {t:"Wading: "+(flow<cfg.flowHigh*0.7?"Safe. Edges accessible":"Caution: high water"),c:flow<cfg.flowHigh*0.7?"good":"bad"},
      {t:"Fish lies: "+(fc==="good"?"Predictable":"Scattered and harder to find"),c:fc}
    ].map(function(i){return "<li><span class=\"ci "+i.c+"\">"+clsIcon(i.c)+"</span><span>"+i.t+"</span></li>";}).join("");
  } else if(flowEst){
    renderFlowEstimate(flowEst, cfg, dateStr);
  } else {
    document.getElementById("fval").textContent="\u2014";
    document.getElementById("ftrend").textContent="";
    document.getElementById("flbl").textContent=(isToday?"Live data unavailable. Use the gauge link.":"No flow estimate for this date. Check the gauge on the day.")+" You want to see "+cfg.sweetMin+"–"+cfg.sweetMax+" m³/s for this river.";
    document.getElementById("fgv").textContent="\u2014";
    document.getElementById("fstat").innerHTML='<span class="status-dot dot-warn"></span>CHECK GAUGE';document.getElementById("fstat").className="gs warn";
    document.getElementById("fcl").innerHTML="<li><span class=\"ci warn\">\u25b3</span><span>Check the gauge link above for current flow before heading out.</span></li>";
  }

  // Temp column
  document.getElementById("tval").textContent=wt;
  document.getElementById("tlbl").textContent=waterTempSourceText(_wtInfo, airTemp)+(tc==="good"?"Prime feeding range for trout.":tc==="warn"?(wt<TEMP_MIN?"Below prime. Fish sluggish.":"Warming. Early morning only."):(wt>=TEMP_STRESS?"Conservation advisory: stop fishing above 18\u00b0C.":"Too cold. Fish inactive."));
  document.getElementById("tgv").textContent=wt+"\u00b0C";
  var tb=document.getElementById("tbar");tb.style.width=barW(wt,0,22)+"%";tb.className="gf "+tc;
  document.getElementById("tstat").innerHTML=clsLbl(tc);document.getElementById("tstat").className="gs "+tc;
  // Combined temp+sky indicator — average the two classifications
  var _clsRank = {good:2, warn:1, bad:0};
  var _tcRank = _clsRank[tc] !== undefined ? _clsRank[tc] : 1;
  var _scRank = _clsRank[sc] !== undefined ? _clsRank[sc] : 1;
  var _avgRank = Math.round((_tcRank + _scRank) / 2);
  var _avgCls  = _avgRank >= 2 ? "good" : _avgRank >= 1 ? "warn" : "bad";
  var _td=document.getElementById("temp-dot");
  if(_td){_td.className="col-status-dot visible dot-"+_avgCls;}

  // Sky column
  document.getElementById("skyv").textContent=skyl+" ("+cloudPct+"%)";
  renderSkyPeriodStrip(window._periodCloud || null);
  // sky sub-indicators removed — combined into temp-dot
  var sb=document.getElementById("skybar");if(sb){sb.style.width=cloudPct+"%";sb.className="gf "+sc;}
  document.getElementById("skystat").textContent=sc==="good"?"Fish feed through the whole water column all day.":sc==="warn"?"Morning and evening windows open. Midday slows.":"Clear. Fishing is hard until 8:30 AM, then expect it to die.";
  document.getElementById("skystat").className="gs "+sc;
  // Best Window card — reuse the period-aware window text computed for the summary card
  var _bwNote;
  if (window._periodCloud) {
    var _pcg = function(c){ return c>=70?'good':c>=30?'warn':'bad'; };
    var _pcM=_pcg(window._periodCloud.morning), _pcD=_pcg(window._periodCloud.midday), _pcE=_pcg(window._periodCloud.evening);
    var _skip=[];
    if(_pcM==='bad')_skip.push('clear morning');
    if(_pcD==='bad')_skip.push('bright midday');
    if(_pcE==='bad')_skip.push('clear evening');
    _bwNote = _skip.length ? 'Skip '+_skip.join(', ')+'.' : 'Cloud cover holds, so fish any time.';
  } else {
    _bwNote = sc==="good"?"Overcast opens the full day. Don't sleep in.":sc==="warn"?"Partly cloudy compresses your window. Get on at first light.":"Clear sky kills the bite fast. Be on the water before sunrise.";
  }
  document.getElementById("twin").textContent=tw;
  document.getElementById("tnote").textContent=_bwNote;

  window._defaultTargetSpecies = defaultTargetSpecies(cfg, wt);
  updateMethods(fc,tc,sc,flow,wt);
  // If migratory fish physically cannot reach this section, say so in the conditions
  // subtitle rather than presenting upper-river access points as if they were an option.
  // Trout and salmon season is shut on this reach. This outranks every other note on the
  // page: conditions do not matter if it is illegal to fish there today.
  (function(){
    var _cfgS = (typeof getRiverConfig === 'function') ? getRiverConfig(selectedRiver) : null;
    var _sc = (typeof seasonClosureFor === 'function')
      ? seasonClosureFor(_cfgS, (typeof getTripDateStr === 'function') ? getTripDateStr() : null)
      : null;
    window._seasonClosed = _sc;
    if (!_sc) return;
    var sub = document.getElementById('cond-subtitle');
    if (sub) sub.textContent = 'Trout and salmon season is closed on this stretch for the date you picked. '
      + _sc.reason;
    var chips = document.getElementById('m1c');
    if (chips && chips.innerHTML.indexOf('Season closed') === -1) {
      chips.innerHTML = '<span class="chip-closed">\u2715 Season closed here</span>' + chips.innerHTML;
    }
  })();

  // Fish are staging somewhere else on this system. Don't let the page read as though
  // this reach is holding fish — name the water that actually is.
  if (window._stagingElsewhere) {
    var _seSub = document.getElementById('cond-subtitle');
    if (_seSub) _seSub.textContent = 'Fish are still staging at the ' + window._stagingElsewhere
      + '. They haven’t pushed up this far yet. The methods below are for when they do.';
    var _seTech = document.getElementById('m1c');
    if (_seTech && _seTech.innerHTML.indexOf('staging') === -1) {
      _seTech.innerHTML = '<span>Fish not here yet</span>' + _seTech.innerHTML;
    }
  }
  if (window._migratoryBlockedSection) {
    var _blockedSp = {chinook:'Chinook Salmon', coho:'Coho Salmon', steelhead:'Steelhead'};
    var _wantSp = selectedSpecies.length ? _blockedSp[selectedSpecies[0]] : null;
    if (_wantSp) {
      var _cs = document.getElementById('cond-subtitle');
      if (_cs) _cs.textContent = _wantSp + ' can\u2019t reach ' + window._migratoryBlockedSection
        + '. A dam blocks them downstream. The conditions below are for resident trout on this stretch.';
    }
  }
  // Staging is settled before this point now, so updateMethods already skipped the
  // in-river salmon block and the override below simply restates the panel.
  if (_stagingModeActive) {
    try { applyStagingTechniqueOverride(); } catch(_reErr) { console.warn('staging apply failed:', _reErr); }
  }
  updateAccessFlowNotes(cfg,flow);
  autoSelectBaitTab();

  // Top Pick band — always shown
  try {
    buildTopPick(nearbyRivers, flow, wt, cloudPct, tc, sc, selectedSpecies, weatherOk);
  } catch(_btpErr) {
    console.error('buildTopPick failed:', _btpErr);
    // Still show the band even if buildTopPick errors
    var _band = document.getElementById('tpband');
    if (_band) _band.style.display = 'block';
  }

  // River Ranker — beginner mode only
  if (appMode === 'beginner' && window._beginnerLocKey) {
    var _mm = parseInt((document.getElementById('travel-range')||{value:'60'}).value)||60;
    renderRiverRanker(window._beginnerLocKey, _mm);
  } else {
    var rrs = document.getElementById('rrank-section');
    if (rrs) rrs.style.display = 'none';
  }

  // Store selected techs for scoring
  window._selectedTechs = Array.from(document.querySelectorAll('.tech-chip.active'))
    .map(function(el){ return el.getAttribute('data-tech'); });
}

// ── ACCESS MAP ────────────────────────────────────────────────────────────────
function renderAccessMap(cfg, coords) {
  var mapEl = document.getElementById("access-map");
  if (!mapEl || !coords.length) return;

  // Store coords and sorted access list globally
  window._mapCoords  = coords;
  window._mapCfg     = cfg;
  // _mapAccess holds the sorted access list matching coords order
  window._mapAccess  = cfg._sortedAccess || cfg.access;

  // Default: show recommended spot (index 0 = sorted first)
  updateMapPin(0);
}

function buildMapOsmUrl(lat, lng, allCoords) {
  var spread = allCoords.length <= 2 ? 0.06 : 0.09;
  return 'https://www.openstreetmap.org/export/embed.html'
    + '?bbox=' + (lng-spread) + '%2C' + (lat-spread*0.75)
    + '%2C' + (lng+spread) + '%2C' + (lat+spread*0.75)
    + '&layer=mapnik'
    + '&marker=' + lat + '%2C' + lng;
}

function updateMapPin(spotIdx) {
  var mapEl  = document.getElementById("access-map");
  var coords = window._mapCoords || [];
  var cfg    = window._mapCfg;
  if (!mapEl || !coords.length || !cfg) return;

  // Clamp index
  var idx = Math.max(0, Math.min(spotIdx, coords.length - 1));
  var c   = coords[idx];
  var _access = window._mapAccess || cfg.access;
  var a   = _access[idx];
  if (!c) return;

  var osmUrl = buildMapOsmUrl(c.lat, c.lng, coords);
  var gmUrl  = 'https://maps.google.com/?q=' + c.lat + ',' + c.lng;
  var spotName = a ? a.name.split(/\s[\u2014\u00b7]\s/)[0].trim() : 'Fishing spot';

  // Build legend — highlight selected pin
  var _accessList = window._mapAccess || cfg.access;
  var legend = _accessList.map(function(ac, i) {
    var co = coords[i];
    if (!co) return '';
    var dotCls = ac.crowd === 'low' ? 'low' : ac.crowd === 'med' ? 'med' : 'high';
    var active  = i === idx ? ' is-active' : '';
    return '<div class="map-pin' + active + '" data-spot-idx="' + i + '">'
      + '<div class="map-pin-dot ' + dotCls + '">'
      + (i + 1) + '</div>'
      + '<span>' + ac.name.split(/\s[\u2014\u00b7]\s/)[0].trim() + '</span>'
      + '</div>';
  }).join('');

  // Update iframe src (change pin without full reload if already rendered)
  var iframe = mapEl.querySelector('iframe');
  if (iframe) {
    iframe.src = osmUrl;
  } else {
    // First render — build full widget
    mapEl.innerHTML =
      '<iframe class="map-frame" src="' + osmUrl + '" loading="lazy"></iframe>'
      + '<div id="map-gm-cta" class="map-cta-wrap">'
      + '<a id="map-gm-link" class="map-cta" href="' + gmUrl + '" target="_blank" rel="noopener">'
      + '\uD83D\uDCCD Navigate to ' + spotName + '</a>'
      + '</div>'
      + '<div class="map-pin-list" id="map-legend">'
      + '<div class="map-legend-lbl">Other spots \u2192 tap to move pin</div>'
      + legend
      + '</div>';

    // Wire legend clicks
    setTimeout(function() {
      mapEl.querySelectorAll('.map-pin[data-spot-idx]').forEach(function(el) {
        el.addEventListener('click', function() {
          updateMapPin(parseInt(this.getAttribute('data-spot-idx')));
        });
      });
    }, 100);
    return; // done for first render
  }

  // Subsequent renders — update legend and Google Maps link in place
  var legendEl = document.getElementById('map-legend');
  if (legendEl) {
    legendEl.innerHTML = '<div class="map-legend-lbl">Other spots \u2192 tap to move pin</div>' + legend;
    legendEl.querySelectorAll('.map-pin[data-spot-idx]').forEach(function(el) {
      el.addEventListener('click', function() {
        updateMapPin(parseInt(this.getAttribute('data-spot-idx')));
      });
    });
  }
  var gmLink = document.getElementById('map-gm-link');
  if (gmLink) {
    gmLink.href = gmUrl;
    gmLink.innerHTML = '\uD83D\uDCCD Navigate to ' + spotName;
  }
}

// ── SPECIES RAIL ─────────────────────────────────────────────────────────────
// ── SEASONAL DATA ─────────────────────────────────────────────────────────────
// Months are 0-indexed (0=Jan, 11=Dec). Each entry:
//   peak: [startMonth, endMonth] - best fishing window
//   present: [startMonth, endMonth] - fish are in the river
//   note: short plain-English description
// "present" for migratory species = when the run is in the river
// For resident trout, present all year but fishing quality is seasonal

var SPECIES_PHOTOS = {
  "brook":"/images/species/brook-trout.jpg",
  "brown":"/images/species/brown-trout.jpg",
  "chinook":"/images/species/chinook-salmon.jpg",
  "coho":"/images/species/coho-salmon.jpg",
  "rainbow":"/images/species/rainbow-trout.jpg",
  "steelhead":"/images/species/steelhead.jpg"
};


function setResHeader(riverName) {
  var riverEl = document.getElementById('res-river');
  var dateEl  = document.getElementById('res-date');
  if (riverEl) riverEl.textContent = secLabel(riverName);
  if (dateEl) {
    var _dateStr = getTripDateStr();
    var _today   = (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
    var _tripD   = new Date(_dateStr + 'T12:00:00');
    var _todayD  = new Date(_today   + 'T12:00:00');
    var _diff    = Math.round((_tripD - _todayD) / 86400000);
    var _fmt     = _tripD.toLocaleDateString('en-CA', {weekday:'short', month:'short', day:'numeric'});
    var _label   = _diff === 0  ? 'Today · '    + _fmt
                 : _diff === 1  ? 'Tomorrow · ' + _fmt
                 : _diff > 1   ? 'Forecast · ' + _fmt
                 : _diff === -1 ? 'Yesterday · '+ _fmt
                 : _fmt;
    dateEl.textContent = _label;
  }
}

/* ===== HOMEPAGE GUIDES — seasonal article cards =====
   months: 1-12. peak = prime window (amber), on = shoulder window (muted green).
   A guide with all 12 in `on` and none in `peak` reads as "useful year round".
   Cards reorder every load: in-peak first (largest slot), then in-shoulder, then the rest. */
var GUIDES = [
  {
    url:'/guides/steelhead-run-timing/',
    title:'When do steelhead run in Ontario?',
    blurb:'They follow the salmon in, a little earlier at the east end of the lake. Fall, winter and spring timing, and which water stays open on each river.',
    img:'https://i.ytimg.com/vi/8ZAt0ks_FEY/mqdefault.jpg',
    peak:[10,11,4], on:[9,12,1,2,3], video:true
  },
  {
    url:'/guides/winter-steelhead/',
    title:'Late fall and winter steelhead in Ontario',
    blurb:'Which rivers stay open after September 30, where steelhead sit once the water gets cold, and the float setup and baits that still get bites.',
    img:'https://i.ytimg.com/vi/5ygb9Je_eJM/mqdefault.jpg',
    peak:[11,12,1,2], on:[10,3], video:true
  },
  {
    url:'/rivers/humber/',
    title:'Salmon and steelhead on the Humber',
    blurb:'Toronto\u2019s closest salmon river. Old Mill is packed in the fall, quiet in winter, full of redhorse in spring, and open all year below Eglinton.',
    img:'/images/rivers/humber-winter-steelhead-chrome.webp',
    peak:[9,10], on:[11,12,1,2,3,4], video:false
  },
  {
    url:'/rivers/bronte/',
    title:'Bronte runs last, and then runs again',
    blurb:'The last salmon river of the Ontario season, running into November, and a good spring steelhead creek. Two windows at opposite ends of the year.',
    img:'https://i.ytimg.com/vi/9zzp9Z1KsXk/mqdefault.jpg',
    peak:[10,11], on:[9,12,1,2,3,4], video:true
  },
  {
    url:'/rivers/bowmanville/salmon-run/',
    title:'When do salmon run in Bowmanville Creek?',
    blurb:'A small creek with a big run, and a fish ladder that exists because volunteers once carried 15,000 salmon over the dam by hand.',
    img:'/images/rivers/bowmanville-creek-valley.webp',
    peak:[9,10], on:[8,11], video:false
  },
  {
    // River-specific page. These rank better than the Ontario-wide guide — "bowmanville
    // salmon run 2026" sits at position 3.7 off a table row alone — so they lead.
    url:'/rivers/ganaraska/salmon-run/',
    title:'When do salmon run in the Ganaraska?',
    blurb:'Ontario’s earliest salmon river, and one of the few where the best water is closed for six weeks of the run.',
    img:'/images/rivers/ganaraska-gear-riverside.webp',
    peak:[9,10], on:[8,11], video:false
  },
  {
    url:'/guides/salmon-run-timing/',
    title:'When do salmon run in Ontario rivers?',
    blurb:'Chinook stage off the harbour mouths from late August, then push upriver on the first sustained rain. What triggers a run, how long the window lasts, and which rivers turn on first.',
    img:'/images/guides/salmon-run-timing-card.webp',
    peak:[9,10], on:[8,11], video:false
  },
  {
    url:'/guides/salmon-float-fishing-tips/',
    title:'Three float fishing tips for salmon',
    blurb:'Where to start the drift, how long a leader to run under the float, and why holding the float back gets the bait seen first.',
    img:'https://i.ytimg.com/vi/sdcNeg5ibaw/mqdefault.jpg',
    peak:[9,10], on:[8,11], video:true
  },
  {
    url:'/guides/euro-nymphing-upper-credit/',
    title:'Euro nymphing the Upper Credit for rainbows',
    blurb:'Four fish landed from eight hook-ups at the Forks of the Credit, and the fly change that turned the morning around. Gear, positioning, and why the Perdigon outfished everything else.',
    img:'https://i.ytimg.com/vi/dsNlP-lNE4Y/mqdefault.jpg',
    // Forks of the Credit sits above Old Baseline Rd: sanctuary closure Oct 1 – Dec 31
    // and Jan 1 – Friday before the fourth Saturday in April. Season is late Apr – Sep 30.
    peak:[5,6,9], on:[4,7,8], video:true
  },
  {
    url:'/guides/where-steelhead-hold/',
    title:'Where steelhead actually hold in a river',
    blurb:'Most blank days come down to where you’re standing. How to read pools, runs and seams so you stop fishing empty water. Part one of three.',
    img:'https://i.ytimg.com/vi/vlj1AhJQRrA/mqdefault.jpg',
    peak:[4,5,11,12], on:[3,10], video:true
  }
];

function renderGuides() {
  var grid = document.getElementById('guides-grid');
  if (!grid || !GUIDES.length) return;
  // Eastern-aware current month — after 8PM ET a UTC month rollover would be wrong
  var d = new Date(), m = d.getMonth() + 1;

  function rank(g) {
    if (g.peak.indexOf(m) !== -1) return 0;          // in prime season
    if (g.on.indexOf(m) !== -1 && g.peak.length) return 1; // shoulder of a seasonal guide
    if (!g.peak.length) return 3;                    // evergreen — never leads
    return 2;                                        // out of season
  }
  function nextOpen(g) {
    if (!g.peak.length) return null;
    for (var i = 0; i < 12; i++) {
      var mm = ((m - 1 + i) % 12) + 1;
      if (g.peak.indexOf(mm) !== -1) return i === 0 ? null : mm;
    }
    return null;
  }
  var MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var ML = ['J','F','M','A','M','J','J','A','S','O','N','D'];

  // Months until a guide's peak window opens — used to break ties in the dead months
  // (May–July) so the guide opening soonest leads rather than whichever was listed first.
  function monthsOut(g) {
    if (!g.peak.length) return 99;
    for (var i = 0; i < 12; i++) {
      if (g.peak.indexOf(((m - 1 + i) % 12) + 1) !== -1) return i;
    }
    return 99;
  }
  var sorted = GUIDES.slice().sort(function(a,b){
    return (rank(a) - rank(b)) || (monthsOut(a) - monthsOut(b));
  });
  // A few picks for this month get cards; the rest sit in a collapsed text list below. Every
  // guide stays linked from the homepage (they exist for search), but only the picks load
  // pictures, and those load lazily from small thumbnails.
  var FEATURED = 4, MIN_FEATURED = 3;
  var picks = sorted.filter(function(g){ return rank(g) <= 1; }).slice(0, FEATURED);
  if (picks.length < MIN_FEATURED) picks = sorted.slice(0, MIN_FEATURED);
  var more = sorted.filter(function(g){ return picks.indexOf(g) === -1; });
  var lead = picks[0], rest = picks.slice(1);

  function statusText(g) {
    if (g.peak.indexOf(m) !== -1) return 'Peak season · in the water now';
    if (!g.peak.length) return 'Useful year round';
    if (g.on.indexOf(m) !== -1) return 'Season starting';
    var n = nextOpen(g);
    return n ? 'Opens ' + MN[n-1] : 'Out of season';
  }
  function monthStrip(g, labelled) {
    var h = '<div class="gmonths' + (labelled ? ' lbl' : '') + '" aria-hidden="true">';
    for (var i = 1; i <= 12; i++) {
      var cls = 'gm';
      if (g.peak.indexOf(i) !== -1) cls += ' peak';
      else if (g.on.indexOf(i) !== -1) cls += ' on';
      if (i === m) cls += ' cur';
      h += '<span class="' + cls + '">' + ML[i-1] + '</span>';
    }
    return h + '</div>';
  }
  function playIcon(g) {
    return g.video ? '<span class="gvid"><svg viewBox="0 0 10 10"><path d="M2 1 L9 5 L2 9 Z"/></svg></span>' : '';
  }
  // Local photos have a 480 px copy in /images/thumbs/; YouTube thumbnails are already small.
  function picture(g, isLead) {
    if (!g.img) return '';
    var local = g.img.charAt(0) === '/';
    var thumb = local ? g.img.replace(/^\/images\/[^\/]+\//, '/images/thumbs/') : g.img;
    var srcset = local ? ' srcset="' + thumb + ' 480w, ' + g.img + ' 1200w" sizes="' +
      (isLead ? '(max-width:700px) 100vw, 620px' : '96px') + '"' : '';
    return '<img src="' + thumb + '"' + srcset + ' alt="" loading="lazy" decoding="async" onerror="this.remove()">';
  }
  function card(g, isLead) {
    var live = g.peak.indexOf(m) !== -1;
    return '<a class="gcard ' + (isLead ? 'gcard-lead' : 'gcard-side') + (live ? ' live' : '') + '" href="' + g.url + '">' +
      '<div class="gspine"></div>' +
      '<div class="gimg">' + picture(g, isLead) + playIcon(g) + '</div>' +
      '<div class="ginner">' +
        monthStrip(g, isLead) +
        '<h3>' + g.title + '</h3>' +
        '<p>' + g.blurb + '</p>' +
        '<div class="gstatus">' + statusText(g) + '</div>' +
      '</div></a>';
  }
  function mini(g) {
    return '<li><a class="gmini' + (g.peak.indexOf(m) !== -1 ? ' live' : '') + '" href="' + g.url + '">' +
      '<span class="gmini-t">' + g.title + '</span><span class="gmini-s">' + statusText(g) + '</span></a></li>';
  }

  grid.innerHTML = card(lead, true) +
    '<div class="guides-list">' + rest.map(function(g){ return card(g, false); }).join('') + '</div>' +
    (more.length ? '<details class="gmore"><summary>More guides <span>(' + more.length + ')</span></summary>' +
      '<ul>' + more.map(mini).join('') + '</ul>' +
      '<a class="gmore-all" href="/guides/">Browse every guide</a></details>' : '');
}

function getTripDateStr() {
  var di = document.getElementById('trip-date');
  return (di && di.value) ? di.value : (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
}


function getUpcomingPeak(speciesName) {
  var now = new Date();
  var month = now.getMonth();
  var data = SPECIES_SEASONS[speciesName];
  if (!data) return null;
  // Find next peak window after current month
  for (var offset = 1; offset <= 12; offset++) {
    var m = (month + offset) % 12;
    for (var i = 0; i < data.windows.length; i++) {
      var w = data.windows[i];
      if (w.quality === 'peak') {
        var start = w.months[0], end = w.months[1];
        if (start <= end) {
          if (m === start) return { window: w, monthsAway: offset };
        } else {
          if (m === start) return { window: w, monthsAway: offset };
        }
      }
    }
  }
  return null;
}

var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function buildSeasonBar(speciesName) {
  // Build a 12-segment bar showing quality across the year
  var data = SPECIES_SEASONS[speciesName];
  if (!data) return '';
  var now = new Date().getMonth();
  var segments = [];
  for (var m = 0; m < 12; m++) {
    var quality = 'slow';
    for (var i = 0; i < data.windows.length; i++) {
      var w = data.windows[i];
      var start = w.months[0], end = w.months[1];
      var inWindow = start <= end ? (m >= start && m <= end) : (m >= start || m <= end);
      if (inWindow) { quality = w.quality; break; }
    }
    var isCurrent = m === now;
    segments.push({ month: m, quality: quality, current: isCurrent });
  }

  var barHtml = '<div class="season-bar">';
  segments.forEach(function(s) {
    var cls = 'seg seg-' + s.quality + (s.current ? ' seg-now' : '');
    var title = MONTH_NAMES[s.month];
    barHtml += '<div class="' + cls + '" title="' + title + '"></div>';
  });
  barHtml += '</div>';
  barHtml += '<div class="season-bar-labels">';
  [0,2,4,6,8,10].forEach(function(m) {
    barHtml += '<span>' + MONTH_NAMES[m] + '</span>';
  });
  barHtml += '</div>';
  return barHtml;
}

// ── SPECIES RAIL ─────────────────────────────────────────────────────────────
function renderSpeciesRail(cfg) {
  var rail  = document.getElementById("species-rail");
  var title = document.getElementById("species-rail-title");
  var sub   = document.getElementById("species-rail-sub");
  if (!rail) return;

  var riverSpecies = cfg.species || [];
  var riverName = selectedRiver ? selectedRiver.split(",")[0].trim() : "";
  var now = new Date();
  var currentMonth = now.getMonth();

  title.textContent = "Species on the " + riverName;

  var allSpecies = ["Brown Trout","Rainbow Trout","Steelhead","Brook Trout","Chinook Salmon","Coho Salmon"];
  var speciesFilterMap = {brown:"Brown Trout",rainbow:"Rainbow Trout",steelhead:"Steelhead",brook:"Brook Trout",chinook:"Chinook Salmon",coho:"Coho Salmon"};
  var _spm2={brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'};
  var targetSpeciesArr=selectedSpecies.map(function(k){return _spm2[k];}).filter(Boolean);

  // Build union of species across ALL sections of the same parent river
  // so we can distinguish "not in this section" from "not on this river at all"
  var _parentRiverSpecies = (function() {
    var _union = riverSpecies.slice(); // start with current section
    // Find which parent river this section belongs to
    var _parentName = null;
    Object.keys(RIVER_SECTIONS).forEach(function(parent) {
      if (RIVER_SECTIONS[parent].indexOf(riverName) !== -1) _parentName = parent;
    });
    if (_parentName) {
      RIVER_SECTIONS[_parentName].forEach(function(siblingSection) {
        var _sibCfg = getRiverConfig(siblingSection);
        if (_sibCfg && _sibCfg.species) {
          _sibCfg.species.forEach(function(s) {
            if (_union.indexOf(s) === -1) _union.push(s);
          });
        }
      });
    }
    return _union;
  })();

  // Count how many are present and in-season
  var presentCount  = allSpecies.filter(function(s){ return riverSpecies.indexOf(s) !== -1; }).length;
  var inSeasonCount = allSpecies.filter(function(s){
    if (riverSpecies.indexOf(s) === -1) return false;
    var w = getCurrentSeason(s);
    return w && w.quality !== 'absent';
  }).length;

  sub.textContent = presentCount + " species present \u00b7 " + inSeasonCount + " fishable right now";

  rail.innerHTML = allSpecies.map(function(name) {
    var isPresent = riverSpecies.indexOf(name) !== -1;
    var isTarget=targetSpeciesArr.indexOf(name)!==-1;
    var seasonal  = isPresent ? getCurrentSeason(name) : null;
    var quality   = seasonal ? seasonal.quality : 'absent';
    var data      = SPECIES_SEASONS[name] || {};

    // Card class
    var cardClass = "sc sc-species" +
      (isTarget  ? " active" : "") +
      (!isPresent ? " sc-absent" : "");

    // Status label
    var _inOtherSection = !isPresent && _parentRiverSpecies.indexOf(name) !== -1;
    var statusText, statusClass;
    if (!isPresent) {
      statusText = _inOtherSection ? "\u25cb Not in this section" : "\u25cb Not on this river";
      statusClass = "sst wip";
    } else if (quality === 'absent') {
      var upcoming = getUpcomingPeak(name);
      statusText = "\u25cb Out of season" + (upcoming ? " \u00b7 peak in " + upcoming.monthsAway + " mo" : "");
      statusClass = "sst wip";
    } else if (quality === 'peak') {
      statusText = "● In season, peak now";
      statusClass = "sst on";
    } else if (quality === 'good') {
      statusText = "◐ In season, good";
      statusClass = "sst on";
    } else {
      statusText = "◖ Present, slow";
      statusClass = "sst soon";
    }

    // Tag line
    var tagText=isTarget?(targetSpeciesArr.length>1?"Selected":"Your Target"):
                  !isPresent ? (_inOtherSection ? "Not in this section" : "Not present") :
                  quality === 'peak' ? "\u2605 Prime Season" :
                  quality === 'good' ? "In Season" :
                  quality === 'absent' ? "Migratory, in the lake" :
                  "Present, off-season";

    // Season note
    var noteHtml = "";
    if (isPresent && seasonal) {
      noteHtml = '<div class="sc-note">' + seasonal.label + ': ' + seasonal.note + '</div>';
    }

    // Season bar
    var barHtml = isPresent ? buildSeasonBar(name) : '';

    return '<div class="' + cardClass + '">' +
      '<div class="stag">' + tagText + '</div>' +
      '<div class="sname">' + name + '</div>' +
      '<div class="slat">' + (data.latin || '') + '</div>' +
      '<div class="' + statusClass + '">' + statusText + '</div>' +
      noteHtml +
      barHtml +
    '</div>';
  }).join("");
}

// ── MODE TOGGLE ───────────────────────────────────────────────────────────────
function setMode(mode) {
  appMode = mode;
  var card = document.querySelector('.form-card');
  var btnB = document.getElementById('mode-btn-beginner');
  var btnE = document.getElementById('mode-btn-expert');
  var descB = document.getElementById('mode-desc-beginner');
  var descE = document.getElementById('mode-desc-expert');
  var cta  = document.getElementById('cta-label');
  if (mode === 'beginner') {
    card.classList.add('mode-beginner');
    card.classList.remove('mode-expert');
    btnB.classList.add('active');
    btnE.classList.remove('active');
    if (descB) { descB.style.opacity='1'; descB.style.fontWeight='500'; descB.style.color='var(--moss)'; }
    if (descE) { descE.style.opacity='.6'; descE.style.fontWeight='normal'; descE.style.color='var(--sage)'; }
    if (cta) cta.textContent = 'Find my best spot';
    // Restore location field and travel slider
    var locCellB = document.getElementById('loc-input-field') ? document.getElementById('loc-input-field').closest('.field-group') : null;
    if (locCellB) locCellB.style.display = '';
    var riverFGB = document.getElementById('river-field-group');
    if (riverFGB) riverFGB.style.display = 'none';
    var travelSecB = document.getElementById('travel-range');
    if (travelSecB && travelSecB.parentElement) travelSecB.parentElement.style.display = '';
    var rsecB = document.getElementById('river-section');
    if (rsecB) rsecB.style.display = 'none';
  } else {
    window._beginnerLocKey = null; // clear stale location from beginner mode
    var _drvEl = document.getElementById('tp-drive-time');
    if (_drvEl) _drvEl.style.display = 'none';
    card.classList.add('mode-expert');
    card.classList.remove('mode-beginner');
    btnB.classList.remove('active');
    btnE.classList.add('active');
    if (descB) { descB.style.opacity='.6'; descB.style.fontWeight='normal'; descB.style.color='var(--sage)'; }
    if (descE) { descE.style.opacity='1'; descE.style.fontWeight='500'; descE.style.color='var(--moss)'; }
    if (cta) cta.textContent = 'Get Forecast';
    initExpertMode();
    // Show river section, hide location + travel slider in expert mode
    var rsec = document.getElementById('river-section');
    if (rsec) rsec.style.display = 'block';
    var ph = document.getElementById('river-placeholder');
    if (ph) ph.style.display = 'none';
    // Hide location field and travel time slider
    var locGroup = document.getElementById('loc-input-field');
    if (locGroup && locGroup.parentElement) locGroup.parentElement.style.display = 'none';
    var riverFG = document.getElementById('river-field-group');
    if (riverFG) riverFG.style.display = '';
    var travelSec = document.getElementById('travel-range');
    if (travelSec && travelSec.closest) { var ts = travelSec.closest('.beginner-only, [class*="travel"], div'); if(ts && ts.id !== 'landing') ts.style.display = 'none'; }
    // Also hide the form-top grid (date+location row) partially — hide just location cell
    var locCell = document.getElementById('loc-input-field') ? document.getElementById('loc-input-field').closest('.field-group') : null;
    if (locCell) locCell.style.display = 'none';
  }
}

// ── RANK NEARBY RIVERS BY FISHABILITY ─────────────────────────────────────────
function rankRivers(rivers, speciesKey, dateStr) {
  var speciesMap = {brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'};
  var _ska=Array.isArray(speciesKey)?speciesKey:(speciesKey?[speciesKey]:[]);
  var targetSpeciesNames=_ska.map(function(k){return speciesMap[k];}).filter(Boolean);

  return rivers.map(function(r) {
    // Species, season, where the fish are, legality: shared with the weekly email (conditions-core.js).
    var base = sectionSeasonScore(r.name, targetSpeciesNames, dateStr);
    var cfg = base.cfg;
    var score = base.score;
    var notes = base.notes;
    var warnings = base.warnings;

    // Prefer rivers closer by
    var drive = r.driveTime || 60;
    if (drive < 30) score += 4;
    else if (drive < 60) score += 2;
    else if (drive > 120) score -= 2;

    // Regs — flag any catch-and-release / sanctuary
    var regs = RIVER_REGS[r.name];
    if (regs) {
      regs.special.forEach(function(s) {
        if (/sanctuary/i.test(s) || /closed/i.test(s)) warnings.push('Reg: ' + s.slice(0,60));
      });
    }

    // Technique match
    var techniques = (window._selectedTechs || []);
    if (techniques.length > 0 && cfg.routine) {
      score += 1; // minor bonus for having routine data
    }

    return {
      name: r.name,
      loc: r.loc,
      driveTime: drive,
      score: score,
      notes: notes,
      warnings: warnings,
      cfg: cfg
    };
  }).sort(function(a,b) { return b.score - a.score; });
}

// ── BUILD TOP PICK BAND ───────────────────────────────────────────────────────
// ── SKY PERIOD STRIP ─────────────────────────────────────────────────────────
function renderSkyPeriodStrip(periodCloud) {
  var strip = document.getElementById('sky-period-strip');
  if (!strip) return;
  if (!periodCloud) { strip.style.display = 'none'; return; }

  function skyGrade(c) { return c >= 70 ? 'good' : c >= 30 ? 'warn' : 'bad'; }
  function skyLabel(c) {
    return c >= 70 ? 'Overcast' : c >= 50 ? 'Mostly Cloudy' : c >= 20 ? 'Partly Cloudy' : 'Clear';
  }

  // SVG icons as inline strings
  var sunRays = '';
  [0,45,90,135,180,225,270,315].forEach(function(a) {
    var r = Math.PI/180*a;
    sunRays += '<line x1="'+(12+7.5*Math.cos(r)).toFixed(1)+'" y1="'+(12+7.5*Math.sin(r)).toFixed(1)+'" x2="'+(12+9.8*Math.cos(r)).toFixed(1)+'" y2="'+(12+9.8*Math.sin(r)).toFixed(1)+'" stroke="#e8a85a" stroke-width="1.5" stroke-linecap="round"/>';
  });
  var SVG_SUN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#e8a85a"/>'+sunRays+'</svg>';

  var partlyRays = '';
  [0,60,120,180,240,300].forEach(function(a){
    var r=Math.PI/180*a;
    partlyRays += '<line x1="'+(9+5.5*Math.cos(r)).toFixed(1)+'" y1="'+(9+5.5*Math.sin(r)).toFixed(1)+'" x2="'+(9+7*Math.cos(r)).toFixed(1)+'" y2="'+(9+7*Math.sin(r)).toFixed(1)+'" stroke="#e8a85a" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>';
  });
  var SVG_PARTLY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="4" fill="#e8a85a" opacity="0.9"/>'+partlyRays+'<path d="M8 16 Q5 16 5 13.5 Q5 11 7.5 11 Q7.5 9 10 9 Q12.5 9 13 11 Q15 11 15 13.5 Q15 16 12 16 Z" fill="#9ab5b0"/></svg>';

  var SVG_CLOUD = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 18 Q3 18 3 15 Q3 12 6 12 Q6 9.5 9 9.5 Q12 9.5 12.5 12 Q15 12 15 15 Q15 18 12 18 Z" fill="#6b9a95"/></svg>';

  function getIcon(c) { return c>=70 ? SVG_CLOUD : c>=30 ? SVG_PARTLY : SVG_SUN; }

  var periods = [
    { id:'morning', time:'8 AM',  val:periodCloud.morning },
    { id:'midday',  time:'12 PM', val:periodCloud.midday  },
    { id:'evening', time:'6 PM',  val:periodCloud.evening }
  ];

  periods.forEach(function(p) {
    var cell = document.getElementById('spc-'+p.id);
    var iconEl = document.getElementById('spc-icon-'+p.id);
    var lblEl  = document.getElementById('spc-lbl-'+p.id);
    if (!cell || !iconEl || !lblEl) return;
    var g = skyGrade(p.val);
    cell.className = 'spc spc-'+g;
    iconEl.innerHTML = getIcon(p.val);
    lblEl.textContent = skyLabel(p.val);
  });

  strip.style.display = 'block';
}

// ── STAGING HERO ─────────────────────────────────────────────────────────────
// When fish are staging, the hero must describe the LAKE, not the river. River flow and
// river water temp are real numbers answering a question nobody asked while the fish are
// still out in front of the mouth — showing them alongside a lake recommendation is what
// made the old two-card layout ambiguous. The separate staging card is gone; this is the
// single summary. Reasoning lives in the tile sublabels rather than a duplicate chip row,
// and lures/technique stay in the Technique & Gear section further down the page.
function renderStagingHero(st) {
  // st: { pct, rating, lakeTemp, lakeName, cloudPct, windSpeed, upwell, phaseLabel }
  var host = document.getElementById('tp-tiles');
  if (!host) return;

  function tile(label, value, meaning, state, smallVal) {
    return '<div class="tp-tile ' + state + '">' +
      '<div class="tp-tile-bar"></div>' +
      '<div class="tp-tile-body">' +
        '<div class="tp-tile-lbl">' + label + '</div>' +
        '<div class="tp-tile-val' + (smallVal ? ' sm' : '') + '">' + value + '</div>' +
        '<div class="tp-tile-meaning">' + meaning + '</div>' +
      '</div></div>';
  }

  // 1) LAKE TEMP — warm surface pushes staging fish deeper and holds them off longer
  var lt = st.lakeTemp, ltState, ltMeaning;
  if (lt == null) { ltState = 'na'; ltMeaning = 'No buoy data'; }
  else if (lt <= 14) { ltState = 'good'; ltMeaning = 'Cool, fish shallow'; }
  else if (lt <= 18) { ltState = 'good'; ltMeaning = 'Good staging temp'; }
  else if (lt <= 21) { ltState = 'ok';   ltMeaning = 'Warm, fish holding deeper'; }
  else { ltState = 'poor'; ltMeaning = 'Too warm, fish deep'; }
  var ltVal = (lt == null) ? '\u2014' : (Math.round(lt * 10) / 10) + '\u00b0';

  // 2) SKY — overcast brings staging fish higher in the column and extends the window
  var cp = st.cloudPct, skyState, skyMeaning;
  if (cp == null) { skyState = 'na'; skyMeaning = 'No data'; }
  else if (cp >= 50) { skyState = 'good'; skyMeaning = 'Holding higher'; }
  else if (cp >= 25) { skyState = 'ok';   skyMeaning = 'Some cover'; }
  else { skyState = 'poor'; skyMeaning = 'Bright, fish dawn and dusk'; }
  var skyVal = (cp == null) ? '\u2014' : cp + '%';

  // 3) WIND / UPWELLING — on the north shore, westerlies drive cold water to the surface
  var windVal, windMeaning, windState;
  if (st.windSpeed == null) { windVal = '\u2014'; windMeaning = 'No data'; windState = 'na'; }
  else if (st.upwell === 'up-strong')  { windVal = 'Upwell'; windMeaning = 'Strong cold push'; windState = 'good'; }
  else if (st.upwell === 'up-light')   { windVal = 'Upwell'; windMeaning = 'Mild cold push';        windState = 'good'; }
  else if (st.upwell === 'down-strong'){ windVal = 'Downwell'; windMeaning = 'Warm, pushes fish out'; windState = 'poor'; }
  else if (st.upwell === 'down-light') { windVal = 'Downwell'; windMeaning = 'Mild warming';         windState = 'ok'; }
  else if (st.windSpeed < 8)           { windVal = 'Light';  windMeaning = 'No upwelling push';     windState = 'ok'; }
  else                                 { windVal = 'Alongshore'; windMeaning = 'Little effect';     windState = 'ok'; }

  // 4) STAGING STRENGTH — the number the whole page hangs on
  var pct = st.pct == null ? null : Math.round(st.pct);
  var stState = pct == null ? 'na' : pct >= 65 ? 'good' : pct >= 40 ? 'ok' : 'poor';
  var stMeaning = pct == null ? 'No data' : (st.rating || '') + ' \u00b7 ' + (st.phaseLabel || 'staging');

  host.innerHTML =
    tile('Lake Temp', ltVal, ltMeaning, ltState) +
    tile('Sky', skyVal, skyMeaning, skyState) +
    tile('Wind', windVal, windMeaning, windState, windVal.length > 8) +
    tile('Staging', pct == null ? '\u2014' : pct + '%', stMeaning, stState);

  renderStagingStrength(st);
}

// Full-width strength bar directly under the headline — the one number that answers
// "is it worth the drive" before anything else on the page.
function renderStagingStrength(st) {
  var bar = document.getElementById('tp-strength');
  if (!bar) return;
  var pct = st.pct == null ? null : Math.max(0, Math.min(100, Math.round(st.pct)));
  if (pct == null) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  var _lbl = st.barLabel || ('Staging strength' + (st.lakeName ? ' \u00b7 ' + st.lakeName : ''));
  bar.innerHTML =
    '<div class="tp-str-top">' +
      '<span class="tp-str-lbl">' + _lbl + '</span>' +
      '<span class="tp-str-val">' + (st.rating || '') + ' \u00b7 ' + pct + '%</span>' +
    '</div>' +
    '<div class="tp-str-bar"><i style="width:' + pct + '%"></i></div>' +
    '<div class="tp-str-scale"><span>Slow</span><span>Fair</span><span>Strong</span></div>';
}

function hideStagingStrength() {
  var bar = document.getElementById('tp-strength');
  if (bar) bar.style.display = 'none';
}

// ── CONDITION TILES (hero) ───────────────────────────────────────────────────
function renderConditionTiles(opts) {
  // opts: { wt, cloudPct, flow, sweetMin, sweetMax, flowLow, flowHigh, topMethod, isToday, weatherOk, flowEst }
  var host = document.getElementById('tp-tiles');
  if (!host) return;
  // Clear staging-mode furniture. renderStagingCard resolves async and may overwrite this
  // afterwards; on a non-staging river it never fires, so the hero must reset itself here
  // or a stale strength bar survives into the next search.
  hideStagingStrength();
  var _sn = document.getElementById('tp-staging-note');
  if (_sn) _sn.style.display = 'none';

  function tile(label, value, meaning, state, smallVal) {
    return '<div class="tp-tile ' + state + '">' +
      '<div class="tp-tile-bar"></div>' +
      '<div class="tp-tile-body">' +
        '<div class="tp-tile-lbl">' + label + '</div>' +
        '<div class="tp-tile-val' + (smallVal ? ' sm' : '') + '">' + value + '</div>' +
        '<div class="tp-tile-meaning">' + meaning + '</div>' +
      '</div></div>';
  }

  // 1) WATER TEMP — ideal 8–14 for trout
  var wt = opts.wt;
  var waterState, waterMeaning;
  if (wt == null) { waterState = 'na'; waterMeaning = 'No data'; }
  else if (window._weatherOk === false && !(window._waterTempInfo && window._waterTempInfo.kind === 'measured')) { waterState = 'na'; waterMeaning = 'Est. only'; }
  else if (wt >= 8 && wt <= 14) { waterState = 'good'; waterMeaning = 'Ideal'; }
  else if (wt >= 5 && wt < 8) { waterState = 'ok'; waterMeaning = 'Cool'; }
  else if (wt > 14 && wt <= 18) { waterState = 'ok'; waterMeaning = 'Warm'; }
  else if (wt > 18) { waterState = 'poor'; waterMeaning = 'Too warm'; }
  else { waterState = 'poor'; waterMeaning = 'Too cold'; }
  var waterVal = (wt == null) ? '—' : (Math.round(wt * 10) / 10) + '\u00b0';

  // 2) SKY / CLOUD — overcast is best for trout
  var cp = opts.cloudPct;
  var skyState, skyMeaning;
  if (cp == null) { skyState = 'na'; skyMeaning = 'No data'; }
  else if (cp >= 50) { skyState = 'good'; skyMeaning = 'Good cover'; }
  else if (cp >= 25) { skyState = 'ok'; skyMeaning = 'Some cover'; }
  else { skyState = 'poor'; skyMeaning = 'Bright/clear'; }
  var skyVal = (cp == null) ? '—' : cp + '%';

  // 3) FLOW — today: live value + state; future: target range, muted
  var flowTile;
  if (opts.isToday && opts.flow != null) {
    var f = opts.flow, fState, fMeaning;
    if (f >= opts.sweetMin && f <= opts.sweetMax) { fState = 'good'; fMeaning = 'In range'; }
    else if (f < opts.sweetMin && f >= (opts.flowLow || opts.sweetMin * 0.3)) { fState = 'ok'; fMeaning = 'Low'; }
    else if (f > opts.sweetMax && f <= (opts.flowHigh || opts.sweetMax * 2)) { fState = 'ok'; fMeaning = 'High'; }
    else { fState = 'poor'; fMeaning = f < opts.sweetMin ? 'Too low' : 'Too high'; }
    flowTile = tile('Flow', (Math.round(f * 10) / 10) + '', fMeaning, fState);
  } else if (opts.isToday && opts.flow == null) {
    // Today but gauge down
    flowTile = tile('Flow', 'N/A', 'Check gauge', 'na', true);
  } else if (opts.flowEst) {
    // Future date with an estimate (renderFlowEstimate() has the detail): number for days 1 to 2, range after
    var e = opts.flowEst, eb = flowBand(e.q, opts);
    var eState = eb === 'prime' ? 'good' : eb === 'normal' ? 'ok' : eb === 'high' ? 'ok' : 'poor';
    flowTile = tile('Flow', e.showNumber ? '~' + e.q : e.lo + '\u2013' + e.hi, 'Est. ' + ({low:'low',normal:'normal',prime:'prime',high:'high',blown:'blown'}[eb]), eState);
  } else {
    // Future date with no estimate: show the target range, muted
    flowTile = tile('Flow aim', opts.sweetMin + '\u2013' + opts.sweetMax, 'Check day-of', 'na');
  }

  // 4) TOP BAIT — based on chosen method; always "good" (it's the recommended bait)
  var bait = opts.topMethod || 'Varies';
  // Shorten long bait names for the tile
  var baitShort = bait.replace(/ fishing/i, '').replace(/Slow /,'').trim();
  if (baitShort.length > 9) baitShort = baitShort.split(' ')[0];
  var baitMeaning = bait.length > 9 ? bait.split(' ').slice(-1)[0] : 'Recommended';

  host.innerHTML =
    tile('Water', waterVal, waterMeaning, waterState) +
    tile('Sky', skyVal, skyMeaning, skyState) +
    flowTile +
    tile('Top Bait', baitShort, baitMeaning, 'good', baitShort.length > 8);
}

function buildTopPick(rankedRivers, flow, wt, cloudPct, tc, sc, speciesKey, weatherOk) {
  var band = document.getElementById('tpband');
  if (!band) return;

  var speciesMap = {brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'};
  var _bka=Array.isArray(speciesKey)?speciesKey:(speciesKey?[speciesKey]:[]);
  var targetName=_bka.length===1?speciesMap[_bka[0]]:null;
  // Multi-species: build array of all selected species that are present on this river
  var cfg = getRiverConfig(selectedRiver);
  var _targetNames = _bka.map(function(k){ return speciesMap[k]; }).filter(Boolean);
  var _riverSpecies = (cfg && cfg.species) || [];
  var _targetNamesOnRiver = _targetNames.filter(function(n){ return _riverSpecies.indexOf(n) !== -1; });
  // For headline: only name species that are BOTH on this section AND fishable right now
  var _tripDateForHeadline = getTripDateStr();
  var _targetNamesNowFishable = _targetNamesOnRiver.filter(function(n) {
    var w = getCurrentSeason(n, _tripDateForHeadline);
    return w && w.quality !== 'absent';
  });
  // Fall back to all on-river if none are currently fishable (e.g. winter)
  if (_targetNamesNowFishable.length === 0) _targetNamesNowFishable = _targetNamesOnRiver;
  // For headline use: if 2+ species are fishable on this section, treat as group target
  var _multiTarget = _targetNamesNowFishable.length >= 2 ? _targetNamesNowFishable : null;
  var _multiTargetLabel = _multiTarget ? _multiTarget.join(' + ') : null;
  // If exactly 1 fishable selected species is on this section,
  // promote it to targetName so the headline uses it instead of falling to recs[0]
  if (!targetName && !_multiTarget && _targetNamesNowFishable.length === 1) {
    targetName = _targetNamesNowFishable[0];
  }

  // Best access point: first one with low crowd — UNLESS this is a staging scenario,
  // in which case only harbour/port mouth spots are relevant (fish aren't in the river yet).
  var _stagingActive = false;
  (function() {
    var _stgTarget = targetName || (_targetNamesNowFishable.length === 1 ? _targetNamesNowFishable[0] : null)
      || (!_bka.length ? defaultTargetSpecies(getRiverConfig(selectedRiver), wt) : null);
    if (!_stgTarget || !selectedRiver || typeof STAGING_ZONES === 'undefined') return;
    // Only when this section IS the harbour/mouth section — inland sections keep their own spots.
    if (!resolveStagingSection(selectedRiver) || !STAGING_ZONES[selectedRiver.split(',')[0].trim()]) return;
    // Third caller of the same false-in-September helper. The hero picked the spot with
    // this flag while the technique panel used the phase, so the hero said Erindale Park
    // while the panel said fish the harbour.
    _stagingActive = shouldPointAtMouth(_stgTarget, getTripDateStr());
  })();

  var bestSpot = null;
  if (cfg.access) {
    // Drop anything closed on the trip date before ranking. A sanctuary closure is not a
    // preference to weigh against drive time — it is illegal to fish there.
    var _tripD = (typeof getTripDateStr === 'function') ? getTripDateStr() : null;
    var _openAccess = cfg.access.filter(function(a){ return isAccessOpen(a, _tripD); });
    cfg = Object.create(cfg);           // shadow, don't mutate the shared config
    cfg.access = _openAccess.length ? _openAccess : [];
  }
  bestSpot = bestAccessSpot(cfg.access, _stagingActive);

  // Best time window
  var skyl = cloudPct >= 80 ? 'Overcast' : cloudPct >= 50 ? 'Mostly Cloudy' : cloudPct >= 20 ? 'Partly Cloudy' : 'Clear';
  var sc = clsSky(cloudPct);
  // Compute best fishing window using hourly period data if available, else fall back to daily mean
  var tw, tnoteText;
  var _pc = window._periodCloud;
  if (_pc) {
    // Grade each period: good ≥70% cloud, warn 30-69%, bad <30%
    var _grade = function(c){ return c >= 70 ? 'good' : c >= 30 ? 'warn' : 'bad'; };
    var _mg = _grade(_pc.morning), _dg = _grade(_pc.midday), _eg = _grade(_pc.evening);
    // Build window label from which periods are good or warn
    var _goodPeriods = [], _warnPeriods = [];
    if (_mg === 'good') _goodPeriods.push('Morning (6–10 AM)');
    else if (_mg === 'warn') _warnPeriods.push('Morning (6–10 AM)');
    if (_dg === 'good') _goodPeriods.push('Midday (10 AM–3 PM)');
    else if (_dg === 'warn') _warnPeriods.push('Midday (10 AM–3 PM)');
    if (_eg === 'good') _goodPeriods.push('Evening (3–8 PM)');
    else if (_eg === 'warn') _warnPeriods.push('Evening (3–8 PM)');
    var _active = _goodPeriods.concat(_warnPeriods);
    if (_active.length === 3) {
      tw = 'All day';
      tnoteText = 'Consistent cloud cover all day. Fish any time.';
    } else if (_active.length === 0) {
      tw = 'Early morning only (before 8 AM)';
      tnoteText = 'Clear sky all day. Be on the water before sunrise.';
    } else {
      tw = _active.join(' & ');
      // Explain why skipped periods are skipped
      var _skipped = [];
      if (_mg === 'bad') _skipped.push('mornings are clear (sun kills the bite)');
      if (_dg === 'bad') _skipped.push('midday is bright');
      if (_eg === 'bad') _skipped.push('evening clears out');
      tnoteText = _skipped.length ? 'Skip ' + _skipped.join('; ') + '.' : 'Mixed sky. Focus on the cloudy windows.';
    }
  } else {
    // Fall back to daily mean
    tw = sc === 'good' ? 'All day' : sc === 'warn' ? 'Morning (6–9 AM) & Evening (6–8 PM)' : 'Early morning only (before 8 AM)';
    tnoteText = sc === 'good' ? 'Overcast opens the full day. Don\'t sleep in.' : sc === 'warn' ? 'Partly cloudy compresses your window. Get on at first light.' : 'Clear sky kills the bite fast. Be on the water before sunrise.';
  }

  // Best method
  var _famLabels = {
    '':    {high:'Streamers',cold:'Slow nymphing',normal:'Nymphing'},
    fly:   {high:'Streamer fishing',cold:'Slow nymphing',normal:'Nymphing'},
    spin:  {high:'Heavy spinners',cold:'Slow jig',normal:'Spinner fishing'},
    float: {high:'Drift fishing',cold:'Bottom bait',normal:'Float fishing'}
  };
  var _fam = selectedTechFamily.length > 0 ? selectedTechFamily[0] : '';
  var _fl = _famLabels[_fam] || _famLabels[''];
  var topMethod = flow!=null&&flow>(cfg.flowHigh||20)*0.6 ? _fl.high : wt<8 ? _fl.cold : _fl.normal;
  // Second copy of the salmon method override — this is the one the HERO reads. It still
  // keyed on "is this river a staging zone", a permanent property, so the Ganaraska hero
  // said spinning all season while the technique panel correctly said float fishing.
  // Phase, not geography: staging = spoons, in river = roe under a float.
  // Same decision as the Technique panel, from the same function — see salmonMethodMode.
  (function(){
    var _mode = salmonMethodMode({
      speciesKey: methodSpeciesKey(selectedRiver ? selectedRiver.split(',')[0].trim() : ''),
      fam: _fam, cfg: cfg,
      stagingModeActive: _stagingModeActive,
      migratoryBlocked: window._migratoryBlockedSection
    });
    if (_mode === 'spin')  topMethod = 'Spinning · Spoons & Lures';
    if (_mode === 'float' || _mode === 'spin-float') topMethod = 'Float Fishing · Roe & Beads';
    window._spinFloat = _mode === 'spin-float';
  })();

  // Final legality pass for the hero, mirroring updateMethods. Whatever branch produced
  // topMethod, a bait/roe method cannot stand on artificial-only water.
  topMethod = legalMethodName(topMethod, cfg);

  // Render the conditions tile grid (hero)
  (function(){
    var _td = document.getElementById('trip-date');
    var _ds = _td && _td.value ? _td.value : (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
    var _isToday = _ds === (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
    try {
      renderConditionTiles({
        wt: wt, cloudPct: cloudPct, flow: flow,
        sweetMin: cfg.sweetMin != null ? cfg.sweetMin : 5,
        sweetMax: cfg.sweetMax != null ? cfg.sweetMax : 15,
        flowLow: cfg.flowLow, flowHigh: cfg.flowHigh,
        topMethod: topMethod, isToday: _isToday, weatherOk: weatherOk,
        flowEst: _isToday ? null : window._flowEst
      });
    } catch(_tileErr) { console.warn('condition tiles', _tileErr); }
  })();

  // Species situation — fall back to recommendation if target is out of season
  var speciesNote = '';
  var fallbackSpecies = null;
  // The species genuinely on screen. Set alongside every fallback assignment below so the
  // catch-and-release check tests what we're recommending, not what was asked for.
  window._shownSpeciesName = targetName || null;
  var recs = recommendSpecies(cfg);

  // Thermal stress filter: above 18°C, no trout should be recommended as fallback.
  // Brook trout are most sensitive (~16°C), but 18°C is the practical C&R threshold for all three.
  var _TROUT = ['Brown Trout', 'Rainbow Trout', 'Brook Trout'];
  // Only trust wt for thermal-stress filtering when it came from a real weather fetch,
  // not the generic fallback (airTemp=12 → wt=8, which is not real August/summer data).
  var _thermalStress = wt != null && wt >= 18 && window._weatherOk !== false;
  if (_thermalStress) {
    recs = recs.filter(function(r) { return _TROUT.indexOf(r.name) === -1; });
  }
  // A fallback suggestion must never be the species the user already targeted —
  // "Fish Chinook Salmon instead" of Chinook Salmon is nonsense.
  if (targetName) {
    recs = recs.filter(function(r) { return r.name !== targetName; });
  }

  // A species in its 'slow' window must never become a confident "fish X instead".
  // recommendSpecies gives +2 for resident and +3 for low-crowd access, which is enough
  // to float a slow-season fish to the top of an otherwise empty list. That is how Brown
  // Trout got recommended on the lower Ganaraska in early August, when lake-run browns
  // don't actually push in until the fall run alongside the salmon.
  var _recsSlow = recs.filter(function(r){ return r.seasonal && r.seasonal.quality === 'slow'; });
  recs = recs.filter(function(r){
    return r.seasonal && (r.seasonal.quality === 'peak' || r.seasonal.quality === 'good');
  });
  // If everything left is slow, say so plainly rather than redirecting to a fish that
  // isn't there yet.
  window._allSpeciesSlow = (recs.length === 0 && _recsSlow.length > 0);
  window._slowSpeciesName = window._allSpeciesSlow ? _recsSlow[0].name : null;

  if (targetName) {
    var seasonal = getCurrentSeason(targetName, getTripDateStr());
    var onRiver  = cfg.species && cfg.species.indexOf(targetName) !== -1;
    if (!onRiver || (seasonal && seasonal.quality === 'absent')) {
      var _isMigratory = seasonal && (targetName === 'Chinook Salmon' || targetName === 'Coho Salmon' || targetName === 'Steelhead');
      var _isSalmon = targetName === 'Chinook Salmon' || targetName === 'Coho Salmon';
      var _isAtMouth = selectedRiver && (typeof STAGING_ZONES !== 'undefined') && !!STAGING_ZONES[selectedRiver];

      // Does this river SYSTEM have a staging/mouth section, even if it's not this exact section?
      // e.g. Middle Credit River isn't a staging zone, but Lower Credit River is, on the same river.
      var _sysStagingSection = null;
      if (_isSalmon && !_isAtMouth && selectedRiver && typeof STAGING_ZONES !== 'undefined') {
        // Strip Upper/Middle/Lower prefix to get the core river name (e.g. "Credit River")
        var _curRiverName = selectedRiver.split(',')[0].split(' \u2014 ')[0].trim();
        var _coreName = riverSystemName(_curRiverName);
        Object.keys(STAGING_ZONES).forEach(function(z) {
          if (!_sysStagingSection && _coreName && z.indexOf(_coreName) !== -1) _sysStagingSection = z;
        });
      }

      // Only treat staging as plausible if the CURRENT season window for this species
      // actually describes staging/harbour activity — not a blanket "In Lake" absence.
      var _stagingPlausible = seasonal && /harbour|staging|mouth/i.test(seasonal.label || '');

      if (recs.length > 0) {
        fallbackSpecies = recs[0].name; window._shownSpeciesName = fallbackSpecies;
        if (_isSalmon && !_isAtMouth && _sysStagingSection && _stagingPlausible) {
          // Salmon are staging/running at a mouth section on this same river system.
          // Redirect there instead of silently substituting a resident species —
          // the resident fallback may also be unsafe (heat stress) or scarce this time of year.
          var _sysShort = secShort(_sysStagingSection);
          headlineHtml = '<em>' + targetName + '</em> are running, but at the <em>' + secLabel(_sysStagingSection) + '</em>, not this section. '
            + 'Head there instead, or fish <em>' + fallbackSpecies + '</em> here if you\u2019d rather stay local'
            + (recs[0].reasons[0] ? ' \u2014 ' + recs[0].reasons[0] : '') + '.';
          speciesNote = ''; // headline already set directly, skip the generic builder below
        } else if (_isSalmon && !_isAtMouth) {
          // No staging zone matched, or staging isn't plausible yet this early — genuinely too early
          speciesNote = targetName + ' won’t enter rivers until late summer. '
            + 'Fish for <em>' + fallbackSpecies + '</em> in this section instead'
            + (recs[0].reasons[0] ? ' — ' + recs[0].reasons[0] : '') + '. '
            + (_stagingPlausible
              ? 'For an early shot at salmon, try a harbour mouth section (Ganaraska, Bowmanville, Credit).'
              : (seasonal && seasonal.note ? seasonal.note : ''));
        } else if (_isSalmon && _isAtMouth) {
          // At a harbour mouth — staging logic handles the headline; just set fallback quietly
          fallbackSpecies = recs[0].name; window._shownSpeciesName = fallbackSpecies;
          speciesNote = '';
        } else {
          speciesNote = targetName + ' not in river right now. Fish for ' + fallbackSpecies + ' instead (' + (recs[0].reasons[0] || recs[0].seasonal.label) + '). ';
        }
      } else if (_isSalmon && !_isAtMouth && _sysStagingSection && _stagingPlausible) {
        // No resident fallback available (e.g. all trout filtered by heat stress) —
        // but salmon staging is genuinely plausible right now per the season data. Redirect there.
        headlineHtml = '<em>' + targetName + '</em> aren’t in this section, '
          + 'but they\u2019re starting to stage at the <em>' + secLabel(_sysStagingSection) + '</em>. Worth checking there instead.';
        speciesNote = '';
      } else if (window._allSpeciesSlow && window._slowSpeciesName) {
        // Everything on this river is in a slow window. Don't redirect to a fish that
        // isn't really there — name the situation instead.
        headlineHtml = '<em>' + targetName + '</em> aren\u2019t here yet, and nothing else is in season on this stretch. '
          + '<em>' + window._slowSpeciesName + '</em> are resident but slow right now. They pick up later in the season.';
        speciesNote = '';
      } else if (seasonal && seasonal.note) {
        // Genuinely too early in the season — use the honest season note rather than a generic line
        headlineHtml = '<em>' + targetName + '</em> aren’t here yet. ' + seasonal.note;
        speciesNote = '';
      } else {
        speciesNote = targetName + ' not in river right now. ';
      }
    } else if (seasonal && seasonal.quality === 'peak') {
      speciesNote = targetName + ' are at peak season. ';
    } else if (seasonal && seasonal.quality === 'good') {
      speciesNote = targetName + ' are in season. ';
    } else if (seasonal && seasonal.quality === 'slow') {
      var _isSalmonSlow = targetName === 'Chinook Salmon' || targetName === 'Coho Salmon';
      var _isAtMouthSlow = selectedRiver && (typeof STAGING_ZONES !== 'undefined') && !!STAGING_ZONES[selectedRiver];
      var _sysStagingSlow = null;
      if (_isSalmonSlow && !_isAtMouthSlow && selectedRiver && typeof STAGING_ZONES !== 'undefined') {
        var _curRiverNameSlow = selectedRiver.split(',')[0].split(' \u2014 ')[0].trim();
        var _coreNameSlow = riverSystemName(_curRiverNameSlow);
        Object.keys(STAGING_ZONES).forEach(function(z) {
          if (!_sysStagingSlow && _coreNameSlow && z.indexOf(_coreNameSlow) !== -1) _sysStagingSlow = z;
        });
      }
      var _slowPlausible = seasonal && /harbour|staging|mouth/i.test(seasonal.label || '');
      if (_isSalmonSlow && (_isAtMouthSlow || _sysStagingSlow) && (_slowPlausible || (window._stagingPct != null && window._stagingPct >= 40))) {
        // Staging report already shows real activity — trust it over the generic seasonal label.
        // Only trigger when the staging card actually rendered something meaningful (Fair/Strong).
        fallbackSpecies = recs.length > 0 ? recs[0].name : null; if (fallbackSpecies) window._shownSpeciesName = fallbackSpecies;
        if (_sysStagingSlow) {
          headlineHtml = '<em>' + targetName + '</em> are starting to push in. See the staging report below. '
            + 'Best water is the <em>' + _sysStagingSlow + '</em>'
            + (fallbackSpecies ? ', or fish <em>' + fallbackSpecies + '</em> here if you\u2019d rather stay local.' : '.');
        } else {
          headlineHtml = '<em>' + targetName + '</em> are starting to push in. See the staging report below for where and how to target them.';
        }
        speciesNote = '';
      } else {
        speciesNote = targetName + ' fishing is slow. ';
        if (recs.length > 0 && recs[0].name !== targetName) {
          fallbackSpecies = recs[0].name; window._shownSpeciesName = fallbackSpecies;
          speciesNote += 'Consider ' + fallbackSpecies + ' instead. ';
        }
      }
    }
  } else {
    // Same pick as the gear: see defaultTargetSpecies. It can name a staging salmon whose
    // season window is still 'slow', so it is not always in recs.
    var _def = defaultTargetSpecies(cfg, wt) || (recs.length > 0 ? recs[0].name : null);
    if (_def) {
      fallbackSpecies = _def; window._shownSpeciesName = fallbackSpecies;
      var _defRec = recs.filter(function(r){ return r.name === _def; })[0];
      speciesNote = 'Best bet: ' + _def + (_defRec ? ' (' + (_defRec.reasons[0] || _defRec.seasonal.label) + ')' : ', staging at the mouth') + '. ';
      var _altRec = recs.filter(function(r){ return r.name !== _def; })[0];
      if (_altRec) speciesNote += _altRec.name + ' also good. ';
    }
  }

  // Headline
  var riverShort = selectedRiver ? selectedRiver.split(',')[0] : 'this river';
  var spotName = bestSpot ? bestSpot.name.split(/\s[\u2014\u00b7]\s/)[0].trim() : riverShort;
  // Prepend parent river name to spotName if the access point name doesn't already include it
  (function() {
    var _riverFull = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
    var _parentRiver = _riverFull.indexOf(' — ') !== -1
      ? _riverFull.split(' — ')[0].trim()
      : _riverFull;
    // Only prepend if spotName doesn't already mention the parent river
    if (_parentRiver && spotName &&
        spotName.toLowerCase().indexOf(_parentRiver.toLowerCase().split(' ')[0]) === -1) {
      spotName = _parentRiver + ', ' + spotName;
    }
  })();
  var headlineSpecies = targetName || 'Trout';

  // Build method phrase (must come before headline)
  // What to bring: bringPhraseFor() in conditions-core.js, shared with the weekly email.
  var bringPhrase = bringPhraseFor(topMethod, window._spinFloat);

  // Build headline — lead with species warning when target is out of season
  var _displaySpecies = fallbackSpecies || (targetName && (() => {
    var s = getCurrentSeason(targetName, getTripDateStr());
    return s && s.quality !== 'absent' ? targetName : null;
  })()) || _multiTargetLabel || (recs.length > 0 ? recs[0].name : null);
  // Store effective recommended species so regs card can sync to it
  window._effectiveRecommendedSpecies = _displaySpecies || targetName || null;
  // Patch any already-rendered regs labels to match the recommended species
  try { (function() {
    var _sp = window._effectiveRecommendedSpecies;
    if (!_sp) return;
    var _lbl = _sp.replace(' Trout','').replace(' Salmon','');
    document.querySelectorAll('.regs-title').forEach(function(el) {
      if (/2026 Regs/i.test(el.textContent)) {
        el.textContent = '2026 Regs · ' + _lbl;
      }
    });
    // Also re-filter species rows to show recommended species
    var _keyMap = {'Brown Trout':'brown','Rainbow Trout':'rainbow','Brook Trout':'brook','Steelhead':'rainbow','Chinook Salmon':'chinook','Coho Salmon':'coho'};
    var _effKey2 = _keyMap[_sp];
    if (!_effKey2) return;
    document.querySelectorAll('.reg-row').forEach(function(row) {
      var nameEl = row.querySelector('.reg-species');
      if (!nameEl) return;
      var name = nameEl.textContent.toLowerCase();
      var matches = name.indexOf(_sp.split(' ')[0].toLowerCase()) !== -1;
      row.style.display = matches ? '' : 'none';
    });
    // Same for the limit bullets in the regs panel.
    document.querySelectorAll('.regs-bullets').forEach(function(ul) {
      var lis = Array.from(ul.querySelectorAll('li[data-sp]'));
      lis.forEach(function(li){ li.style.display = li.getAttribute('data-sp').toLowerCase().indexOf(_sp.split(' ')[0].toLowerCase()) !== -1 ? '' : 'none'; });
      if (lis.length && lis.every(function(li){ return li.style.display === 'none'; })) lis.forEach(function(li){ li.style.display = ''; });
    });
    // If all rows hidden, show all (fallback)
    document.querySelectorAll('.regs-species-list').forEach(function(list) {
      var rows = list.querySelectorAll('.reg-row');
      var visible = Array.from(rows).filter(function(r){ return r.style.display !== 'none'; });
      if (visible.length === 0) rows.forEach(function(r){ r.style.display = ''; });
    });
  })(); } catch(_e) { console.warn('regs label patch', _e); }
  var headlineHtml;
  var timeShort = tw.split(' (')[0].split(' and ')[0];
  // Staging override: target is an absent staging species AND this is a lake-mouth staging zone
  var _stagingHeadline = null;
  try {
    var _tgtName = targetName || ((typeof selectedSpeciesLabel !== 'undefined' && selectedSpeciesLabel && selectedSpeciesLabel !== 'Any Species') ? selectedSpeciesLabel : null);
    if (_tgtName && STAGING_ZONES[selectedRiver] && /Chinook|Coho|Steelhead/i.test(_tgtName)) {
      var _sw = getCurrentSeason(_tgtName, getTripDateStr());
      if (_sw && _sw.quality === 'absent') {
        var _gk = STAGING_GROUP[STAGING_ZONES[selectedRiver].key] || 'central';
        var _di2 = document.getElementById('trip-date');
        var _now2 = (_di2 && _di2.value) ? new Date(_di2.value + 'T12:00:00') : new Date();
        var _sp2 = /Steelhead/i.test(_tgtName)
          ? getSteelheadPhase(_now2.getMonth(), _now2.getDate(), null)
          : getSalmonPhase(_gk, _now2.getMonth(), _now2.getDate());
        if (_sp2 && _sp2.active && _sp2.mode === 'stage') {
          _stagingHeadline = '<em>' + _tgtName + '</em> aren’t in the river yet. They’re staging in the lake near the mouth. '
            + 'See the staging report below for where and how to target them.';
        } else if (_sp2 && _sp2.active && _sp2.mode === 'run') {
          _stagingHeadline = '<em>' + _tgtName + '</em> are running into the river now. '
            + 'See the staging report below, and fish the lower river on rising water.';
        } else if (/Steelhead/i.test(_tgtName)) {
          // Steelhead have their own timing: out in the lake all summer, staging off the
          // mouths from September. The salmon copy below gave them a late-July timeline.
          _stagingHeadline = '<em>Steelhead</em> are out in the lake. They start staging off the river mouths '
            + 'in September and push into the river through the fall.';
        } else {
          // Pre-staging: too early for salmon to be running, but early Chinook can show
          // near east harbour mouths opportunistically in June under cold lake temps.
          // Brown Trout are well upstream at this time of year — not relevant here.
          // Best window is dawn or dusk, or all day if heavily overcast.
          var _timeHint = cloudPct >= 70
            ? 'overcast helps, so fish through the day'
            : 'dawn or dusk only';
          var _riverShortName = selectedRiver ? selectedRiver.split(',')[0].split(' \u2014 ')[0].trim() : 'this river';
          var _timingHints = {
            east:         'staging typically starts early July, with the run building mid-to-late August',
            centralEarly: 'staging typically starts mid-July, with the run beginning early September',
            central:      'staging typically starts late July, with the run building through September',
            late:         'staging typically starts early August, with the run building through late September'
          };
          var _timingHint = _timingHints[_gk] || _timingHints.central;
          _stagingHeadline = '<em>' + _tgtName + '</em> are still in the lake, '
            + 'on ' + _riverShortName + ', ' + _timingHint + '. '
            + 'Occasional early fish show near the harbour mouth on cold-water days before then. '
            + 'If you go, spoons and spinners at ' + _timeHint + '. Don’t expect consistency yet.';
        }
      }
    }
  } catch(e) {}
  if (_stagingHeadline) {
    headlineHtml = _stagingHeadline;
    // Override method accordion to show spinning/harbour setup instead of fly methods
    setTimeout(applyStagingTechniqueOverride, 50);
  } else if (fallbackSpecies && targetName && seasonal && seasonal.quality === 'slow'
             && _riverSpecies.indexOf(targetName) !== -1) {
    // Slow season: the species IS here but conditions discourage fishing. This sat after
    // the generic fallback branch below and never ran, so slow fish (lake-run browns
    // holding over in winter) were reported as "aren't here yet".
    var _slowNote = seasonal.note ? seasonal.note.split('.')[0] + '.' : 'Fishing is slow this time of year.';
    headlineHtml = '<em>' + targetName + '</em> are here, but it’s tough going. '
      + _slowNote + ' '
      + 'Try <em>' + fallbackSpecies + '</em> instead: '
      + 'head to <em>' + spotName + '</em>, '
      + timeShort.toLowerCase() + ', '
      + bringPhrase + '.';
  } else if (fallbackSpecies && targetName) {
    // Distinguish geographic mismatch from seasonal absence
    var _geoMismatch = _riverSpecies.indexOf(targetName) === -1;
    var _redirectSection = null;
    if (_geoMismatch) {
      var _curRiver = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
      Object.keys(RIVER_SECTIONS).forEach(function(parent) {
        if (RIVER_SECTIONS[parent].indexOf(_curRiver) !== -1) {
          RIVER_SECTIONS[parent].forEach(function(sib) {
            if (!_redirectSection && sib !== _curRiver) {
              var _sibCfg = getRiverConfig(sib);
              if (_sibCfg && _sibCfg.species && _sibCfg.species.indexOf(targetName) !== -1) {
                _redirectSection = sib;
              }
            }
          });
        }
      });
    }
    if (_geoMismatch && _redirectSection) {
      var _sibShort = _redirectSection.replace(/^.+—\s*/, '');
      headlineHtml = '<em>' + targetName + '</em> aren’t found in this section. '
        + 'They live in the <em>' + _sibShort + '</em>. '
        + 'Fish <em>' + fallbackSpecies + '</em> here today: '
        + 'head to <em>' + spotName + '</em>, ' + timeShort.toLowerCase() + ', ' + bringPhrase + '.';
    } else if (_geoMismatch) {
      headlineHtml = '<em>' + targetName + '</em> aren’t found in this section. '
        + 'Fish <em>' + fallbackSpecies + '</em> instead, and '
        + 'head to <em>' + spotName + '</em>, '
        + timeShort.toLowerCase() + ', '
        + bringPhrase + '.';
    } else {
      headlineHtml = '<em>' + targetName + '</em> aren’t here yet. '
        + 'Fish <em>' + fallbackSpecies + '</em> instead, and '
        + 'head to <em>' + spotName + '</em>, '
        + timeShort.toLowerCase() + ', '
        + bringPhrase + '.';
    }
  } else if (targetName && _thermalStress && _TROUT.indexOf(targetName) !== -1 && !fallbackSpecies) {
    // Thermal stress, trout-only river — no safe recommendation possible
    headlineHtml = 'Water is <em>' + (wt || '—') + '°C</em>, above the safe limit for trout. '
      + 'Consider waiting for cooler conditions or fishing early morning before 8 AM.';
  } else if (targetName && !fallbackSpecies &&
             (_riverSpecies.indexOf(targetName) === -1 || (seasonal && seasonal.quality === 'absent'))) {
    // Not in this section, or out of season, with nothing to suggest instead. The absent
    // branch above set this headline but the generic one below overwrote it with
    // "Head to <spot>... Target <species>", which sent people to the pier for lake-run
    // browns in August and to Rouge Beach for browns that don't use it.
    headlineHtml = _riverSpecies.indexOf(targetName) === -1
      ? '<em>' + targetName + '</em> aren’t found in this section.'
      : '<em>' + targetName + '</em> aren’t here yet. ' + (seasonal.note || '');
  } else if (!targetName && _multiTarget) {
    // Multi-species selection: both are on this river, name them both
    headlineHtml = 'Head to <em>' + spotName + '</em>. '
      + 'Fish <em>' + timeShort + '</em> for <em>' + _multiTargetLabel + '</em>. '
      + 'Bring your <em>' + bringPhrase + '</em>.';
  } else if (!targetName && _displaySpecies) {
    headlineHtml = 'Try <em>' + _displaySpecies + '</em> at <em>' + spotName + '</em>. '
      + 'Fish <em>' + timeShort + '</em>. '
      + 'Bring your <em>' + bringPhrase + '</em>.';
  } else {
    headlineHtml = 'Head to <em>' + spotName + '</em>. '
      + 'Fish <em>' + timeShort + '</em>. '
      + 'Bring your <em>' + bringPhrase + '</em>.'
      + (_displaySpecies ? ' Target <em>' + _displaySpecies + '</em>.' : '');
  }

  // Legal-season pass. Runs after every branch above so none of them can send someone to
  // water that is closed on the trip date, and so a target species that is fishable on
  // another section of this river wins over a local substitute.
  var _goto = null;
  function gotoLink(section, species) {
    return '<a href="#river" class="tp-goto-link" data-goto-section="' + section + '" data-goto-species="' + species + '"><em>'
      + secLabel(section) + '</em></a>';
  }
  (function() {
    var _trip = getTripDateStr();
    var _here = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
    // Closed means the season is shut OR every access point is closed (a sanctuary such as
    // Port Hope from Sep 1 to Oct 14). The season-only check let the hero say "Try Chinook
    // Salmon at Port Hope Sanctuary" while the pill said Closed to fishing.
    // Use the section's full config: cfg here is shadowed down to the open spots only, so
    // when every spot is closed its access list is empty and reads as "nothing closed".
    var _cfgFull = getRiverConfig(selectedRiver);
    var _accessShut = !seasonClosureFor(cfg, _trip) && allAccessClosed(_cfgFull, _trip);
    var _closedHere = seasonClosureFor(cfg, _trip) || (_accessShut
      ? { band: 'access', reason: 'Every access point on this stretch is closed on this date.' } : null);
    var _closedLead = _accessShut ? 'Every access point on this stretch is closed on this date.' : 'The season is closed on this stretch.';
    var _targetOk = targetName ? speciesFishableIn(_here, targetName, _trip) : false;
    if (!_closedHere && (!targetName || _targetOk)) return;
    if (!_closedHere && _stagingHeadline) return;

    var _sibs = sectionSiblings(_here);
    var _closedNote = _closedHere ? ' Trout and salmon season on this stretch closed September 30.' : '';
    if (_closedHere && _closedHere.band === 'extended') _closedNote = ' Trout and salmon season on this stretch closed December 31.';
    if (_accessShut) _closedNote = ' ' + _closedLead;

    if (targetName && !_targetOk) {
      var _sib = null;
      _sibs.forEach(function(s) { if (!_sib && speciesFishableIn(s, targetName, _trip)) _sib = s; });
      if (_sib) {
        var _q = getCurrentSeason(targetName, _trip, _sib);
        var _why = _q && _q.quality === 'peak' ? 'they’re at peak season' : 'they’re in season';
        var _listedHere = cfg.species && cfg.species.indexOf(targetName) !== -1;
        headlineHtml = (_listedHere && _closedHere
            ? _closedLead + ' <em>' + targetName + '</em> are also in the ' + gotoLink(_sib, targetName)
            : '<em>' + targetName + '</em> aren\u2019t fishable in this section. They are in the ' + gotoLink(_sib, targetName))
          + ', where ' + _why + ' and the season is open. Head there instead.'
          + (_listedHere ? '' : _closedNote);
        window._shownSpeciesName = targetName;
        _goto = { section: _sib, species: targetName };
        return;
      }
      // The reach is open but this species isn't (brook trout after September 30 on extended and
      // all-year water: speciesSeasonClosureFor). Say so, and offer the best open species here.
      var _spClosed = !_closedHere ? speciesSeasonClosureFor(_cfgFull, targetName, _trip) : null;
      if (_spClosed) {
        var _alt = null;
        recommendSpecies(cfg).forEach(function(r) {
          if (r.name === targetName || !r.seasonal || (r.seasonal.quality !== 'peak' && r.seasonal.quality !== 'good')) return;
          if (_thermalStress && _TROUT.indexOf(r.name) !== -1) return;
          if (!_alt || r.score > _alt.score) _alt = r;
        });
        headlineHtml = '<em>' + targetName + '</em> season closed September 30 and reopens on the fourth Saturday in April.'
          + (_alt ? ' <em>' + _alt.name + '</em> are open here. Head to <em>' + spotName + '</em>.'
                  : ' Nothing else on this river is both open and in season.');
        window._shownSpeciesName = _alt ? _alt.name : null;
        return;
      }
      if (!_closedHere) return; // no better section; the local fallback above is legal
    }

    // Closed here, and the target (if any) isn't fishable anywhere else on this river.
    // Offer the best species on an open sibling section, scored the same way as locally.
    var _best = null;
    _sibs.forEach(function(s) {
      var sc = getRiverConfig(s);
      if (!sc || sectionClosedOn(sc, _trip)) return;
      recommendSpecies(sc).forEach(function(r) {
        if (!r.seasonal || (r.seasonal.quality !== 'peak' && r.seasonal.quality !== 'good')) return;
        if (_thermalStress && _TROUT.indexOf(r.name) !== -1) return;
        if (!_best || r.score > _best.score) _best = { section: s, name: r.name, score: r.score };
      });
    });
    var _lead = targetName
      ? '<em>' + targetName + '</em> aren’t fishable on this river right now.'
      : _closedLead;
    if (targetName && _closedHere) _lead += _closedNote;
    if (_best) {
      headlineHtml = _lead + ' <em>' + _best.name + '</em> are in season in the ' + gotoLink(_best.section, _best.name)
        + ', which is open. Head there instead.';
      window._shownSpeciesName = _best.name;
      _goto = { section: _best.section, species: _best.name };
    } else {
      headlineHtml = _lead + ' Nothing else on this river is both open and in season'
        + (_closedHere && !(targetName && _closedNote) ? '. ' + _closedHere.reason : '.');  // _lead already says why
      window._shownSpeciesName = null;
    }
  })();

  // Upstream pass (TJ's rule). Only when nothing above already sent the reader elsewhere and
  // the fish aren't staging at the mouth: in upstreamWindowOn() dates, point to the furthest reach upstream
  // that is open on the trip date for a migratory species the reader is after.
  (function() {
    if (_goto || _stagingHeadline) return;
    var _trip = getTripDateStr();
    var _here = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
    var _mig = ['Steelhead', 'Chinook Salmon', 'Coho Salmon'];
    if (isLakeRunBrownSection(_here)) _mig.push('Brown Trout');
    var _want = targetName ? [targetName]
      : (_targetNamesOnRiver.length ? _targetNamesOnRiver
      : [window._shownSpeciesName || window._defaultTargetSpecies].filter(Boolean));
    _want = _want.filter(function(n){ return _mig.indexOf(n) !== -1; });
    var _up = furthestUpstreamOpen(_here, _want, _trip);
    if (!_up) return;
    // Usually autoUpstreamSection() has already moved the reader up. This is left for "Stay on ..."
    // (or a species mix it didn't cover): the button only, so the headline stays short (TJ, 2026-10-25).
    _goto = { section: _up.section, species: targetName ? _up.species : '' };
  })();

  document.getElementById('tp-headline').innerHTML = headlineHtml;
  // After an automatic move upstream: one small line saying so, with a way back.
  (function() {
    var _hd = document.getElementById('tp-headline');
    var _note = document.getElementById('tp-upnote');
    if (!_note) {
      _note = document.createElement('p');
      _note.id = 'tp-upnote';
      _note.className = 'tp-upnote';
      _hd.parentNode.insertBefore(_note, _hd.nextSibling);
    }
    var _u = window._upstreamFrom;
    _note.hidden = !_u;
    if (_u) {
      _note.innerHTML = 'Moved up from the ' + secShort(_u.from) + ' because the fish are pushing upstream. '
        + '<a href="#river" class="tp-stay-link" data-stay-section="' + _u.from + '">Stay on the ' + secShort(_u.from) + '</a>';
    }
  })();
  (function() {
    var _btn = document.getElementById('tp-goto');
    if (!_btn) {
      _btn = document.createElement('button');
      _btn.type = 'button';
      _btn.id = 'tp-goto';
      _btn.className = 'tp-goto-btn';
      var _hd = document.getElementById('tp-headline');
      _hd.parentNode.insertBefore(_btn, _hd.nextSibling);
    }
    _btn.hidden = !_goto;
    if (_goto) {
      _btn.setAttribute('data-goto-section', _goto.section);
      _btn.setAttribute('data-goto-species', _goto.species);
      _btn.textContent = 'See ' + secLabel(_goto.section) + ' \u2192';
    }
  })();

  // Update eyebrow with date context and tense
  (function() {
    var _eyebrow = document.querySelector('.tp-eyebrow');
    if (!_eyebrow) return;
    var _di = document.getElementById('trip-date');
    var _dateStr = _di && _di.value ? _di.value : (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
    var _today = (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
    var _tripD = new Date(_dateStr + 'T12:00:00');
    var _todayD = new Date(_today + 'T12:00:00');
    var _diffDays = Math.round((_tripD - _todayD) / 86400000);
    var _fmt = _tripD.toLocaleDateString('en-CA', {weekday:'short', month:'short', day:'numeric'});
    var _context;
    if (_diffDays === 0) {
      _context = 'Today · ' + _fmt;
    } else if (_diffDays === 1) {
      _context = 'Tomorrow · ' + _fmt;
    } else if (_diffDays > 1) {
      _context = 'Forecast for ' + _fmt;
    } else if (_diffDays === -1) {
      _context = 'Yesterday · ' + _fmt;
    } else {
      _context = _fmt;
    }
    _eyebrow.textContent = _context;

    // Adjust headline verb tense for future dates
    // Only touches leading action verbs — staging/pre-run headlines are already forward-looking
    if (_diffDays > 0) {
      var _hl = document.getElementById('tp-headline');
      if (_hl) {
        _hl.innerHTML = _hl.innerHTML
          .replace(/^Head to /, 'Plan to head to ')
          .replace(/^Try (?=<em>)/, 'Consider trying ');
      }
    }
  })();

  // Always show the band
  if (band) band.style.display = 'block';
  // Hide drive time in expert/check-by-river mode — no city context available
  var _driveElHide = document.getElementById('tp-drive-time');
  if (_driveElHide && appMode === 'expert') _driveElHide.style.display = 'none';

  // Confidence badge
  var _sectionClosed = sectionClosedOn(getRiverConfig(selectedRiver), getTripDateStr());
  // One species picked, and its own season is shut on this open reach (brook trout after Sept 30).
  var _spClosedPill = (function() {
    var k = Array.isArray(speciesKey) ? speciesKey : (speciesKey ? [speciesKey] : []);
    var n = k.length === 1 ? ({brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'})[k[0]] : null;
    return n && !_sectionClosed && speciesSeasonClosureFor(getRiverConfig(selectedRiver), n, getTripDateStr()) ? n : null;
  })();
  var _confEl = document.getElementById('tp-confidence');
  if (_confEl) {
    var _topScore = rankedRivers && rankedRivers[0] ? rankedRivers[0].score : null;
    // In expert mode, estimate score from season quality
    if (_topScore == null) {
      var _cfg2 = getRiverConfig(selectedRiver);
      var _bka2 = Array.isArray(speciesKey)?speciesKey:(speciesKey?[speciesKey]:[]);
      var _sm2 = {brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'};
      var _spName = _bka2.length ? _sm2[_bka2[0]] : null;
      var _seas = _spName ? getCurrentSeason(_spName) : null;
      _topScore = _seas ? (_seas.quality==='peak'?10:_seas.quality==='good'?6:_seas.quality==='slow'?2:0) : 4;
    }
    // Add the water (or the staging strength for fish still in the lake). Same function as the weekly email.
    // A future date has no reading; days 1 to 2 use the flow estimate, which can only pull the rating down.
    var _cfgPill = getRiverConfig(selectedRiver), _baseScore = _topScore;
    var _rate = flow != null
      ? { score: conditionsScore(_baseScore, _cfgPill, flow, wt, cloudPct, window._stagingPct, window._stagingInLake), potential: false, flow: flow }
      : rateWithFlowEstimate(function(f){ return conditionsScore(_baseScore, _cfgPill, f, wt, cloudPct, window._stagingPct, window._stagingInLake); }, window._flowEst);
    window._pillFlow = flow; // the staging card's re-rate uses the same live flow (or the same estimate rule)
    _topScore = _rate.score;
    var _conf = scoreToConfidence(_topScore);
    if (_sectionClosed) {
      _confEl.textContent = 'Closed to fishing';
      _confEl.className = 'tp-confidence conf-tough';
    } else if (_spClosedPill) {
      _confEl.textContent = 'Closed for ' + _spClosedPill;
      _confEl.className = 'tp-confidence conf-tough';
    } else {
      _confEl.textContent = 'Conditions: ' + confidenceWord(_conf, _rate.potential);
      _confEl.className = 'tp-confidence ' + _conf.cls;
      _confEl.title = _rate.potential ? 'Based on the flow estimate for this date. Check the gauge on the day.' : '';
    }
    _confEl.style.display = 'inline-block';
  }
  // Drive time — show prominently below the headline
  var _topRiver = rankedRivers && rankedRivers[0];
  // Always try RIVERS_DB for drive time (covers expert mode and when nearbyRivers misses)
  if ((!_topRiver || !_topRiver.driveTime) && window._beginnerLocKey) {
    var _locKey2 = window._beginnerLocKey;
    var _riverName2 = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
    var _dbEntry = RIVERS_DB.find(function(r){ return r.name === _riverName2; });
    var _dt2 = _dbEntry && _dbEntry.times ? _dbEntry.times[_locKey2] : null;
    if (_dt2) _topRiver = { driveTime: _dt2 };
  }
  var _driveEl = document.getElementById('tp-drive-time');
  if (_driveEl && appMode !== 'expert' && _topRiver && _topRiver.driveTime) {
    var _dt = _topRiver.driveTime || (RIVER_CONFIG[_topRiver.name] && RIVER_CONFIG[_topRiver.name].driveTime && RIVER_CONFIG[_topRiver.name].driveTime[window._beginnerLocKey || '']) || null;
    var _dtStr = _dt < 60 ? _dt + ' min' : (_dt === 60 ? '1 hr' : Math.floor(_dt/60) + ' hr ' + (_dt%60 ? _dt%60 + ' min' : ''));
    var _lk = window._beginnerLocKey || '';
    var _lkLabel = _lk ? _lk.replace(/\b\w/g, function(c){ return c.toUpperCase(); }) : 'your location';

    // Drive worthiness verdict: combines score and distance (driveVerdict in conditions-core.js)
    var _dv = driveVerdict(_topScore, _dt, _sectionClosed);
    var _worthIt = _dv.text, _verdictCls = _dv.cls;

    _driveEl.innerHTML = '<span class="drive-time">\uD83D\uDE97 ' + _dtStr + ' from ' + _lkLabel + '</span>'
      + '<span class="drive-verdict ' + _verdictCls + '">' + _worthIt + '</span>'
      + '<span style="font-size:.68rem;opacity:.55;margin-left:.4rem">est. from city centre</span>';
    _driveEl.style.display = 'block';
  }
    'Head to <em>' + spotName + '</em>. Fish <em>' + tw.split(' (')[0].split(' and ')[0] + '</em>. Bring your <em>' + bringPhrase + '</em>.' ;

  document.getElementById('tp-why').innerHTML = '';

  // Species recommendation chips (no species selected)
  var chips = [];
  if (_bka.length === 0) {
    var _chipRecs = recommendSpecies(cfg);
    _chipRecs.slice(0, 3).forEach(function(r, i) {
      var icon = r.name.indexOf('Trout') !== -1 ? '🟤' : '🔵';
      var qualIcon = r.seasonal.quality === 'peak' ? '★ ' : r.seasonal.quality === 'good' ? '● ' : '';
      chips.push({
        text: icon + ' ' + qualIcon + r.name + (r.reasons[0] ? ' — ' + r.reasons[0] : ''),
        cls: r.seasonal.quality === 'peak' ? 'good' : r.seasonal.quality === 'good' ? '' : 'warn'
      });
    });
  }
  if (bestSpot) chips.push({ text: '📍 ' + bestSpot.loc, cls: '' });
  chips.push({ text: '\u23f0 ' + tw.split(' and ')[0], cls: sc === 'good' ? 'good' : sc === 'warn' ? 'warn' : 'bad' });
  chips.push({ text: '🪱 ' + topMethod, cls: 'good' });
  if (flow == null) chips.push({ text: '\u26a0\ufe0f Check gauge first', cls: 'warn' });
  if (bestSpot && bestSpot.crowd === 'low') chips.push({ text: '🧘 Low pressure spot', cls: 'good' });
  else if (bestSpot && bestSpot.crowd === 'high') chips.push({ text: '👥 Popular spot, go early', cls: 'warn' });

  // Add reg warnings (date-filtered)
  var _tpRegs = RIVER_REGS[riverShort];
  if (_tpRegs) {
    var _tripDate = document.getElementById('trip-date') ? document.getElementById('trip-date').value : '';
    var _regSum = filterAndSummariseRegs(_tpRegs, _tripDate, Array.isArray(selectedSpecies)?selectedSpecies:[], selectedRiver);
    if (_regSum) chips.push({ text: '📋 ' + _regSum.slice(0,80) + (_regSum.length>80?'\u2026':''), cls: 'warn' });
  }

  // When salmon/steelhead: swap chips to match actual situation
  if (_stagingHeadline) {
    var _stMode = (_stagingHeadline.indexOf('running into the river') !== -1) ? 'run'
                : (_stagingHeadline.indexOf('staging in the lake') !== -1) ? 'stage'
                : 'prestaging';
    if (_stMode === 'stage') {
      chips = [
        { text: '📍 Pier, beach & rivermouth', cls: '' },
        { text: '🎣 Spoons & lures · spinning rod', cls: '' },
        { text: '🌊 Best on overcast days + onshore wind', cls: '' }
      ];
    } else if (_stMode === 'run') {
      chips = [
        { text: '📍 Lower river', cls: '' },
        { text: '🌊 Fish rising water after rain', cls: '' }
      ];
    } else {
      // Pre-staging: opportunistic early Chinook at harbour mouth only.
      var _dawnDusk = cloudPct >= 70 ? 'Overcast, fish through the day' : 'Dawn or dusk only';
      chips = [
        { text: '📍 Harbour mouth, spinning rod', cls: '' },
        { text: '🎣 Little Cleo · Kastmaster · Rapala Jointed', cls: '' },
        { text: '⏰ ' + _dawnDusk, cls: cloudPct >= 70 ? 'good' : 'warn' },
        { text: '🌡️ Only worth it if lake temps are cold', cls: 'warn' },
        { text: '⚠️ Low odds, opportunistic only', cls: 'bad' }
      ];
    }
  }
  document.getElementById('tp-chips').innerHTML = chips.map(function(c) {
    return '<div class="tp-chip ' + c.cls + '">' + c.text + '</div>';
  }).join('');

  band.style.display = 'block';
}

// ── RENDER RIVER RANKER (beginner mode) ───────────────────────────────────────
function renderRiverRanker(locKey, maxMinutes) {
  var section = document.getElementById('rrank-section');
  var grid    = document.getElementById('rrank-grid');
  var lbl     = document.getElementById('rrank-lbl');
  if (!section || !grid) return;

  var rivers = getRivers(locKey, maxMinutes || 180); // filtered by travel time
  if (!rivers.length) return;

  // Attach drive times
  rivers.forEach(function(r) {
    var _cfg2=RIVER_CONFIG[r.name]; var _dk4=driveKeyFor(locKey); r.driveTime=(r.times&&(r.times[locKey]||r.times[_dk4]))||(_cfg2&&_cfg2.driveTime&&(_cfg2.driveTime[locKey]||_cfg2.driveTime[_dk4]))||60;
  });

  nearbyRivers = rivers;

  // Track nearby river clicks
  (function(){
    var _g = document.getElementById('rrank-grid');
    if (_g && !_g._trackWired) {
      _g._trackWired = true;
      _g.addEventListener('click', function(e) {
        var _item = e.target.closest('[data-river-name]');
        if (_item) track('Nearby River Clicked', { river: _item.getAttribute('data-river-name') || 'unknown' });
      });
    }
  })();

  var dateStr = document.getElementById('trip-date').value || (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();
  var ranked = rankRivers(rivers, selectedSpecies, dateStr);

  lbl.textContent = 'Rivers near you, ranked by today’s conditions';

  grid.innerHTML = ranked.map(function(r, i) {
    var isTop = i === 0;
    var scoreLabel = r.score >= 8 ? 'good' : r.score >= 3 ? 'warn' : 'bad';
    var scoreText  = r.score >= 8 ? '\u2705 Good today' : r.score >= 3 ? '\u26a0\ufe0f Marginal' : '\u274c Tough today';
    var notesHtml  = r.notes.map(function(n){ return '<span style="color:var(--sage);font-size:.68rem">'+n+'</span>'; }).join(' \u00b7 ');
    var warnHtml   = r.warnings.slice(0,1).map(function(w){ return '<span style="color:#c07040;font-size:.65rem">\u26a0\ufe0f '+w+'</span>'; }).join('');

    return '<div class="rrank-card'+(isTop?' rr-top':'')+ '" data-river-name="'+r.name+'" data-river-loc="'+(r.loc||'').replace(/\u2013/g,'-')+'">' +
      '<div class="rrank-num">'+(i+1)+(isTop?' · Top Pick':'')+'</div>' +
      '<div class="rrank-name">'+secLabel(r.name)+'</div>' +
      '<div class="rrank-drive">'+fmtDrive(r.driveTime)+' away <span style="font-size:.65rem;opacity:.5">est.</span></div>' +
      (notesHtml ? '<div style="margin-bottom:.3rem">'+notesHtml+'</div>' : '') +
      (warnHtml  ? '<div style="margin-bottom:.3rem">'+warnHtml+'</div>'  : '') +
      rrankBadge(r.score) +
    '</div>';
  }).join('');

  // Wire click — selecting a card picks that river and re-renders
  grid.querySelectorAll('.rrank-card[data-river-name]').forEach(function(el) {
    el.addEventListener('click', function() {
      var name = this.getAttribute('data-river-name');
      var loc  = this.getAttribute('data-river-loc');
      selectedRiver = name + ', ' + loc;
      setResHeader(selectedRiver);
      grid.querySelectorAll('.rrank-card').forEach(function(c){ c.style.outline = ''; });
      this.style.outline = '2px solid var(--fern)';
      window._viewSource = 'nearby';
      renderResults();
    });
  });

  section.style.display = 'block';
}

// ── REGULATIONS FILTER & SUMMARISER ─────────────────────────────────────────
// Returns a single plain-English sentence (or null) summarising ACTIVE
// regulations for the given date and selected species.

// The regs panel as a few plain-English bullets: open or closed on the date, what you can keep,
// and only the gear rules that apply on this reach. Replaces the S-x / C-y codes, the
// river-wide summary line and the legend that explained them.
function regsSpeciesPhrase(name) {
  return String(name || '').replace(/\s*\/\s*/g, ' or ')
    .replace(/\b(Trout|Salmon|Brown|Rainbow|Brook|Steelhead|Chinook|Coho)\b/g, function(m){ return m.toLowerCase(); });
}
function buildRegsBullets(regs, filteredSpecies, effectiveSpecies, reaches, sectionName, dateStr) {
  var items = [];
  if (!regs) return items;
  var here = (reaches || []).filter(function(rc){ return rc.here; })[0];
  var cfg = (typeof getRiverConfig === 'function') ? getRiverConfig(sectionName) : null;
  var when = dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : 'this date';

  // 1. Open or closed on the trip date, and this reach's season.
  if (here) {
    var bandSentence = here.band === 'all-year' ? 'This reach is open all year.'
      : 'This reach is open from the ' + here.bandText.replace(/^open from (the )?/, '') + '.';
    if (here.status === 'open') {
      items.push({ html: '<strong class="rb-open">Open on ' + when + '.</strong> ' + bandSentence +
        (here.why ? ' Some access points are closed on this date; the spots below show which.' : '') });
    } else {
      var reason = /september 30/i.test(here.why) ? 'The trout and salmon season here ended September 30.'
        : /december 31/i.test(here.why) ? 'The trout and salmon season here ended December 31.'
        : /fourth saturday/i.test(here.why) ? 'The season here opens on the fourth Saturday in April.'
        : 'Every access point we list on this reach is closed on this date.';
      items.push({ html: '<strong class="rb-closed">Closed on ' + when + '.</strong> ' + reason });
      // Limits and gear rules don't apply to water you can't fish; listing them read as a go.
      return items;
    }
  }

  // 2. What you can keep, one bullet per species shown.
  var sorted = (filteredSpecies || []).slice();
  if (effectiveSpecies) {
    var e = effectiveSpecies.toLowerCase().split(' ')[0];
    sorted.sort(function(a, b){ return (b.name.toLowerCase().indexOf(e) !== -1) - (a.name.toLowerCase().indexOf(e) !== -1); });
  }
  var anyKeep = false, anyUnder5 = false;
  sorted.forEach(function(row) {
    var sp = regsSpeciesPhrase(row.name);
    var txt;
    if (reachCatchReleaseFor(sectionName, row.name)) {
      txt = 'Catch and release only for ' + sp + ' on this reach. You can’t keep any.';
    } else {
      var m = String(row.limit || '').match(/S-(\d+)\s*\/\s*C-(\d+)/i);
      if (!m) return;
      var sN = parseInt(m[1], 10), cN = parseInt(m[2], 10);
      if (sN === 0) txt = 'Catch and release only for ' + sp + '. You can’t keep any.';
      else {
        anyKeep = true;
        if (sN < 5) anyUnder5 = true;
        txt = 'Keep up to ' + sN + ' ' + sp + ' a day with a Sport licence, or ' + cN + ' with a Conservation licence.';
      }
    }
    items.push({ html: txt, sp: row.name });
  });
  // Zones 16 and 17: all trout and salmon share one daily limit (MNR 2026, zone-wide aggregate).
  // Only worth saying when it adds something: a species limit under 5, or several species listed.
  if (anyKeep && (anyUnder5 || sorted.length > 1) && /FMZ 1[67]\b/.test(regs.zone || '')) {
    items.push({ html: 'All the trout and salmon you keep count toward one daily total: 5 with a Sport licence, 2 with a Conservation licence.' });
  }

  // 3. Gear and bait rules that apply here.
  if (cfg && cfg.artificialOnly) items.push({ html: 'Artificial lures or flies only, with one barbless hook. No bait or roe.' });
  if ((regs.special || []).some(function(x){ return /bait management/i.test(x); })) {
    items.push({ html: 'Don’t move baitfish or leeches into or out of the area unless they’re dead and preserved (Southern Bait Management Zone).' });
  }
  return items;
}
function filterAndSummariseRegs(regs, tripDateStr, selectedSpeciesArr, sectionName) {
  if (!regs) return null;
  // On a river with several reaches, season and gear rules belong to the reach: the reach table
  // gives seasons, and gear rules come from the reach config, not from river-wide text (the
  // Upper Credit's artificial-only, C&R rule was shown on the Lower Credit as "On this river").
  var _secCfg = (sectionName && typeof getRiverConfig === 'function') ? getRiverConfig(sectionName) : null;
  var _multiReach = !!(sectionName && reachSeasons(sectionName, '').length > 1);

  var date = tripDateStr ? new Date(tripDateStr + 'T12:00:00') : new Date();
  var month = date.getMonth();   // 0=Jan
  var day   = date.getDate();

  // ── Date helpers ────────────────────────────────────────────────────────────
  // "4th Sat. in April" → compute that date for the current year
  function nthWeekday(nth, weekday, monthIdx, year) {
    // weekday: 0=Sun,1=Mon,...,6=Sat
    var d = new Date(year, monthIdx, 1);
    var count = 0;
    while (count < nth) {
      if (d.getDay() === weekday) count++;
      if (count < nth) d.setDate(d.getDate() + 1);
    }
    return d;
  }

  var year = date.getFullYear();
  // Pre-compute common anchor dates
  var sat4April  = nthWeekday(4, 6, 3, year);  // 4th Sat. April
  var sat4AprFri = new Date(sat4April); sat4AprFri.setDate(sat4April.getDate() - 1); // Fri before
  var sat2May    = nthWeekday(2, 6, 4, year);  // 2nd Sat. May
  var sat2MayFri = new Date(sat2May); sat2MayFri.setDate(sat2May.getDate() - 1);

  // Is `date` within [startMD, endMD] where MD = {month, day} (0-indexed month)?
  function inRange(sm, sd, em, ed) {
    var after  = (month > sm) || (month === sm && day >= sd);
    var before = (month < em) || (month === em && day <= ed);
    if (sm <= em) return after && before;
    // wraps year
    return after || before;
  }

  function beforeDate(d2) { return date < d2; }
  function afterDate(d2)  { return date >= d2; }
  function betweenDates(d1, d2) { return date >= d1 && date <= d2; }

  // ── Species filter ────────────────────────────────────────────────────────
  var smMap = {brown:'brown trout', rainbow:'rainbow trout', brook:'brook trout',
               chinook:'chinook', coho:'coho'};
  var targetLower = selectedSpeciesArr.map(function(k){ return smMap[k]||k; });
  function speciesMatches(text) {
    if (targetLower.length === 0) return true;
    var t = text.toLowerCase();
    return targetLower.some(function(s){ return t.indexOf(s) !== -1; }) ||
           /trout|salmon|salmonid/i.test(t); // generic
  }

  // ── Classify each special condition ───────────────────────────────────────
  var active   = [];  // currently applies
  var inactive = [];  // date-based, NOT currently active
  var always   = [];  // no date — always applies

  regs.special.forEach(function(s) {
    var lo = s.toLowerCase();

    // Skip purely informational / non-actionable lines
    if (/no active.*gauge|check.*ca for|check.*conservation|check.*parks canada|check.*trca|check.*grca|check.*exact location|standard zone.*seasons|check.*local rules|check which zone/i.test(s)) return;

    // ── Date-bearing patterns ────────────────────────────────────────────────
    var dated = false;

    // "sanctuary Jan. 1–Fri. before 4th Sat. April & Oct. 1–Dec. 31"
    // Must be tested before the single-window pattern below, which also matches this
    // text and used to drop the Oct–Dec half (Humber above 407, Bronte at Lowville).
    if (/jan\.?\s*1.*4th sat.*april.*oct\.?\s*1.*dec\.?\s*31/i.test(s)) {
      dated = true;
      var p1 = betweenDates(new Date(year,0,1), sat4AprFri);
      var p2 = inRange(9,1,11,31);
      if (p1 || p2) active.push(s); else inactive.push(s);
    }
    // "sanctuary Jan. 1 – Fri. before 4th Sat. April" (Jan 1 – early April)
    else if (/sanctuary jan\.?\s*1.*(fri.*before.*4th sat.*april|4th sat.*april)/i.test(s)) {
      dated = true;
      var sanctEnd = sat4AprFri;
      if (betweenDates(new Date(year,0,1), sanctEnd)) active.push(s);
      else inactive.push(s);
    }
    // "sanctuary Jan. 1–Fri. before 2nd Sat. in May & Oct. 1–Dec. 31"
    else if (/jan\.?\s*1.*2nd sat.*may.*oct\.?\s*1.*dec\.?\s*31/i.test(s)) {
      dated = true;
      var p1 = betweenDates(new Date(year,0,1), sat2MayFri);
      var p2 = inRange(9,1,11,31);
      if (p1 || p2) active.push(s); else inactive.push(s);
    }
    // "Fish Sanctuary: no fishing March 1 – Fri. before 4th Sat. in April"
    else if (/march 1.*fri.*before.*4th sat/i.test(s)) {
      dated = true;
      if (betweenDates(new Date(year,2,1), sat4AprFri)) active.push(s);
      else inactive.push(s);
    }
    // "Hwy 403 to Britannia Rd.: sanctuary Jan. 1–Apr. & Aug. 15–Dec. 31"
    else if (/jan\.?\s*1.*apr.*aug\.?\s*15.*dec\.?\s*31/i.test(s)) {
      dated = true;
      var p1 = inRange(0,1,3,30);
      var p2 = inRange(7,15,11,31);
      if (p1 || p2) active.push(s); else inactive.push(s);
    }
    // "sanctuary closed to night fishing Oct. 1–Oct. 31"
    else if (/oct\.?\s*1.*oct\.?\s*31/i.test(s)) {
      dated = true;
      if (inRange(9,1,9,31)) active.push(s); else inactive.push(s);
    }
    // "4th Sat. April – Dec. 31 (extended fall)" — open season
    else if (/4th sat.*april.*dec\.?\s*31/i.test(s)) {
      dated = true;
      if (afterDate(sat4April) && inRange(0,1,11,31)) active.push(s);
      else inactive.push(s);
    }
    // "Maple Hill Dam section: fish sanctuary closed all year"
    else if (/closed all year/i.test(s)) {
      dated = true;
      active.push(s);
    }
    // "open all year" — always relevant
    else if (/open all year/i.test(s)) {
      dated = true;
      active.push(s);
    }

    if (!dated) always.push(s);
  });

  // ── Build the single-sentence summary ─────────────────────────────────────
  var parts = [];

  // 1. Season check from species rows
  if (regs.species && selectedSpeciesArr.length > 0 && !_multiReach) {
    var smMap2 = {brown:"Brown Trout",rainbow:"Rainbow Trout",brook:"Brook Trout",steelhead:"Rainbow Trout",
                  chinook:"Chinook Salmon",coho:"Coho Salmon"};
    selectedSpeciesArr.forEach(function(k) {
      var name = smMap2[k];
      var row = regs.species.find(function(r){ return regsRowMatches(r.name, k); });
      if (!row) return;
      // Check if season is open based on date
      // Season strings like "4th Sat. April – Sept. 30" or "Open all year..."
      var seasonStr = (row.season||'').toLowerCase();
      if (/open all year/i.test(seasonStr)) {
        // Fine, no warning
      } else if (/4th sat.*april.*sept\.?\s*30/i.test(seasonStr) || /4th sat.*april.*sep\.?\s*30/i.test(seasonStr)) {
        var seasonOpen  = afterDate(sat4April);
        var seasonClose = inRange(0,1,8,30); // before Sept 30 = Jan–Sept
        var isOpen = seasonOpen && !inRange(9,1,11,31); // open: 4th Sat Apr – Sept 30
        // Actually: open if date >= 4th Sat April AND month <= 8 (Sept is month 8, day 30)
        var openNow = afterDate(sat4April) && (month < 9 || (month === 9 && day <= 30));
        if (!openNow) {
          parts.push(name + " season is closed (opens " +
            sat4April.toLocaleDateString('en-CA',{month:'short',day:'numeric'}) + ").");
        }
      }
    });
  }

  // 2. Active date-based sanctuary/restrictions
  var sanctuaryActive = active.filter(function(s){ return /sanctuary|closed/i.test(s); });
  if (sanctuaryActive.length > 0 && speciesMatches(sanctuaryActive[0])) {
    // Condense: just say "sanctuary in effect on part of this river"
    parts.push("A sanctuary is in effect on part of this river today. Check your exact location.");
  }

  // 3. Always-on gear restrictions (not date-dependent)
  var artOnly = always.filter(function(s){ return /artificial lure only|artificial only/i.test(s); });
  var barbless = always.filter(function(s){ return /barbless/i.test(s); });
  var crOnly   = always.filter(function(s){ return /c.?r only|catch.*release only/i.test(s); });
  var baitMgmt = always.filter(function(s){ return /bait management zone/i.test(s); });
  var wildBrook = always.filter(function(s){ return /wild brook trout/i.test(s); });

  if (_multiReach && _secCfg) {
    var _crNames = {brown:'Brown Trout',rainbow:'Rainbow Trout',brook:'Brook Trout',steelhead:'Steelhead',chinook:'Chinook Salmon',coho:'Coho Salmon'};
    var _cr = _secCfg.catchRelease || [];
    var _crHit = _cr.length && (selectedSpeciesArr.length === 0 ||
      selectedSpeciesArr.some(function(k){ return _cr.indexOf(_crNames[k]) !== -1; }));
    artOnly  = _secCfg.artificialOnly ? ['reach'] : [];
    barbless = _secCfg.artificialOnly ? ['reach'] : [];
    crOnly   = _crHit ? ['reach'] : [];
  }
  var gearParts = [];
  if (artOnly.length > 0)  gearParts.push("artificial lures only");
  if (barbless.length > 0) gearParts.push("barbless hooks only");
  if (crOnly.length > 0)   gearParts.push("catch & release only");
  if (baitMgmt.length > 0) gearParts.push("Southern Bait Management Zone (no live baitfish)");
  if (wildBrook.length > 0 && (selectedSpeciesArr.indexOf('brook') !== -1 || selectedSpeciesArr.length === 0)) {
    gearParts.push("wild brook trout. Handle with care, catch and release strongly recommended");
  }

  if (gearParts.length > 0) {
    parts.push((_multiReach ? "On this reach: " : "On this river: ") + gearParts.join(", ") + ".");
  }

  // 4. Limit info for selected species
  if (regs.species && selectedSpeciesArr.length > 0) {
    var limitParts = [];
    selectedSpeciesArr.forEach(function(k) {
      var row = regs.species.find(function(r){ return regsRowMatches(r.name, k); });
      var lim = row ? (sectionName ? reachLimitText(sectionName, row) : row.limit) : null;
      if (row && lim && !limitParts.some(function(x){ return x.indexOf(row.name + ':') === 0; })) limitParts.push(row.name + ": " + lim);
    });
    if (limitParts.length > 0) parts.push("Daily limits: " + limitParts.join("; ") + ".");
  }

  if (parts.length === 0) return null;
  return parts.join(" ");
}

// Is this regs row's species catch-and-release on this reach (reach config `catchRelease`)? Same
// first-word match as the plain-English summary uses, so the two always agree.
function reachCatchReleaseFor(sectionName, rowName) {
  var c = (typeof getRiverConfig === 'function') ? getRiverConfig(sectionName) : null;
  if (!c || !c.catchRelease) return false;
  return c.catchRelease.some(function(n){ return String(rowName || '').toLowerCase().indexOf(n.toLowerCase().split(' ')[0]) !== -1; });
}
function reachLimitText(sectionName, row) {
  return reachCatchReleaseFor(sectionName, row.name) ? 'S-0 / C-0 (C&amp;R on this reach)' : row.limit;
}
// "How to read these rules": only the terms that appear in this panel. The fixed list explained
// limits, C&R and gear rules even when none of them were shown.
function recommendSpecies(cfg) {
  // Score each species on the river and return ranked list with reasons
  // Steelhead must be here. It is a distinct SPECIES_SEASONS entry (migratory O. mykiss)
  // listed on 29 river sections, but it was missing from this list — so it could never be
  // scored or offered as a fallback, even in November when it is the obvious answer.
  // Steelhead before Brown Trout: on lake-run water they score the same in winter, and a tie
  // should go to the steelhead (the main winter fish), not the browns.
  var allSpecies = ['Steelhead','Brown Trout','Rainbow Trout','Brook Trout','Chinook Salmon','Coho Salmon'];
  var riverSpecies = cfg.species || [];

  var scored = [];

  allSpecies.forEach(function(name) {
    if (riverSpecies.indexOf(name) === -1) return; // not on this river

    var score = 0;
    var reasons = [];
    var caveats = [];

    // Closed for this species on an open reach (brook trout after September 30 on extended and
    // all-year water). A fully closed reach is handled by the closed headline, so leave those alone.
    var _tripD = getTripDateStr();
    if (_tripD && cfg && !seasonClosureFor(cfg, _tripD) && speciesSeasonClosureFor(cfg, name, _tripD)) return;
    // Season quality
    var seasonal = getCurrentSeason(name, _tripD, cfg && cfg._section);
    if (!seasonal || seasonal.quality === 'absent') return; // not in river
    if (seasonal.quality === 'peak')      { score += 10; reasons.push('peak season right now'); }
    else if (seasonal.quality === 'good') { score +=  6; reasons.push('in season'); }
    else if (seasonal.quality === 'slow') { score +=  2; caveats.push('slow season'); }

    // Ease of access — prefer rivers with low-pressure spots
    var hasLowCrowd = cfg.access && cfg.access.some(function(a){ return a.crowd === 'low'; });
    var hasMedCrowd = cfg.access && cfg.access.some(function(a){ return a.crowd === 'med'; });
    if (hasLowCrowd) { score += 3; reasons.push('low-pressure access available'); }
    else if (hasMedCrowd) { score += 1; }
    else { caveats.push('expect crowds'); }

    // Resident vs migratory — residents are always available, migratory needs timing.
    // Lake-run browns are migratory here, so no resident or easy-trout bonus.
    var data = SPECIES_SEASONS[name];
    var lakeRun = name === 'Brown Trout' && isLakeRunBrownSection(cfg && cfg._section);
    if (data && data.type === 'resident' && !lakeRun) {
      score += 2; reasons.push('resident year-round');
    } else if ((data && data.type === 'migratory') || lakeRun) {
      reasons.push('run is in');
    }

    // Beginner friendliness — trout are easier than salmon
    if (name.indexOf('Trout') !== -1 && !lakeRun) { score += 1; }

    scored.push({
      name: name,
      score: score,
      seasonal: seasonal,
      reasons: reasons,
      caveats: caveats
    });
  });

  return scored.sort(function(a, b){ return b.score - a.score; });
}

var BAIT_IMAGES = {
  'Hare\'s Ear Nymph': '/images/flies/hares-ear-nymph.jpg',
  'Frenchie': '/images/flies/frenchie.jpg',
  'Perdigon': '/images/flies/perdigon.jpg',
  'Stonefly Nymph': '/images/flies/stonefly-nymph.jpg',
  'Zebra Midge': '/images/flies/zebra-midge.jpg',
  'Blue Winged Olive': '/images/flies/blue-winged-olive.jpg',
  'Woolly Bugger': '/images/flies/woolly-bugger.jpg',
  'Zonker': '/images/flies/zonker.jpg',
    'Clouser Minnow': '/images/lures/clouser-minnow.jpg',
  'Elk Hair Caddis': '/images/lures/elk-hair-caddis.jpg',
    'Sulphur Comparadun': '/images/lures/sulphur-comparadun.jpg',
  'Royal Wulff': '/images/lures/royal-wulff.jpg',
  'Rapala Original Floating': '/images/lures/rapala.jpg',
  'Blue Fox Vibrax Spinner': '/images/lures/blue-fox-vibrax.jpg',
  'Kastmaster Spoon': '/images/lures/kastmaster.jpg',
  'Little Cleo Spoon': '/images/lures/little-cleo.jpg',
  'Mepps Aglia Spinner': '/images/lures/mepps-aglia.jpg',
};

var baitImageCache = {  'Hard Bead': '/images/bait/hard-bead.jpg',
  'Soft Bead': '/images/bait/soft-bead.jpg',
  'Roe Bag': '/images/bait/roe-bag.jpg',
  'Plastic Worm': '/images/bait/plastic-worm.jpg',
  'Nightcrawler': '/images/bait/nightcrawler.jpg',
};

function fetchBaitImage(baitName) {
  // Two separate maps exist: BAIT_IMAGES covers flies and lures, baitImageCache covers
  // float baits (roe bags, beads, worms). This only ever read the first, so every float
  // bait fell through to the SVG placeholder even though the photos were on the server.
  if (BAIT_IMAGES[baitName]) return Promise.resolve(BAIT_IMAGES[baitName]);
  if (baitImageCache[baitName]) return Promise.resolve(baitImageCache[baitName]);
  return Promise.resolve(null);
}

// ── AUTO-SELECT BAIT TAB BASED ON TECHNIQUE ──────────────────────────────────
function autoSelectBaitTab() {
  var fam = selectedTechFamily.length > 0 ? selectedTechFamily[0] : '';
  var topMethod = document.getElementById('m1n') ? document.getElementById('m1n').textContent : '';

  // Chinook or Coho at a staging zone → salmon lures panel
  var _mk = methodSpeciesKey(selectedRiver ? selectedRiver.split(',')[0].trim() : '');
  var _isSalmonSp = _mk === 'chinook' || _mk === 'coho';
  // Phase, not geography — a staging ZONE is permanent, a staging PHASE is not. This
  // forced the salmon-lures panel year-round on every mouth section.
  if (_isSalmonSp && _stagingModeActive && (fam === 'spin' || fam === '')) {
    tab = 'salmon-lures';
    var btn2 = document.querySelector('.btab[data-tab="salmon-lures"]');
    if (btn2) showTab('salmon-lures', btn2);
    return;
  }

  var tab;
  if (fam === 'spin') {
    tab = 'lures';
  } else if (fam === 'float') {
    tab = 'float'; // dedicated float fishing bait panel
  } else if (fam === 'fly') {
    // Within fly fishing, pick based on recommended method
    if (/dry/i.test(topMethod))      tab = 'dries';
    else if (/streamer/i.test(topMethod)) tab = 'streamers';
    else                              tab = 'nymphs';
  } else {
    // No family selected — pick based on method
    if (/streamer|spin|spoon/i.test(topMethod)) tab = 'streamers';
    else if (/dry/i.test(topMethod))             tab = 'dries';
    else if (/float|drift|bait/i.test(topMethod)) tab = 'float';
    else if (/lure|jig|crankbait/i.test(topMethod)) tab = 'lures';
    else                                          tab = 'nymphs';
  }

  // Find the button with that data-tab and activate it
  var btn = document.querySelector('.btab[data-tab="' + tab + '"]');
  if (btn) showTab(tab, btn);
}

// ── LOAD BAIT IMAGES ─────────────────────────────────────────────────────────
function loadBaitImages() {
  document.querySelectorAll('.bi[data-bait-name]').forEach(function(el) {
    var name = el.getAttribute('data-bait-name');
    var ph = el.querySelector('.bi-img-ph');
    if (!ph || !name) return;
    fetchBaitImage(name).then(function(src) {
      if (src) {
        ph.style.opacity = '1';
        ph.innerHTML = '<img src="' + src + '" alt="' + name + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
      }
    });
  });
}

// ── GEAR SETUP RECOMMENDATIONS ────────────────────────────────────────────────
function buildGearSetup(topMethod, fam, conditions, gridId, labelId) {
  var cold = conditions.cold, high = conditions.high, low = conditions.low;
  var sm = {brown:'Brown Trout',rainbow:'Rainbow Trout',steelhead:'Steelhead',brook:'Brook Trout',chinook:'Chinook Salmon',coho:'Coho Salmon'};
  // Same species the method was picked for (never selectedSpecies[0]; see CLAUDE.md).
  var _gk = methodSpeciesKey(selectedRiver ? selectedRiver.split(',')[0].trim() : '');
  var primarySpecies = sm[_gk] || null;
  var isSalmon = !!primarySpecies && primarySpecies.indexOf('Salmon') !== -1;
  var spinFloat = fam === 'spin-float';
  if (spinFloat) fam = 'float';
  var isBrook  = primarySpecies === 'Brook Trout';

  // Ordered list, not an object. Order is the packing order, and `secondary:true` demotes
  // terminal tackle so swivels and split shot stop competing with the rod choice.
  // `wide:true` lets a long value span both columns instead of wrapping badly.
  var gear = [];
  var kitName = 'Setup';
  var kitNote = null;
  function g(label, val, note, opts) {
    if (!val) return;                       // a field that doesn't apply simply isn't pushed
    opts = opts || {};
    gear.push({ label:label, val:val, note:note || null, secondary:!!opts.secondary, wide:!!opts.wide });
  }

  // ── FLY ────────────────────────────────────────────────────────────────
  if (fam === 'fly' || (!fam && /nymph|dry|streamer|midge/i.test(topMethod))) {
    if (/streamer/i.test(topMethod)) {
      kitName = 'Fly setup · ' + (isSalmon ? '7\u20138 wt' : '5\u20136 wt');
      g('Rod', isSalmon ? '7\u20138 wt, 9\u201310 ft' : '5\u20136 wt, 9 ft', 'Fast action for casting big flies');
      g('Reel', 'Large arbor with a real drag');
      g('Line', 'Sinking tip or full sink', 'Type II\u2013III for most rivers', {wide:true});
      g('Leader', '6\u20139 ft \u00b7 1x\u20133x fluorocarbon', 'Short and stout, because fish inhale streamers', {wide:true});
      g('Fly size', '#2\u20138', 'Olive, black, rust');
      g('Also bring', 'Locking pliers, net', null, {secondary:true});
    } else if (/dry/i.test(topMethod)) {
      kitName = 'Fly setup · ' + (isBrook ? '2\u20133 wt' : '4\u20135 wt');
      g('Rod', isBrook ? '2\u20133 wt, 7\u20138 ft' : '4\u20135 wt, 8\u20139 ft', 'Lighter is better for delicate presentation');
      g('Reel', 'Click-and-pawl or light disc');
      g('Line', 'Weight forward floating');
      g('Leader', '12\u201315 ft tapered');
      g('Tippet', '5x\u20136x', 'Long and fine, which matters for spooky fish');
      g('Fly size', '#14\u201320', 'Match the hatch');
      g('Also bring', 'Floatant, 5x and 6x spools', null, {secondary:true});
    } else if (/euro|tight.?line/i.test(topMethod) || (isBrook && /nymph/i.test(topMethod))) {
      kitName = 'Fly setup · ' + (isBrook ? '3 wt' : '3\u20134 wt') + ' euro';
      kitNote = 'The long rod is the method here. A 9 ft rod won’t fish this water well.';
      g('Rod', isBrook ? '3 wt, 10 ft' : '3\u20134 wt, 10\u201311 ft', 'Long rod for contact nymphing');
      g('Reel', 'Small arbor, balanced to the rod');
      g('Line', 'Euro line or level mono rig', null, {wide:true});
      g('Leader', '15\u201320 ft with bi-colour sighter', 'Sighter is your strike detection', {wide:true});
      g('Tippet', '5x\u20136x fluorocarbon');
      g('Fly size', '#12\u201318', cold ? 'Go smaller in cold water' : null);
      g('Also bring', 'Tungsten beads, sighter tippet', null, {secondary:true});
    } else {
      kitName = 'Fly setup · ' + (isSalmon ? '8\u20139 wt' : '5\u20136 wt');
      g('Rod', isSalmon ? '8\u20139 wt, 9\u201310 ft' : '5\u20136 wt, 9 ft', 'Medium-fast suits most nymphing');
      g('Reel', 'Large arbor with smooth drag');
      g('Line', 'Weight forward floating');
      g('Leader', '9\u201312 ft \u00b7 4x\u20135x');
      g('Tippet', 'Fluorocarbon', 'Nearly invisible underwater');
      g('Fly size', '#12\u201318', cold ? 'Small and slow in cold water' : 'Smaller in clear, larger in stained');
      g('Also bring', 'Split shot, indicators, floatant', null, {secondary:true});
    }

  // ── FLOAT ──────────────────────────────────────────────────────────────
  } else if (fam === 'float' || (!fam && /float|drift|bait|roe|bead|centrepin|bottom bounc/i.test(topMethod))) {
    var _bigFish = isSalmon || /steelhead|chinook|coho/.test(_gk) || (_gk === 'brown' && isLakeRunBrownSection(selectedRiver));
    kitName = spinFloat ? 'Float setup on a spinning rod' : 'Float setup';
    kitNote = high ? 'Water is up, so use a heavier float and more shot than usual.'
            : low  ? 'Flow is low, so use a smaller float and a longer leader than usual.' : null;
    if (spinFloat) {
      g('Rod', isSalmon ? '9\u201311 ft medium-heavy spinning' : _bigFish ? '9\u201311 ft medium spinning' : '9\u201311 ft medium-light spinning',
        'Your spinning rod works. Longer gives better float control', {wide:true});
      g('Reel', isSalmon ? '3000\u20134000 spinning, smooth drag' : _bigFish ? '2500\u20133000 spinning' : '2500 spinning');
    } else {
    // A centrepin works for resident trout too, with lighter line, floats and hooks (TJ).
    g('Rod', _bigFish ? 'Centrepin or 10\u201312 ft spinning' : 'Centrepin or 9\u201311 ft medium-light spinning',
      'Long rod = better float control', {wide:true});
    g('Reel', _bigFish ? 'Centrepin or 3000 spinning' : 'Centrepin or light spinning, 2500');
    }
    g('Main line', _bigFish ? '8\u201312 lb mono' : '4\u20136 lb mono', 'Mono floats');
    g('Leader', _bigFish ? '6\u20138 lb fluoro, 18\u201324 in' : '3\u20134 lb fluoro, 18\u201324 in', null, {wide:true});
    g('Float', high ? 'Large balsa, 4\u20136 g' : 'Small balsa or pencil, 1\u20133 g');
    g('Weights', high ? 'Shot pattern to hold depth' : 'Light shot, strung out');
    g('Hook', _bigFish ? '#8\u201312 single octopus' : '#12\u201316 single', 'Barbless where required');
    g('Also bring', 'Split shot, bait needles, pliers', null, {secondary:true});

  // ── SPIN ───────────────────────────────────────────────────────────────
  } else {
    kitName = 'Spinning setup';
    kitNote = high ? 'Water is up, so go heavier to keep the lure down.' : null;
    g('Rod', isSalmon ? '8\u20139 ft medium-heavy spinning' : '6\u20137 ft medium-light spinning',
      isSalmon ? 'Backbone to move big fish in current' : 'Sensitive tip for subtle takes', {wide:true});
    g('Reel', '2500\u20133000 spinning', 'Smooth drag');
    g('Main line', '8\u201312 lb mono or braid', 'Braid for feel, mono for forgiveness');
    g('Leader', '8\u201312 lb fluoro, 24 in', null, {wide:true});
    g('Lure weight', high ? '1/4\u20131/2 oz' : '1/8\u20131/4 oz');
    g('Also bring', 'Split rings, ball bearing swivels', null, {secondary:true});
  }

  // ── RENDER ─────────────────────────────────────────────────────────────
  var grid = document.getElementById(gridId || 'gear-grid');
  if (!grid) return;
  var core = gear.filter(function(x){ return !x.secondary; });
  var extras = gear.filter(function(x){ return x.secondary; });

  var _lbl = document.getElementById(labelId || 'tg-gear-lbl');
  if (_lbl) _lbl.textContent = kitName;

  grid.innerHTML = core.map(function(item) {
    return '<div class="gear-item' + (item.wide ? ' wide' : '') + '">' +
      '<div class="gear-item-lbl">' + item.label + '</div>' +
      '<div class="gear-item-val">' + item.val + '</div>' +
      (item.note ? '<div class="gear-item-note">' + item.note + '</div>' : '') +
    '</div>';
  }).join('');

  var noteEl = document.getElementById('tg-gear-note');
  if (noteEl) {
    if (kitNote) { noteEl.textContent = kitNote; noteEl.style.display = 'block'; }
    else noteEl.style.display = 'none';
  }
  var secEl = document.getElementById('tg-gear-sec');
  if (secEl) {
    if (extras.length) {
      secEl.innerHTML = '<b>Also bring</b> \u00b7 ' + extras.map(function(e){ return e.val; }).join(' \u00b7 ');
      secEl.style.display = 'block';
    } else secEl.style.display = 'none';
  }
}

// ── ACCORDION TOGGLE ──────────────────────────────────────────────────────────
function toggleTG(id) {
  var item  = document.getElementById(id);
  var body  = document.getElementById(id + '-body');
  var chev  = document.getElementById(id + '-chev');
  if (!item || !body) return;
  var isOpen = item.classList.contains('tg-open');
  // Collapse all + update aria-expanded
  ['tg-primary'].forEach(function(k) {
    var it = document.getElementById(k);
    var bd = document.getElementById(k + '-body');
    var ch = document.getElementById(k + '-chev');
    var hdr = it ? it.querySelector('.tg-header') : null;
    if (it) it.classList.remove('tg-open');
    if (bd) bd.classList.add('tg-body-collapsed');
    if (ch) ch.textContent = '▸';
    if (hdr) hdr.setAttribute('aria-expanded', 'false');
  });
  // Open the clicked one (unless it was already open)
  if (!isOpen) {
    item.classList.add('tg-open');
    body.classList.remove('tg-body-collapsed');
    if (chev) chev.textContent = '▾';
    var hdr2 = item.querySelector('.tg-header');
    if (hdr2) hdr2.setAttribute('aria-expanded', 'true');
  }
}

// ── BAIT TAB MAPPING ─────────────────────────────────────────────────────────
// Returns the best bait tab for a given method name
// Actionable advice per bait. bestFor/how replace the old single prose blob so the
// UI can lead with what to DO rather than what the lure IS. `when` is the short
// label shown on alternate rows.
var BAIT_ADVICE = {
  'Hare\'s Ear Nymph': {spec:'#12–16 · Natural / Gold bead', bestFor:'Anywhere, any time. The confidence fly', how:'Dead drift through runs and along seams', when:'Always'},
  'Frenchie': {spec:'#14–18 · Copper wire rib', bestFor:'Clear water and selective fish', how:'Fish it as your point fly on a two-nymph rig', when:'Clear water'},
  'Perdigon': {spec:'#12–16 · Olive / Brown', bestFor:'Getting down fast in short pockets', how:'Heavy bead reaches bottom before the drift ends', when:'High flow'},
  'Stonefly Nymph': {spec:'#8–12 · Black / Brown, heavy', bestFor:'Big fish looking for a big meal', how:'Bounce it along the bottom in fast runs', when:'Fast runs'},
  'Zebra Midge': {spec:'#18–22 · Black/silver or red/silver', bestFor:'Low clear water when nothing else works', how:'Drop it 18 in below a larger nymph', when:'Low & clear'},
  'Woolly Bugger': {spec:'#4–8 · Olive, Black, Brown', bestFor:'A first choice almost anywhere', how:'Cast across, swing down, strip back in short pulls', when:'Always'},
  'Zonker': {spec:'#4–8 · Chartreuse/White or Olive/White', bestFor:'Elevated or stained water', how:'Strip fast enough to make the rabbit strip pulse', when:'Stained water'},
  'Clouser Minnow': {spec:'#2–6 · Pink/White, Chartreuse/White', bestFor:'Steelhead and browns holding deep', how:'Strip and pause through pools. The dumbbell eyes make it jig', when:'Deep pools'},
  'Elk Hair Caddis': {spec:'#14–16 · Tan / Olive', bestFor:'Evening rises, May to September', how:'Drift drag-free, then twitch it once at the end', when:'Evening'},
  'Sulphur Comparadun': {spec:'#14–16 · Yellow / Orange', bestFor:'The evening sulphur hatch, May to July', how:'Low-riding profile. Fish it in the film', when:'May–July'},
  'Royal Wulff': {spec:'#12–14 · Classic attractor', bestFor:'Broken water, or as a dry-dropper indicator', how:'High-floating. Hang a nymph 18–24 in below', when:'Broken water'},
  'Blue Winged Olive': {spec:'#16–20 · Olive / Grey', bestFor:'Overcast afternoons in spring and September', how:'Match the dun hatch. Dead drift, fine tippet', when:'Overcast'},
  'Rapala Original Floating': {spec:'4–7 cm · Firetiger, Perch, Rainbow', bestFor:'River browns holding near cover', how:'Cast upstream, retrieve just faster than the current', when:'Near cover'},
  'Blue Fox Vibrax Spinner': {spec:'#3–5 · Silver / Gold blade', bestFor:'Covering water to find active fish', how:'Silver in clear, gold in stained. Slow it down in cold', when:'Finding fish'},
  'Kastmaster Spoon': {spec:'1/4–3/8 oz · Silver, Gold', bestFor:'Getting deep fast in pools and seams', how:'Cast across, count it down, retrieve steady', when:'Deep water'},
  'Mepps Aglia Spinner': {spec:'#3–4 · Black/Yellow, Natural', bestFor:'Working seams in any flow', how:'Steady retrieve, keeping the blade just turning', when:'Any flow'},
  'Roe Bag': {spec:'Small mesh sacs · Natural or cured', bestFor:'Fresh fish holding in pools', how:'Cast upstream, hold the float back so the bait leads', when:'Top pick'},
  'Soft Bead': {spec:'10–12 mm · Pink, Peach, Natural', bestFor:'Steelhead and salmon in coloured water', how:'Peg 1–2 in above the hook. Pink when coloured', when:'Coloured water'},
  'Hard Bead': {spec:'8–12 mm · Nuke Egg colours', bestFor:'Clear water and pressured fish', how:'Peg 1–2 in above the hook. Chartreuse and orange lead', when:'Clear water'},
  'Plastic Worm': {spec:'3–4 inch · Red, Pink, Chartreuse', bestFor:'Stained water after rain', how:'Thread on the hook and drift it naturally', when:'After rain'},
  'Nightcrawler': {spec:'Full or half · Natural', bestFor:'Spring, and after rain when naturals wash in', how:'Drift naturally with just enough shot to hold', when:'Spring / rain'},
  'Little Cleo Spoon': {spec:'½–¾ oz · Orange/White, Gold/Red', bestFor:'Harbour mouths and pier ends', how:'Cast across the current and retrieve slowly, letting it flutter on the drop', when:'Top pick'},
  'Rapala Jointed Minnow': {spec:'J11 · Firetiger, Silver', bestFor:'Working parallel to a pier or shoreline', how:'Twitch and pause it. Salmon key on the action at low speed', when:'Low speed'},
  'Blue Fox Vibrax': {spec:'#5 · Silver/Chartreuse, Gold', bestFor:'Overcast conditions and dawn', how:'Slow to medium retrieve just under the surface', when:'Dawn / overcast'},
  'Mepps Aglia': {spec:'#4–5 · Silver, Gold', bestFor:'Calmer harbour water and finicky fish', how:'Slower blade rotation triggers less aggressive fish', when:'Calm water'},
};

// Render pillar 3 from the hidden bait source panels + BAIT_ADVICE.
// Replaces the old tab/panel cloning: one ranked pick with BEST FOR / HOW, the rest as
// one-line rows. Handles 1 bait, 5 baits, missing photos and missing advice without
// leaving empty cards or "N/A".
function renderBaitPillar(topMethod) {
  var card  = document.getElementById('tg-bait-card');
  var alts  = document.getElementById('tg-bait-alts');
  var foot  = document.getElementById('tg-bait-foot');
  var lblEl = document.getElementById('tg-bait-lbl');
  var pill  = document.getElementById('pillar-bait');
  if (!card || !alts) return;

  // While fish are staging, the salmon-lures panel is authoritative regardless of how the
  // technique headline happens to be worded. The 50 ms re-render reads the live headline
  // "Throwing spoons at the river mouth", which matches the generic /spoon/ lure rule and
  // was quietly swapping harbour spoons for river-brown crankbaits.
  var tab = _stagingModeActive ? 'salmon-lures' : methodToBaitTab(topMethod);
  // Artificial-only water: the float panel is roe, beads and worms — all illegal here.
  var _cfgAO = (typeof getRiverConfig === 'function') ? getRiverConfig(selectedRiver) : null;
  if (_cfgAO && _cfgAO.artificialOnly && tab === 'float') tab = 'nymphs';
  var src = document.getElementById('p-' + tab);
  var items = src ? Array.prototype.slice.call(src.querySelectorAll('.bi')) : [];

  // Terminology follows the technique — never call a fly "bait".
  var lblMap = { nymphs:'Flies', dries:'Flies', streamers:'Flies',
                 lures:'Lures', 'salmon-lures':'Lures', float:'Bait' };
  if (lblEl) lblEl.textContent = lblMap[tab] || 'Bait';

  if (!items.length) {
    if (pill) pill.style.display = 'none';
    return;
  }
  if (pill) pill.style.display = '';

  function read(el) {
    var name = (el.querySelector('.bname')||{}).textContent || '';
    var adv  = BAIT_ADVICE[name] || {};
    return {
      name: name,
      spec: adv.spec || ((el.querySelector('.bdet')||{}).textContent || ''),
      bestFor: adv.bestFor || null,
      how: adv.how || null,
      when: adv.when || null,
      // Fall back to the original prose if this bait has no structured advice yet
      blurb: (el.querySelector('.bcond')||{}).textContent || '',
      key: el.getAttribute('data-bait-name') || name
    };
  }
  var list = items.map(read);
  var top = list[0], rest = list.slice(1);

  function imgHtml(b) {
    var url = (typeof BAIT_IMAGES !== 'undefined' && BAIT_IMAGES[b.key])
           || (typeof baitImageCache !== 'undefined' && baitImageCache[b.key]) || null;
    if (url) return '<div class="p-bimg"><img src="' + url + '" alt="' + b.name + '" loading="lazy"></div>';
    return '<div class="p-bimg"><svg viewBox="0 0 24 14" fill="none" stroke="currentColor" ' +
      'stroke-width="1.2" stroke-linecap="round"><path d="M18 7C16 3 12 2 8 3 5 4 2 6 2 7c0 1 3 3 6 4 4 1 8 0 10-4Z"/>' +
      '<path d="m18 7 3-2-1 2 1 2Z"/></svg></div>';
  }

  var rows = '';
  if (top.bestFor) rows += '<div><dt>Best for</dt><dd>' + top.bestFor + '</dd></div>';
  if (top.how)     rows += '<div><dt>How</dt><dd>' + top.how + '</dd></div>';
  if (!rows && top.blurb) rows = '<div><dt>Note</dt><dd>' + top.blurb + '</dd></div>';

  card.innerHTML =
    '<div class="p-bait-top">' + imgHtml(top) +
      '<div style="flex:1;min-width:0">' +
        '<span class="p-badge">\u2605 Start here</span>' +
        '<h5>' + top.name + '</h5>' +
        (top.spec ? '<div class="p-bspec">' + top.spec + '</div>' : '') +
      '</div></div>' +
    (rows ? '<dl class="p-how">' + rows + '</dl>' : '');

  // Alternates: show two, collapse the remainder.
  var SHOWN = 2;
  // Alternates expand to the same depth as the top pick — photo, BEST FOR, HOW. They
  // open independently rather than closing each other: comparing two lures side by side
  // is a real thing to do at the water, and force-closing the one just read is annoying.
  var _altSeq = 0;
  function altRow(b) {
    var id = 'alt-' + (_altSeq++);
    var rows = '';
    if (b.bestFor) rows += '<dt>Best for</dt><dd>' + b.bestFor + '</dd>';
    if (b.how)     rows += '<dt>How</dt><dd>' + b.how + '</dd>';
    if (!rows && b.blurb) rows = '<dt>Note</dt><dd>' + b.blurb + '</dd>';
    return '<div class="p-altwrap">' +
      '<button class="p-alt" type="button" data-alt="' + id + '" aria-expanded="false" aria-controls="' + id + '">' +
        '<span><span class="p-alt-name">' + b.name + '</span>' +
        (b.spec ? '<span class="p-alt-sub">' + b.spec + '</span>' : '') + '</span>' +
        '<span class="p-alt-right">' +
          (b.when ? '<span class="p-alt-when">' + b.when + '</span>' : '') +
          '<span class="p-alt-chev">\u25be</span>' +
        '</span>' +
      '</button>' +
      '<div class="p-altbody" id="' + id + '">' +
        '<div class="p-bait-top">' + imgHtml(b) +
          '<div style="flex:1;min-width:0">' +
            (b.spec ? '<div class="p-bspec" style="margin-top:0">' + b.spec + '</div>' : '') +
          '</div></div>' +
        (rows ? '<dl class="p-how" style="border-top:0;padding-top:.55rem;margin-top:.4rem">' + rows + '</dl>' : '') +
      '</div></div>';
  }
  function wireAlts(scope) {
    (scope || document).querySelectorAll('.p-alt[data-alt]').forEach(function(btn){
      if (btn._wired) return; btn._wired = true;
      btn.addEventListener('click', function(){
        var body = document.getElementById(btn.getAttribute('data-alt'));
        if (!body) return;
        var open = body.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.classList.toggle('is-open', open);
      });
    });
  }
  if (!rest.length) {
    alts.innerHTML = '<p class="p-empty" style="padding-top:.6rem">No other options ranked for these conditions.</p>';
  } else {
    var visible = rest.slice(0, SHOWN), hidden = rest.slice(SHOWN);
    alts.innerHTML = visible.map(altRow).join('') +
      (hidden.length
        ? '<div id="tg-bait-hidden" style="display:none">' + hidden.map(altRow).join('') + '</div>' +
          '<button class="p-more" type="button" id="tg-bait-more">' + hidden.length + ' more \u2193</button>'
        : '');
    var moreBtn = document.getElementById('tg-bait-more');
    if (moreBtn) moreBtn.addEventListener('click', function() {
      var h = document.getElementById('tg-bait-hidden');
      if (!h) return;
      var open = h.style.display !== 'none';
      h.style.display = open ? 'none' : 'block';
      moreBtn.textContent = open ? (hidden.length + ' more \u2193') : 'Show fewer \u2191';
    });
    wireAlts(alts);
  }

  // Panel-level footnote (bait regs, harbour closures) carries over if present.
  var srcFoot = src ? src.querySelector('.bfooter') : null;
  if (foot) {
    if (srcFoot) { foot.textContent = srcFoot.textContent; foot.style.display = 'block'; }
    else foot.style.display = 'none';
  }
}

function methodToBaitTab(methodName) {
  var m = (methodName || '').toLowerCase();
  if (/dry fly|dry-fly|caddis|comparadun|parachute|wulff/i.test(m)) return 'dries';
  if (/streamer|sculpin|woolly|zonker|clouser|articulated|minnow/i.test(m)) return 'streamers';
  // 'subsurface' used to live in this rule and routed "Crankbaits · Subsurface" to nymphs.
  if (/nymph|midge|hatch|euro|tight.?line/i.test(m)) return 'nymphs';
  if (/harbour|pier|staging|cleo|river mouth/i.test(m)) return 'salmon-lures';
  // Lures MUST be tested before float: "crankbait" contains the substring "bait", so the
  // float rule below would otherwise claim every crankbait method for roe and beads.
  if (/spinner|spoon|lure|jig|crankbait|plug|kastmaster|rapala|mepps/i.test(m)) return 'lures';
  // 'bottom bounc' added — it previously matched nothing and fell through to lures.
  if (/float|bait|roe|bead|centrepin|drift|stationary|bottom bounc/i.test(m)) return 'float';
  if (/fly/i.test(m)) return 'nymphs';
  return 'lures';
}


function toggleRranker() {
  var inner = document.getElementById('rrank-inner');
  var btn   = document.getElementById('rrank-toggle-btn');
  var chev  = btn ? btn.querySelector('.rrank-toggle-chev') : null;
  if (!inner) return;
  var open = inner.style.display !== 'none';
  inner.style.display = open ? 'none' : 'block';
  if (btn)  btn.setAttribute('aria-expanded', String(!open));
  if (chev) chev.innerHTML = open ? '&#9656;' : '&#9662;';
}

function toggleAcard(summaryEl) {
  var card   = summaryEl.closest('.ac-collapsed');
  var detail = card ? card.querySelector('.ac-detail') : null;
  var chev   = summaryEl.querySelector('.ac-chevron');
  if (!detail) return;
  var open = detail.style.display !== 'none';
  detail.style.display = open ? 'none' : 'block';
  if (chev) chev.textContent = open ? '\u25b8' : '\u25be';
  card.classList.toggle('ac-open', !open);
  // Update map pin to this spot when expanding
  if (!open) {
    var spotIdx = card ? parseInt(card.getAttribute('data-spot-idx')) : -1;
    if (!isNaN(spotIdx) && spotIdx >= 0) updateMapPin(spotIdx);
  }
}

// ── STOCKING SECTION ──────────────────────────────────────────────────────────
function renderStockingSection(riverName) {
  var sec  = document.getElementById('stocking-section');
  var grid = document.getElementById('stocking-grid');
  if (!sec || !grid) return;

  var name = riverName ? riverName.split(',')[0].trim() : '';
  var records = RIVER_STOCKING[name];
  if (!records) {
    var key = Object.keys(RIVER_STOCKING).find(function(k) {
      return name.indexOf(k) !== -1 || k.indexOf(name.split(' ')[0]) !== -1;
    });
    if (key) records = RIVER_STOCKING[key];
  }
  if (!records || !records.length) { sec.style.display = 'none'; return; }

  var html = records.map(function(r) {
    var icon, badgeCls, statusTxt;
    if (r.status === 'now') {
      icon = '\u2714'; badgeCls = 'now'; statusTxt = r.label;
    } else if (r.status === 'next') {
      icon = '\u2192'; badgeCls = 'soon'; statusTxt = r.label;
    } else if (r.status === 'future') {
      icon = '\u23f3'; badgeCls = 'future'; statusTxt = r.label;
    } else {
      icon = '\u007e'; badgeCls = 'past'; statusTxt = r.label;
    }
    return '<div class="stocking-row' + (r.status === 'now' ? ' stocking-active' : '') + '">' +
      '<div>' +
        '<div class="stocking-species">' + r.species + '</div>' +
        '<div class="stocking-detail">' + r.qtyStr + ' ' + r.stage.toLowerCase() +
          ' stocked ' + r.year + '</div>' +
      '</div>' +
      '<span class="stocking-badge ' + badgeCls + '">' + icon + '\u00a0' + statusTxt + '</span>' +
    '</div>';
  }).join('');

  html += '<div class="stocking-source">Source: OMNRF FishONLine \u00b7 Updated annually</div>';
  grid.innerHTML = html;
  sec.style.display = 'block';
}

// ── CONFIDENCE SCORE ──────────────────────────────────────────────────────────


// Fetch weather for a lat/lng and return {tempC, cloudPct}
async function fetchLandingWeather(lat, lng) {
  try {
    var url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + lat + '&longitude=' + lng
      + '&hourly=temperature_2m,cloudcover'
      + '&forecast_days=1&timezone=America%2FToronto';
    var res = await fetch(url);
    if (!res.ok) return null;
    var data = await res.json();
    var hour = new Date().getHours();
    var tempC    = data.hourly && data.hourly.temperature_2m   ? data.hourly.temperature_2m[hour]   : null;
    var cloudPct = data.hourly && data.hourly.cloudcover       ? data.hourly.cloudcover[hour]       : null;
    return { tempC: tempC, cloudPct: cloudPct };
  } catch(e) { return null; }
}

// ── SPECIES GRID — season chips, best first (TJ, 2026-10-30) ─────────────────
// Every tile gets a word chip top right (Prime, Good, Slow, In lake, Closed) from TJ's half-month calendar
// (FORM_SEASON_CAL) on reaches in range that are legally open on the trip date, and tiles are ordered best
// first. Closed tiles stay tappable so the results page can say why. formSpeciesStatus() in the core decides.
var SP_TILE_NAME = { brown:'Brown Trout', rainbow:'Rainbow Trout', steelhead:'Steelhead', brook:'Brook Trout', chinook:'Chinook Salmon', coho:'Coho Salmon' };
var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formTripDate() {
  var v = (document.getElementById('trip-date') || {}).value;
  if (v) return v;
  var n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
}

// Sections the form is choosing from: everything within the travel range of the picked city, or
// every active section before a city is picked.
function formSectionsInRange() {
  var val = (document.getElementById('loc-input-field') || {}).value;
  var loc = val ? resolveLocation(val) : null;
  if (loc) {
    var max = parseInt((document.getElementById('travel-range') || { value: '60' }).value, 10) || 60;
    return getRivers(loc, appMode === 'expert' ? 180 : max, Infinity).map(function(r){ return r.name; });
  }
  return Object.keys(RIVER_CONFIG).filter(function(k){ return k !== 'default' && RIVER_CONFIG[k].active !== false; });
}

function longDate(iso) {
  var p = iso.split('-');
  return MONTH_NAMES[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10);
}

// One chip per tile (TJ picked word chips, 2026-10-30), tiles ordered best first. 'out' = legal but the fish
// are out in the lake (TJ's 'done');
// 'closed' = no reach in range open for it that day, or none in range at all.
var SP_STATE_RANK = { prime: 4, good: 3, slow: 2, out: 1, closed: 0 };
var SP_STATE_WORD = { prime: 'Prime', good: 'Good', slow: 'Slow', out: 'In lake', closed: 'Closed' };
function speciesTileState(st) {
  if (!st.open) return 'closed';
  return st.status === 'done' ? 'out' : st.status;
}

function updateSpeciesGrid() {
  var grid = document.querySelector('.species-btn-grid');
  if (!grid) return;
  var dateStr = formTripDate();
  var sections = formSectionsInRange();
  var btns = Array.from(grid.querySelectorAll('.species-btn'));
  btns.forEach(function(btn, idx) {
    var k = btn.getAttribute('data-value');
    if (!SP_TILE_NAME[k]) return;
    var st = formSpeciesStatus(SP_TILE_NAME[k], sections, dateStr);
    var state = speciesTileState(st);
    if (btn._spIdx == null) btn._spIdx = idx;
    btn._spRank = SP_STATE_RANK[state];
    var badge = btn.querySelector('.sp-badge');
    if (!badge) { badge = document.createElement('span'); badge.className = 'sp-badge'; badge.setAttribute('aria-hidden', 'true'); btn.appendChild(badge); }
    badge.setAttribute('data-s', state);
    badge.textContent = SP_STATE_WORD[state];
    var sr = btn.querySelector('.sp-sr');
    if (!sr) { sr = document.createElement('span'); sr.className = 'sr-only sp-sr'; btn.appendChild(sr); }
    sr.textContent = ', ' + SP_STATE_WORD[state] + (st.reopens ? ', opens ' + longDate(st.reopens) : '');
  });
  // Best first, left to right; ties keep the usual order.
  btns.filter(function(b){ return b._spRank != null; })
    .sort(function(a, b){ return (b._spRank - a._spRank) || (a._spIdx - b._spIdx); })
    .forEach(function(b){ grid.appendChild(b); });
}

['trip-date', 'loc-input-field', 'travel-range'].forEach(function(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', function(){ try { updateSpeciesGrid(); } catch (e) { console.error('updateSpeciesGrid', e); } });
  if (id === 'travel-range') el.addEventListener('input', function(){ try { updateSpeciesGrid(); } catch (e) {} });
});


function rrankBadge(score) {
  var c = scoreToConfidence(score);
  return '<span class="rrank-badge conf-badge ' + c.cls + '">' + c.label + '</span>';
}

// ── DEFAULT RIVER PREVIEW (landing page, no city selected) ───────────────────
function renderDefaultPreview() {
  var el = document.getElementById('default-preview');
  if (!el) return;

  var cards = DEFAULT_RIVERS.map(function(river) {
    var name = river.name;
    var dbEntry = RIVERS_DB.find(function(r){ return r.name === name; });
    var cfg = getRiverConfig(name);
    if (!cfg || !dbEntry) return '';

    // Quick season quality estimate (no flow data on landing)
    var bestQ = 'absent', bestSp = '';
    (cfg.species || []).forEach(function(s) {
      var w = getCurrentSeason(s);
      if (!w) return;
      if (w.quality === 'peak' && bestQ !== 'peak')       { bestQ = 'peak';   bestSp = s; }
      else if (w.quality === 'good' && bestQ === 'absent'){ bestQ = 'good';   bestSp = s; }
      else if (w.quality === 'slow' && bestQ === 'absent'){ bestQ = 'slow';   bestSp = s; }
    });

    var score = bestQ === 'peak' ? 10 : bestQ === 'good' ? 6 : bestQ === 'slow' ? 2 : 0;
    var conf  = scoreToConfidence(score);
    var drive = (dbEntry.times && dbEntry.times['toronto']) || (cfg && cfg.driveTime && cfg.driveTime['toronto']) || 60;
    var driveStr = drive < 60 ? drive + ' min' : (drive === 60 ? '1 hr' : Math.floor(drive/60) + ' hr ' + (drive%60||''));
    var speciesLabel = bestSp ? bestSp.replace(' Trout','').replace(' Salmon','') : (cfg.species||[])[0]||'';

    var shortName = name.replace(' River','').replace(' Creek','');
    var speciesShort = speciesLabel ? speciesLabel.replace(' Trout','').replace(' Salmon','') : '';
    // Species key for goToResults (e.g. 'rainbow', 'brown', 'chinook')
    var speciesKeyMap = {'Brown Trout':'brown','Rainbow Trout':'rainbow','Brook Trout':'brook','Chinook Salmon':'chinook','Coho Salmon':'coho'};
    var speciesKey = bestSp ? (speciesKeyMap[bestSp] || '') : '';
    return '<div class="dp-card" data-river="' + name + '" data-gauge="' + river.gauge + '"'+'data-species="' + speciesKey + '" data-sweet-min="' + river.sweetMin + '" data-sweet-max="' + river.sweetMax + '">' +
      '<div class="dp-name">' + shortName + '</div>' +
      '<div class="dp-row2">' +
        (speciesShort ? '<span class="dp-species">' + speciesShort + '</span>' : '') +
        '<span class="dp-conf ' + conf.cls + '" id="dp-conf-' + name.replace(/ /g,'-') + '">' + conf.label + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  el.innerHTML = '<div class="dp-label" id="dp-label-el">Fishability · Today near Toronto</div>' + '<div class="dp-grid">' + cards + '</div>';
  el.style.display = 'block';

  // Wire card clicks — go directly to that river's results page
  el.querySelectorAll('.dp-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var rname   = this.getAttribute('data-river');
      var spKey   = this.getAttribute('data-species') || '';
      var cityMap = {
        'Credit River':'mississauga','Grand River':'guelph','Humber River':'toronto',
        'Bronte Creek':'oakville','Duffins Creek':'ajax','Ganaraska River':'port hope'
      };
      var city = cityMap[rname] || 'toronto';

      // Set all state directly and jump to results — no form submission needed
      var dbEntry = RIVERS_DB.find(function(r){ return r.name === rname; });
      if (!dbEntry) return;

      // Set global state — get loc from RIVER_CONFIG, not RIVERS_DB (which has no .loc)
      var _cfgEntry = getRiverConfig(rname);
      var _loc = (_cfgEntry && _cfgEntry.loc) ? _cfgEntry.loc : '';
      selectedRiver = rname + (_loc ? ', ' + _loc : '');
      selectedTechFamily = [];
      selectedSpecies = spKey ? [spKey] : [];
      appMode = 'beginner';  // keep beginner mode so section order stays correct
      window._beginnerLocKey = city;

      // Set date to today
      var dateInp = document.getElementById('trip-date');
      if (dateInp) dateInp.value = (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})();

      // Update species buttons UI
      document.querySelectorAll('.species-btn').forEach(function(b){ b.classList.remove('active'); });
      if (spKey) {
        var spBtn = document.querySelector('.species-btn[data-value="' + spKey + '"]');
        if (spBtn) spBtn.classList.add('active');
      }

      // Show results page directly
      setResHeader(selectedRiver);
      document.getElementById('landing').style.display = 'none';
      document.getElementById('results').style.display = ''; document.getElementById('results').classList.add('active');
      window.scrollTo(0, 0);
      initNotifyBar();
      window._viewSource = 'home-list';
      renderResults();
      setTimeout(loadBaitImages, 800);
    });
  });

  // Update label with source note
  var lbl = document.getElementById('dp-label-el') || el.querySelector('.dp-label');
  if (lbl) lbl.innerHTML = 'FISHABILITY · TODAY NEAR TORONTO <span class="dp-source">· Live flow loading…</span>';

  // Fetch live conditions for each river in parallel
  var _baseScores = {};
  DEFAULT_RIVERS.forEach(function(river) { _baseScores[river.name] = 0; });

  // Get weather once for Toronto area (shared)
  fetchLandingWeather(43.7, -79.4).then(function(wx) {
    var tempC = wx ? wx.tempC : null;
    var cloudPct = wx ? wx.cloudPct : null;

    // Fetch flow for each river
    var fetches = DEFAULT_RIVERS.map(function(river) {
      return fetchFlow(river.gauge).then(function(fd) {
        var flow = fd ? fd.flow : null;
        var cfg  = getRiverConfig(river.name);
        var flowLow  = cfg ? cfg.flowLow  : river.sweetMin * 0.3;
        var flowHigh = cfg ? cfg.flowHigh : river.sweetMax * 2;

        // Recalculate base score from season
        var dbEntry = RIVERS_DB.find(function(r){ return r.name === river.name; });
        var drive = dbEntry && dbEntry.times ? (dbEntry.times['toronto'] || 60) : 60;
        var tempRivers = [{ name: river.name, driveTime: drive, times: dbEntry ? dbEntry.times : {} }];
        var ranked = rankRivers(tempRivers, [], (function(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})());
        var baseScore = ranked.length ? ranked[0].score : 4;

        // Add live conditions
        var liveBonus = liveConditionsScore(flow, river.sweetMin, river.sweetMax, flowLow, flowHigh, tempC, cloudPct);
        // Same flow cap as the results pill (flowCapScore in conditions-core.js)
        var totalScore = flowCapScore(baseScore + liveBonus, getRiverConfig(river.name) || {sweetMin: river.sweetMin, sweetMax: river.sweetMax, flowLow: flowLow, flowHigh: flowHigh}, flow);
        var conf = scoreToConfidence(totalScore);

        // Update badge in place
        var badgeEl = document.getElementById('dp-conf-' + river.name.replace(/ /g, '-'));
        if (badgeEl) {
          badgeEl.textContent = conf.label;
          badgeEl.className = 'dp-conf ' + conf.cls;
        }
        // Update card data attrs for tooltip
        var card = el.querySelector('[data-river="' + river.name + '"]');
        if (card && flow != null) {
          card.setAttribute('data-flow', flow);
        }
        return { name: river.name, flow: flow, score: totalScore };
      }).catch(function() { return { name: river.name, flow: null }; });
    });

    Promise.all(fetches).then(function(results) {
      var gotFlow = results.some(function(r){ return r.flow != null; });
      if (lbl) lbl.innerHTML = 'Fishability · Today near Toronto'
        + ' <span class="dp-source">'+(gotFlow?'· Live flow · Default gauge':'· Seasonal estimate')+'</span>';
    });
  });
}

// Render default preview after all JS is parsed

// Handle browser back button on river page
window.addEventListener('popstate', function(e) {
  if (!e.state || e.state.page === 'landing') {
    // Browser went back to dashboard
    document.getElementById('results').style.display = ''; document.getElementById('results').classList.remove('active');
    document.getElementById('landing').style.display = 'block';
    window.scrollTo(0, 0);
  }
});
// Set initial history state for the landing page
if (!history.state) {
  history.replaceState({ page: 'landing' }, '', window.location.pathname);
}

// Guard each init call independently. These run as a bare sequence at module scope, so a
// throw in any one of them silently kills every call after it — which is how the guides
// list came up empty while the heading above it still rendered. Same failure mode as the
// blank access grid. Each failure now names itself in the console instead of hiding.
[['renderDefaultPreview', renderDefaultPreview],
 ['renderGuides', renderGuides],
 ['updateSpeciesGrid', updateSpeciesGrid]].forEach(function(step){
  try { step[1](); }
  catch (e) { console.error('init step failed: ' + step[0], e); }
});

// ── NOTIFY BAR — river page ───────────────────────────────────────────────────
// One ask per page (TJ, 2026-10-17). The bar offers whichever fits what the angler is doing:
//   trip    a future trip date on water that is open that day: email the conditions that morning
//   run     a river with salmon or steelhead: run alerts for that river
//   outlook anything else: the monthly outlook
// The Worker (worker/worker.js handleSubscribe) stores the interest and sends the welcome email.
function riverParentOf(section) {
  var base = String(section || '').split(',')[0].trim();
  var hit = Object.keys(RIVER_SECTIONS).filter(function(p){ return RIVER_SECTIONS[p].indexOf(base) !== -1; })[0];
  return hit || null;
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function notifyOffer() {
  var section = selectedRiver ? selectedRiver.split(',')[0].trim() : '';
  var parent = riverParentOf(section);
  var trip = getTripDateStr();
  var today = (function(){ var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0'); })();
  var days = Math.round((Date.parse(trip) - Date.parse(today)) / 864e5);
  var db = (typeof RIVERS_DB !== 'undefined') ? RIVERS_DB.filter(function(r){ return r.name === section; })[0] : null;
  var cfg = getRiverConfig(section);
  if (section && db && days >= 1 && days <= 16 && !sectionClosedOn(cfg, trip) && !lsGet('hff_sub_trip:' + trip + ':' + section)) {
    var nice = new Date(trip + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
    var spKey = methodSpeciesKey(section);
    return { kind: 'trip', key: 'hff_sub_trip:' + trip + ':' + section,
      title: 'Get these conditions the morning of ' + nice,
      sub: 'Flow and weather for ' + secShort(section) + ', emailed at 6 am',
      button: 'Email me',
      payload: { trip: { date: trip, section: section, species: spKey || '', gauge: db.gauge || '',
                 lat: db.lat, lng: db.lng, sweetMin: db.sweetMin, sweetMax: db.sweetMax } } };
  }
  // Weekly conditions email (TJ, 2026-10-20): needs a picked species that lives on this reach,
  // and a reach that is open on the trip date. On run rivers it rides along as a checkbox.
  var weekly = null;
  var _wKey = (typeof selectedSpecies !== 'undefined' && selectedSpecies && selectedSpecies.length) ? methodSpeciesKey(section) : '';
  var _wName = {brown:'Brown Trout',rainbow:'Rainbow Trout',brook:'Brook Trout',steelhead:'Steelhead',chinook:'Chinook Salmon',coho:'Coho Salmon'}[_wKey];
  if (section && _wName && cfg && cfg.species && cfg.species.indexOf(_wName) !== -1 && !sectionClosedOn(cfg, trip) &&
      !lsGet('hff_sub_weekly:' + section + ':' + _wName)) {
    weekly = { section: section, species: _wName, key: 'hff_sub_weekly:' + section + ':' + _wName };
  }
  if (parent && RUN_ALERT_RIVERS.indexOf(parent) !== -1 && !lsGet('hff_sub_run:' + parent)) {
    return { kind: 'run', key: 'hff_sub_run:' + parent,
      title: 'Get run alerts for the ' + parent,
      sub: 'An email when salmon or steelhead are running. Checked by an angler before it goes out.',
      button: 'Alert me', outlookBox: !weekly && !lsGet('hff_sub_outlook'), weeklyBox: weekly,
      payload: { river: parent } };
  }
  if (weekly && !(parent && RUN_ALERT_RIVERS.indexOf(parent) !== -1)) {
    return { kind: 'weekly', key: weekly.key,
      title: 'Get a heads-up when ' + weekly.species + ' conditions look good',
      sub: 'One email on Thursdays, only when the coming days look good on ' + secShort(section),
      button: 'Email me', payload: { weekly: { section: weekly.section, species: weekly.species } } };
  }
  if (!lsGet('hff_sub_outlook')) {
    return { kind: 'outlook', key: 'hff_sub_outlook',
      title: 'Get the monthly river outlook',
      sub: 'What the month ahead means for Ontario trout and salmon, plus openers and closures',
      button: 'Sign me up', payload: {} };
  }
  return null;
}

function initNotifyBar() {
  // Dismissing hides the bar for two weeks, not forever.
  var _dis = Number(lsGet('hff_bar_dismissed_at') || 0);
  if (_dis && Date.now() - _dis < 14 * 864e5) return;

  var bar     = document.getElementById('notify-bar');
  var submit  = document.getElementById('notify-bar-submit');
  var input   = document.getElementById('notify-bar-email');
  var form    = document.getElementById('notify-bar-form');
  var success = document.getElementById('notify-bar-success');
  var dismiss = document.getElementById('notify-bar-dismiss');
  if (!bar) return;

  var offer = notifyOffer();
  bar._offer = offer;
  if (!offer) { bar.classList.remove('visible'); bar.style.display = 'none'; return; }
  var tEl = document.getElementById('notify-bar-title');
  var sEl = document.getElementById('notify-bar-sub');
  if (tEl) tEl.textContent = offer.title;
  if (sEl) sEl.textContent = offer.sub;
  if (submit) { submit.textContent = offer.button; submit.disabled = false; }
  var box = document.getElementById('notify-bar-outlook');
  if (box) { box.style.display = offer.outlookBox ? '' : 'none'; var cb = box.querySelector('input'); if (cb) cb.checked = false; }
  var wbox = document.getElementById('notify-bar-weekly');
  if (wbox) {
    wbox.style.display = offer.weeklyBox ? '' : 'none';
    var wcb = wbox.querySelector('input'); if (wcb) wcb.checked = false;
    var wtx = wbox.querySelector('span');
    if (wtx && offer.weeklyBox) wtx.textContent = 'Also a Thursday email when the coming days look good for ' + offer.weeklyBox.species + ' here';
  }
  if (form) form.style.display = '';
  if (success) success.style.display = 'none';
  var _oldErr = document.getElementById('notify-bar-error'); if (_oldErr) _oldErr.textContent = '';

  // Show bar after user scrolls 300px
  bar.style.display = 'block';
  var shown = false;
  function onScroll() {
    if (!shown && window.scrollY > 300) {
      shown = true;
      bar.classList.add('visible');
      track('Notify Bar Shown', { river: (selectedRiver || '').split(',')[0] || 'unknown', offer: offer.kind });
      window.removeEventListener('scroll', onScroll);
    }
  }
  // One scroll listener at a time: this runs again each time a river is opened.
  if (bar._onScroll) window.removeEventListener('scroll', bar._onScroll);
  bar._onScroll = onScroll;
  window.addEventListener('scroll', onScroll);

  // Listeners below are bound once. initNotifyBar() runs every time a river is opened, and
  // binding again stacked handlers, so one tap on Subscribe sent one request per river viewed.
  if (bar._bound) return;
  bar._bound = true;

  // Keep the bar above the on-screen keyboard. Android Chrome and iOS Safari shrink only
  // the visual viewport when the keyboard opens, so a bottom:0 fixed bar ends up behind it.
  // Lift it by the gap between the layout viewport and the visible area.
  if (window.visualViewport) {
    var vv = window.visualViewport;
    var liftBar = function() {
      var gap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      bar.style.bottom = gap > 0 ? gap + 'px' : '';
      bar.classList.toggle('keyboard-up', gap > 0);
    };
    vv.addEventListener('resize', liftBar);
    vv.addEventListener('scroll', liftBar);
  }

  // Dismiss
  if (dismiss) {
    dismiss.addEventListener('click', function() {
      bar.classList.remove('visible');
      track('Notify Bar Dismissed', { river: (selectedRiver || '').split(',')[0] || 'unknown', offer: bar._offer ? bar._offer.kind : 'none' });
      lsSet('hff_bar_dismissed_at', String(Date.now()));
      setTimeout(function(){ bar.style.display = 'none'; }, 400);
    });
  }

  // Submit
  if (submit && input) {
    submit.addEventListener('click', function() {
      var offer = bar._offer;
      if (!offer) return;
      var email = input.value.trim();
      if (!email || !email.includes('@')) {
        input.style.borderColor = '#c0392b';
        input.focus();
        return;
      }
      input.style.borderColor = '';
      submit.disabled = true;
      submit.textContent = 'Saving…';
      var cb = document.querySelector('#notify-bar-outlook input');
      var wcb = document.querySelector('#notify-bar-weekly input');
      var body = Object.assign({ email: email, kind: offer.kind, source: 'river-bar',
                                 outlook: !!(offer.outlookBox && cb && cb.checked) }, offer.payload);
      if (offer.weeklyBox && wcb && wcb.checked) body.weekly = { section: offer.weeklyBox.section, species: offer.weeklyBox.species };

      fetch(PROXY_URL + '/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // Only a confirmed save counts. The bar used to show "you're on the list" and record
      // a signup whatever the Worker returned, so months of failed saves looked like signups.
      .then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(d){
          if (!r.ok || !d || d.ok !== true) throw new Error('subscribe ' + r.status);
          return d;
        });
      })
      .then(function() {
        lsSet(offer.key, '1');
        if (body.outlook) lsSet('hff_sub_outlook', '1');
        if (body.weekly) lsSet('hff_sub_weekly:' + body.weekly.section + ':' + body.weekly.species, '1');
        track('Email Signup', { river: (selectedRiver || '').split(',')[0] || 'unknown', offer: offer.kind + (body.weekly && offer.kind !== 'weekly' ? '+weekly' : ''),
                                species: (selectedSpecies || []).join(',') || 'any' });
        if (form)    form.style.display    = 'none';
        if (success) success.style.display = 'block';
        setTimeout(function() {
          bar.classList.remove('visible');
          setTimeout(function(){ bar.style.display = 'none'; }, 400);
        }, 2500);
      })
      .catch(function(err) {
        track('Email Signup Failed', { river: (selectedRiver || '').split(',')[0] || 'unknown', offer: offer.kind,
                                       reason: String(err && err.message || 'network').slice(0, 60) });
        submit.disabled = false;
        submit.textContent = 'Try again';
        var _err = document.getElementById('notify-bar-error');
        if (!_err && form) {
          _err = document.createElement('div');
          _err.id = 'notify-bar-error';
          _err.className = 'notify-bar-error';
          _err.setAttribute('role', 'alert');
          form.parentNode.insertBefore(_err, form.nextSibling);
        }
        if (_err) _err.textContent = 'Something went wrong and your email wasn’t saved. Please try again.';
      });
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submit.click();
    });
  }
}
// ── END NOTIFY BAR ────────────────────────────────────────────────────────────


// ── ADD TO HOME SCREEN (TJ, 2026-10-31) ──────────────────────────────────────
// The manifest opens the site full screen from a home-screen icon. Most phone users don't know the
// feature exists, so the homepage shows a one-time hint on phones from the second day someone visits:
// iPhone/iPad get the Share > Add to Home Screen steps; Android Chrome gets an Add button that opens
// its own install prompt. One tap on the x hides it for good. It never shows on results (the notify
// bar lives there), inside an in-app browser (Instagram, Facebook can't add to home screen), or
// once the site is already running from the home screen.
var _installEvt = null;
function isStandalone() {
  try { return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone); }
  catch (e) { return false; }
}
function a2hsPlatform() {
  var ua = navigator.userAgent || '';
  if (/FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp/i.test(ua)) return null;
  // iPadOS 13+ Safari reports itself as a Mac; a Mac with a touch screen is an iPad.
  var iOS = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
}
function a2hsDayCount() {
  var today = new Date().toISOString().slice(0, 10);
  var days = (lsGet('hff_visit_days') || '').split(',').filter(Boolean);
  if (days.indexOf(today) === -1) { days.push(today); lsSet('hff_visit_days', days.slice(-5).join(',')); }
  return days.length;
}
function hideInstallHint(reason) {
  var el = document.getElementById('a2hs');
  if (!el || el.hidden) return;
  el.hidden = true;
  if (reason === 'dismiss') { lsSet('hff_a2hs_done', '1'); track('Install Hint Dismissed', { platform: el.getAttribute('data-platform') }); }
}
function showInstallHint(platform) {
  if (document.getElementById('a2hs')) return;
  var res = document.getElementById('results');
  if (res && res.style.display !== 'none') return;
  var shareIcon = '<svg class="a2hs-share" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 1v11M4.5 4.5 8 1l3.5 3.5M5 8H2.5v10.5h11V8H11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var how = platform === 'ios'
    ? 'Tap ' + shareIcon + ' <b>Share</b>, then <b>Add to Home Screen</b>.'
    : (_installEvt ? 'Open it like an app, full screen, in one tap.' : 'Open your browser menu, then <b>Add to Home screen</b>.');
  var el = document.createElement('div');
  el.id = 'a2hs'; el.className = 'a2hs'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Add to home screen');
  el.setAttribute('data-platform', platform);
  el.innerHTML = '<img src="/icon-192.png?v=3" alt="" width="40" height="40">' +
    '<div class="a2hs-text"><strong>Add HereFishyFishy to your home screen</strong><span>' + how + '</span></div>' +
    (platform === 'android' && _installEvt ? '<button type="button" class="a2hs-add" id="a2hs-add">Add</button>' : '') +
    '<button type="button" class="a2hs-x" id="a2hs-x" aria-label="Close">×</button>';
  document.body.appendChild(el);
  lsSet('hff_a2hs_shown', String((parseInt(lsGet('hff_a2hs_shown') || '0', 10) || 0) + 1));
  track('Install Hint Shown', { platform: platform });
  document.getElementById('a2hs-x').addEventListener('click', function(){ hideInstallHint('dismiss'); });
  var add = document.getElementById('a2hs-add');
  if (add) add.addEventListener('click', function(){
    var evt = _installEvt; _installEvt = null;
    if (!evt) return;
    evt.prompt();
    evt.userChoice.then(function(c){
      track('Install Prompt Answered', { outcome: c && c.outcome });
      if (c && c.outcome === 'accepted') lsSet('hff_a2hs_done', '1');
      hideInstallHint();
    }).catch(function(){});
  });
}
function maybeInstallHint() {
  if (isStandalone()) return;
  var platform = a2hsPlatform();
  if (!platform) return;
  // ?a2hs=1 shows it now, for testing on a phone (skips the second-day and dismissed checks).
  if (/[?&]a2hs=1/.test(_initialSearch)) { setTimeout(function(){ showInstallHint(platform); }, platform === 'android' ? 2500 : 800); return; }
  if (lsGet('hff_a2hs_done')) return;
  if (/[?&](river|species)=/.test(_initialSearch)) return;   // deep links open straight into results
  if (a2hsDayCount() < 2) return;
  if ((parseInt(lsGet('hff_a2hs_shown') || '0', 10) || 0) >= 3) return;  // shown 3 times, no answer: stop asking
  if (platform === 'android') {
    // Chrome hands over its install prompt shortly after load; other Android browsers never do.
    setTimeout(function(){ showInstallHint('android'); }, 2500);
  } else {
    setTimeout(function(){ showInstallHint('ios'); }, 1500);
  }
}
window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); _installEvt = e; });
window.addEventListener('appinstalled', function(){ lsSet('hff_a2hs_done', '1'); hideInstallHint(); track('App Installed', {}); });
try {
  if (isStandalone()) {
    try { if (!sessionStorage.getItem('hff_hs_launch')) { sessionStorage.setItem('hff_hs_launch', '1'); track('Home Screen Launch', {}); } } catch (e) {}
  } else {
    maybeInstallHint();
  }
} catch (e) { console.error('install hint', e); }
