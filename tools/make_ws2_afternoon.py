"""The whole afternoon of 19 Oct 2026 as one stack: every capture of the lab repository, in the order it was recorded.

Input : a clone of https://git.tami.sh/yair/ws2 (Git LFS pulled): data/memory-20261019-061349 (33 captures, ms screen)
        and data/fast-memory-20261019-062928 (40 captures, fast sweep)
Output: data/ws2-afternoon.json   for every capture the first pulse's rising edge, -100..+400 us, on a 2 us grid
                                  (volts converted with the capture's own calibration; nothing subtracted, so the
                                  drift of baseline and amplitude between captures stays in the picture)

Usage : python tools/make_ws2_afternoon.py <path to the ws2 clone> [<out dir, default: .>]
Read-only on the lab data.
"""
import glob, json, os, sys
import numpy as np

REPO = sys.argv[1] + '/'
OUT = (sys.argv[2] if len(sys.argv) > 2 else '.') + '/'
GRID = np.arange(-100, 400, 2.0)          # microseconds around the first rising edge

rows = []
for d in ('data/memory-20261019-061349', 'data/fast-memory-20261019-062928'):
    for f in sorted(glob.glob(REPO + d + '/0*.json')):
        meta = json.load(open(f))
        z = np.load(f[:-5] + '.npz')
        p1, p2 = meta['preamble1'], meta['preamble2']
        dt = p1[4]
        v1 = (z['ch1'].astype(np.float64) - p1[8] - p1[9]) * p1[7]
        v2 = (z['ch2'].astype(np.float64) - p2[8] - p2[9]) * p2[7]
        hi = v2 > 1.65
        rise = np.flatnonzero(~hi[:-1] & hi[1:]) + 1
        if len(rise) == 0:
            continue
        r = int(rise[0])
        # smooth over ~2 us, then sample on the common grid
        k = max(1, int(round(2e-6 / dt)))
        csum = np.cumsum(np.insert(v1, 0, 0.0))
        smooth = (csum[k:] - csum[:-k]) / k
        t_us = (np.arange(len(smooth)) + k / 2 - r) * dt * 1e6
        trace = np.interp(GRID, t_us, smooth) * 1e3          # mV
        rows.append({'utc': meta['utc'], 'mode': meta['mode'], 'value': meta.get('value'),
                     'dataset': os.path.basename(os.path.dirname(f)), 'mv': [round(float(x), 1) for x in trace]})
rows.sort(key=lambda x: x['utc'])
with open(OUT + 'data/ws2-afternoon.json', 'w') as fh:
    json.dump({'source': 'lab repo yair/ws2, 19 Oct 2026, first pulse of every capture, 2 us grid', 'startUs': -100, 'stepUs': 2, 'captures': rows}, fh, separators=(',', ':'))
print(len(rows), 'captures,', rows[0]['utc'], 'to', rows[-1]['utc'])
