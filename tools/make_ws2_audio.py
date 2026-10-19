import json, os
import numpy as np
from scipy.signal import resample_poly, butter, sosfiltfilt
from scipy.io import wavfile

SP = r'C:/Users/denis/AppData/Local/Temp/claude/C--dev-reservoir/97f115a0-cb9c-434c-8b87-7c8fa398ab59/scratchpad/'
OUT = r'C:/dev/reservoir/'
os.makedirs(OUT + 'audio', exist_ok=True)
ch1 = np.load(SP + 'ws2raw/ch1.npy').astype(np.float64)
ch2 = np.load(SP + 'ws2raw/ch2.npy').astype(np.float64)
rise = np.load(SP + 'ws2raw/rise_idx.npy')
fall = np.load(SP + 'ws2raw/fall_idx.npy')
dt = 0.8e-6
FS = 48000

def norm(x, peak=0.8):
    x = x - np.mean(x)
    return (x / np.max(np.abs(x)) * peak).astype(np.float32)

def hp(x, fs, f=20.0):
    return sosfiltfilt(butter(2, f / (fs / 2), 'highpass', output='sos'), x)

def save(name, x):
    wavfile.write(OUT + 'audio/' + name, FS, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    print(name, round(len(x) / FS, 2), 's')

# 1) the sample at its own pace: 0.3 s before the burst to 0.6 s after, resampled 1.25 MSa/s -> 48 kHz
a = rise[0] - int(0.3 / dt)
b = fall[-1] + int(0.6 / dt)
real = resample_poly(ch1[a:b], 24, 625)
save('ws2_real_1to1.wav', norm(hp(real, FS)))

# 2) audification: the raw samples played at 48 kHz = 26x slower; 20 pulses in the middle of the burst
i0 = rise[90] - int(2e-3 / dt)
i1 = rise[110] - int(2e-3 / dt)
slow = ch1[i0:i1]
save('ws2_slow26.wav', norm(hp(slow, FS, 8.0)))

# 3) what does not repeat: every pulse minus the mean pulse, pulses 90-110, 26x slower, normalised hard
period = int(round(np.median(np.diff(rise))))
stack = np.array([ch1[r - 400: r - 400 + period] for r in rise[3:-3]])
mean_pulse = stack.mean(axis=0)
resid = (stack - mean_pulse)
r_sel = resid[87:107].reshape(-1)
save('ws2_residual26.wav', norm(r_sel))
print('residual rms mV', resid.std() * 1e3, 'mean pulse span mV', (mean_pulse.max() - mean_pulse.min()) * 1e3)

# 4) the sample at rest: 3 s before the burst, 1:1 and 26x slower (the hiss moves into the audible band)
rest = ch1[: rise[0] - int(0.2 / dt)]
save('ws2_rest_1to1.wav', norm(resample_poly(rest[: int(3 / dt)], 24, 625)))
save('ws2_rest26.wav', norm(rest[: FS * 8]))

# 5) a compact record for the screen: the mean pulse (log-spaced in time) with its spread, the per-pulse levels
def bins(sig_stack, t_from_ms, t_to_ms, n):
    edges = np.unique(np.round(np.geomspace(max(t_from_ms, 0.0016), t_to_ms, n) / (dt * 1e3)).astype(int))
    mean, lo, hi = [], [], []
    for e0, e1 in zip(edges[:-1], edges[1:]):
        seg = sig_stack[:, e0:max(e1, e0 + 1)]
        mean.append(float(seg.mean()))
        lo.append(float(np.percentile(seg, 5)))
        hi.append(float(np.percentile(seg, 95)))
    t = [float((e0 + e1) / 2 * dt * 1e3) for e0, e1 in zip(edges[:-1], edges[1:])]
    return t, mean, lo, hi

pre = 400
rise_stack = np.array([ch1[r - pre: r - pre + 12500] for r in rise[3:-3]])[:, pre:]
fall_stack = np.array([ch1[f - pre: f - pre + 12500] for f in fall[3:-3]])[:, pre:]
tr, mr, lr, hr = bins(rise_stack, 0, 10, 140)
tf, mf, lf, hf = bins(fall_stack, 0, 10, 140)
level = np.array([ch1[r + int(9.0e-3 / dt): r + int(9.8e-3 / dt)].mean() for r in rise])
per_pulse_rms = resid.std(axis=1)
rec = {
    'source': 'WS2_Experiment_Complete_Log_2026-10-19 / RigolDSws2d0.csv (Rigol DHO814, 1.25 MSa/s, 10x probes, DC)',
    'driveV': 3.302, 'pulses': int(len(rise)), 'periodMs': 20, 'pauseS': 5,
    'rise': {'tMs': tr, 'mV': [x * 1e3 for x in mr], 'p5': [x * 1e3 for x in lr], 'p95': [x * 1e3 for x in hr]},
    'fall': {'tMs': tf, 'mV': [x * 1e3 for x in mf], 'p5': [x * 1e3 for x in lf], 'p95': [x * 1e3 for x in hf]},
    'endOfHighMv': [float(x * 1e3) for x in level],
    'residualRmsMv': [float(x * 1e3) for x in per_pulse_rms],
}

# per-pulse curves for the 20 pulses that are also in the slowed audio (pulses 90-109), same log-time bins
def bins_each(sig_stack, t_from_ms, t_to_ms, n):
    edges = np.unique(np.round(np.geomspace(max(t_from_ms, 0.0016), t_to_ms, n) / (dt * 1e3)).astype(int))
    rows = []
    for row in sig_stack:
        rows.append([float(row[e0:max(e1, e0 + 1)].mean() * 1e3) for e0, e1 in zip(edges[:-1], edges[1:])])
    return rows

FIRST = 90   # the slowed audio holds pulses 90-109
sel_rise = np.array([ch1[r - pre: r - pre + 12500] for r in rise[:200]])[:, pre:]
sel_fall = np.array([ch1[f - pre: f - pre + 12500] for f in fall[:200]])[:, pre:]
rec['pulses'] = {'first': 0, 'audioFirst': FIRST,
                 'rise': [[round(v, 1) for v in r] for r in bins_each(sel_rise, 0, 10, 140)],
                 'fall': [[round(v, 1) for v in r] for r in bins_each(sel_fall, 0, 10, 140)]}

with open(OUT + 'data/ws2-measured.json', 'w') as f:
    json.dump(rec, f, separators=(',', ':'))
print('json bytes', os.path.getsize(OUT + 'data/ws2-measured.json'))
