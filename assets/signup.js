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
  // River and fish chips (TJ, 2026-11-03): a whole river, up to 3, and any fish on them. Also used by /weekly/.
  var PICKER_CSS = '.hff-pick{margin:0 0 .75rem}.hff-pick .plbl{display:block;font:600 .68rem/1 Inter,system-ui,-apple-system,sans-serif;' +
    'letter-spacing:.12em;text-transform:uppercase;color:#1e7a6e;margin:0 0 .45rem}' +
    '.hff-pick .plbl span{text-transform:none;letter-spacing:0;font-weight:400;color:#6b7d86}' +
    '.hff-chips{display:flex;flex-wrap:wrap;gap:.4rem}' +
    '.hff-chip{min-height:38px;padding:.4rem .8rem;border:1px solid #c9d6d2;border-radius:999px;background:#fff;color:#1a2e3a;' +
    'font:500 .9rem/1.2 Inter,system-ui,-apple-system,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.hff-chip[aria-pressed=true]{background:#1e7a6e;border-color:#1e7a6e;color:#fff}' +
    '.hff-chip[aria-pressed=true]::before{content:"\\2713\\00a0"}' +
    '.hff-chip.more{border-style:dashed;color:#1e7a6e;font-weight:600}' +
    '.hff-pick .pnote{font-size:.8rem;color:#a63d2f;margin:.35rem 0 0;min-height:0}';
  var MAX_RIVERS = 3;
  // Shown first, most used first (Umami app river picks, Sep to Oct 2026); the rest sit behind "More rivers" (TJ, 2026-11-03).
  var TOP_RIVERS = ['Credit River', 'Humber River', 'Bronte Creek', 'Bowmanville Creek', 'Ganaraska River', 'Duffins Creek',
    'Rouge River', 'Sixteen Mile Creek'];
  var FISH_ORDER = ['Steelhead', 'Chinook Salmon', 'Coho Salmon', 'Brown Trout', 'Rainbow Trout', 'Brook Trout'];
  function chipName(r) { return r.replace(/ River$/, ''); }
  function riverFish(r) {
    var seen = {};
    ((window.RIVER_SECTIONS || {})[r] || []).forEach(function (s) {
      var c = window.RIVER_CONFIG && RIVER_CONFIG[s];
      if (c && c.active !== false) (c.species || []).forEach(function (n) { seen[n] = 1; });
    });
    return FISH_ORDER.filter(function (n) { return seen[n]; });
  }
  // Builds the two chip groups into `el`. opts: {rivers: [...], species: [...]} to preselect.
  // Returns {pairs(): [{river, species}], rivers(), species(), error()} where error() is '' when the picks are usable.
  function weeklyPicker(el, opts) {
    opts = opts || {};
    var all = Object.keys(window.RIVER_SECTIONS || {}).filter(function (r) { return riverFish(r).length; }).sort();
    var selR = (opts.rivers || []).filter(function (r) { return all.indexOf(r) !== -1; }).slice(0, MAX_RIVERS);
    var selF = (opts.species || []).filter(function (n) { return FISH_ORDER.indexOf(n) !== -1; });
    var top = TOP_RIVERS.filter(function (r) { return all.indexOf(r) !== -1; });
    var rest = all.filter(function (r) { return top.indexOf(r) === -1; });
    // Open the full list when a prefilled river is one of the others.
    var showAll = !top.length || selR.some(function (r) { return top.indexOf(r) === -1; });
    el.innerHTML = '<div class="hff-pick"><span class="plbl">Rivers <span>(up to ' + MAX_RIVERS + ')</span></span>' +
      '<div class="hff-chips r" role="group" aria-label="Rivers"></div><p class="pnote rn" hidden></p></div>' +
      '<div class="hff-pick"><span class="plbl">Fish</span><div class="hff-chips f" role="group" aria-label="Fish"></div></div>';
    var rBox = el.querySelector('.hff-chips.r'), fBox = el.querySelector('.hff-chips.f'), note = el.querySelector('.rn');
    function chip(label, value, on) {
      return '<button type="button" class="hff-chip" data-v="' + esc(value) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
    }
    function fishOffered() {
      var src = selR.length ? selR : all, seen = {};
      src.forEach(function (r) { riverFish(r).forEach(function (n) { seen[n] = 1; }); });
      return FISH_ORDER.filter(function (n) { return seen[n]; });
    }
    function draw() {
      var shown = showAll ? top.concat(rest) : top;
      rBox.innerHTML = shown.map(function (r) { return chip(chipName(r), r, selR.indexOf(r) !== -1); }).join('') +
        (showAll || !rest.length ? '' : '<button type="button" class="hff-chip more" aria-expanded="false">More rivers (' + rest.length + ')</button>');
      var offered = fishOffered();
      selF = selF.filter(function (n) { return offered.indexOf(n) !== -1; });
      fBox.innerHTML = offered.map(function (n) { return chip(n, n, selF.indexOf(n) !== -1); }).join('');
    }
    rBox.addEventListener('click', function (e) {
      var b = e.target.closest('.hff-chip'); if (!b) return;
      if (b.classList.contains('more')) { showAll = true; draw(); var nx = rBox.querySelectorAll('.hff-chip')[top.length]; if (nx) nx.focus(); return; }
      var v = b.getAttribute('data-v'), i = selR.indexOf(v);
      note.hidden = true;
      if (i !== -1) selR.splice(i, 1);
      else if (selR.length >= MAX_RIVERS) { note.textContent = 'Up to ' + MAX_RIVERS + ' rivers. Tap one to remove it first.'; note.hidden = false; return; }
      else selR.push(v);
      draw();
    });
    fBox.addEventListener('click', function (e) {
      var b = e.target.closest('.hff-chip'); if (!b) return;
      var v = b.getAttribute('data-v'), i = selF.indexOf(v);
      if (i !== -1) selF.splice(i, 1); else selF.push(v);
      b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
    });
    draw();
    function pairs() {
      var out = [];
      selR.forEach(function (r) { var fish = riverFish(r); selF.forEach(function (n) { if (fish.indexOf(n) !== -1) out.push({ river: r, species: n }); }); });
      return out;
    }
    return {
      pairs: pairs,
      rivers: function () { return selR.slice(); },
      species: function () { return selF.slice(); },
      error: function () {
        if (!selR.length) return 'Pick at least one river.';
        if (!selF.length) return 'Pick at least one fish.';
        if (!pairs().length) return 'None of those fish are on the rivers you picked.';
        return '';
      }
    };
  }
  window.HFF_weeklyPicker = function (el, opts) {
    if (!document.getElementById('hff-pick-css')) { var st = document.createElement('style'); st.id = 'hff-pick-css'; st.textContent = PICKER_CSS; document.head.appendChild(st); }
    return weeklyPicker(el, opts);
  };

  var HOW = 'Picked from live river flow and the week\u2019s rain, temperature and cloud forecast.';
  var FINE = 'Only sent when there\u2019s a good day. Free, no account, unsubscribe anytime.';
  var CSS = '.hff-signup{margin:2.2rem 0 1rem;padding:1.1rem 1.15rem 1.15rem;background:#eef5f3;border-radius:10px;' +
    'font:400 .95rem/1.45 Inter,system-ui,-apple-system,sans-serif;color:#31414c}' +
    '.hff-signup .lbl{font-weight:600;font-size:.68rem;line-height:1;letter-spacing:.13em;text-transform:uppercase;color:#1e7a6e;margin-bottom:.55rem}' +
    '.hff-signup p{margin:0 0 .8rem}' +
    '.hff-signup form{display:flex;flex-wrap:wrap;gap:.5rem}' +
    '.hff-signup input[type=email],.hff-signup select{flex:1 1 200px;min-width:0;min-height:44px;padding:.5rem .75rem;border:1px solid #c9d6d2;' +
    'border-radius:8px;background:#fff;font:inherit;color:#1a2e3a}' +
    '.hff-signup button[type=submit]{min-height:44px;padding:.5rem 1.1rem;border:0;border-radius:8px;background:#1e7a6e;color:#fff;font:600 .95rem/1 inherit;cursor:pointer}' +
    '.hff-signup button[type=submit]:disabled{opacity:.6;cursor:default}' +
    '.hff-signup .opt{display:flex;align-items:center;gap:.45rem;margin-top:.6rem;font-size:.85rem;cursor:pointer}' +
    '.hff-signup .opt input{width:16px;height:16px;margin:0;accent-color:#1e7a6e}' +
    '.hff-signup .small{font-size:.78rem;color:#6b7d86;margin:.6rem 0 0}' +
    '.hff-signup .how{font-size:.8rem;color:#6b7d86;margin:-.35rem 0 .8rem}' +
    '.hff-signup .msg{margin:.6rem 0 0;font-size:.9rem}.hff-signup .msg.err{color:#a63d2f}' +
    PICKER_CSS;

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

  // The weekly conditions email. mode "steelhead": run pages from October to April (river fixed, or a river picker);
  // mode "any": the homepage, with river and fish chips (weeklyPicker, whole rivers, up to 3).
  function buildWeekly(box, mode, river) {
    var page = location.pathname;
    var placement = box.getAttribute('data-placement') || 'end';
    var parents = RIVERS.filter(function (r) { return STEELHEAD_REACH[r]; });
    var what = mode === 'steelhead'
      ? 'Each week, get the best steelhead days ' + (river ? 'on ' + (/River$/.test(river) ? 'the ' : '') + esc(river) : 'on your river')
      : 'Each week, get the best days to fish your river';
    var showRun = mode === 'steelhead';
    var showOutlook = mode === 'any' && !lsGet('hff_sub_outlook');
    box.innerHTML = '<div class="lbl">Stop guessing</div>' +
      '<p>' + what + ', with where to stand and what to bring.</p>' +
      '<p class="how">' + HOW + '</p>' +
      (mode === 'any' ? '<div class="pk"></div>' : '') +
      '<form novalidate>' +
      (river || mode === 'any' ? '' : '<select aria-label="River" class="r" required><option value="">Choose your river</option>' +
        parents.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select>') +
      '<input type="email" placeholder="your@email.com" autocomplete="email" aria-label="Email" required>' +
      '<button type="submit">Send me the best days</button></form>' +
      (showRun ? '<label class="opt"><input type="checkbox"> Also send run alerts</label>' : '') +
      (showOutlook ? '<label class="opt"><input type="checkbox"> Also send the monthly outlook</label>' : '') +
      '<p class="small">' + FINE + '</p><p class="msg" role="status"></p>';
    observeSeen(box, page, 'weekly', placement);
    var form = box.querySelector('form'), email = box.querySelector('input[type=email]');
    var rSel = box.querySelector('select.r');
    var cb = box.querySelector('.opt input'), btn = box.querySelector('button[type=submit]'), msg = box.querySelector('.msg');
    var picker = mode === 'any' ? weeklyPicker(box.querySelector('.pk')) : null;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.className = 'msg'; msg.textContent = '';
      var r, sp, weekly;
      if (picker) {
        var perr = picker.error();
        if (perr) { msg.className = 'msg err'; msg.textContent = perr; return; }
        weekly = picker.pairs();
        r = picker.rivers().join(', '); sp = picker.species().join(', ');
      } else {
        r = rSel ? rSel.value : river;
        if (!r) { msg.className = 'msg err'; msg.textContent = 'Pick a river first.'; rSel.focus(); return; }
        sp = 'Steelhead';
        weekly = { section: STEELHEAD_REACH[r], species: sp };
      }
      var v = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { msg.className = 'msg err'; msg.textContent = 'Check the email address.'; email.focus(); return; }
      var run = !!(showRun && cb && cb.checked), outlook = !!(showOutlook && cb && cb.checked);
      var offer = 'weekly' + (run ? '+run' : '') + (outlook ? '+outlook' : '');
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Saving\u2026';
      // Ticking run alerts sends kind "run" with the weekly reach attached; the Worker saves both.
      var body = { email: v, kind: run ? 'run' : 'weekly', source: 'page:' + page, outlook: outlook,
        weekly: weekly };
      if (run) body.river = r;
      fetch(PROXY + '/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (d) {
            if (!res.ok || !d || d.ok !== true) throw new Error('subscribe ' + res.status);
          });
        })
        .then(function () {
          (Array.isArray(weekly) ? weekly : [weekly]).forEach(function (w) { lsSet('hff_sub_weekly:' + (w.river || w.section) + ':' + w.species, '1'); });
          if (run) lsSet('hff_sub_run:' + r, '1');
          if (outlook) lsSet('hff_sub_outlook', '1');
          track('Email Signup', { page: page, offer: offer, river: r, species: sp, placement: placement });
          form.style.display = 'none';
          var opt = box.querySelector('.opt'); if (opt) opt.style.display = 'none';
          var pk = box.querySelector('.pk'); if (pk) pk.style.display = 'none';
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
        '<p>Get an email when ' + (river && !STEELHEAD_REACH[river] ? 'salmon are' : 'salmon or steelhead are') + ' running' + (river ? ' on the ' + esc(river) : ' on the river you fish') +
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


  // How far people scroll (TJ, 2026-11-03): one Umami "Scroll Depth {page, depth}" at 25, 50, 75 and 100 percent of the
  // page, once each per page view. Not on the homepage (the app). Read with Signup Box Seen to see where readers stop.
  function trackScrollDepth() {
    if (location.pathname === '/' || location.pathname === '/weekly/' || !('addEventListener' in window)) return;
    var marks = [25, 50, 75, 100], sent = {}, ticking = false;
    function check() {
      ticking = false;
      var doc = document.documentElement, total = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
      if (!total) return;
      var pct = ((window.pageYOffset || doc.scrollTop || 0) + window.innerHeight) / total * 100;
      marks.forEach(function (m) {
        if (!sent[m] && pct >= (m === 100 ? 98 : m)) { sent[m] = 1; track('Scroll Depth', { page: location.pathname, depth: m }); }
      });
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(check); } }, { passive: true });
    check();
  }

  function init() {
    trackScrollDepth();
    var boxes = document.querySelectorAll('.hff-signup');
    if (!boxes.length) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    // One ask per page: only the first box is used.
    build(boxes[0]);
    for (var i = 1; i < boxes.length; i++) boxes[i].remove();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
