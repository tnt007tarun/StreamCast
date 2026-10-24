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
  flow: 3, waterTemp: 10, cloudPct: 80 });
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

// Run strength with flow (TJ, 2026-10-23). Lower Bowmanville: flowLow 0.3, sweet 1 to 8, flowHigh 15.
{
  const cfg = C.getRiverConfig('Lower Bowmanville Creek');
  assert.equal(C.scoreToConfidence(C.conditionsScore(0, cfg, 3, 10, 50, 80)).word, 'Excellent', 'strong run, prime flow: Excellent (TJ, 2026-10-24)');
  assert.equal(C.scoreToConfidence(C.conditionsScore(0, cfg, 0.5, 10, 50, 80)).word, 'Good', 'strong run, normal flow: Good');
  assert.equal(C.scoreToConfidence(C.conditionsScore(0, cfg, 3, 10, 50, 50)).word, 'Marginal', 'fair run, prime flow: no lift');
  assert.equal(C.scoreToConfidence(C.conditionsScore(0, cfg, 3, 10, 50, 80, true)).word, 'Good', 'fish still in the lake: no lift');
  assert.equal(C.conditionsScore(0, cfg, 0.5, 10, 50, 80), 8, 'normal flow (below prime) is not capped (TJ, 2026-10-24)');
  assert.equal(C.conditionsScore(0, cfg, 0.2, 10, 50, 80), 1, 'too low (under flowLow) caps at Tough');
  assert.equal(C.conditionsScore(0, cfg, 10, 10, 50, 80), 5, 'above prime caps at Marginal');
  assert.equal(C.conditionsScore(0, cfg, 20, 10, 50, 80), 1, 'blown out caps at Tough');
  assert.equal(C.conditionsScore(0, cfg, 0.5, 10, 50, 80, true), 8, 'fish still in the lake: flow ignored');
  assert.equal(C.conditionsScore(0, cfg, null, 10, 50, 80), 8, 'no gauge reading: no cap');
}

// Drive verdict
assert.equal(C.driveVerdict(12, 45, false).cls, 'verdict-yes');
assert.equal(C.driveVerdict(12, 45, true).cls, 'verdict-no');
assert.equal(C.driveVerdict(1, 20, false).cls, 'verdict-no');

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

console.log('conditions-core: all checks passed');
