// One signup box per guide or river page (TJ, 2026-10-17: never more than one ask per page).
// Usage: <div class="hff-signup" data-kind="run" data-river="Ganaraska River" data-placement="mid"></div>
//   data-placement  "mid" or "end" (default), sent with the Umami events to compare placements
//   data-kind="run"      run alerts; data-river picks the river, or leave it empty for a picker
//   data-kind="outlook"  the monthly outlook
//   data-kind="weekly"   the weekly conditions email with river and fish pickers (homepage; needs conditions-core.js)
// From October to April a "run" box offers the weekly steelhead email instead (TJ, 2026-10-28: steelhead are what's
// running then), with run alerts as a tick box. Rivers without a steelhead reach (the Don) keep run alerts.
// Posts to the Worker's /subscribe, the same endpoint as the app's notify bar.
(function () {
  var PROXY = 'https://streamcast-proxy.tnt-tarun.workers.dev';
  var RIVERS = ['Beaver River', 'Black Creek', 'Bowmanville Creek', 'Bronte Creek', 'Credit River', 'Don River', 'Duffins Creek',
    'Ganaraska River', 'Grand River', 'Humber River', 'Nottawasaga River', 'Rouge River', 'Saugeen River',
    'Sixteen Mile Creek', 'Wilmot Creek'];
  // The reach the weekly steelhead email scores for each river: open all year where the river has one.
  var STEELHEAD_REACH = {
    'Beaver River': 'Lower Beaver River (Thornbury)',
    'Bowmanville Creek': 'Lower Bowmanville Creek',
    'Bronte Creek': 'Bronte Creek \u2014 Lower Estuary & Mouth',
    'Credit River': 'Lower Credit River',
    'Duffins Creek': 'Duffins Creek \u2014 Lower Section',
    'Ganaraska River': 'Ganaraska River \u2014 Lower (Lake to CNR Bridge)',
    'Grand River': 'Lower Grand River',
    'Humber River': 'Lower-Mid Humber (Old Mill to Eglinton)',
    'Nottawasaga River': 'Nottawasaga River \u2014 Lower Section (Boyne to Wasaga Beach)',
    'Rouge River': 'Rouge River \u2014 Marsh & Mouth (Lake Ontario)',
    'Saugeen River': 'Saugeen River \u2014 Lower Main Stem (Paisley to Southampton)',
    'Sixteen Mile Creek': 'Sixteen Mile Creek \u2014 Lower Reaches & Oakville Harbour',
    'Wilmot Creek': 'Wilmot Creek \u2014 Lower River (to CN Rail Tracks)'
  };
  var STEELHEAD_MONTHS = [9, 10, 11, 0, 1, 2, 3];   // October to April
  var HOW = 'Picked from live river flow and the week\u2019s rain, temperature and cloud forecast.';
  var FINE = 'Only sent when there\u2019s a good day. Free, no account, unsubscribe anytime.';
  var CSS = '.hff-signup{margin:2.2rem 0 1rem;padding:1.1rem 1.15rem 1.15rem;background:#eef5f3;border-radius:10px;' +
    'font:400 .95rem/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#31414c}' +
    '.hff-signup .lbl{font-weight:600;font-size:.68rem;line-height:1;letter-spacing:.13em;text-transform:uppercase;color:#1e7a6e;margin-bottom:.55rem}' +
    '.hff-signup p{margin:0 0 .8rem}' +
    '.hff-signup form{display:flex;flex-wrap:wrap;gap:.5rem}' +
    '.hff-signup input[type=email],.hff-signup select{flex:1 1 200px;min-width:0;min-height:44px;padding:.5rem .75rem;border:1px solid #c9d6d2;' +
    'border-radius:8px;background:#fff;font:inherit;color:#1a2e3a}' +
    '.hff-signup button{min-height:44px;padding:.5rem 1.1rem;border:0;border-radius:8px;background:#1e7a6e;color:#fff;font:600 .95rem/1 inherit;cursor:pointer}' +
    '.hff-signup button:disabled{opacity:.6;cursor:default}' +
    '.hff-signup .opt{display:flex;align-items:center;gap:.45rem;margin-top:.6rem;font-size:.85rem;cursor:pointer}' +
    '.hff-signup .opt input{width:16px;height:16px;margin:0;accent-color:#1e7a6e}' +
    '.hff-signup .small{font-size:.78rem;color:#6b7d86;margin:.6rem 0 0}' +
    '.hff-signup .how{font-size:.8rem;color:#6b7d86;margin:-.35rem 0 .8rem}' +
    '.hff-signup .msg{margin:.6rem 0 0;font-size:.9rem}.hff-signup .msg.err{color:#a63d2f}';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  // Umami loads deferred; retry for a few seconds so an early "seen" isn't lost.
  function track(name, props, tries) {
    try {
      if (window.umami) { window.umami.track(name, props); return; }
      if ((tries || 0) < 10) setTimeout(function () { track(name, props, (tries || 0) + 1); }, 500);
    } catch (e) {}
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function observeSeen(box, page, offer, placement) {
    // Seen = at least half the box on screen, once per page view. Signups divided by this is the
    // box's conversion rate (compare pages and placements).
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (en) { return en.isIntersecting; })) {
        track('Signup Box Seen', { page: page, offer: offer, placement: placement });
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(box);
  }

  // Homepage picker: the river's reach that lists the fish, preferring one open today, then the longest season.
  function pickSection(parent, sp) {
    var secs = ((window.RIVER_SECTIONS || {})[parent] || []).filter(function (s) {
      var c = window.RIVER_CONFIG && RIVER_CONFIG[s];
      return c && c.active !== false && c.species && c.species.indexOf(sp) !== -1;
    });
    var today = new Date(); today = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
    var rank = { 'all-year': 0, extended: 1, standard: 2 };
    secs.sort(function (a, b) {
      var oa = typeof speciesFishableIn === 'function' && speciesFishableIn(a, sp, today) ? 0 : 1;
      var ob = typeof speciesFishableIn === 'function' && speciesFishableIn(b, sp, today) ? 0 : 1;
      return oa - ob || (rank[RIVER_CONFIG[a].season] || 3) - (rank[RIVER_CONFIG[b].season] || 3);
    });
    return secs[0] || '';
  }

  // The weekly conditions email. mode "steelhead": run pages from October to April (river fixed, or a river picker);
  // mode "any": the homepage, with river and fish pickers built from conditions-core.js.
  function buildWeekly(box, mode, river) {
    var page = location.pathname;
    var placement = box.getAttribute('data-placement') || 'end';
    var parents = mode === 'steelhead'
      ? RIVERS.filter(function (r) { return STEELHEAD_REACH[r]; })
      : Object.keys(window.RIVER_SECTIONS).filter(function (p) {
          return RIVER_SECTIONS[p].some(function (s) { var c = RIVER_CONFIG[s]; return c && c.active !== false && c.species && c.species.length; });
        }).sort();
    var what = mode === 'steelhead'
      ? 'Each week, get the best steelhead days ' + (river ? 'on ' + (/River$/.test(river) ? 'the ' : '') + esc(river) : 'on your river')
      : 'Each week, get the best days to fish your river';
    var showRun = mode === 'steelhead';
    var showOutlook = mode === 'any' && !lsGet('hff_sub_outlook');
    box.innerHTML = '<div class="lbl">Stop guessing</div>' +
      '<p>' + what + ', with where to stand and what to bring.</p>' +
      '<p class="how">' + HOW + '</p>' +
      '<form novalidate>' +
      (river ? '' : '<select aria-label="River" class="r" required><option value="">Choose your river</option>' +
        parents.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select>') +
      (mode === 'any' ? '<select aria-label="Fish" class="f" required><option value="">Fish</option></select>' : '') +
      '<input type="email" placeholder="your@email.com" autocomplete="email" aria-label="Email" required>' +
      '<button type="submit">Send me the best days</button></form>' +
      (showRun ? '<label class="opt"><input type="checkbox"> Also send run alerts</label>' : '') +
      (showOutlook ? '<label class="opt"><input type="checkbox"> Also send the monthly outlook</label>' : '') +
      '<p class="small">' + FINE + '</p><p class="msg" role="status"></p>';
    observeSeen(box, page, 'weekly', placement);
    var form = box.querySelector('form'), email = box.querySelector('input[type=email]');
    var rSel = box.querySelector('select.r'), fSel = box.querySelector('select.f');
    var cb = box.querySelector('.opt input'), btn = box.querySelector('button'), msg = box.querySelector('.msg');
    if (rSel && fSel) rSel.addEventListener('change', function () {
      var seen = {}, list = [];
      (RIVER_SECTIONS[rSel.value] || []).forEach(function (s) {
        var c = RIVER_CONFIG[s];
        if (c && c.active !== false) (c.species || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; list.push(n); } });
      });
      fSel.innerHTML = '<option value="">Fish</option>' + list.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.className = 'msg'; msg.textContent = '';
      var r = rSel ? rSel.value : river;
      if (!r) { msg.className = 'msg err'; msg.textContent = 'Pick a river first.'; rSel.focus(); return; }
      var sp = mode === 'steelhead' ? 'Steelhead' : (fSel && fSel.value);
      if (!sp) { msg.className = 'msg err'; msg.textContent = 'Pick a fish.'; fSel.focus(); return; }
      var section = mode === 'steelhead' ? STEELHEAD_REACH[r] : pickSection(r, sp);
      var v = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { msg.className = 'msg err'; msg.textContent = 'Check the email address.'; email.focus(); return; }
      var run = !!(showRun && cb && cb.checked), outlook = !!(showOutlook && cb && cb.checked);
      var offer = 'weekly' + (run ? '+run' : '') + (outlook ? '+outlook' : '');
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Saving\u2026';
      // Ticking run alerts sends kind "run" with the weekly reach attached; the Worker saves both.
      var body = { email: v, kind: run ? 'run' : 'weekly', source: 'page:' + page, outlook: outlook,
        weekly: { section: section, species: sp } };
      if (run) body.river = r;
      fetch(PROXY + '/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (d) {
            if (!res.ok || !d || d.ok !== true) throw new Error('subscribe ' + res.status);
          });
        })
        .then(function () {
          lsSet('hff_sub_weekly:' + section + ':' + sp, '1');
          if (run) lsSet('hff_sub_run:' + r, '1');
          if (outlook) lsSet('hff_sub_outlook', '1');
          track('Email Signup', { page: page, offer: offer, river: r, species: sp, placement: placement });
          form.style.display = 'none';
          var opt = box.querySelector('.opt'); if (opt) opt.style.display = 'none';
          msg.textContent = 'Done. Check your inbox for a confirmation.';
        })
        .catch(function (err) {
          track('Email Signup Failed', { page: page, offer: offer, placement: placement, reason: String(err && err.message || 'network').slice(0, 60) });
          btn.disabled = false; btn.textContent = label;
          msg.className = 'msg err'; msg.textContent = 'Something went wrong and your email wasn\u2019t saved. Please try again.';
        });
    });
  }

  function build(box) {
    var dk = box.getAttribute('data-kind');
    var river = box.getAttribute('data-river') || '';
    if (river && RIVERS.indexOf(river) === -1) river = '';
    if (dk === 'weekly' && window.RIVER_SECTIONS && window.RIVER_CONFIG) return buildWeekly(box, 'any', '');
    if (dk === 'run' && STEELHEAD_MONTHS.indexOf(new Date().getMonth()) !== -1 && (!river || STEELHEAD_REACH[river])) {
      return buildWeekly(box, 'steelhead', river);
    }
    var kind = dk === 'run' ? 'run' : 'outlook';
    var page = location.pathname;
    var placement = box.getAttribute('data-placement') || 'end';
    var html;
    if (kind === 'run') {
      html = '<div class="lbl">Run alerts</div>' +
        '<p>Get an email when salmon or steelhead are running' + (river ? ' on the ' + esc(river) : ' on the river you fish') +
        '. Each alert is checked by an angler before it goes out.</p>' +
        '<form novalidate>' +
        (river ? '' : '<select aria-label="River" required><option value="">Choose a river</option>' +
          RIVERS.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select>') +
        '<input type="email" placeholder="your@email.com" autocomplete="email" aria-label="Email" required>' +
        '<button type="submit">Alert me</button></form>' +
        (lsGet('hff_sub_outlook') ? '' : '<label class="opt"><input type="checkbox"> Also send the monthly outlook</label>') +
        '<p class="small">Free, no account. One click to unsubscribe.</p><p class="msg" role="status"></p>';
    } else {
      html = '<div class="lbl">Monthly outlook</div>' +
        '<p>Once a month: what the forecast means for Ontario’s trout and salmon rivers, plus the season openers and closures coming up.</p>' +
        '<form novalidate><input type="email" placeholder="your@email.com" autocomplete="email" aria-label="Email" required>' +
        '<button type="submit">Sign me up</button></form>' +
        '<p class="small">Free, no account. One click to unsubscribe.</p><p class="msg" role="status"></p>';
    }
    box.innerHTML = html;
    observeSeen(box, page, kind, placement);
    var form = box.querySelector('form');
    var email = box.querySelector('input[type=email]');
    var sel = box.querySelector('select');
    var cb = box.querySelector('.opt input');
    var btn = box.querySelector('button');
    var msg = box.querySelector('.msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.className = 'msg'; msg.textContent = '';
      var r = sel ? sel.value : river;
      if (kind === 'run' && !r) { msg.className = 'msg err'; msg.textContent = 'Pick a river first.'; sel.focus(); return; }
      var v = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { msg.className = 'msg err'; msg.textContent = 'Check the email address.'; email.focus(); return; }
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Saving…';
      var body = { email: v, kind: kind, source: 'page:' + page, outlook: !!(cb && cb.checked) };
      if (kind === 'run') body.river = r;
      fetch(PROXY + '/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (d) {
            if (!res.ok || !d || d.ok !== true) throw new Error('subscribe ' + res.status);
          });
        })
        .then(function () {
          if (kind === 'outlook' || body.outlook) lsSet('hff_sub_outlook', '1');
          if (kind === 'run') lsSet('hff_sub_run:' + r, '1');
          track('Email Signup', { page: page, offer: kind, river: r || 'none', placement: placement });
          form.style.display = 'none';
          var opt = box.querySelector('.opt'); if (opt) opt.style.display = 'none';
          msg.textContent = 'Done. Check your inbox for a confirmation.';
        })
        .catch(function (err) {
          track('Email Signup Failed', { page: page, offer: kind, placement: placement, reason: String(err && err.message || 'network').slice(0, 60) });
          btn.disabled = false; btn.textContent = label;
          msg.className = 'msg err'; msg.textContent = 'Something went wrong and your email wasn’t saved. Please try again.';
        });
    });
  }

  function init() {
    var boxes = document.querySelectorAll('.hff-signup');
    if (!boxes.length) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    // One ask per page: only the first box is used.
    build(boxes[0]);
    for (var i = 1; i < boxes.length; i++) boxes[i].remove();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
