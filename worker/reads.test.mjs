// Checks for the shared reads in assets/conditions-core.js (Phase 1, 2026-11-02): sky, water temperature, flow,
// the Conditions pill, the fishing window and the hero's reasons. Run from the repo root: node worker/reads.test.mjs
// Sunrise and sunset below are Toronto times for each date, rounded to the minute (test fixtures, not live data).
import assert from 'node:assert/strict';
import '../assets/conditions-core.js';

const C = globalThis.HFF_CORE;
const SUN = {
  winter: { date: '2027-01-15', sunrise: '2027-01-15T07:46', sunset: '2027-01-15T17:05' },
  spring: { date: '2027-04-24', sunrise: '2027-04-24T06:24', sunset: '2027-04-24T20:10' },
  summer: { date: '2026-07-01', sunrise: '2026-07-01T05:37', sunset: '2026-07-01T21:03' },
  fall:   { date: '2026-11-02', sunrise: '2026-11-02T06:51', sunset: '2026-11-02T17:04' },
};
const noEmDash = (s, what) => assert.ok(!/—/.test(s), what + ' has an em dash: ' + s);
const mins = (s) => C.localMinutes(s);

// ── Sky ───────────────────────────────────────────────────────────────────────
{
  const g = (c) => C.skyRead(c).grade;
  assert.equal(g(70), 'good'); assert.equal(g(69), 'warn'); assert.equal(g(30), 'warn'); assert.equal(g(29), 'bad');
  assert.equal(C.clsSky(45), C.skyRead(45).grade, 'clsSky and skyRead agree');
  assert.equal(C.skyRead(50).word, 'Mostly Cloudy');
  assert.equal(C.skyRead(50).cover, 'Some cover', '50% is not "Good cover" next to "compresses your window" any more');
  assert.equal(C.skyRead(100).word, 'Overcast'); assert.equal(C.skyRead(5).word, 'Clear'); assert.equal(C.skyRead(15).word, 'Mostly Clear');
  assert.equal(C.skyRead(null).grade, 'na');
  // Every word sits in one grade: no "Partly Cloudy" that is also "Bright".
  for (let c = 0; c <= 100; c++) {
    const r = C.skyRead(c);
    const want = { Overcast: 'good', 'Mostly Cloudy': 'warn', 'Partly Cloudy': 'warn', 'Mostly Clear': 'bad', Clear: 'bad' }[r.word];
    assert.equal(r.grade, want, c + '% word ' + r.word);
  }
}

// ── Water temperature ────────────────────────────────────────────────────────
{
  const model = { kind: 'model' }, live = { kind: 'measured', place: 'Mississauga' };
  const m = C.waterTempRead(10.2, model, { weatherOk: true });
  assert.equal(m.display, 'About 10°C', 'modelled: whole degrees with About');
  assert.equal(m.tag, 'Modelled'); assert.equal(m.measured, false); assert.equal(m.grade, 'good');
  assert.match(m.source, /modelled/);
  const l = C.waterTempRead(10.24, live, { weatherOk: true });
  assert.equal(l.display, '10.2°C', 'live: one decimal, no About'); assert.equal(l.tag, 'Live');
  assert.match(l.source, /Credit Valley Conservation/);
  assert.equal(C.waterTempRead(10.2, model, { weatherOk: false }).grade, 'na', 'no weather: no made-up estimate');
  assert.equal(C.waterTempRead(10.2, live, { weatherOk: false }).grade, 'good', 'a live reading stands without weather');
  // Thresholds are clsTemp's (8 / 14 / 18), unchanged.
  for (const t of [3, 5.9, 6, 7.9, 8, 14, 14.1, 17.9, 18, 22]) assert.equal(C.waterTempRead(t, model, {}).grade, C.clsTemp(t), 't=' + t);
  assert.equal(C.waterTempRead(14.4, model, { species: 'Rainbow Trout', weatherOk: true }).clause,
    'at the warm edge of the 8 to 14°C feeding range, so fish the cool first hours of light', 'about 14 is not "above 14"');
  assert.equal(C.waterTempRead(7.6, model, { weatherOk: true }).clause, 'at the cool edge of the 8 to 14°C feeding range, so expect slower fishing');
  assert.equal(C.waterTempRead(15, model, { species: 'Chinook Salmon', weatherOk: true }).clause, 'above the 8 to 14°C feeding range');
  // Species: winter steelhead in season get their own season note in cold water; resident trout in their slow window don't.
  const sh = C.getCurrentSeason('Steelhead', '2027-01-15');
  const cold = C.waterTempRead(2, model, { species: 'Steelhead', seasonal: sh, weatherOk: true });
  assert.equal(cold.word, 'Cold'); assert.ok(cold.sentence.indexOf(sh.note) !== -1, 'steelhead cold-water note');
  assert.ok(!/inactive/i.test(cold.sentence), 'no "fish inactive" for an in-season run');
  const bt = C.waterTempRead(2, model, { species: 'Brown Trout', seasonal: C.getCurrentSeason('Brown Trout', '2027-01-15'), weatherOk: true });
  assert.equal(bt.sentence, 'Cold, so expect slower fishing.');
  assert.match(C.waterTempRead(16, model, { weatherOk: true }).clause, /cool first hours/, 'warm water keeps the early-hours rule');
  assert.match(C.waterTempRead(16, model, { species: 'Brook Trout', weatherOk: true }).clause, /cool first hours/, 'a trout rule');
  assert.equal(C.waterTempRead(16, model, { species: 'Chinook Salmon', weatherOk: true }).clause, 'above the 8 to 14\u00b0C feeding range',
    'no trout heat rule for salmon');
  assert.match(C.waterTempRead(19, model, { weatherOk: true }).sentence, /Conservation advisory/);
}

// ── Flow ─────────────────────────────────────────────────────────────────────
{
  const cfg = C.getRiverConfig('Lower Credit River');   // prime 6 to 13 at Streetsville
  const miss = C.flowRead(null, cfg, { isToday: true });
  assert.equal(miss.missing, true); assert.equal(miss.grade, 'na');
  assert.match(miss.sentence, /Streetsville gauge isn’t reporting/); assert.match(miss.sentence, /Check it before you drive/);
  assert.equal(C.flowRead(null, cfg, { isToday: false }).missing, false, 'a future date has no reading, which is not a missing gauge');
  const pr = C.flowRead(8.4, cfg, { at: '2026-11-02T19:15:00Z', now: Date.parse('2026-11-02T19:40:00Z') });
  assert.equal(pr.band, 'prime'); assert.equal(pr.word, 'Prime');
  assert.match(pr.source, /Water Survey of Canada gauge Credit River at Streetsville, read 2:15 PM$/, 'UTC shown as Toronto time');
  const old = C.flowRead(8.4, cfg, { at: '2026-11-02T14:15:00Z', now: Date.parse('2026-11-02T19:40:00Z') });
  assert.match(old.source, /\(5 hours ago\)/);
  assert.ok(!/read/.test(C.flowRead(8.4, cfg, { at: '2026-11-02 19:15' }).source), 'no time zone: no time shown');
  assert.equal(C.flowRead(4, cfg, {}).word, 'Normal'); assert.equal(C.flowRead(4, cfg, {}).grade, C.clsFlow(4, cfg));
  // Trend wording reads direction against the band (TJ, 2026-11-02); see the temperature and trend section below.
  assert.equal(C.flowTrendRead('down', 'normal', C.clsFlow(4, cfg)).grade, C.clsFlow(4, cfg), 'trend icon follows the band');
}

// ── Conditions pill: missing flow makes no call ─────────────────────────────
{
  for (const score of [0, 3, 7, 12]) {
    const conf = C.scoreToConfidence(score);
    const q = C.confidenceRead(conf, { flowMissing: true });
    assert.equal(q.text, 'Conditions: Unknown · no flow reading', 'score ' + score + ': no rating word without flow');
    assert.ok(!/Good|Excellent|Marginal|Tough/.test(q.text), 'no positive or negative call');
    assert.equal(q.cls, 'conf-unknown'); assert.equal(q.unknown, true);
    assert.match(q.title, /no flow reading/); assert.match(q.title, /Check the gauge/);
  }
  const good = C.scoreToConfidence(7);
  assert.equal(C.confidenceRead(good, { flowMissing: true, flowIrrelevant: true }).text, 'Conditions: Good', 'fish in the lake: flow does not count');
  assert.equal(C.confidenceRead(good, {}).text, 'Conditions: Good');
  assert.equal(C.confidenceRead(good, {}).cls, good.cls);
  assert.equal(C.confidenceRead(C.scoreToConfidence(12), { weatherMissing: true }).text, 'Conditions: Unknown · no weather data');
  assert.equal(C.confidenceRead(good, { flowMissing: true, weatherMissing: true }).text, 'Conditions: Unknown · no flow reading, no weather data');
  assert.equal(C.confidenceRead(good, { potential: true }).text, 'Conditions: Potentially good', 'a flow estimate still rates the day');
  // The score itself is unchanged by a missing reading (rankings use it).
  assert.equal(C.scoreToConfidence(7).word, 'Good');
}

// ── Fishing window ───────────────────────────────────────────────────────────
{
  const inDaylight = (w, sun, what) => {
    assert.ok(w.ranges && w.ranges.length, what + ': has ranges');
    w.ranges.forEach((r) => {
      assert.ok(r[0] >= mins(sun.sunrise), what + ': starts at or after sunrise');
      assert.ok(r[1] <= mins(sun.sunset), what + ': ends at or before sunset');
      assert.ok(r[1] > r[0], what + ': not empty');
    });
    noEmDash(w.text, what); noEmDash(w.phrase, what);
  };
  const pcs = [null, { morning: 80, midday: 80, evening: 80 }, { morning: 10, midday: 10, evening: 10 },
    { morning: 80, midday: 10, evening: 60 }, { morning: 10, midday: 50, evening: 75 }, { morning: 40, midday: 40, evening: 10 }];
  for (const [season, sun] of Object.entries(SUN)) {
    for (const cloud of [0, 25, 50, 75, 100]) for (const pc of pcs) {
      const w = C.fishingWindow({ sunrise: sun.sunrise, sunset: sun.sunset, periodCloud: pc, cloudPct: cloud, weatherOk: true, waterTemp: 10, waterOk: true });
      inDaylight(w, sun, season + ' ' + cloud + '% ' + JSON.stringify(pc));
      assert.equal(w.approximate, false);
    }
    const warm = C.fishingWindow({ sunrise: sun.sunrise, sunset: sun.sunset, cloudPct: 90, weatherOk: true, waterTemp: 16, waterOk: true });
    assert.equal(warm.mode, 'early', season + ': warm water keeps the first hours');
    const warmSalmon = C.fishingWindow({ sunrise: sun.sunrise, sunset: sun.sunset, cloudPct: 90, weatherOk: true, waterTemp: 16, waterOk: true, species: 'Chinook Salmon' });
    assert.equal(warmSalmon.mode, 'allday', season + ': the warm-water rule is for trout only');
    assert.equal(C.fishingWindow({ sunrise: sun.sunrise, sunset: sun.sunset, cloudPct: 90, weatherOk: true, waterTemp: 16, waterOk: false }).mode, 'allday',
      season + ': a stand-in temperature never sets the window');
    inDaylight(warm, sun, season + ' warm');
  }
  // The November case from the audit: part cloud no longer says 6 to 8 PM.
  const nov = C.fishingWindow({ sunrise: SUN.fall.sunrise, sunset: SUN.fall.sunset, cloudPct: 50, weatherOk: true });
  assert.equal(nov.mode, 'earlylate');
  assert.equal(nov.text, 'Sunrise (6:51 AM) to about 9:50 AM, and 3:05 PM to sunset (5:04 PM)');
  assert.equal(nov.phrase, 'from sunrise to about 9:50 AM and again from 3:05 PM');
  assert.ok(!/6.8 PM|8 PM/.test(nov.text));
  // Summer: the same rule lands later in the evening, still ending at sunset.
  const jul = C.fishingWindow({ sunrise: SUN.summer.sunrise, sunset: SUN.summer.sunset, cloudPct: 50, weatherOk: true });
  assert.equal(jul.text, 'Sunrise (5:37 AM) to about 8:35 AM, and 7:05 PM to sunset (9:03 PM)');
  // Winter clear day: the first two hours of light, not "before 8 AM" (sunrise is 7:46).
  const jan = C.fishingWindow({ sunrise: SUN.winter.sunrise, sunset: SUN.winter.sunset, cloudPct: 5, weatherOk: true });
  assert.equal(jan.text, 'Sunrise (7:46 AM) to about 9:45 AM');
  // Spring overcast: all day.
  const apr = C.fishingWindow({ sunrise: SUN.spring.sunrise, sunset: SUN.spring.sunset, cloudPct: 85, weatherOk: true });
  assert.equal(apr.mode, 'allday'); assert.equal(apr.text, 'All day, sunrise to sunset (6:24 AM to 8:10 PM)');
  // Periods: overcast morning and evening, bright midday.
  const per = C.fishingWindow({ sunrise: SUN.fall.sunrise, sunset: SUN.fall.sunset, periodCloud: { morning: 80, midday: 10, evening: 60 }, weatherOk: true });
  assert.equal(per.text, 'Sunrise (6:51 AM) to about 10 AM, and 3 PM to sunset (5:04 PM)');
  assert.equal(per.note, 'Skip the bright midday.');
  // Adjacent periods merge.
  const merged = C.fishingWindow({ sunrise: SUN.fall.sunrise, sunset: SUN.fall.sunset, periodCloud: { morning: 10, midday: 50, evening: 75 }, weatherOk: true });
  assert.equal(merged.text, '10 AM to sunset (5:04 PM)');
  assert.equal(merged.phrase, 'from 10 AM to sunset', 'the headline reads "Fish from 10 AM to sunset", not "Fish Midday"');
  // No sunrise or sunset: no clock times, flagged approximate.
  const nos = C.fishingWindow({ cloudPct: 50, weatherOk: true });
  assert.equal(nos.approximate, true); assert.ok(!/\d/.test(nos.text), 'no clock times without sun data');
  assert.match(nos.note, /approximate/);
  // No weather at all: a general guide, flagged approximate, never a fake sky read.
  const now = C.fishingWindow({ sunrise: SUN.fall.sunrise, sunset: SUN.fall.sunset, weatherOk: false, cloudPct: 50 });
  assert.equal(now.mode, 'earlylate'); assert.equal(now.approximate, true); assert.match(now.note, /Weather didn’t load/);
  // Today after sunset.
  // Today: only what is still ahead.
  const fallPart = { sunrise: SUN.fall.sunrise, sunset: SUN.fall.sunset, cloudPct: 50, weatherOk: true };
  const late = C.fishingWindow(Object.assign({ nowMin: 19 * 60 }, fallPart));
  assert.equal(late.passed, true); assert.equal(late.phrase, null, 'no time to fish once the window is over');
  assert.equal(late.text, 'Today’s window is over'); assert.deepEqual(late.remaining, []);
  assert.equal(late.ranges.length, 2, 'the whole day is still on record');
  const mid = C.fishingWindow(Object.assign({ nowMin: 11 * 60 }, fallPart));
  assert.equal(mid.passed, false); assert.equal(mid.text, '3:05 PM to sunset (5:04 PM)', 'the morning has gone, the evening is ahead');
  assert.equal(mid.phrase, 'from 3:05 PM to sunset');
  const during = C.fishingWindow(Object.assign({ nowMin: 8 * 60 + 2 }, fallPart));
  assert.equal(during.text, 'Now to about 9:50 AM, and 3:05 PM to sunset (5:04 PM)');
  assert.equal(during.phrase, 'from now to about 9:50 AM and again from 3:05 PM');
  const before = C.fishingWindow(Object.assign({ nowMin: 5 * 60 }, fallPart));
  assert.equal(before.text, nov.text, 'before sunrise the whole day is ahead');
  const allNow = C.fishingWindow({ sunrise: SUN.fall.sunrise, sunset: SUN.fall.sunset, cloudPct: 85, weatherOk: true, nowMin: 13 * 60 });
  assert.equal(allNow.text, 'Now to sunset (5:04 PM)');
  for (let m = 0; m < 24 * 60; m += 7) {
    const w = C.fishingWindow(Object.assign({ nowMin: m }, fallPart));
    (w.remaining || []).forEach((r) => assert.ok(r[0] >= m && r[1] > m, 'nothing in the past at ' + m));
    assert.equal(w.passed, m >= mins(SUN.fall.sunset), 'passed exactly after sunset (' + m + ')');
  }
  // Clock text
  assert.equal(C.clockText(600), '10 AM'); assert.equal(C.clockText(742), '12:20 PM'); assert.equal(C.clockText(411, true), '6:51 AM');
}

// ── Hero reasons ─────────────────────────────────────────────────────────────
{
  const cfg = C.getRiverConfig('Lower Credit River');
  const date = '2026-11-02';
  const seas = C.getCurrentSeason('Steelhead', date);
  const water = C.waterTempRead(10.2, { kind: 'model' }, { species: 'Steelhead', seasonal: seas, weatherOk: true });
  const base = { species: 'Steelhead', seasonal: seas, migratory: true, sectionNotes: C.sectionSeasonScore('Lower Credit River', ['Steelhead'], date).notes,
    gaugeName: cfg.gaugeName, isToday: true, water };
  const gaugeDown = C.heroReasons(Object.assign({}, base, { flow: C.flowRead(null, cfg, { isToday: true }), flowValue: null }));
  assert.deepEqual(gaugeDown, [
    'Fall return season for steelhead is under way.',
    'The Credit River at Streetsville gauge isn’t reporting, so the flow is unknown. Check it before you drive.',
    'Water is about 10°C (modelled from recent weather), inside the 8 to 14°C feeding range.'
  ]);
  const prime = C.heroReasons(Object.assign({}, base, { flow: C.flowRead(8.4, cfg, {}), flowValue: 8.4 }));
  assert.equal(prime[1], 'Flow is 8.4 m³/s, inside this stretch’s prime range of 6 to 13 m³/s.');
  const live = C.heroReasons(Object.assign({}, base, { flow: C.flowRead(8.4, cfg, {}), flowValue: 8.4,
    water: C.waterTempRead(10.24, { kind: 'measured', place: 'Mississauga' }, { weatherOk: true }) }));
  assert.equal(live[2], 'Water is 10.2°C, measured at Mississauga (Credit Valley Conservation, live), inside the 8 to 14°C feeding range.');
  // Future date with a flow estimate
  const fut = C.heroReasons(Object.assign({}, base, { isToday: false, flow: C.flowRead(null, cfg, { isToday: false }), flowValue: null,
    flowEst: { q: 9, lo: 7, hi: 11, showNumber: true }, flowEstBand: C.flowBand(9, cfg) }));
  assert.equal(fut[1], 'Flow is forecast at about 9 m³/s, in the prime range. That’s an estimate, so check the gauge on the day.');
  // Future date, no estimate: no flow line (nothing to say that is grounded)
  const fut2 = C.heroReasons(Object.assign({}, base, { isToday: false, flow: C.flowRead(null, cfg, { isToday: false }), flowValue: null }));
  assert.equal(fut2.length, 2); assert.ok(!fut2.some((t) => /Flow|gauge/.test(t)));
  // Fish still in the lake: flow is not a reason
  const lake = C.heroReasons(Object.assign({}, base, { fishInLake: true, flow: C.flowRead(null, cfg, { isToday: true }) }));
  assert.ok(!lake.some((t) => /gauge|Flow/.test(t)));
  // No weather: no water line
  const nowx = C.heroReasons(Object.assign({}, base, { flow: C.flowRead(8.4, cfg, {}), flowValue: 8.4,
    water: C.waterTempRead(10, { kind: 'model' }, { weatherOk: false }) }));
  assert.ok(!nowx.some((t) => /Water is/.test(t)));
  // Mouth note (early in a run, the mouth section): explains why the mouth over upstream water. At most three lines.
  const sep = '2026-09-05';
  const mouthNotes = C.sectionSeasonScore('Lower Credit River', ['Chinook Salmon'], sep).notes;
  const mouth = C.heroReasons({ species: 'Chinook Salmon', seasonal: C.getCurrentSeason('Chinook Salmon', sep), migratory: true, sectionNotes: mouthNotes,
    flow: C.flowRead(8, cfg, {}), flowValue: 8, isToday: true, water });
  assert.ok(mouth.length <= 3);
  if (mouthNotes.indexOf('Fish still concentrated at the mouth') !== -1) assert.match(mouth[1], /usually hold near the mouth/);
  // Out of season: no season line
  assert.ok(!C.heroReasons({ species: 'Chinook Salmon', seasonal: C.getCurrentSeason('Chinook Salmon', '2026-03-01'), water }).some((t) => /Chinook/.test(t)));
  for (const t of [].concat(gaugeDown, prime, live, fut, fut2, mouth)) noEmDash(t, 'reason');

  // Season lines are expectations from the calendar: never a claim that fish are here.
  const presence = /are in the river|are here|are present|stacked|fish are staging|are holding/i;
  for (const sp of ['Steelhead', 'Chinook Salmon', 'Coho Salmon', 'Brown Trout', 'Rainbow Trout', 'Brook Trout']) {
    for (let m = 1; m <= 12; m++) {
      const d = '2026-' + String(m).padStart(2, '0') + '-15';
      const se = C.getCurrentSeason(sp, d);
      const lines = C.heroReasons({ species: sp, seasonal: se, migratory: ['Steelhead', 'Chinook Salmon', 'Coho Salmon'].includes(sp),
        sectionNotes: ['Staging at the mouth'], flow: C.flowRead(8, cfg, {}), flowValue: 8, isToday: true, water });
      lines.forEach((t) => { assert.ok(!presence.test(t), sp + ' ' + d + ': ' + t); noEmDash(t, 'reason'); });
      if (se && se.quality !== 'absent' && se.quality !== 'slow') assert.match(lines[0], /season for .+ is under way/);
    }
  }
  assert.equal(C.heroReasons({ species: 'Chinook Salmon', seasonal: C.getCurrentSeason('Chinook Salmon', '2026-10-01'), sectionNotes: [] })[0],
    'Peak run season for chinook salmon is under way.');
  assert.equal(C.heroReasons({ species: 'Brown Trout', seasonal: C.getCurrentSeason('Brown Trout', '2026-04-15'), sectionNotes: [] })[0],
    'Spring season for brown trout is under way, rated peak on the season calendar.');
}

// ── Temperature rules (TJ, 2026-11-02) ──────────────────────────────────────
{
  const model = { kind: 'model' };
  const t = (wt, ctx) => C.liveConditionsScore(null, 6, 13, 3, 30, wt, null, ctx);
  // No fish named: the old steps exactly.
  for (const wt of [0, 0.5, 2, 3.9, 4, 7, 10, 15, 18, 19, 25]) assert.equal(t(wt), t(wt, null), 'no context ' + wt);
  assert.equal(t(2), -3); assert.equal(t(5), 1); assert.equal(t(10), 3); assert.equal(t(19), -3);
  // Winter steelhead (and lake-run browns) in season: 1 to 4 °C scores like 4 to 8; below 1 °C stays -3.
  const shJan = C.tempContext(['Steelhead'], '2027-01-15', 'Lower Humber River');
  assert.deepEqual(shJan, { coldTolerant: true, troutHeat: false });
  assert.equal(t(2, shJan), 1, 'winter steelhead at 2 °C'); assert.equal(t(1, shJan), 1); assert.equal(t(0.5, shJan), -3, 'about freezing');
  assert.equal(t(10, shJan), 3, 'prime unchanged');
  assert.equal(C.coldTolerantFish('Steelhead', '2026-07-01', 'Lower Humber River'), false, 'steelhead out of season');
  assert.equal(C.coldTolerantFish('Brown Trout', '2027-01-15', 'Upper Grand River (Tailwater)'), false, 'resident browns: old steps');
  const brownRun = C.isLakeRunBrownSection('Lower Credit River');
  if (brownRun) assert.equal(C.coldTolerantFish('Brown Trout', '2027-01-15', 'Lower Credit River'), C.getCurrentSeason('Brown Trout', '2027-01-15', 'Lower Credit River').quality !== 'slow');
  assert.equal(C.tempContext(['Steelhead', 'Rainbow Trout'], '2027-01-15', 'Lower Humber River').coldTolerant, false, 'a trout in the mix: old cold step');
  // Winter steelhead day: the score no longer loses 4 points to 2 °C water.
  const cfgH = C.getRiverConfig('Lower Humber River');
  const before = C.conditionsScore(6, cfgH, (cfgH.sweetMin + cfgH.sweetMax) / 2, 2, 80, null, false);
  const after = C.conditionsScore(6, cfgH, (cfgH.sweetMin + cfgH.sweetMax) / 2, 2, 80, null, false, shJan);
  assert.equal(after - before, 4);
  const d = C.scoreDay({ section: 'Lower Humber River', species: ['Steelhead'], date: '2027-01-15', flow: (cfgH.sweetMin + cfgH.sweetMax) / 2, waterTemp: 2, cloudPct: 80 });
  assert.equal(d.score, C.conditionsScore(C.sectionSeasonScore('Lower Humber River', ['Steelhead'], '2027-01-15', 'Lower Humber River').score,
    cfgH, (cfgH.sweetMin + cfgH.sweetMax) / 2, 2, 80, null, false, shJan), 'the weekly email uses the same steps');
  // Wording: "Cold" in amber for winter run fish, not "bad"; trout keep "bad".
  const sh = C.getCurrentSeason('Steelhead', '2027-01-15');
  const w2 = C.waterTempRead(2, model, { species: 'Steelhead', seasonal: sh, weatherOk: true, coldTolerant: true });
  assert.equal(w2.word, 'Cold'); assert.equal(w2.grade, 'warn'); assert.ok(w2.sentence.indexOf(sh.note) !== -1);
  assert.equal(C.waterTempRead(0.4, model, { species: 'Steelhead', seasonal: sh, weatherOk: true, coldTolerant: true }).grade, 'bad');
  assert.equal(C.waterTempRead(2, model, { species: 'Brown Trout', weatherOk: true }).grade, 'bad');
  // 18 °C: trout only. Salmon: no advisory, no -3; trout: both unchanged.
  const ck = C.tempContext(['Chinook Salmon'], '2026-08-25', 'Ganaraska River — Lower (Lake to CNR Bridge)');
  assert.equal(ck.troutHeat, false);
  assert.equal(t(19, ck), 1, 'salmon at 19 °C scores like 14 to 18');
  assert.equal(t(19, C.tempContext(['Brown Trout'], '2026-07-15', 'Upper Grand River (Tailwater)')), -3, 'trout at 19 °C unchanged');
  const ckw = C.waterTempRead(19, model, { species: 'Chinook Salmon', weatherOk: true });
  assert.ok(!/Conservation advisory/.test(ckw.sentence)); assert.match(ckw.sentence, /advisory is for trout/); assert.equal(ckw.grade, 'warn');
  assert.equal(C.waterTempRead(18, model, { species: 'Chinook Salmon', weatherOk: true }).clause, 'well above the 8 to 14°C feeding range');
  const bt = C.waterTempRead(19, model, { species: 'Brown Trout', weatherOk: true });
  assert.match(bt.sentence, /Conservation advisory: stop fishing for trout above 18/); assert.equal(bt.grade, 'bad');
  assert.match(C.waterTempRead(19, model, { weatherOk: true }).sentence, /Conservation advisory/, 'no fish named: the trout rule');
  // While fish are in the lake (staging at the mouth) the rating ignores river temperature (unchanged).
  const cfgG = C.getRiverConfig('Lower Bowmanville Creek');
  assert.equal(C.conditionsScore(0, cfgG, 1.5, 19, 50, 80, true), C.conditionsScore(0, cfgG, 1.5, 10, 50, 80, true));
  // Flow trend: direction against the prime range (TJ, 2026-11-02). Dropping through prime is a good day, not a worry.
  assert.equal(C.flowTrendRead('down', 'prime', 'good').text, '↓ Dropping through the prime range, the few days after rain this river usually fishes well.');
  assert.equal(C.flowTrendRead('down', 'prime', 'good').grade, 'good', 'the icon follows the band');
  assert.equal(C.flowTrendRead('up', 'high', 'warn').text, '↑ Rising and already high. Expect coloured water.');
  assert.equal(C.flowTrendRead('down', 'high', 'warn').text, '↓ Coming down after rain. Prime usually follows in a few days.');
  for (const band of ['low', 'normal', 'prime', 'high', 'blown']) for (const tr of ['up', 'down', 'stable']) {
    const r = C.flowTrendRead(tr, band, 'warn');
    assert.ok(!/good sign|almost always|keep an eye/.test(r.text), band + ' ' + tr); noEmDash(r.text, 'trend');
  }
  assert.equal(C.flowTrendRead('up', null).text, '↑ Rising.', 'no band: direction only');
  // Every river uses the default routine: its flow step no longer says rising is almost always better.
  const step = C.RIVER_CONFIG['default'].routine[2];
  assert.ok(!/almost always/.test(step.d)); assert.match(step.d, /dropping into it usually fishes best/);
}

// ── Species and window agree ─────────────────────────────────────────────────
{
  // The same warm water gives a trout the early hours and a salmon the cloud-based window: the window has to be worked
  // out for the fish the hero names (the app calls speciesReads() again with that fish).
  const base = { sunrise: SUN.summer.sunrise, sunset: SUN.summer.sunset, cloudPct: 85, weatherOk: true, waterTemp: 16, waterOk: true };
  assert.equal(C.fishingWindow(Object.assign({ species: 'Rainbow Trout' }, base)).mode, 'early');
  assert.equal(C.fishingWindow(Object.assign({ species: 'Chinook Salmon' }, base)).mode, 'allday');
  assert.equal(C.fishingWindow(Object.assign({ species: null }, base)).mode, 'early', 'unknown fish: the trout rule, as before');
}

console.log('shared reads: all checks passed');
