// conditionsScore() and liveConditionsScore() are now sums of conditionsParts() / liveConditionsParts() (Phase 2,
// 2026-11-02), so the app can show how a rating was built. This checks the split changed no score: the old functions
// are copied below verbatim from commit 0aaa399 and compared on a grid. Run from the repo root: node worker/parts.test.mjs
import assert from 'node:assert/strict';
import '../assets/conditions-core.js';

const C = globalThis.HFF_CORE;

function oldLive(flow, sweetMin, sweetMax, flowLow, flowHigh, tempC, cloudPct, ctx) {
  var s = 0;
  if (flow != null) {
    if (flow >= sweetMin && flow <= sweetMax)         s += 5;
    else if (flow >= flowLow && flow <= flowHigh)     s += 0;
    else                                              s -= 4;
  }
  if (tempC != null) {
    if (tempC >= 8  && tempC <= 14)  s += 3;
    else if (tempC >= 4  && tempC < 8)  s += 1;
    else if (tempC > 14 && tempC <= 18) s += 1;
    else if (ctx && ctx.coldTolerant && tempC >= 3 && tempC < 4) s += 1;
    else if (ctx && ctx.coldTolerant && tempC >= C.COLD_RUN_MIN && tempC < 3) s += 0;
    else if (ctx && !ctx.troutHeat && tempC > 18) s += 1;
    else                                s -= 3;
  }
  if (cloudPct != null) {
    if (cloudPct >= 60)  s += 2;
    else if (cloudPct >= 30) s += 1;
  }
  return s;
}
function oldConditions(baseScore, cfg, flow, waterTemp, cloudPct, stagingPct, fishInLake, ctx) {
  if (stagingPct != null) {
    var s = stagingPct >= 65 ? 8 : stagingPct >= 40 ? 5 : 2;
    if (fishInLake) return s;
    if (s >= 8 && C.flowBand(flow, cfg) === 'prime') s = 10;
    return C.flowCapScore(s, cfg, flow);
  }
  if (cfg && flow != null) {
    return C.flowCapScore(baseScore + oldLive(flow, cfg.sweetMin, cfg.sweetMax, cfg.flowLow, cfg.flowHigh, waterTemp, cloudPct, ctx), cfg, flow);
  }
  return baseScore;
}

const cfgs = ['Lower Credit River', 'Lower Bowmanville Creek', 'Upper Grand River (Tailwater)', 'Lower Humber River'].map((n) => C.getRiverConfig(n));
const ctxs = [null, { coldTolerant: true, troutHeat: false }, { coldTolerant: false, troutHeat: true }, { coldTolerant: false, troutHeat: false }];
const flows = (cfg) => [null, 0, cfg.flowLow - 0.1, cfg.flowLow, (cfg.flowLow + cfg.sweetMin) / 2, cfg.sweetMin, cfg.sweetMax, cfg.sweetMax + 0.1, cfg.flowHigh, cfg.flowHigh + 1];
const temps = [null, -1, 0.5, 1, 2, 3.9, 4, 6, 8, 10, 14, 14.5, 18, 18.5, 24];
const clouds = [null, 0, 29, 30, 59, 60, 100];
let n = 0;
for (const cfg of cfgs) for (const f of flows(cfg)) for (const t of temps) for (const c of clouds) for (const ctx of ctxs) {
  assert.equal(C.liveConditionsScore(f, cfg.sweetMin, cfg.sweetMax, cfg.flowLow, cfg.flowHigh, t, c, ctx),
    oldLive(f, cfg.sweetMin, cfg.sweetMax, cfg.flowLow, cfg.flowHigh, t, c, ctx));
  for (const base of [-30, 0, 2, 6, 10, 14]) for (const sp of [null, 30, 50, 70]) for (const inLake of [false, true]) {
    const got = C.conditionsParts(base, cfg, f, t, c, sp, inLake, ctx);
    assert.equal(got.total, oldConditions(base, cfg, f, t, c, sp, inLake, ctx));
    assert.equal(C.conditionsScore(base, cfg, f, t, c, sp, inLake, ctx), got.total);
    // The parts add up to the total, unless a cap or a run day replaced the sum.
    if (!got.cap && !got.replaced) assert.equal(base + got.parts.reduce((a, p) => a + p.pts, 0), got.total);
    n++;
  }
}
// scoreDay keeps the same numbers it had
const d = C.scoreDay({ section: 'Lower Bowmanville Creek', species: ['Steelhead'], date: '2026-10-23', flow: 1.5, waterTemp: 10, cloudPct: 80 });
assert.equal(d.confidence.word, 'Excellent');
console.log('score parts: ' + n + ' cases match the old functions');
