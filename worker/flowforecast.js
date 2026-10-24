// Flow forecast, 1 to 7 days ahead (TJ approved the approach 2026-10-24; research in project doc
// claude/flow-forecast-research-2026-10-24.md). One small linear model per gauge and lead day, fitted
// offline by tools/flowmodel_fit.py from 2016 to 2026 daily flow and ERA5 weather, stored in
// flowmodel.json. At request time it needs the last 4 days of flow at the gauge and daily rain and
// temperature in the catchment (the last 92 days, for snowpack and wetness, plus the 7-day forecast).
// Everything here except fetchFlowForecast() is pure, so tests and the weekly email can call it.
import MODEL from './flowmodel.json' with { type: 'json' };

export const FLOW_MODEL = MODEL;
export const EPS = 0.05;              // added before taking logs, same as the fit
export const PAST_DAYS = 92;          // Open-Meteo forecast API maximum; enough for a winter's snowpack
export const MAX_LEAD = 7;
export const NUMBER_LEADS = 2;        // days 1 to 2 show a number; later days only a range (TJ, 2026-10-24)
const DDF = 3.0;                      // degree-day snowmelt, mm per degree C per day
const API_DECAY = 0.9;                // wetness index: yesterday's counts 0.9, the day before 0.81, ...

// Rain plus snowmelt each day, and the snowpack, from daily precipitation (mm) and mean temperature (C).
export function snowSplit(p, t) {
  let swe = 0;
  const w = [], sw = [];
  for (let i = 0; i < p.length; i++) {
    const pi = p[i] == null || isNaN(p[i]) ? 0 : p[i];
    const ti = t[i] == null || isNaN(t[i]) ? 0 : t[i];
    let rain = pi;
    if (ti <= 0) { swe += pi; rain = 0; }
    const melt = Math.min(swe, DDF * Math.max(ti, 0));
    swe -= melt;
    w.push(rain + melt); sw.push(swe);
  }
  return { w, swe: sw };
}

export function wetness(w) {
  let a = 0;
  return w.map((x) => (a = a * API_DECAY + x));
}

// Features for one lead day, in the order the fit used. `hist` holds the gauge's daily mean flow for
// today (q0), yesterday (q1) and three days ago (q3). `w`, `swe` and `api` run over the weather days,
// with today at index `ti`; days after ti are the forecast. `doy` is today's day of the year.
export function features(hist, wx, ti, doy, h) {
  const lq = (q) => Math.log(q + EPS);
  const lq0 = lq(hist.q0);
  const f = [];
  for (let k = 1; k <= h; k++) f.push(wx.w[ti + k]);
  const fsum = f.reduce((a, b) => a + b, 0);
  const fmax = Math.max(...f);
  const w0 = wx.w[ti], wm1 = wx.w[ti - 1];
  const fh = f[h - 1];
  const fh1 = h > 1 ? f[h - 2] : w0;
  const fh2 = h > 2 ? f[h - 3] : h === 2 ? w0 : wm1;
  const api = wx.api[ti];
  return {
    lq0, dq1: lq0 - lq(hist.q1), dq3: lq0 - lq(hist.q3), w0, wm1, api, swe: wx.swe[ti],
    ms: Math.sin(2 * Math.PI * doy / 365), mc: Math.cos(2 * Math.PI * doy / 365),
    fsum, fh, fh1, fh2, fmax, fsum_wet: fsum * api / 50, fmax_wet: fmax * api / 50,
  };
}

// The estimate for each lead day: central flow and an 80% range, from today's flow and the weather.
// Returns [] when the gauge has no model or the inputs are incomplete.
export function forecastFromInputs(gauge, hist, weather, todayIso, model = MODEL) {
  const g = model.gauges && model.gauges[gauge];
  if (!g || !hist || [hist.q0, hist.q1, hist.q3].some((q) => q == null || isNaN(q))) return [];
  const ti = weather.dates.indexOf(todayIso);
  if (ti < 1) return [];
  const { w, swe } = snowSplit(weather.precip, weather.temp);
  const wx = { w, swe, api: wetness(w) };
  const d0 = new Date(todayIso + 'T12:00:00Z');
  const doy = Math.round((d0 - Date.UTC(d0.getUTCFullYear(), 0, 0)) / 86400000);
  const out = [];
  for (let h = 1; h <= MAX_LEAD; h++) {
    const m = g.leads[String(h)];
    if (!m || ti + h >= weather.dates.length) break;
    const x = features(hist, wx, ti, doy, h);
    let y = m.intercept;
    m.cols.forEach((c, i) => { y += m.coef[i] * x[c]; });
    const lq = x.lq0 + y;
    const q = Math.max(0, Math.exp(lq) - EPS);
    const lo = Math.max(0, Math.exp(lq + m.lo) - EPS), hi = Math.exp(lq + m.hi) - EPS;
    const rain = weather.precip[ti + h];
    out.push({ date: weather.dates[ti + h], lead: h, q: round(q), lo: round(lo), hi: round(hi),
      showNumber: h <= NUMBER_LEADS, rainMm: rain == null ? null : Math.round(rain * 10) / 10 });
  }
  return out;
}

function round(v) {
  return v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
}

// Daily means for today, yesterday and three days ago, from 5-minute readings ({t: ms, q}).
// "Today" is the last 24 hours, so a reading early in the morning still has a full day behind it.
export function flowHistory(readings, nowMs) {
  const mean = (a, b) => {
    const v = readings.filter((r) => r.t > nowMs - b * 3600000 && r.t <= nowMs - a * 3600000).map((r) => r.q);
    return v.length >= 12 ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  return { q0: mean(0, 24), q1: mean(24, 48), q3: mean(72, 96) };
}

// Catchment weather from the Open-Meteo forecast API: the mean over the gauge's points.
export function weatherUrl(points) {
  const q = new URLSearchParams({
    latitude: points.map((p) => p[0]).join(','), longitude: points.map((p) => p[1]).join(','),
    daily: 'precipitation_sum,temperature_2m_mean', past_days: String(PAST_DAYS), forecast_days: '8',
    timezone: 'America/Toronto',
  });
  return 'https://api.open-meteo.com/v1/forecast?' + q;
}

export function parseWeather(json) {
  const list = Array.isArray(json) ? json : [json];
  const dates = list[0].daily.time;
  const avg = (key) => dates.map((_, i) => {
    const v = list.map((l) => l.daily[key][i]).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });
  return { dates, precip: avg('precipitation_sum'), temp: avg('temperature_2m_mean') };
}

export function torontoDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(ms));
}

// Network part: deps.fetchJson(url) returns parsed JSON (or throws). Used by the /flow-forecast route
// and the weekly email.
export async function fetchFlowForecast(gauge, deps) {
  const g = MODEL.gauges[gauge];
  if (!g) return { station: gauge, days: [], reason: 'no model for this gauge' };
  const nowMs = deps.nowMs || Date.now();
  const since = new Date(nowMs - 97 * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');
  const flowUrl = 'https://api.weather.gc.ca/collections/hydrometric-realtime/items?' + new URLSearchParams({
    STATION_NUMBER: gauge, datetime: since + '/..', limit: '2000', f: 'json',
    properties: 'DATETIME,DISCHARGE',
  });
  const [flowJson, wxJson] = await Promise.all([deps.fetchJson(flowUrl), deps.fetchJson(weatherUrl(g.points))]);
  const readings = (flowJson.features || []).map((f) => ({
    t: Date.parse(f.properties.DATETIME), q: parseFloat(f.properties.DISCHARGE),
  })).filter((r) => !isNaN(r.t) && !isNaN(r.q));
  const hist = flowHistory(readings, nowMs);
  const today = torontoDate(nowMs);
  const days = forecastFromInputs(gauge, hist, parseWeather(wxJson), today);
  return { station: gauge, issued: today, now: hist.q0 == null ? null : round(hist.q0), days,
    reason: days.length ? null : 'not enough recent gauge readings' };
}
