# Throwaway: checks the API calls worker/flowforecast.js makes, from outside the cloud sandbox.
import json, urllib.request, urllib.parse, datetime
out = {}
since = (datetime.datetime.utcnow() - datetime.timedelta(hours=97)).strftime('%Y-%m-%dT%H:%M:%SZ')
for name, q in {'with_props': dict(STATION_NUMBER='02HB029', datetime=since + '/..', limit='2000', f='json', properties='DATETIME,DISCHARGE'),
                'no_props': dict(STATION_NUMBER='02HB029', datetime=since + '/..', limit='2000', f='json')}.items():
    u = 'https://api.weather.gc.ca/collections/hydrometric-realtime/items?' + urllib.parse.urlencode(q)
    try:
        j = json.load(urllib.request.urlopen(u, timeout=60)); f = j.get('features', [])
        out[name] = dict(n=len(f), first=f[0]['properties'] if f else None, last=f[-1]['properties'] if f else None, matched=j.get('numberMatched'))
    except Exception as e:
        out[name] = 'error ' + str(e)
u = 'https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(dict(latitude='43.9,43.74', longitude='-80.08,-79.93',
    daily='precipitation_sum,temperature_2m_mean', past_days='92', forecast_days='8', timezone='America/Toronto'))
try:
    j = json.load(urllib.request.urlopen(u, timeout=60))
    out['openmeteo'] = dict(kind=type(j).__name__, n=len(j), days=len(j[0]['daily']['time']), first=j[0]['daily']['time'][0], last=j[0]['daily']['time'][-1])
except Exception as e:
    out['openmeteo'] = 'error ' + str(e)
json.dump(out, open('data/flowlab/check.json', 'w'), indent=1)
print(json.dumps(out, indent=1))
