# streamcast-proxy Worker

The app's API at `streamcast-proxy.tnt-tarun.workers.dev` (also `proxy.herefishyfishy.ca`).
Cloudflare Pages does not deploy this folder; it is deployed on its own.

| Route | What it does |
|---|---|
| `/flow?station=` | Latest Water Survey of Canada discharge and trend (5 min cache) |
| `/lake-temps` | Nearshore lake temperature by zone from NDBC buoys (1 h cache) |
| `/stocking` | MNRF stocking records by river (24 h cache) |
| `/subscribe` | POST `{email, kind, source, ...}`: `kind` is `outlook`, `run` (`river`, optional `weekly`), `trip` (`trip`) or `weekly` (`weekly: {section, species}`). Saves to KV, adds to Resend, sends the welcome email. Returns `{ok:true}` only on success |
| `/unsubscribe` | POST `{e, t}` (site page) or one-click POST with `?e=&t=` (Gmail, Apple Mail). Marks the KV record and the Resend contact unsubscribed. GET redirects to `/unsubscribe/` on the site |
| `/water-temps` | Live water (and air) temperature from Credit Valley Conservation's real-time stations, parsed from cvc.ca/water-quality-table/. Cached in KV `CACHE` (`wt:latest`) for 45 min |
| `/health`, `/fields` | Diagnostics |
| `/credit-river/*` | Old SSR pages, superseded by `functions/credit-river/[species].js` on Pages |

Deploy: `cd worker && npx wrangler deploy`. Always from this folder so `wrangler.toml`
supplies the bindings. Check them afterwards in the dashboard (Worker, Settings, Bindings).

Unsubscribe links are `https://herefishyfishy.ca/unsubscribe/?e=<email>&t=<token>`, where the
token is an HMAC of the email with `UNSUBSCRIBE_SECRET`. Any email sent to the list must include
one (build it with `unsubLinks()`) plus the `List-Unsubscribe` headers, and must skip KV records
with `unsubscribed: true`.

Every email footer also carries `SENDER_FOOTER` (name, mailing address, contact) for CASL.
Change the address there when it changes, and keep the old one working for 60 days.

Cron (`5 * * * *`): `logWaterTemps()` saves each CVC reading to KV `CACHE` under `wt:log:<YYYY-MM-DD>` (Toronto date),
with the last 60 days of daily mean air temperature at each Credit station (Open-Meteo), once a day. That log is what the
app's water temperature model is calibrated against. `wt:debug` holds a slice of the raw CVC HTML for checking the parser.

## Weekly conditions email (`weekly.js`)
Thursday, in the 5 pm hour Toronto time (the hourly cron checks the time; KV `CACHE` `alert:weekly:ran:<date>` stops a
second run). For each subscriber's reach and species it scores Friday to Wednesday with the app's own rules
(`../assets/conditions-core.js`, bundled by wrangler) and sends one email listing the combos with a Good or Excellent day
on open water. No good day, no email. At most one weekly email per person per 6 days (`lastWeeklyAt` on `sub:<email>`).
- Who: `weekly: [{section, species}]` on the KV record (notify bar: its own offer on trout-only rivers, a checkbox under
  run alerts elsewhere), plus old notify-bar signups with `rivers` and `species`.
- Inputs per reach: one Open-Meteo call (30 days back for the water model, 8 days ahead) and today's flow. Flow is
  today's reading for every day, as in the app; 15 mm of rain that day or the day before caps a day at Marginal.
- `ALERTS_MODE` in `wrangler.toml`: `preview` (default) emails TJ what each subscriber would get and why others get
  nothing; `live` sends. Each run logs to `CACHE` `alert:weekly:log:<date>`.
- Limits: up to 12 reaches a run (free plan: 50 outbound requests per run). Resend free plan: 100 emails a day.
- Run alerts are capped the same way: at most one per person per 6 days (`lastRunAlertAt`). Someone with run alerts
  and a weekly reach can get one of each in a week. Trip-day emails and the monthly outlook don't count.
- Checks: `node worker/weekly.test.mjs` (made-up weather and subscribers; writes `worker/.weekly-preview.html`).
