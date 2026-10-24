// Checks for flowforecast.js. Run: node worker/flowforecast.test.mjs
import assert from 'node:assert/strict';
import { snowSplit, wetness, features, forecastFromInputs, flowHistory, parseWeather, weatherUrl, FLOW_MODEL, NUMBER_LEADS,
  gaugesForHour, refreshForecasts, servedForecast, FORECAST_KEY } from './flowforecast.js';

// Snow: below freezing it piles up, above freezing it melts at 3 mm per degree a day.
{
  const { w, swe } = snowSplit([10, 0, 0], [-5, 2, 10]);
  assert.deepEqual(w, [0, 6, 4]);
  assert.deepEqual(swe, [10, 4, 0]);
  assert.deepEqual(wetness([10, 0]), [10, 9]);
}

// Feature lags line up with the fit (tools/flowmodel_fit.py): lead 1 uses today and yesterday as fh1 and fh2.
{
  const wx = { w: [1, 2, 3, 4, 5, 6], swe: [0, 0, 0, 0, 0, 0], api: [1, 1, 1, 1, 1, 1] };
  const f1 = features({ q0: 2, q1: 2, q3: 2 }, wx, 2, 100, 1);
  assert.equal(f1.fh, 4); assert.equal(f1.fh1, 3); assert.equal(f1.fh2, 2); assert.equal(f1.fsum, 4);
  const f3 = features({ q0: 2, q1: 2, q3: 2 }, wx, 2, 100, 3);
  assert.equal(f3.fh, 6); assert.equal(f3.fh1, 5); assert.equal(f3.fh2, 4); assert.equal(f3.fsum, 15); assert.equal(f3.fmax, 6);
}

// Daily means from 5-minute readings: today is the last 24 hours.
{
  const now = Date.UTC(2026, 9, 24, 12);
  const r = [];
  for (let m = 0; m < 96 * 60; m += 5) r.push({ t: now - m * 60000, q: m < 24 * 60 ? 5 : m < 48 * 60 ? 4 : 3 });
  const h = flowHistory(r, now);
  assert.equal(h.q0, 5); assert.equal(h.q1, 4); assert.equal(h.q3, 3);
  assert.equal(flowHistory(r.slice(0, 5), now).q1, null, 'too few readings gives null');
}

// Open-Meteo returns an object for one point and a list for several.
{
  const one = { daily: { time: ['2026-10-24'], precipitation_sum: [4], temperature_2m_mean: [8] } };
  assert.deepEqual(parseWeather(one), { dates: ['2026-10-24'], precip: [4], temp: [8] });
  const two = [one, { daily: { time: ['2026-10-24'], precipitation_sum: [2], temperature_2m_mean: [6] } }];
  assert.deepEqual(parseWeather(two), { dates: ['2026-10-24'], precip: [3], temp: [7] });
  assert.ok(weatherUrl([[43.9, -80.08]]).includes('past_days=92'));
}

// Every app gauge with a model: dry week holds near today's flow, a wet week raises it, ranges
// bracket the estimate, and only days 1 to 2 show a number.
{
  const today = '2026-10-24';
  const dates = [];
  for (let i = -92; i <= 7; i++) dates.push(new Date(Date.UTC(2026, 9, 24 + i)).toISOString().slice(0, 10));
  const ti = dates.indexOf(today);
  const temp = dates.map(() => 9);
  const base = dates.map((_, i) => (i % 9 === 0 && i < ti ? 6 : 0.5));
  const wet = base.map((p, i) => (i === ti + 2 ? 40 : p));
  assert.ok(Object.keys(FLOW_MODEL.gauges).length > 0, 'model has gauges');
  for (const [g, m] of Object.entries(FLOW_MODEL.gauges)) {
    const hist = { q0: 2, q1: 2.1, q3: 2.3 };
    const dry = forecastFromInputs(g, hist, { dates, precip: base, temp }, today);
    const rain = forecastFromInputs(g, hist, { dates, precip: wet, temp }, today);
    assert.equal(dry.length, Object.keys(m.leads).length, g + ' one estimate per lead');
    assert.equal(dry[0].date, '2026-10-25');
    for (const d of dry) {
      assert.ok(d.lo <= d.q && d.q <= d.hi, `${g} day ${d.lead}: ${d.lo} <= ${d.q} <= ${d.hi}`);
      assert.equal(d.showNumber, d.lead <= NUMBER_LEADS);
      assert.ok(d.q > 0.3 && d.q < 6, `${g} day ${d.lead}: a dry week stays near 2 (got ${d.q})`);
    }
    if (rain.length >= 3) assert.ok(rain[2].q > dry[2].q, `${g}: 40 mm of rain raises day 3 (${dry[2].q} -> ${rain[2].q})`);
  }
  assert.deepEqual(forecastFromInputs('NOPE', { q0: 1, q1: 1, q3: 1 }, { dates, precip: base, temp }, today), []);
  assert.deepEqual(forecastFromInputs(Object.keys(FLOW_MODEL.gauges)[0], { q0: 1, q1: null, q3: 1 }, { dates, precip: base, temp }, today), []);
}

// Cron refresh: each gauge in exactly one of the three hourly groups; one weather call per run.
{
  const all = Object.keys(FLOW_MODEL.gauges);
  const groups = [0, 1, 2].map((h) => gaugesForHour(h));
  assert.equal(groups.flat().length, all.length);
  assert.deepEqual(new Set(groups.flat()), new Set(all));
  assert.deepEqual(gaugesForHour(4), groups[1]);

  const nowMs = Date.UTC(2026, 9, 24, 16);
  const dates = [];
  for (let i = -92; i <= 7; i++) dates.push(new Date(Date.UTC(2026, 9, 24 + i)).toISOString().slice(0, 10));
  const day = { time: dates, precipitation_sum: dates.map(() => 1), temperature_2m_mean: dates.map(() => 8) };
  const feats = [];
  for (let m = 0; m < 96 * 60; m += 5) feats.push({ properties: { DATETIME: new Date(nowMs - m * 60000).toISOString(), DISCHARGE: 2 } });
  const calls = [], kv = {};
  const r = await refreshForecasts({ hour: 0, nowMs,
    fetchJson: async (u) => { calls.push(u); return u.includes('open-meteo') ? groups[0].flatMap((g) => FLOW_MODEL.gauges[g].points.map(() => ({ daily: day }))) : { features: feats }; },
    kvPut: async (k, v) => { kv[k] = JSON.parse(v); } });
  assert.deepEqual(r.failed, []);
  assert.equal(calls.filter((u) => u.includes('open-meteo')).length, 1, 'one weather call per run');
  assert.equal(calls.length, groups[0].length + 1);
  const g0 = groups[0][0], saved = kv[FORECAST_KEY(g0)];
  assert.equal(saved.issued, '2026-10-24'); assert.equal(saved.days[0].date, '2026-10-25');
  // Served the next day: the past day drops off and leads count from the new day.
  const next = servedForecast(saved, '2026-10-25');
  assert.equal(next.days[0].date, '2026-10-26'); assert.equal(next.days[0].lead, 1); assert.equal(next.days[0].showNumber, true);
  assert.equal(next.days.find((d) => d.date === '2026-10-28').showNumber, false);
}

console.log('flowforecast: all checks passed');
