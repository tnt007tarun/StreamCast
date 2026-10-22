// One signup box per guide or river page (TJ, 2026-10-17: never more than one ask per page).
// Usage: <div class="hff-signup" data-kind="run" data-river="Ganaraska River" data-placement="mid"></div>
//   data-placement  "mid" or "end" (default), sent with the Umami events to compare placements
//   data-kind="run"      run alerts; data-river picks the river, or leave it empty for a picker
//   data-kind="outlook"  the monthly outlook
// Posts to the Worker's /subscribe, the same endpoint as the app's notify bar.
(function () {
  var PROXY = 'https://streamcast-proxy.tnt-tarun.workers.dev';
  var RIVERS = ['Beaver River', 'Black Creek', 'Bowmanville Creek', 'Bronte Creek', 'Credit River', 'Don River', 'Duffins Creek',
    'Ganaraska River', 'Grand River', 'Humber River', 'Nottawasaga River', 'Rouge River', 'Saugeen River',
    'Sixteen Mile Creek', 'Wilmot Creek'];
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

  function build(box) {
    var kind = box.getAttribute('data-kind') === 'run' ? 'run' : 'outlook';
    var river = box.getAttribute('data-river') || '';
    if (river && RIVERS.indexOf(river) === -1) river = '';
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
        '<p class="small">One click to unsubscribe from any email.</p><p class="msg" role="status"></p>';
    } else {
      html = '<div class="lbl">Monthly outlook</div>' +
        '<p>Once a month: what the forecast means for Ontario’s trout and salmon rivers, plus the season openers and closures coming up.</p>' +
        '<form novalidate><input type="email" placeholder="your@email.com" autocomplete="email" aria-label="Email" required>' +
        '<button type="submit">Sign me up</button></form>' +
        '<p class="small">One click to unsubscribe from any email.</p><p class="msg" role="status"></p>';
    }
    box.innerHTML = html;
    // Seen = at least half the box on screen, once per page view. Signups divided by this is the
    // placement's conversion rate (compare mid-article vs end of article).
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (en) { return en.isIntersecting; })) {
          track('Signup Box Seen', { page: page, offer: kind, placement: placement });
          io.disconnect();
        }
      }, { threshold: 0.5 });
      io.observe(box);
    }
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
