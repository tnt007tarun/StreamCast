# streamcast-proxy Worker

The app's API at `streamcast-proxy.tnt-tarun.workers.dev` (also `proxy.herefishyfishy.ca`).
Cloudflare Pages does not deploy this folder; it is deployed on its own.

| Route | What it does |
|---|---|
| `/flow?station=` | Latest Water Survey of Canada discharge and trend (5 min cache) |
| `/lake-temps` | Nearshore lake temperature by zone from NDBC buoys (1 h cache) |
| `/stocking` | MNRF stocking records by river (24 h cache) |
| `/subscribe` | POST `{email, rivers, species, source}`. Saves to KV, adds to Resend, sends the welcome email. Returns `{ok:true}` only on success |
| `/unsubscribe` | POST `{e, t}` (site page) or one-click POST with `?e=&t=` (Gmail, Apple Mail). Marks the KV record and the Resend contact unsubscribed. GET redirects to `/unsubscribe/` on the site |
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
