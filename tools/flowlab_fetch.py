# One-off data pull for the flow-forecast research (2026-10-24). Runs in GitHub Actions only.
import json, urllib.request, urllib.parse, os, time
OUT = 'data/flowlab'; os.makedirs(OUT, exist_ok=True)
PTS = {'upper': (43.90, -80.08), 'mid': (43.74, -79.93), 'lower': (43.62, -79.75)}
def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r: return json.load(r)
        except Exception as e:
            print('retry', i, url[:120], e); time.sleep(10 * (i + 1))
    raise SystemExit('failed ' + url)
def save(name, obj):
    with open(f'{OUT}/{name}.json', 'w') as f: json.dump(obj, f)
    print('saved', name)
lat = ','.join(str(p[0]) for p in PTS.values()); lon = ','.join(str(p[1]) for p in PTS.values())
# 1. ERA5 daily weather, 2015 to yesterday
q = dict(latitude=lat, longitude=lon, start_date='2015-01-01', end_date='2026-10-23', timezone='America/Toronto',
         daily='precipitation_sum,rain_sum,snowfall_sum,temperature_2m_mean,temperature_2m_max')
save('era5_daily', get('https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(q)))
# 2. Forecasts as issued, 1 to 7 days ahead (hourly precip by lead day), 2024 onward
hv = ','.join(['precipitation'] + [f'precipitation_previous_day{d}' for d in range(1, 8)])
for y0, y1 in [('2024-01-01', '2024-12-31'), ('2025-01-01', '2025-12-31'), ('2026-01-01', '2026-10-23')]:
    q = dict(latitude=lat, longitude=lon, start_date=y0, end_date=y1, timezone='America/Toronto', hourly=hv)
    save('prevruns_' + y0[:4], get('https://previous-runs-api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(q)))
# 3. GloFAS river discharge (reanalysis + forecast), 3x3 cells around each gauge
G = {'02HB029': (43.583, -79.713), '02HB001': (43.828, -80.017)}
for st, (la, lo) in G.items():
    las, los = [], []
    for dy in (-0.05, 0, 0.05):
        for dx in (-0.05, 0, 0.05):
            las.append(round(la + dy, 3)); los.append(round(lo + dx, 3))
    q = dict(latitude=','.join(map(str, las)), longitude=','.join(map(str, los)), daily='river_discharge',
             start_date='2015-01-01', end_date='2026-10-31')
    save('glofas_' + st, get('https://flood-api.open-meteo.com/v1/flood?' + urllib.parse.urlencode(q)))
# 4. Gauge metadata
for st in G:
    save('station_' + st, get('https://api.weather.gc.ca/collections/hydrometric-stations/items?f=json&STATION_NUMBER=' + st))
