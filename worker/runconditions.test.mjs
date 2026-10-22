// Checks for the run-alert inputs saved by the hourly cron. Run from the repo root:
// node worker/runconditions.test.mjs
import assert from 'node:assert/strict';
import { lowerMigratoryReach, subscribedRunRivers, appendFlow, flowBump, rainUrl, parseRain, rainSums, updateRunConditions } from './runconditions.js';

const RUN = ['Beaver River', 'Black Creek', 'Bowmanville Creek', 'Bronte Creek', 'Credit River', 'Don River', 'Duffins Creek',
  'Ganaraska River', 'Grand River', 'Humber River', 'Nottawasaga River', 'Rouge River', 'Saugeen River', 'Sixteen Mile Creek', 'Wilmot Creek'];

// Every run-alert river resolves to a reach with a gauge and coordinates.
for (const r of RUN) {
  const x = lowerMigratoryReach(r);
  assert.ok(x && x.gauge && x.lat && x.lng, 'reach for ' + r);
}
assert.equal(lowerMigratoryReach('Credit River').section, 'Lower Credit River');
assert.equal(lowerMigratoryReach('Credit River').gauge, '02HB029');
assert.equal(lowerMigratoryReach('Grand River').section, 'Lower Grand River');
assert.equal(lowerMigratoryReach('Nottawasaga River').section, 'Nottawasaga River — Lower Section (Boyne to Wasaga Beach)');
assert.equal(lowerMigratoryReach('Black Creek').section, 'Black Creek — Lower Watershed & Humber Confluence');
assert.equal(lowerMigratoryReach('Speed River'), null, 'trout-only river');

assert.deepEqual(subscribedRunRivers([
  { runRivers: ['Credit River'] }, { runRivers: ['Credit River', 'Humber River'] },
  { runRivers: ['Credit River'], unsubscribed: true }, { runRivers: ['Nowhere'] }, {}], RUN),
  { 'Credit River': 2, 'Humber River': 1 });

// Flow log: hourly readings, repeats skipped, older than 96 h dropped.
const NOW = Date.parse('2026-10-22T12:00:00Z');
const h = (n) => new Date(NOW - n * 3600e3).toISOString();
let log = [];
for (let n = 100; n >= 0; n--) log = appendFlow(log, { t: h(n), q: 3 }, NOW);
assert.equal(log.length, 97);
assert.equal(appendFlow(log, { t: h(0), q: 3 }, NOW).length, 97, 'same reading time is not added twice');

// Steady low water: no bump.
let b = flowBump(log, NOW);
assert.equal(b.bump, false); assert.equal(b.rise, 0); assert.equal(b.steadyOrDropping, true);

// Rain bump: 3 -> 9 m3/s 30 h ago, now dropping to 6. That's a bump.
const bumpLog = log.map((r) => {
  const age = (NOW - Date.parse(r.t)) / 3600e3;
  return { t: r.t, q: age > 36 ? 3 : age > 30 ? 3 + (36 - age) : 9 - (30 - age) * 0.1 };
});
b = flowBump(bumpLog, NOW);
assert.equal(b.bump, true, JSON.stringify(b));
assert.equal(b.base.q, 3); assert.equal(b.peak.q, 9); assert.equal(b.rise, 2);

// Still rising: not yet (the alert waits for steady or dropping).
const rising = log.map((r, i) => ({ t: r.t, q: 3 + Math.max(0, i - 80) * 0.5 }));
b = flowBump(rising, NOW);
assert.equal(b.steadyOrDropping, false); assert.equal(b.bump, false);

// Too little history to say about "steady": no bump either way.
assert.equal(flowBump([{ t: h(0), q: 5 }], NOW).bump, false);
assert.equal(flowBump([], NOW), null);

// Rain: one call for all rivers; single-location responses are objects.
assert.ok(rainUrl([{ lat: 43.56, lng: -79.72 }, { lat: 44.3, lng: -79.98 }]).includes('latitude=43.56,44.3&longitude=-79.72,-79.98'));
const one = { daily: { time: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'], precipitation_sum: [4, 10, 2.5, 1, 0, 6] } };
assert.deepEqual(parseRain(one, 1)[0].mm, one.daily.precipitation_sum);
assert.equal(parseRain([one, one], 2).length, 2);
assert.deepEqual(rainSums(parseRain(one, 1)[0], '2026-10-22'), { past3: 16.5, todayNext2: 7 });

// End to end with fakes: Credit subscribers only, so one gauge and one rain call.
const calls = [];
let saved;
const st = await updateRunConditions({
  runRivers: RUN, today: '2026-10-22', nowMs: NOW,
  listRecords: async () => [{ runRivers: ['Credit River'] }, { runRivers: ['Credit River'] }],
  flow: async (g) => { calls.push(g); return { flow: 3.3, trend: 'stable', at: h(0) }; },
  fetchJson: async (u) => { calls.push('rain'); return one; },
  getState: async () => ({ flowLogs: { '02HB029': log.slice(0, -1), '02XX999': log } }),
  putState: async (s) => { saved = s; }
});
assert.deepEqual(calls, ['02HB029', 'rain']);
assert.deepEqual(Object.keys(st.rivers), ['Credit River']);
const cr = st.rivers['Credit River'];
assert.equal(cr.subscribers, 2); assert.equal(cr.flowNow.q, 3.3); assert.equal(cr.flowLog.length, 97);
assert.equal(cr.bump.bump, false); assert.deepEqual(cr.rainSums, { past3: 16.5, todayNext2: 7 });
assert.deepEqual(Object.keys(saved.flowLogs), ['02HB029'], 'logs for gauges no longer used are dropped');

// A failed flow call or rain call still saves what it has.
const st2 = await updateRunConditions({
  runRivers: RUN, today: '2026-10-22', nowMs: NOW,
  listRecords: async () => [{ runRivers: ['Humber River'] }],
  flow: async () => { throw new Error('down'); },
  fetchJson: async () => { throw new Error('down'); },
  getState: async () => null, putState: async () => {}
});
assert.equal(st2.rivers['Humber River'].flowNow, null);
assert.equal(st2.rivers['Humber River'].rain, null);

console.log('runconditions: all checks passed');
