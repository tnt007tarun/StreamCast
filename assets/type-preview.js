/* TYPE PREVIEW ONLY (never merge). ?type=current|inter|serif, remembered on this browser, with a small switch bottom left. */
(function () {
  var KEY = 'hff_type', v = null;
  try { var q = new URLSearchParams(location.search).get('type'); if (q) localStorage.setItem(KEY, q); v = localStorage.getItem(KEY); } catch (e) {}
  if (v !== 'inter' && v !== 'serif') v = 'current';
  var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/type-preview.css'; document.head.appendChild(l);
  function apply() { if (v === 'current') document.documentElement.removeAttribute('data-type'); else document.documentElement.setAttribute('data-type', v); }
  apply();
  var box = document.createElement('div'); box.id = 'tp-switch'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Type preview');
  [['current', 'Current'], ['inter', 'Inter'], ['serif', 'Serif']].forEach(function (o) {
    var b = document.createElement('button'); b.textContent = o[1]; b.setAttribute('aria-pressed', o[0] === v);
    b.onclick = function () { v = o[0]; try { localStorage.setItem(KEY, v); } catch (e) {} apply(); Array.prototype.forEach.call(box.children, function (c, i) { c.setAttribute('aria-pressed', ['current', 'inter', 'serif'][i] === v); }); };
    box.appendChild(b);
  });
  function add() { document.body.appendChild(box); }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
