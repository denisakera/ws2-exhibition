"""Prepare the paired-pulse capture for the exhibition (the "two pulses" view of the Zvuk vzorku tab).

Input : a clone of https://git.tami.sh/yair/ws2 (data/fast-memory-20261019-062928, Git LFS pulled)
Output: data/ws2-pairs.json   compact curves (2 us bins) for the six gaps, 5 repeats each, and the isolated tail
        audio/ws2_pair_<gap>.wav   the isolated pulse's end, then the pair, 651x slower (32 ns samples played at 48 kHz)
        audio/ws2_pairs_sweep.wav  the six of them one after another, gap 500 us down to 10 us (the screen follows it)

Usage : python tools/make_ws2_pairs.py <path to data/fast-memory-20261019-062928> [<out dir, default: .>]
Everything is read-only on the lab data. Numbers are the recording's own: nothing is fitted.
"""
import glob, json, os, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt

SRC = sys.argv[1] + '/'
OUT = (sys.argv[2] if len(sys.argv) > 2 else '.') + '/'
DT = 32e-9
BIN = 62                       # samples per 2 us bin
GAPS = [10, 20, 50, 100, 200, 500]
PRE_US, POST_US = 30, 650      # window around the end of pulse one
os.makedirs(OUT + 'audio', exist_ok=True)
os.makedirs(OUT + 'data', exist_ok=True)


def load(name):
    meta = json.load(open(SRC + name + '.json'))
    z = np.load(SRC + name + '.npz')
    p1, p2 = meta['preamble1'], meta['preamble2']
    v1 = (z['ch1'].astype(np.float64) - p1[8] - p1[9]) * p1[7]
    v2 = (z['ch2'].astype(np.float64) - p2[8] - p2[9]) * p2[7]
    hi = v2 > 1.65
    return meta, v1, np.flatnonzero(~hi[:-1] & hi[1:]) + 1, np.flatnonzero(hi[:-1] & ~hi[1:]) + 1


def binned(sig, start, n_bins):
    seg = sig[start: start + n_bins * BIN]
    return seg[: len(seg) // BIN * BIN].reshape(-1, BIN).mean(axis=1) * 1e3      # mV


def window(v, i, a_us, b_us):
    return v[i + int(a_us * 1e-6 / DT): i + int(b_us * 1e-6 / DT)].mean()


refs, pairs = [], {g: [] for g in GAPS}
for f in sorted(glob.glob(SRC + '0*-r?-fast*.json')):
    name = os.path.basename(f)[:-5]
    meta, v1, r, fl = load(name)
    base = window(v1, r[0], -300, -50)
    amp = window(v1, fl[0], -500, -100) - base
    a = fl[0] - int(PRE_US * 1e-6 / DT)
    n = (PRE_US + POST_US) * 1e-6 / DT // BIN
    if meta['mode'] == 'fastref':
        refs.append({'tail': binned(v1 - base, a, int(n)), 'amp': amp})
    else:
        g = int(meta['value'])
        n_p = int(400e-6 / DT) // BIN
        pairs[g].append({
            'trace': binned(v1 - base, a, int(n)),
            'p1': binned(v1 - base, r[0], n_p), 'p2': binned(v1 - base, r[1], n_p),
            'carry': (window(v1, r[1], -4, -1) - base) / amp * 100,
            'excess': ((window(v1, r[1], 20, 50) - base) - (window(v1, r[0], 20, 50) - base)) / amp * 100,
            'name': name, 'a': a, 'fall': int(fl[0]), 'rise2': int(r[1]),
        })

rd = lambda x: [round(float(t), 1) for t in x]
out = {
    'source': 'lab repo yair/ws2, data/fast-memory-20261019-062928 (Rigol DHO814, 32 ns samples, CH1 0.2 V/div, 10x probes, DC); 10 us..500 us LOW gap, 5 repeats',
    'binUs': 2, 'preUs': PRE_US, 'postUs': POST_US, 'gaps': GAPS,
    'refTailMv': rd(np.mean([x['tail'] for x in refs], axis=0)),
    'refAmpMv': round(float(np.mean([x['amp'] for x in refs]) * 1e3), 1),
    'pairs': {str(g): {
        'trace': [rd(p['trace']) for p in pairs[g]],
        'p1': [rd(p['p1']) for p in pairs[g]],
        'p2': [rd(p['p2']) for p in pairs[g]],
        'carry': round(float(np.mean([p['carry'] for p in pairs[g]])), 1),
        'carrySd': round(float(np.std([p['carry'] for p in pairs[g]], ddof=1)), 1),
        'excess': round(float(np.mean([p['excess'] for p in pairs[g]])), 1),
    } for g in GAPS},
}
with open(OUT + 'data/ws2-pairs.json', 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
print('json', os.path.getsize(OUT + 'data/ws2-pairs.json'), 'bytes')

# ---- audio: for every gap, the end of a single pulse, a pause, then the pair; 651x slower
hp = lambda x, fs=48000: sosfiltfilt(butter(2, 6.0 / (fs / 2), 'highpass', output='sos'), x)
ref_name = [os.path.basename(f)[:-5] for f in sorted(glob.glob(SRC + '0*-r1-fastref-0.json'))][0]
_, rv1, rr, rf = load(ref_name)
rbase = window(rv1, rr[0], -300, -50)
raw = {}
for g in GAPS:
    p = pairs[g][0]
    _, v1, r, fl = load(p['name'])
    base = window(v1, r[0], -300, -50)
    seg = v1[fl[0] - int(30e-6 / DT): r[1] + int(350e-6 / DT)] - base
    ref_seg = rv1[rf[0] - int(30e-6 / DT): rf[0] - int(30e-6 / DT) + len(seg)] - rbase
    raw[g] = (ref_seg, seg)
peak = max(np.max(np.abs(x - x[:50].mean())) for a, b in raw.values() for x in (a, b))
for g in GAPS:
    ref_seg, seg = raw[g]
    x = np.concatenate([hp((ref_seg - ref_seg[:50].mean()) / peak), np.zeros(int(0.35 * 48000)),
                        hp((seg - seg[:50].mean()) / peak), np.zeros(int(0.9 * 48000))])
    x = x / np.max(np.abs(x)) * 0.85
    wavfile.write(OUT + f'audio/ws2_pair_{g}.wav', 48000, (x * 32767).astype(np.int16))
    print('audio', g, 'us', round(len(x) / 48000, 2), 's')

# ---- the six one after another: the second pulse comes closer, and the screen can follow the sound
order = [500, 200, 100, 50, 20, 10]
parts = []
for g in order:
    rate, w = wavfile.read(OUT + f'audio/ws2_pair_{g}.wav')
    parts.append(w)
wavfile.write(OUT + 'audio/ws2_pairs_sweep.wav', 48000, np.concatenate(parts))
out['sweep'] = {'order': order, 'durations': [round(len(w) / 48000, 4) for w in parts]}
with open(OUT + 'data/ws2-pairs.json', 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
print('sweep', round(sum(len(w) for w in parts) / 48000, 1), 's')
