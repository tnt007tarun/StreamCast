// Weekly conditions email (TJ, 2026-10-20). Thursday evening, Toronto time: for each subscriber's
// reach and species, score Friday to Wednesday with the app's own rules (assets/conditions-core.js)
// and send one email listing the combos with at least one Good or Excellent day on open water.
// Nothing good, no email. At most one a week per person. ALERTS_MODE=live sends to subscribers;
// anything else (the default) sends TJ one preview of what each subscriber would get.
// Plan: claude.ai project doc claude/weekly-alerts-plan-2026-10-20.md.
import '../assets/conditions-core.js';

const C = globalThis.HFF_CORE;

export const WEEKLY_DAYS = 6;            // Friday to Wednesday when run on a Thursday
export const WEEKLY_MIN_SCORE = 6;       // "Good" on the app's Conditions pill
export const BLOWOUT_RAIN_MM = 15;       // this much rain that day or the day before caps a day at Marginal
export const MARGINAL_CAP = 5;
export const WEEKLY_GAP_DAYS = 6;        // at most one weekly email per person per week
export const MAX_SECTIONS_PER_RUN = 12;  // free plan: 50 outbound requests per run, 2 per reach
const MIGRATORY = ['Chinook Salmon', 'Coho Salmon', 'Steelhead'];
export const SPECIES_KEY = { 'Brown Trout': 'brown', 'Rainbow Trout': 'rainbow', 'Brook Trout': 'brook',
  'Steelhead': 'steelhead', 'Chinook Salmon': 'chinook', 'Coho Salmon': 'coho' };
const KEY_NAME = Object.fromEntries(Object.entries(SPECIES_KEY).map(([n, k]) => [k, n]));

export function speciesName(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (SPECIES_KEY[t]) return t;
  return KEY_NAME[t.toLowerCase()] || null;
}
export function sectionKey(s) {
  const base = String(s || '').split(',')[0].trim();
  const cfg = C.RIVER_CONFIG[base];
  return cfg && cfg.lat !== undefined && base !== 'default' ? base : null;
}
// The reach and species pairs a subscriber follows: `weekly` (signed up for this email) plus the
// rivers and species saved by the notify bar before #86 (legacy). Pairs where the species doesn't
// live on the reach are dropped.
export function weeklyInterests(rec) {
  if (!rec || rec.unsubscribed) return [];
  const out = [], seen = {};
  const add = (sec, sp) => {
    const s = sectionKey(sec), n = speciesName(sp);
    if (!s || !n) return;
    const cfg = C.RIVER_CONFIG[s];
    if (!cfg.species || cfg.species.indexOf(n) === -1) return;
    const k = s + '|' + n;
    if (seen[k]) return;
    seen[k] = true;
    out.push({ section: s, species: n });
  };
  (rec.weekly || []).forEach((w) => w && add(w.section, w.species));
  (rec.rivers || []).forEach((r) => (rec.species || []).forEach((sp) => add(r, sp)));
  return out.slice(0, 5);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function windowDates(todayIso) {
  return Array.from({ length: WEEKLY_DAYS }, (_, i) => addDays(todayIso, i + 1));
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
}

// One Open-Meteo call per reach: 30 days back (the water model's memory) plus 8 days ahead.
export function weatherUrl(cfg) {
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + cfg.lat + '&longitude=' + cfg.lng +
    '&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,cloudcover_mean,precipitation_sum,' +
    'winddirection_10m_dominant,windspeed_10m_max&past_days=30&forecast_days=8&timezone=America%2FToronto';
}
export function parseWeather(j) {
  if (!j || !j.daily || !j.daily.time) return null;
  const d = j.daily, byDate = {};
  d.time.forEach((t, i) => {
    byDate[t] = { cloud: d.cloudcover_mean ? d.cloudcover_mean[i] : null, rain: d.precipitation_sum ? d.precipitation_sum[i] : null,
      windDir: d.winddirection_10m_dominant ? d.winddirection_10m_dominant[i] : null,
      windSpd: d.windspeed_10m_max ? d.windspeed_10m_max[i] : null,
      hi: d.temperature_2m_max ? d.temperature_2m_max[i] : null, lo: d.temperature_2m_min ? d.temperature_2m_min[i] : null };
  });
  return { hist: { time: d.time, mean: d.temperature_2m_mean }, byDate };
}

// Score every day in the window for one reach and species. Same chain as the app: staging read
// for migratory fish (stagingSectionFor/stagingRead), else flow, water temperature and sky
// (scoreDay). Flow is today's gauge reading for every day, as in the app; heavy rain caps a day.
export function scoreWeek({ section, species, dates, today, wx, flow, liveWater, lakeTemps }) {
  const cfg = C.getRiverConfig(section);
  return dates.map((date) => {
    const d = wx && wx.byDate[date];
    if (!d) return { date, missing: true, good: false };
    const fishable = C.speciesFishableIn(section, species, date);
    const waterTemp = C.waterTempFromHistory(section, wx.hist, date, today, liveWater);
    let staging = null;
    if (MIGRATORY.indexOf(species) !== -1) {
      const z = C.stagingSectionFor(section);
      if (z) {
        const lt = lakeTemps && lakeTemps[C.STAGING_ZONES[z].key] != null ? lakeTemps[C.STAGING_ZONES[z].key] : null;
        staging = C.stagingRead(z, date, /Chinook|Coho/.test(species), species === 'Steelhead', lt, d.cloud, d.windDir, d.windSpd);
      }
    }
    const r = C.scoreDay({ section, species: [species], date, flow, waterTemp, cloudPct: d.cloud,
      stagingPct: staging ? staging.pct : null });
    const prev = wx.byDate[addDays(date, -1)];
    const rainy = (d.rain || 0) >= BLOWOUT_RAIN_MM || !!(prev && (prev.rain || 0) >= BLOWOUT_RAIN_MM);
    const score = rainy ? Math.min(r.score, MARGINAL_CAP) : r.score;
    return {
      date, score, word: r.closed ? 'Closed' : C.scoreToConfidence(score).word, closed: r.closed, fishable,
      good: fishable && !r.closed && score >= WEEKLY_MIN_SCORE,
      waterTemp, cloud: d.cloud, rain: d.rain, rainy, flow, flowClass: flow != null && cfg ? C.clsFlow(flow, cfg) : null,
      staging: staging ? { which: staging.which, mode: staging.phase.mode, pct: staging.pct, atMouth: stagingAtMouth(section, staging) } : null
    };
  });
}
function stagingAtMouth(section, staging) {
  // Staging tactics (spoons from the pier) only apply on the mouth reach itself, as in the app.
  return staging.which === 'salmon' && staging.phase.mode === 'stage' && !!C.STAGING_ZONES[section];
}

// ── Email blocks. Each returns an HTML string; the same blocks serve every river and species. ──
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function prettyDay(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function dayReason(day, cfg) {
  const bits = [];
  // When a run is on, the app rates the day on run strength (lake temperature, wind, cloud at the mouth).
  if (day.staging) {
    const strength = day.staging.pct >= 65 ? 'strong' : day.staging.pct >= 40 ? 'fair' : 'slow';
    const fish = day.staging.which === 'salmon' ? 'Salmon' : 'Steelhead';
    bits.push(fish + (day.staging.mode === 'stage' ? ' staging at the mouth' : ' run') + ' looks ' + strength);
  }
  if (day.waterTemp != null) bits.push('water about ' + Math.round(day.waterTemp) + ' °C');
  if (day.cloud != null) bits.push(day.cloud >= 70 ? 'overcast' : day.cloud >= 40 ? 'some cloud' : 'bright sky');
  if (day.flowClass === 'good') bits.push('flow in the sweet spot today');
  else if (day.flow != null && cfg && day.flow < cfg.sweetMin) bits.push('flow on the low side today');
  else if (day.flow != null && cfg && day.flow > cfg.sweetMax) bits.push('flow on the high side today');
  const t = bits.join(', ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function blockHeader(combo) {
  return `<h2 style="color:#1e7a6e;margin:24px 0 4px">${esc(combo.species)} on ${esc(C.secLabel(combo.section))}</h2>`;
}
export function blockDays(combo) {
  const cfg = C.getRiverConfig(combo.section);
  const good = combo.days.filter((d) => d.good).sort((a, b) => b.score - a.score).slice(0, 3)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return `<ul style="padding-left:18px;line-height:1.6;margin:8px 0">` + good.map((d) =>
    `<li><strong>${esc(prettyDay(d.date))}: ${esc(d.word)}.</strong> ${esc(dayReason(d, cfg))}.</li>`).join('') + `</ul>`;
}
export function bestDay(combo) {
  return combo.days.filter((d) => d.good).sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : 1))[0] || null;
}
export function blockWhere(combo) {
  const day = bestDay(combo);
  const cfg = C.getRiverConfig(combo.section);
  const open = (cfg.access || []).filter((a) => C.isAccessOpen(a, day.date));
  const spot = C.bestAccessSpot(open, !!(day.staging && day.staging.atMouth));
  if (!spot) return '';
  return `<p style="margin:8px 0"><strong>Where:</strong> ${esc(spot.name)}${spot.loc ? ` (${esc(spot.loc)})` : ''}.</p>`;
}
export function blockGear(combo) {
  const day = bestDay(combo);
  const cfg = C.getRiverConfig(combo.section);
  const mode = C.salmonMethodMode({ speciesKey: SPECIES_KEY[combo.species], fam: '', cfg,
    stagingModeActive: !!(day.staging && day.staging.atMouth), section: combo.section, dateStr: day.date });
  if (!mode) return '';
  const method = mode === 'spin' ? C.SALMON_MODE_METHOD.spin : C.SALMON_MODE_METHOD.float;
  return `<p style="margin:8px 0"><strong>Bring:</strong> your ${esc(C.bringPhraseFor(method, false))}.</p>`;
}
// Open on the listed days (closed days are never listed), plus a closure coming up in the next two weeks.
export function blockRegs(combo, today) {
  const cfg = C.getRiverConfig(combo.section);
  let closing = null;
  for (let i = 1; i <= 14 && !closing; i++) {
    const d = addDays(today, i);
    if (C.sectionClosedOn(cfg, d) && !C.sectionClosedOn(cfg, addDays(d, -1))) closing = d;
  }
  return `<p style="margin:8px 0;font-size:13px;color:#555">This reach is open on the days above.` +
    (closing ? ` It closes on ${esc(prettyDay(closing))}.` : '') + ` Check posted signs and the regulations where you fish.</p>`;
}
export function appLink(combo, site) {
  const day = bestDay(combo);
  return site + '/?river=' + encodeURIComponent(combo.section) + '&species=' + SPECIES_KEY[combo.species] + '&date=' + day.date;
}
export function blockButton(combo, site) {
  return `<p style="margin:12px 0 4px"><a href="${appLink(combo, site)}" style="display:inline-block;background:#1e7a6e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">See ${esc(prettyDay(bestDay(combo).date).split(',')[0])} in the app</a></p>`;
}
export function renderCombo(combo, today, site) {
  return blockHeader(combo) + blockDays(combo) + blockWhere(combo) + blockGear(combo) + blockRegs(combo, today) + blockButton(combo, site);
}
export function weeklySubject(combos) {
  if (combos.length === 1) return 'Good days ahead for ' + combos[0].species + ' on ' + C.secShort(combos[0].section);
  return 'Good days ahead on ' + combos.length + ' of your rivers';
}
export function renderEmail(combos, today, site, footerHtml) {
  const flowNote = combos.some((c) => c.days.some((d) => d.flow != null))
    ? ' Flow is today’s gauge reading. Rain can change it fast, so check the app before you go.' : '';
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a2e3a">
    <p>Your Thursday look at the next six days.${flowNote}</p>
    ${combos.map((c) => renderCombo(c, today, site)).join('')}
    ${footerHtml}
  </div>`;
}

// ── The run. deps carries the Worker's helpers (fetch, Resend, KV, unsubscribe links) so this file
// can be tested without the Worker. ──
export async function runWeekly(env, deps, opts = {}) {
  const mode = opts.mode || (env.ALERTS_MODE === 'live' ? 'live' : 'preview');
  const today = opts.today || deps.torontoDate(new Date());
  const dates = windowDates(today);
  const log = { date: today, mode, recipients: 0, sections: 0, skippedSections: [], sent: 0, previewed: 0, nothing: 0, capped: 0, errors: [] };

  // Who follows what
  const recs = await deps.listRecords();
  let people = recs.map((rec) => ({ rec, interests: weeklyInterests(rec) })).filter((p) => p.interests.length);
  if (people.length) {
    const gone = await deps.resendUnsubscribed();
    people = people.filter((p) => !gone.has(p.rec.email));
  }
  log.recipients = people.length;

  // Score each reach once
  let sections = [...new Set(people.flatMap((p) => p.interests.map((i) => i.section)))];
  if (sections.length > MAX_SECTIONS_PER_RUN) { log.skippedSections = sections.slice(MAX_SECTIONS_PER_RUN); sections = sections.slice(0, MAX_SECTIONS_PER_RUN); }
  log.sections = sections.length;
  const needLake = people.some((p) => p.interests.some((i) => MIGRATORY.indexOf(i.species) !== -1));
  const lakeTemps = needLake ? await deps.lakeTemps().catch(() => null) : null;
  const needLive = sections.some((s) => C.LIVE_WATER_STATIONS[s]);
  const live = needLive ? await deps.liveWater().catch(() => null) : null;
  const inputs = {};
  for (const s of sections) {
    const cfg = C.getRiverConfig(s);
    let wx = null, flow = null;
    try { wx = parseWeather(await deps.fetchJson(weatherUrl(cfg))); } catch (e) { log.errors.push('weather ' + s); }
    if (cfg.gauge) { try { flow = await deps.flow(cfg.gauge); } catch (e) { log.errors.push('flow ' + s); } }
    const st = C.LIVE_WATER_STATIONS[s];
    const lw = live && st && live.water && live.water[st.station];
    const fresh = live && live.updated && Date.now() - Date.parse(live.updated) < 6 * 3600 * 1000;
    inputs[s] = { wx, flow, liveWater: lw && fresh && lw.latest != null ? lw.latest : null };
  }
  const combos = {};
  const comboFor = (i) => {
    const k = i.section + '|' + i.species;
    if (!combos[k] && inputs[i.section]) {
      combos[k] = { section: i.section, species: i.species,
        days: scoreWeek(Object.assign({ section: i.section, species: i.species, dates, today, lakeTemps }, inputs[i.section])) };
    }
    return combos[k] || null;
  };

  // One email per person, listing only the combos with a good day
  const out = [];
  for (const p of people) {
    const all = p.interests.map(comboFor).filter(Boolean);
    const passing = all.filter((c) => c.days.some((d) => d.good));
    const last = p.rec.lastWeeklyAt ? p.rec.lastWeeklyAt.slice(0, 10) : null;
    const capped = !!(last && daysBetween(last, today) < WEEKLY_GAP_DAYS);
    out.push({ email: p.rec.email, rec: p.rec, all, passing, capped });
  }

  if (mode === 'live') {
    const toSend = out.filter((o) => o.passing.length && !o.capped);
    for (let i = 0; i < toSend.length; i += 100) {
      const batch = [];
      for (const o of toSend.slice(i, i + 100)) {
        const links = await deps.unsubLinks(o.email);
        batch.push({ from: deps.FROM, to: [o.email], subject: weeklySubject(o.passing), headers: deps.listHeaders(links),
          html: renderEmail(o.passing, today, deps.SITE, deps.emailFooter(links,
            "You're getting this because you asked for a Thursday heads-up on these rivers at herefishyfishy.ca.")) });
      }
      const ok = await deps.sendBatch(batch, 'weekly-' + today + '-' + i);
      if (ok) {
        log.sent += batch.length;
        for (const o of toSend.slice(i, i + 100)) { o.rec.lastWeeklyAt = new Date().toISOString(); await deps.putRecord(o.rec); }
      } else log.errors.push('send batch ' + i);
    }
  } else {
    log.previewed = out.filter((o) => o.passing.length && !o.capped).length;
    if (out.length) await deps.sendOwner('Weekly email preview: ' + log.previewed + ' of ' + out.length + ' would get one', renderPreview(out, combos, today, deps.SITE));
  }
  log.nothing = out.filter((o) => !o.passing.length).length;
  log.capped = out.filter((o) => o.passing.length && o.capped).length;
  await deps.putLog('alert:weekly:log:' + today, log);
  return { log, out, combos };
}

// TJ's preview: every combo's six days, then what each subscriber would get (or why not).
export function renderPreview(out, combos, today, site) {
  const rows = Object.values(combos).map((c) => `<tr><td style="padding:2px 6px">${esc(c.species)}, ${esc(C.secShort(c.section))}</td>` +
    c.days.map((d) => `<td style="padding:2px 6px;${d.good ? 'font-weight:bold;color:#1e7a6e' : 'color:#777'}">${esc(d.date.slice(5))} ${esc(d.missing ? 'no data' : d.word)}${d.rainy ? ' (rain)' : ''}</td>`).join('') + '</tr>').join('');
  const people = out.map((o) => {
    const head = `<p style="margin:16px 0 4px"><strong>${esc(o.email)}</strong>: `;
    if (!o.passing.length) return head + 'nothing this week (no Good day on open water).</p>';
    if (o.capped) return head + 'skipped, already had a weekly email in the last 6 days.</p>';
    return head + `would get "${esc(weeklySubject(o.passing))}"</p><div style="border:1px solid #e2ded6;padding:8px 12px">` +
      renderEmail(o.passing, today, site, '<p style="color:#999;font-size:11px">[unsubscribe footer]</p>') + '</div>';
  }).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a2e3a">
    <p><strong>Preview only. Nothing was sent to subscribers.</strong> Set ALERTS_MODE to live on the Worker to start sending.</p>
    <table style="font-size:12px;border-collapse:collapse">${rows}</table>${people}</div>`;
}
