// Checks for assets/conditions-core.js, loaded the way the Worker loads it (a side-effect import,
// then globalThis.HFF_CORE). Run from the repo root: node worker/core.test.mjs
import assert from 'node:assert/strict';
import '../assets/conditions-core.js';

const C = globalThis.HFF_CORE;
assert.ok(C, 'HFF_CORE is set');

// Legality
assert.equal(C.speciesFishableIn('Lower Bowmanville Creek', 'Steelhead', '2026-10-23'), true);
assert.equal(C.sectionClosedOn(C.getRiverConfig('Upper Credit River'), '2026-10-23'), true, 'Upper Credit closes Sep 30');
assert.equal(C.speciesFishableIn('Upper Credit River', 'Brook Trout', '2026-10-23'), false);
assert.equal(C.sectionClosedOn(C.getRiverConfig('Upper Credit River'), '2026-06-01'), false);

// One day: steelhead in season, flow in the sweet spot, prime water, overcast
const good = C.scoreDay({ section: 'Lower Bowmanville Creek', species: ['Steelhead'], date: '2026-10-23',
  flow: 1.5, waterTemp: 10, cloudPct: 80 });
assert.equal(good.closed, false);
assert.equal(good.confidence.word, 'Excellent');

// Same day, creek blown out
const blown = C.scoreDay({ section: 'Lower Bowmanville Creek', species: ['Steelhead'], date: '2026-10-23',
  flow: 30, waterTemp: 10, cloudPct: 80 });
assert.ok(blown.score < good.score);

// Closed water never gets a rating
const closed = C.scoreDay({ section: 'Upper Credit River', species: ['Brook Trout'], date: '2026-10-23',
  flow: 2, waterTemp: 10, cloudPct: 80 });
assert.equal(closed.closed, true);
assert.equal(closed.confidence, null);

// Run days (TJ, 2026-11-14). Fish in the river: rated on the river (season, flow, water, sky), plus 2 for a strong
// modelled run at the mouth when flow is in prime too; a fair or weak run takes nothing away. Fish still in the lake: run strength alone.
// Lower Bowmanville: flowLow 0.6, prime 1.1 to 2, flowHigh 5 (2026-10-24 ranges). Base 0, 10 °C (+3), 50% cloud (+1).
{
  const cfg = C.getRiverConfig('Lower Bowmanville Creek');
  assert.equal(C.conditionsScore(0, cfg, 1.5, 10, 50, 80), 0 + 5 + 3 + 1 + 2, 'strong run, prime flow: river plus the run bonus');
  assert.equal(C.conditionsScore(0, cfg, 1.5, 10, 50, 50), 9, 'fair run, prime flow: the river alone');
  assert.equal(C.conditionsScore(0, cfg, 1.5, 10, 50, 20), 9, 'weak run takes nothing away');
  assert.equal(C.conditionsScore(0, cfg, 1.5, 10, 50, null), 9, 'no run model: the same river score');
  assert.equal(C.conditionsScore(0, cfg, 1.5, 10, 50, 80, true), 8, 'fish still in the lake: run strength alone');
  assert.equal(C.conditionsScore(0, cfg, 0.8, 10, 50, 80, true), 8, 'fish still in the lake: flow ignored');
  assert.equal(C.conditionsScore(0, cfg, 0.8, 10, 50, 80), 4, 'strong run, normal flow: no bonus, and normal flow is not capped');
  assert.equal(C.conditionsScore(10, cfg, 0.2, 10, 50, 80), 1, 'too low (under flowLow) caps at Tough');
  assert.equal(C.conditionsScore(10, cfg, 3, 10, 50, 80), 5, 'above prime caps at Marginal');
  assert.equal(C.conditionsScore(10, cfg, 20, 10, 50, 80), 1, 'blown out caps at Tough');
  assert.equal(C.conditionsScore(6, cfg, null, 10, 50, 80), 6, 'no gauge reading: the season rating, no cap');
  // TJ's Lower Credit, 2026-11-14 midday: steelhead in, normal flow 4.1, 6.1 °C live, 100% cloud, fair run. Was Marginal.
  const lc = C.getRiverConfig('Lower Credit River'), base = C.sectionSeasonScore('Lower Credit River', ['Steelhead'], '2026-11-14', 'Lower Credit River').score;
  const ctx = C.tempContext(['Steelhead'], '2026-11-14', 'Lower Credit River');
  assert.equal(C.scoreToConfidence(C.conditionsScore(base, lc, 4.1, 6.1, 100, 50, false, ctx)).word, 'Good', 'drizzly Credit day, normal flow: Good (Excellent needs prime)');
  assert.equal(C.scoreToConfidence(C.conditionsScore(base, lc, 8, 6.1, 100, 50, false, ctx)).word, 'Excellent', 'same day with prime flow: Excellent');
  assert.equal(C.conditionsScore(10, lc, null, 10, 80, null, false, null), 9, 'no flow reading: a peak-season day stops at Good');
}

// Drive verdict

// Don River (2026-10-21): Lake to Eglinton open all year, Eglinton to Hwy 407 extended (MNR 2026 Zone 16)
{
  const L = 'Lower Don River (Lake to Eglinton)', U = 'Upper Don River (Eglinton to Hwy 407)';
  assert.equal(C.sectionClosedOn(C.getRiverConfig(L), '2027-02-15'), false, 'Lower Don open in February');
  assert.equal(C.sectionClosedOn(C.getRiverConfig(U), '2027-02-15'), true, 'Upper Don closed before the opener');
  assert.equal(C.sectionClosedOn(C.getRiverConfig(U), '2026-12-31'), false, 'Upper Don open to Dec 31');
  assert.equal(C.speciesFishableIn(L, 'Chinook Salmon', '2026-10-01'), true);
  assert.equal(C.stagingSectionFor(L), null, 'no Don mouth staging zone (TJ left the mouth out)');
  assert.equal(C.furthestUpstreamOpen(L, ['Chinook Salmon'], '2026-10-22').section, U);
  assert.equal(C.furthestUpstreamOpen(L, ['Chinook Salmon'], '2027-02-15'), null);
  assert.ok(C.RIVER_REGS['Don River'].species.some(r => C.regsRowMatches(r.name, 'chinook')));
}

// Flow caps every day, not only run days (TJ, 2026-10-24)
{
  const cfg = { sweetMin: 6, sweetMax: 13, flowLow: 3, flowHigh: 30 };
  assert.equal(C.flowCapScore(12, cfg, 8), 12, 'sweet spot: no cap');
  assert.equal(C.scoreToConfidence(C.flowCapScore(12, cfg, 35)).word, 'Tough', 'blown out');
  assert.equal(C.scoreToConfidence(C.flowCapScore(12, cfg, 2)).word, 'Tough', 'under flowLow');
  assert.equal(C.scoreToConfidence(C.flowCapScore(12, cfg, 20)).word, 'Marginal', 'above the sweet spot');
  assert.equal(C.flowCapScore(12, cfg, 4), 12, 'normal flow (below prime): no cap (TJ, 2026-10-24)');
  assert.equal(C.flowBand(4, cfg), 'normal'); assert.equal(C.flowBand(8, cfg), 'prime'); assert.equal(C.flowBand(20, cfg), 'high');
  assert.equal(C.flowBand(2, cfg), 'low'); assert.equal(C.flowBand(35, cfg), 'blown');
  assert.equal(C.flowCapScore(12, cfg, null), 12, 'no reading: no cap');
  assert.equal(C.scoreToConfidence(C.conditionsScore(15, cfg, 200, 10, 80, null, false)).word, 'Tough', 'trout day, blown out');
  assert.equal(C.scoreToConfidence(C.conditionsScore(null, cfg, 35, null, null, 80, true)).word, 'Good', 'fish in the lake');
}

// Flow estimate on a future day (TJ, 2026-10-24): days 1 to 2 can pull the rating down, never lift it.
{
  const cfg = { sweetMin: 6, sweetMax: 13, flowLow: 3, flowHigh: 30 };
  const fn = (f) => C.flowCapScore(10, cfg, f);
  assert.deepEqual(C.rateWithFlowEstimate(fn, { q: 40, lead: 1 }), { score: 1, potential: true, flow: 40 }, 'blown out tomorrow: potentially tough');
  assert.equal(C.rateWithFlowEstimate(fn, { q: 20, lead: 2 }).score, 5, 'high in 2 days: capped at marginal');
  assert.equal(C.rateWithFlowEstimate(fn, { q: 8, lead: 1 }).potential, false, 'prime: no change');
  assert.equal(C.rateWithFlowEstimate(fn, { q: 40, lead: 3 }).score, 10, 'day 3 and later never move the rating');
  assert.equal(C.rateWithFlowEstimate(fn, null).score, 10);
  const lift = (f) => (f == null ? 6 : 9);   // a flow that would raise the score is ignored
  assert.equal(C.rateWithFlowEstimate(lift, { q: 8, lead: 1 }).score, 6);
  assert.equal(C.confidenceWord(C.scoreToConfidence(1), true), 'Potentially tough');
  assert.equal(C.confidenceWord(C.scoreToConfidence(10), false), C.scoreToConfidence(10).word);
}

console.log('conditions-core: all checks passed');
