/* "Today" strip for the river pages (TJ, 2026-11-03, audit Phase 4).
   Finds the page's `.now` block, reads the reach and fish from its link into the app, and adds three tiles: Flow, Water
   and Conditions. Wording and rating come from conditions-core.js (flowRead, waterTempRead, rateReachToday,
   confidenceRead), the same functions the app uses, so a tile can't disagree with the app. Nothing is shown unless the
   readings are good: no gauge reading, no weather or a stale gauge leaves the page as it was. */
(function () {
  'use strict';
  var PROXY = 'https://streamcast-proxy.tnt-tarun.workers.dev';
  var now = document.querySelector('.now');
  if (!now || typeof getRiverConfig !== 'function' || typeof rateReachToday !== 'function') return;
  var link = now.querySelector('a[href*="river="]');
  if (!link) return;
  var q = new URL(link.getAttribute('href').replace(/&amp;/g, '&'), location.origin).searchParams;
  var section = q.get('river'), want = q.get('species');
  var cfg = section && getRiverConfig(section);
  if (!cfg || !cfg.gauge) return;

  var KEY = { chinook: 'Chinook Salmon', coho: 'Coho Salmon', steelhead: 'Steelhead', brown: 'Brown Trout', rainbow: 'Rainbow Trout' };
  function todayStr() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }
  var date = todayStr();

  // The fish: the page's own, unless steelhead (listed on the reach) is in better season today.
  var RANK = { peak: 3, good: 2, slow: 1, absent: 0 };
  function seasonRank(f) { var s = getCurrentSeason(f, date, section); return s ? (RANK[s.quality] || 0) : 0; }
  function pickFish() {
    var f = KEY[want] || 'Steelhead';
    if (f !== 'Steelhead' && cfg.species.indexOf('Steelhead') !== -1) {
      var cur = getCurrentSeason(f, date, section);
      // Better season, or the same grade while the page's fish is only in its tail ("Late Run").
      if (seasonRank('Steelhead') > seasonRank(f) || (seasonRank('Steelhead') === seasonRank(f) && cur && /late|tail/i.test(cur.label || ''))) return 'Steelhead';
    }
    return f;
  }

  function get(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function load() {
    var lat = cfg.lat, lng = cfg.lng;
    var live = typeof LIVE_WATER_STATIONS !== 'undefined' ? LIVE_WATER_STATIONS[section] : null;
    return Promise.all([
      get(PROXY + '/flow?station=' + cfg.gauge),
      get('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng +
        '&current=temperature_2m,cloudcover,winddirection_10m,windspeed_10m&timezone=America%2FToronto'),
      get('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng +
        '&daily=temperature_2m_mean&past_days=30&forecast_days=16&timezone=America%2FToronto'),
      live ? get(PROXY + '/water-temps') : Promise.resolve(null),
      get(PROXY + '/lake-temps')
    ]);
  }

  load().then(function (r) {
    var fl = r[0], wx = r[1] && r[1].current, hist = r[2] && r[2].daily, lw = r[3], lakes = r[4] && (r[4].temps || r[4]);
    if (!fl || fl.flow == null || isNaN(fl.flow) || !wx || wx.temperature_2m == null || wx.cloudcover == null) return;
    var at = typeof fl.at === 'string' ? Date.parse(fl.at) : NaN;
    if (isNaN(at) || Date.now() - at > 180 * 60000) return;                 // same 3 hour rule as the app's other-reach card
    if (typeof sectionClosedOn === 'function' && sectionClosedOn(cfg, date)) return;

    var fish = pickFish();
    // Water: a live reading where we have one (Credit), else the weather-memory model, as in the app.
    var info = null, liveVal = null;
    var station = typeof LIVE_WATER_STATIONS !== 'undefined' ? LIVE_WATER_STATIONS[section] : null;
    if (station && lw && lw.water && lw.updated && Date.now() - Date.parse(lw.updated) < 6 * 3600 * 1000) {
      var rd = lw.water[station.station];
      if (rd && rd.latest != null) liveVal = rd.latest;
    }
    if (liveVal != null) info = { value: liveVal, kind: 'measured', place: station.place };
    else {
      var m = waterTempFromHistory(section, hist ? { time: hist.time, mean: hist.temperature_2m_mean } : null, date, date, null);
      if (m != null) info = { value: m, kind: 'model', place: null };
    }
    if (!info) return;                                                       // no honest water read, show nothing

    var z = typeof stagingSectionFor === 'function' ? stagingSectionFor(section) : null;
    if (fish === 'Steelhead' && want !== 'steelhead') { link.setAttribute('href', link.getAttribute('href').replace(/species=[a-z]+/, 'species=steelhead')); }
    var rated = rateReachToday({ section: section, species: fish, date: date, flow: fl.flow, waterTemp: info.value,
      cloudPct: wx.cloudcover, windDir: wx.winddirection_10m, windSpd: wx.windspeed_10m,
      lakeTemp: z && lakes && STAGING_ZONES[z] && lakes[STAGING_ZONES[z].key] != null ? lakes[STAGING_ZONES[z].key] : null });

    var flowR = flowRead(fl.flow, cfg, { at: fl.at, trend: fl.trend, isToday: true });
    var waterR = waterTempRead(info.value, info, { species: fish, seasonal: getCurrentSeason(fish, date, section), weatherOk: true,
      coldTolerant: typeof coldTolerantFish === 'function' ? coldTolerantFish(fish, date, section) : false });

    var tiles = [
      ['Flow', flowR.word, fl.flow.toFixed(1) + ' m³/s'],
      ['Water', waterR.display === '—' ? waterR.word : waterR.display, waterR.tag || waterR.word],
      ['Conditions', rated.word, fish]
    ];
    // Fish out of the water on this reach today: no rating (it would rate a run that isn't happening).
    if (seasonRank(fish) === 0) tiles.pop();
    var box = document.createElement('div');
    box.className = 'hff-today';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Today on this reach');
    tiles.forEach(function (t) {
      var d = document.createElement('div');
      d.className = 'hff-today-tile';
      [['lbl', t[0]], ['val', t[1]], ['sub', t[2]]].forEach(function (p) {
        var s = document.createElement('span'); s.className = p[0]; s.textContent = p[1]; d.appendChild(s);
      });
      box.appendChild(d);
    });
    var src = document.createElement('p');
    src.className = 'hff-today-src';
    src.textContent = (typeof secLabel === 'function' ? secLabel(section) : section) + ', ' + fish + '. ' +
      (info.kind === 'measured' ? 'Water measured at ' + info.place + '.' : 'Water modelled from recent weather.') + ' ' +
      (flowR.source || '');
    var css = document.createElement('style');
    css.textContent = '.hff-today{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:.6rem;margin:.2rem 0 .5rem}' +
      '.hff-today-tile{border:1px solid var(--rule,#e2ded6);border-radius:8px;padding:.6rem .7rem;background:#fff;display:flex;flex-direction:column;gap:.2rem;min-width:0}' +
      '.hff-today-tile .lbl{font:600 12px/1 Inter,system-ui,-apple-system,sans-serif;color:var(--muted,#6b7d86)}' +
      '.hff-today-tile .val{font:600 1.1rem/1.15 Inter,system-ui,-apple-system,sans-serif;color:var(--ink,#1a2e3a);overflow-wrap:anywhere}' +
      '.hff-today-tile .sub{font:400 13px/1.3 Inter,system-ui,-apple-system,sans-serif;color:var(--muted,#6b7d86);overflow-wrap:anywhere}' +
      '.now p.hff-today-src{font:400 13px/1.4 Inter,system-ui,-apple-system,sans-serif;color:var(--muted,#6b7d86);margin:0 0 .9rem}';
    document.head.appendChild(css);
    var after = now.querySelector('p') || now.querySelector('.lbl');
    after.parentNode.insertBefore(box, after.nextSibling);
    box.parentNode.insertBefore(src, box.nextSibling);
  });
})();
