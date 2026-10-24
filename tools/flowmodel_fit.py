# Fits the flow forecast (worker/flowforecast.js) for every gauge the app uses and writes
# worker/flowmodel.json. Refit once a year. Inputs (not in the repo, see CLAUDE.md "Flow forecast"):
#   FLOW_DIR/q_<gauge>.csv     daily mean flow, Water Office daily_data CSV (2015 to last year)
#   FLOW_DIR/d26_<gauge>.csv   daily means of this year's real-time readings (date,q)
#   WX_DIR/era5_<point>.json   Open-Meteo archive, daily precipitation_sum and temperature_2m_mean
#   WX_DIR/prev_<point>.json   Open-Meteo previous-runs API, hourly precipitation_previous_day1..7
# Method (project doc claude/flow-forecast-research-2026-10-24.md): ridge regression in log flow, one
# model per lead day, trained on actual (ERA5) rain to 2023-12-31. The 80% range comes from errors in
# 2025 to 2026 with the rain forecast as it was issued, widened by 10%, with a separate range for dry forecasts. A gauge's lead day is kept only
# when it beats "flow stays as it is" on that test.
import json, sys, os
import numpy as np, pandas as pd
from sklearn.linear_model import Ridge

FLOW_DIR, WX_DIR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
EPS, DDF, DECAY = 0.05, 3.0, 0.9
DRY_MM = 3.0   # same constant as DRY_MM in worker/flowforecast.js
TRAIN_END, TEST_START = '2023-12-31', '2025-01-10'
COLS = ['lq0', 'dq1', 'dq3', 'w0', 'wm1', 'api', 'swe', 'ms', 'mc', 'fsum', 'fh', 'fh1', 'fh2', 'fmax', 'fsum_wet', 'fmax_wet']

# Weather points inside each gauge's catchment (upstream of the gauge). Same names as tools/flowlab_fetch.py.
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
GAUGE_PTS = {
  '02GA016': ['grand_a', 'grand_b'], '02HB001': ['credit_up'], '02HB025': ['credit_up', 'credit_mid'],
  '02HB029': ['credit_up', 'credit_mid', 'credit_low'], '02HB011': ['bronte_a', 'bronte_b'], '02HB022': ['bronte_b'],
  '02HC025': ['humber_a', 'humber_b'], '02HC003': ['humber_a', 'humber_b', 'humber_c'], '02HC047': ['humber_pal'],
  '02ED026': ['notta_hock'], '02ED003': ['notta_hock', 'notta_b', 'notta_c'], '02ED101': ['notta_hock', 'notta_b'],
  '02HC049': ['duffins'], '02HD012': ['ganaraska'], '02HD003': ['ganaraska_up'], '02FB009': ['beaver_a', 'beaver_b'],
  '02FB013': ['beaver_b'], '02FC016': ['saugeen_up'], '02HB005': ['sixteen'], '02HC022': ['rouge'],
  '02HD009': ['wilmot'], '02HD021': ['wilmot_up'], '02HD006': ['bowman'], '02GA040': ['speed'], '02GA029': ['eramosa'],
  '02HC024': ['don'], '02HC027': ['black'],
}

def era5(k):
    d = json.load(open(f'{WX_DIR}/era5_{k}.json'))['daily']
    df = pd.DataFrame(d); df.index = pd.to_datetime(df.pop('time')); return df

def prev(k):
    h = json.load(open(f'{WX_DIR}/prev_{k}.json'))['hourly']
    df = pd.DataFrame(h); df.index = pd.to_datetime(df.pop('time'))
    return df.resample('D').sum(min_count=20)

def flow(st):
    a = pd.read_csv(f'{FLOW_DIR}/q_{st}.csv', encoding='utf-8-sig')
    s = pd.Series(a.iloc[:, 3].astype(float).values, index=pd.to_datetime(a.iloc[:, 1]))
    p = f'{FLOW_DIR}/d26_{st}.csv'
    if os.path.exists(p):
        b = pd.read_csv(p); t = pd.to_datetime(b.iloc[:, 0].str[:10])
        s = pd.concat([s, pd.Series(b.q.values, index=t)])
    s = s[~s.index.duplicated(keep='first')].sort_index()
    return s.asfreq('D')

def snow_split(p, t):
    swe = 0.0; w = np.zeros(len(p)); sw = np.zeros(len(p))
    for i in range(len(p)):
        pi = 0.0 if np.isnan(p[i]) else p[i]; ti = 0.0 if np.isnan(t[i]) else t[i]
        rain = pi
        if ti <= 0: swe += pi; rain = 0.0
        melt = min(swe, DDF * max(ti, 0)); swe -= melt
        w[i] = rain + melt; sw[i] = swe
    return w, sw

def table(st):
    pts = GAUGE_PTS[st]
    e = [era5(k) for k in pts]
    df = pd.DataFrame({'q': flow(st)})
    df['p'] = sum(x.precipitation_sum for x in e) / len(e)
    df['t'] = sum(x.temperature_2m_mean for x in e) / len(e)
    pv = [prev(k) for k in pts]
    for k in range(1, 8):
        df[f'fp{k}'] = sum(x[f'precipitation_previous_day{k}'] for x in pv) / len(pv)
    df = df.loc['2016-01-01':].copy()
    df['w'], df['swe'] = snow_split(df.p.values, df.t.values)
    a = 0.0; api = []
    for x in df.w.values: a = a * DECAY + x; api.append(a)
    df['api'] = api
    df['lq'] = np.log(df.q + EPS)
    return df

def features(df, h, rain):
    X = pd.DataFrame(index=df.index)
    X['lq0'] = df.lq; X['dq1'] = df.lq - df.lq.shift(1); X['dq3'] = df.lq - df.lq.shift(3)
    X['w0'] = df.w; X['wm1'] = df.w.shift(1); X['api'] = df.api; X['swe'] = df.swe
    doy = df.index.dayofyear; X['ms'] = np.sin(2 * np.pi * doy / 365); X['mc'] = np.cos(2 * np.pi * doy / 365)
    fut = []
    for k in range(1, h + 1):
        if rain == 'actual':
            fut.append(df.w.shift(-k))
        else:   # forecast precip issued k days before day t0+k, plus that day's ERA5 snowmelt
            pk = df[f'fp{k}'].shift(-k); tk = df.t.shift(-k)
            melt = (df.w.shift(-k) - df.p.shift(-k).where(tk > 0, 0)).clip(lower=0)
            fut.append(pk.where(tk > 0, 0) + melt)
    F = pd.concat(fut, axis=1); F.columns = range(1, h + 1)
    X['fsum'] = F.sum(axis=1); X['fh'] = F[h]
    X['fh1'] = F[h - 1] if h > 1 else X.w0
    X['fh2'] = F[h - 2] if h > 2 else (X.w0 if h == 2 else X.wm1)
    X['fmax'] = F.max(axis=1)
    X['fsum_wet'] = X.fsum * X.api / 50; X['fmax_wet'] = X.fmax * X.api / 50
    y = df.lq.shift(-h) - df.lq
    return X[COLS], y

def fit_gauge(st):
    df = table(st); leads = {}; report = []
    for h in range(1, 8):
        X, y = features(df, h, 'actual')
        ok = X.notna().all(axis=1) & y.notna()
        tr = X.index[ok & (X.index <= TRAIN_END)]
        m = Ridge(1.0).fit(X.loc[tr], y.loc[tr])
        Xf, yf = features(df, h, 'forecast')
        okf = Xf.notna().all(axis=1) & yf.notna()
        te = Xf.index[okf & (Xf.index >= TEST_START)]
        res = yf.loc[te] - m.predict(Xf.loc[te])
        err_model = np.median(np.abs(res)); err_persist = np.median(np.abs(yf.loc[te]))
        lo, hi = np.quantile(res, 0.10) * 1.1, np.quantile(res, 0.90) * 1.1
        # A dry forecast (under DRY_MM of rain plus melt to the target day) gets its own, tighter range
        dry = (Xf.loc[te, 'fsum'] < DRY_MM).values
        dlo, dhi = (np.quantile(res[dry], 0.10) * 1.1, np.quantile(res[dry], 0.90) * 1.1) if dry.sum() >= 60 else (lo, hi)
        # refit on everything up to the test period's end with actual rain for the shipped coefficients
        tr_all = X.index[ok]
        m2 = Ridge(1.0).fit(X.loc[tr_all], y.loc[tr_all])
        keep = err_model < err_persist
        report.append(dict(st=st, h=h, n_train=len(tr), n_test=len(te), med_err=round(np.exp(err_model) - 1, 3),
                           med_err_persist=round(np.exp(err_persist) - 1, 3), lo=round(lo, 3), hi=round(hi, 3), dry_hi=round(dhi, 3), n_dry=int(dry.sum()), keep=keep))
        if keep:
            leads[str(h)] = dict(cols=COLS, coef=[round(float(c), 6) for c in m2.coef_], intercept=round(float(m2.intercept_), 6),
                                 lo=round(float(lo), 4), hi=round(float(hi), 4), dryLo=round(float(dlo), 4), dryHi=round(float(dhi), 4), medErr=round(float(np.exp(err_model) - 1), 3))
        else:
            break   # later leads only get worse; stop at the first lead that loses to persistence
    return leads, report

if __name__ == '__main__':
    model = {'version': pd.Timestamp.today().strftime('%Y-%m-%d'), 'eps': EPS, 'gauges': {}}
    rep = []
    for st in GAUGE_PTS:
        leads, r = fit_gauge(st); rep += r
        if leads:
            model['gauges'][st] = {'points': [list(PTS[k]) for k in GAUGE_PTS[st]], 'leads': leads}
    json.dump(model, open(OUT, 'w'), separators=(',', ':'))
    pd.set_option('display.width', 200); pd.set_option('display.max_rows', 400)
    print(pd.DataFrame(rep).to_string(index=False))
