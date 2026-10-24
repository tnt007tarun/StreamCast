# Weather pull for tools/flowmodel_fit.py (first run 2026-10-24). Cloud sessions cannot reach the Open-Meteo
# archive, so run it in GitHub Actions on a throwaway branch (workflow: checkout, `python3 tools/flowmodel_fetch.py`,
# commit data/flowlab back). Points must match PTS in flowmodel_fit.py. Change end_date to yesterday before running.
# Weather points sit in each gauge's catchment (upstream of the gauge), picked by hand from the map.
# Open-Meteo counts a multi-year request as many calls (days / 14 per location) and caps 5,000 an hour
# and 10,000 a day, so this goes one point at a time, paces itself and skips files it already has.
import json, urllib.request, urllib.parse, os, time, sys
OUT = 'data/flowlab/v2'; os.makedirs(OUT, exist_ok=True)
PTS = {
  'grand_a': (43.85, -80.35), 'grand_b': (44.05, -80.40),
  'credit_up': (43.90, -80.08), 'credit_mid': (43.74, -79.93), 'credit_low': (43.62, -79.75),
  'bronte_a': (43.42, -79.92), 'bronte_b': (43.46, -80.01),
  'humber_a': (43.92, -79.75), 'humber_b': (43.88, -79.60), 'humber_c': (43.78, -79.58), 'humber_pal': (43.96, -79.88),
  'notta_hock': (44.00, -80.08), 'notta_b': (44.12, -79.88), 'notta_c': (44.12, -79.68),
  'duffins': (43.95, -79.10), 'ganaraska': (44.02, -78.38), 'ganaraska_up': (44.05, -78.46),
  'beaver_a': (44.40, -80.52), 'beaver_b': (44.25, -80.55), 'saugeen_up': (44.12, -80.70),
  'sixteen': (43.55, -79.95), 'rouge': (43.92, -79.30), 'wilmot': (43.98, -78.63), 'wilmot_up': (44.03, -78.64),
  'bowman': (43.98, -78.72), 'speed': (43.75, -80.30), 'eramosa': (43.62, -80.12), 'don': (43.80, -79.40),
  'black': (43.74, -79.52),
}
def get(url, tries=6):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r: return json.load(r)
        except Exception as e:
            body = getattr(e, 'read', lambda: b'')()[:200]
            print('retry', i, url[:100], e, body, flush=True); time.sleep(60 * (i + 1))
    return None
DAILY = 'precipitation_sum,rain_sum,snowfall_sum,temperature_2m_mean,temperature_2m_max'
HOURLY = ','.join(['precipitation'] + [f'precipitation_previous_day{d}' for d in range(1, 8)])
jobs = []
for k, (la, lo) in PTS.items():
    jobs.append((f'era5_{k}', 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(dict(
        latitude=la, longitude=lo, start_date='2016-01-01', end_date='2026-10-23', timezone='America/Toronto', daily=DAILY)), 282))
for k, (la, lo) in PTS.items():
    jobs.append((f'prev_{k}', 'https://previous-runs-api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(dict(
        latitude=la, longitude=lo, start_date='2025-01-01', end_date='2026-10-23', timezone='America/Toronto', hourly=HOURLY)), 47))
used, t0, failed = 0, time.time(), []
for name, url, weight in jobs:
    path = f'{OUT}/{name}.json'
    if os.path.exists(path): continue
    if used + weight > 4500:                      # stay under 5,000 an hour
        wait = max(0, 3700 - (time.time() - t0)); print('pausing', int(wait), 's', flush=True); time.sleep(wait)
        used, t0 = 0, time.time()
    d = get(url)
    if d is None: failed.append(name); continue
    with open(path, 'w') as f: json.dump(d, f)
    used += weight; print('saved', name, used, flush=True); time.sleep(8)
print('failed', failed)
