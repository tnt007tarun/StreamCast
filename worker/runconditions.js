// Run-alert inputs (2026-10-22). The "Run alert drafts" scheduled task can't always reach the gauge
// and weather APIs from its cloud session, so the hourly cron saves what it needs to KV CACHE
// "runcond:latest": for each river with an active run-alert subscriber, its lowest migratory reach,
// that reach's gauge, an hourly flow log for the last 4 days, rain for the last 3 days and the next 2,
// and a flow-bump summary. The task reads it through the Cloudflare API. GET /run-conditions shows it.
import '../assets/conditions-core.js';

const C = globalThis.HFF_CORE;

export const RUNCOND_KEY = 'runcond:latest';
export const FLOW_LOG_HOURS = 96;     // keep 4 days of hourly readings
export const BUMP_WINDOW_HOURS = 72;  // a bump is measured over the last 3 days
export const BUMP_RISE = 0.5;         // peak at least 50% above the level before it
const MIGRATORY = ['Steelhead', 'Chinook Salmon', 'Coho Salmon'];

// The lowest reach on a river that lists steelhead or salmon: one that no other migratory reach on
// the same river has as its UPSTREAM_OF neighbour. Falls back to the first migratory reach listed.
export function lowerMigratoryReach(river) {
  const secs = (C.RIVER_SECTIONS[river] || []).filter((s) => {
    const cfg = C.RIVER_CONFIG[s];
    return cfg && cfg.gauge && (cfg.species || []).some((sp) => MIGRATORY.indexOf(sp) !== -1);
  });
  if (!secs.length) return null;
  const lowest = secs.find((s) => !secs.some((o) => C.UPSTREAM_OF[o] === s)) || secs[0];
  const cfg = C.RIVER_CONFIG[lowest];
  return { section: lowest, gauge: cfg.gauge, lat: cfg.lat, lng: cfg.lng, sweetMin: cfg.sweetMin, sweetMax: cfg.sweetMax };
}

// Rivers with at least one active (not unsubscribed) run-alert subscriber, with counts.
export function subscribedRunRivers(records, runRivers) {
  const counts = {};
  for (const rec of records || []) {
    if (!rec || rec.unsubscribed) continue;
    for (const r of rec.runRivers || []) if (runRivers.indexOf(r) !== -1) counts[r] = (counts[r] || 0) + 1;
  }
  return counts;
}

// Adds a reading to a gauge's log (skipping a repeat of the same reading time) and drops anything
// older than FLOW_LOG_HOURS.
export function appendFlow(log, reading, nowMs) {
  const out = (log || []).slice();
  if (reading && reading.q != null && reading.t && !out.some((r) => r.t === reading.t)) out.push(reading);
  out.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const cutoff = nowMs - FLOW_LOG_HOURS * 3600e3;
  return out.filter((r) => Date.parse(r.t) >= cutoff);
}

// Over the last BUMP_WINDOW_HOURS: the peak, the lowest level before the peak, and whether flow is now
// steady or dropping (latest no more than 5% above the reading about 3 hours earlier). hoursLogged
// says how much history there is; under 72 hours a bump can be missed.
export function flowBump(log, nowMs) {
  const win = (log || []).filter((r) => Date.parse(r.t) >= nowMs - BUMP_WINDOW_HOURS * 3600e3);
  if (!win.length) return null;
  let peak = win[0];
  for (const r of win) if (r.q > peak.q) peak = r;
  const before = win.filter((r) => Date.parse(r.t) <= Date.parse(peak.t));
  let base = before[0];
  for (const r of before) if (r.q < base.q) base = r;
  const latest = win[win.length - 1];
  const latestMs = Date.parse(latest.t);
  const earlier = win.filter((r) => Date.parse(r.t) <= latestMs - 2.5 * 3600e3).pop();
  const steadyOrDropping = earlier ? latest.q <= earlier.q * 1.05 : null;
  const rise = base.q > 0 ? Math.round((peak.q / base.q - 1) * 100) / 100 : null;
  const hoursLogged = Math.round((latestMs - Date.parse(log[0].t)) / 3600e3);
  return {
    base: { q: base.q, t: base.t }, peak: { q: peak.q, t: peak.t }, latest: { q: latest.q, t: latest.t },
    rise, steadyOrDropping, hoursLogged,
    bump: rise != null && rise >= BUMP_RISE && peak.t !== base.t && steadyOrDropping === true
  };
}

// One Open-Meteo call for every river: comma-separated coordinates return an array (one location
// returns a plain object).
export function rainUrl(points) {
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + points.map((p) => p.lat).join(',') +
    '&longitude=' + points.map((p) => p.lng).join(',') +
    '&daily=precipitation_sum&past_days=3&forecast_days=3&timezone=America%2FToronto';
}
export function parseRain(json, count) {
  const arr = Array.isArray(json) ? json : [json];
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = arr[i] && arr[i].daily;
    out.push(d ? { dates: d.time, mm: d.precipitation_sum } : null);
  }
  return out;
}
// Rain in the 3 days before today and today plus the next 2 (mm), from the daily series.
export function rainSums(rain, today) {
  if (!rain || !rain.dates) return null;
  let past = 0, next = 0;
  rain.dates.forEach((d, i) => {
    const mm = rain.mm[i] || 0;
    if (d < today) past += mm; else if (d <= addDays(today, 2)) next += mm;
  });
  return { past3: Math.round(past * 10) / 10, todayNext2: Math.round(next * 10) / 10 };
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// deps: listRecords(), flow(gauge) -> {flow, at, trend} | null, fetchJson(url), getState(), putState(obj),
// today (Toronto YYYY-MM-DD), nowMs, runRivers.
export async function updateRunConditions(deps) {
  const counts = subscribedRunRivers(await deps.listRecords(), deps.runRivers);
  const prev = (await deps.getState()) || {};
  const logs = prev.flowLogs || {};
  const rivers = {};
  const reaches = Object.keys(counts).map((river) => ({ river, reach: lowerMigratoryReach(river) })).filter((x) => x.reach);
  const gauges = [...new Set(reaches.map((x) => x.reach.gauge))];
  const latest = {};
  for (const g of gauges) {
    try {
      const f = await deps.flow(g);
      if (f && f.flow != null) {
        latest[g] = f;
        logs[g] = appendFlow(logs[g], { t: f.at || new Date(deps.nowMs).toISOString(), q: f.flow }, deps.nowMs);
      }
    } catch (e) {}
  }
  let rain = [];
  if (reaches.length) {
    try { rain = parseRain(await deps.fetchJson(rainUrl(reaches.map((x) => x.reach))), reaches.length); } catch (e) { rain = []; }
  }
  reaches.forEach(({ river, reach }, i) => {
    const f = latest[reach.gauge];
    rivers[river] = Object.assign({}, reach, {
      subscribers: counts[river],
      flowNow: f ? { q: f.flow, at: f.at, trend: f.trend } : null,
      flowLog: logs[reach.gauge] || [],
      bump: flowBump(logs[reach.gauge], deps.nowMs),
      rain: rain[i] || null,
      rainSums: rainSums(rain[i], deps.today)
    });
  });
  // Keep logs only for gauges still in use.
  const keep = {};
  gauges.forEach((g) => { if (logs[g]) keep[g] = logs[g]; });
  const state = { updated: new Date(deps.nowMs).toISOString(), today: deps.today, rivers, flowLogs: keep };
  await deps.putState(state);
  return state;
}
