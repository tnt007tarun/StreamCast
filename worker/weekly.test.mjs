// Checks for the weekly conditions email with made-up weather and subscribers.
// Run from the repo root: node worker/weekly.test.mjs   (writes worker/.weekly-preview.html, ignored by git)
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { runWeekly, weeklyInterests, windowDates, scoreWeek, parseWeather, renderEmail, weeklySubject, SPECIES_KEY } from './weekly.js';

const C = globalThis.HFF_CORE;
const TODAY = '2026-10-22'; // a Thursday

// 30 days back plus 8 ahead of mild fall weather. Saturday Oct 24 is a washout.
function fakeWeather() {
  const time = [], mean = [], hi = [], lo = [], cloud = [], rain = [], wd = [], ws = [];
  for (let i = -30; i <= 7; i++) {
    const d = new Date(TODAY + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    time.push(iso); mean.push(9 + Math.sin(i / 4)); hi.push(13); lo.push(5);
    cloud.push(i % 2 ? 80 : 30); rain.push(iso === '2026-10-24' ? 22 : 1); wd.push(200); ws.push(15);
  }
  return { daily: { time, temperature_2m_mean: mean, temperature_2m_max: hi, temperature_2m_min: lo, cloudcover_mean: cloud,
    precipitation_sum: rain, winddirection_10m_dominant: wd, windspeed_10m_max: ws } };
}

// Interests: weekly plus legacy rivers x species, validated against the config
assert.deepEqual(weeklyInterests({ rivers: ['Lower Bowmanville Creek'], species: ['Steelhead'] }),
  [{ section: 'Lower Bowmanville Creek', species: 'Steelhead' }]);
assert.deepEqual(weeklyInterests({ weekly: [{ section: 'Lower Bowmanville Creek', species: 'steelhead' }] }),
  [{ section: 'Lower Bowmanville Creek', species: 'Steelhead' }], 'species keys are accepted');
assert.deepEqual(weeklyInterests({ weekly: [{ section: 'Upper Credit River', species: 'Steelhead' }] }), [], 'no steelhead above Norval');
assert.deepEqual(weeklyInterests({ weekly: [{ section: 'Nowhere Creek', species: 'Steelhead' }] }), []);
assert.deepEqual(weeklyInterests({ unsubscribed: true, rivers: ['Lower Bowmanville Creek'], species: ['Steelhead'] }), []);
assert.deepEqual(windowDates(TODAY), ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28']);

// Scoring: closed water is never good; the washout day is capped at Marginal
const wx = parseWeather(fakeWeather());
const closedWeek = scoreWeek({ section: 'Upper Credit River', species: 'Brown Trout', dates: windowDates(TODAY), today: TODAY, wx, flow: 2 });
assert.ok(closedWeek.every((d) => d.closed && !d.good), 'Upper Credit is closed after Sep 30');
const bow = scoreWeek({ section: 'Lower Bowmanville Creek', species: 'Steelhead', dates: windowDates(TODAY), today: TODAY, wx, flow: 1.5 });
const sat = bow.find((d) => d.date === '2026-10-24'), sun = bow.find((d) => d.date === '2026-10-25');
assert.ok(sat.rainy && sat.score <= 5 && !sat.good, 'rain day capped');
assert.ok(sun.rainy, 'the day after heavy rain is capped too');

// A full run with fake subscribers
function deps(records, sent) {
  return {
    FROM: 'HereFishyFishy <hello@herefishyfishy.ca>', SITE: 'https://herefishyfishy.ca', torontoDate: () => TODAY,
    listHeaders: () => ({ 'List-Unsubscribe': '<x>' }), emailFooter: () => '<p>footer</p>',
    listRecords: async () => records, resendUnsubscribed: async () => new Set(['gone@example.com']),
    fetchJson: async () => fakeWeather(), flow: async () => 1.5, lakeTemps: async () => ({}), liveWater: async () => null,
    unsubLinks: async (e) => ({ page: 'u', oneClick: 'o' }),
    sendBatch: async (batch) => { sent.batches.push(batch); return true; },
    sendOwner: async (subject, html) => { sent.owner.push({ subject, html }); },
    putRecord: async (rec) => { sent.puts.push(rec.email); }, putLog: async (k, log) => { sent.log = log; }
  };
}
const recs = () => [
  { email: 'steelhead@example.com', rivers: ['Lower Bowmanville Creek'], species: ['Steelhead'] },
  { email: 'closed@example.com', weekly: [{ section: 'Upper Credit River', species: 'Brown Trout' }] },
  { email: 'capped@example.com', weekly: [{ section: 'Lower Bowmanville Creek', species: 'Steelhead' }], lastWeeklyAt: '2026-10-19T21:00:00Z' },
  { email: 'gone@example.com', weekly: [{ section: 'Lower Bowmanville Creek', species: 'Steelhead' }] },
  { email: 'run-only@example.com', runRivers: ['Credit River'] }
];

// Preview (the default): one email to TJ, nothing to subscribers
let sent = { batches: [], owner: [], puts: [] };
let r = await runWeekly({}, deps(recs(), sent));
assert.equal(r.log.mode, 'preview');
assert.equal(sent.batches.length, 0);
assert.equal(sent.owner.length, 1);
assert.equal(r.log.recipients, 3, 'unsubscribed in Resend and run-only people are left out');
const steel = r.out.find((o) => o.email === 'steelhead@example.com');
assert.ok(steel.passing.length === 1 && !steel.capped, 'Bowmanville steelhead has good days');
assert.equal(r.out.find((o) => o.email === 'closed@example.com').passing.length, 0);
assert.ok(r.out.find((o) => o.email === 'capped@example.com').capped);
assert.ok(!/—/.test(sent.owner[0].html.replace(/data-[^>]*/g, '')), 'no em dashes in the email');
writeFileSync(new URL('./.weekly-preview.html', import.meta.url), sent.owner[0].html);

// Live: only people with a good day who weren't emailed this week
sent = { batches: [], owner: [], puts: [] };
r = await runWeekly({ ALERTS_MODE: 'live' }, deps(recs(), sent));
assert.equal(sent.batches.length, 1);
assert.deepEqual(sent.batches[0].map((m) => m.to[0]), ['steelhead@example.com']);
assert.deepEqual(sent.puts, ['steelhead@example.com'], 'lastWeeklyAt saved');
const html = sent.batches[0][0].html;
assert.ok(/date=2026-10-2/.test(html) && /species=steelhead/.test(html), 'button links to the day and species');
assert.ok(!/Saturday, Oct 24: (Good|Excellent)/.test(html), 'washout day not offered');
assert.ok(/Bring:<\/strong> your centrepin or spinning rod with float gear/.test(html), 'gear matches the hero');
assert.equal(sent.batches[0][0].subject, 'Good days ahead for Steelhead on Lower Bowmanville Creek');

// Flow counts once the fish are in the river (TJ, 2026-10-23): too low or blown out is Tough, above prime Marginal.
// Normal flow below prime is not capped (TJ, 2026-10-24).
const normal = scoreWeek({ section: 'Lower Bowmanville Creek', species: 'Steelhead', dates: windowDates(TODAY), today: TODAY, wx, flow: 0.8 });
assert.ok(normal.some((d) => d.good), 'normal flow (0.8, under prime 1.1 to 2) can still be a Good day');
const low = scoreWeek({ section: 'Lower Bowmanville Creek', species: 'Steelhead', dates: windowDates(TODAY), today: TODAY, wx, flow: 0.2 });
assert.ok(low.every((d) => d.score <= 1 && !d.good), 'too low (under flowLow 0.6) is Tough');
const blown = scoreWeek({ section: 'Lower Bowmanville Creek', species: 'Steelhead', dates: windowDates(TODAY), today: TODAY, wx, flow: 20 });
assert.ok(blown.every((d) => d.score <= 1), 'flow above flowHigh (5) is Tough');
sent = { batches: [], owner: [], puts: [] };
const lowDeps = deps([{ email: 'steelhead@example.com', rivers: ['Lower Bowmanville Creek'], species: ['Steelhead'] }], sent);
lowDeps.flow = async () => 0.2;
r = await runWeekly({ ALERTS_MODE: 'live' }, lowDeps);
assert.equal(sent.batches.length, 0, 'no email on a low-water week');
// The subject names the river for a mouth reach
assert.equal(weeklySubject([{ section: 'Rouge River \u2014 Marsh & Mouth (Lake Ontario)', species: 'Chinook Salmon' }]),
  'Good days ahead for Chinook Salmon on Rouge River \u00b7 Marsh & Mouth (Lake Ontario)');

console.log('weekly: all checks passed');
