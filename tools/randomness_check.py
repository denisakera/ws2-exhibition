"""Randomness check of the noise in the oscilloscope capture (NIST SP 800-22 style, a subset).

Honest scope: this tests the NOISE OF THE RECORDING (sample + wires + probe + scope front end + ADC),
not WS2 on its own. There is no control recording (a resistor instead of the sample), so nothing here
can be attributed to the material.
"""
import numpy as np, zlib, math
from scipy.special import erfc, gammaincc
from scipy.stats import norm

SP = r'C:/Users/denis/AppData/Local/Temp/claude/C--dev-reservoir/97f115a0-cb9c-434c-8b87-7c8fa398ab59/scratchpad/'
ch1 = np.load(SP + 'ws2raw/ch1.npy').astype(np.float64)
rise = np.load(SP + 'ws2raw/rise_idx.npy')
dt = 0.8e-6

# the resting part before the first pulse (the sample is connected, the drive is low)
rest = ch1[: rise[0] - 20000]
print('resting samples', len(rest), 'seconds', len(rest) * dt)
levels = np.unique(rest)
lsb = np.median(np.diff(levels))
print('distinct levels', len(levels), 'step (mV)', lsb * 1e3, 'noise std (mV)', rest.std() * 1e3)
code = np.round((rest - rest.min()) / lsb).astype(np.int64)

def autocorr(x, lags):
    x = x - x.mean()
    v = (x * x).mean()
    return [float((x[:-l] * x[l:]).mean() / v) for l in lags]

print('autocorrelation of the raw signal at lag 1, 2, 5, 10, 50, 200 samples:', [round(a, 3) for a in autocorr(rest, [1, 2, 5, 10, 50, 200])])

# ---- the tests (p-values; a sequence "passes" a test when p >= 0.01) ---------------------------------
def monobit(b):
    n = len(b)
    s = np.abs(np.sum(2 * b.astype(np.int64) - 1)) / math.sqrt(n)
    return float(erfc(s / math.sqrt(2)))

def block_frequency(b, M=128):
    N = len(b) // M
    pi = b[: N * M].reshape(N, M).mean(axis=1)
    chi = 4 * M * np.sum((pi - 0.5) ** 2)
    return float(gammaincc(N / 2, chi / 2))

def runs(b):
    n = len(b)
    pi = b.mean()
    if abs(pi - 0.5) >= 2 / math.sqrt(n):
        return 0.0
    v = 1 + int(np.sum(b[1:] != b[:-1]))
    return float(erfc(abs(v - 2 * n * pi * (1 - pi)) / (2 * math.sqrt(2 * n) * pi * (1 - pi))))

def approx_entropy(b, m=8):
    n = len(b)
    def phi(mm):
        ext = np.concatenate([b, b[: mm - 1]])
        idx = np.zeros(n, dtype=np.int64)
        for k in range(mm):
            idx = (idx << 1) | ext[k: k + n]
        cnt = np.bincount(idx, minlength=2 ** mm) / n
        cnt = cnt[cnt > 0]
        return float(np.sum(cnt * np.log(cnt)))
    ap = phi(m) - phi(m + 1)
    chi = 2 * n * (math.log(2) - ap)
    return float(gammaincc(2 ** (m - 1), chi / 2))

def cusum(b):
    n = len(b)
    x = 2 * b.astype(np.int64) - 1
    z = np.max(np.abs(np.cumsum(x)))
    s = np.arange(int(math.floor((-n / z + 1) / 4)), int(math.floor((n / z - 1) / 4)) + 1)
    s2 = np.arange(int(math.floor((-n / z - 3) / 4)), int(math.floor((n / z - 1) / 4)) + 1)
    p = 1 - np.sum(norm.cdf((4 * s + 1) * z / math.sqrt(n)) - norm.cdf((4 * s - 1) * z / math.sqrt(n))) \
        + np.sum(norm.cdf((4 * s2 + 3) * z / math.sqrt(n)) - norm.cdf((4 * s2 + 1) * z / math.sqrt(n)))
    return float(p)

def serial_corr(b, lags=(1, 2, 3, 8, 16)):
    return [round(float(np.corrcoef(b[:-l], b[l:])[0, 1]), 4) for l in lags]

def report(name, bits):
    bits = bits.astype(np.uint8)
    n = len(bits)
    ps = {'monobit': monobit(bits), 'block-freq': block_frequency(bits), 'runs': runs(bits),
          'approx-entropy': approx_entropy(bits), 'cusum': cusum(bits)}
    ok = all(p >= 0.01 for p in ps.values())
    comp = len(zlib.compress(np.packbits(bits).tobytes(), 9)) / (n / 8)
    print(f'\n{name}: {n} bits, p = ' + ', '.join(f'{k} {v:.3f}' for k, v in ps.items()) + f' -> {"PASS" if ok else "FAIL"}')
    print(f'   bit mean {bits.mean():.4f}, serial correlation lags 1,2,3,8,16: {serial_corr(bits)}, zlib ratio {comp:.4f}')
    return ok

# 1) the least significant bit of every sample (the samples are strongly correlated: the capture is oversampled)
report('LSB of every sample', (code & 1))
# 2) the least significant bit of every 64th sample (51 us apart: the noise has decorrelated)
step = 64
report(f'LSB of every {step}th sample', (code[::step] & 1))
# 3) two low bits XOR-ed, every 64th sample
report(f'bit0 xor bit1, every {step}th sample', ((code[::step] ^ (code[::step] >> 1)) & 1))
# 4) von Neumann debiasing of the every-64th LSB stream
b = (code[::step] & 1)
pairs = b[: len(b) // 2 * 2].reshape(-1, 2)
vn = pairs[pairs[:, 0] != pairs[:, 1]][:, 0]
report('von Neumann on LSB of every 64th sample', vn)
# 5) median-threshold bits of the raw signal every 64th sample (this keeps the hum and the slow structure)
report('above/below the median, every 64th sample', (rest[::step] > np.median(rest)).astype(np.uint8))
# 6) the same after removing the mains hum (50 Hz and odd multiples) with a notch comb
from scipy.signal import iirnotch, filtfilt
fs = 1 / dt
x = rest.copy()
for f0 in (50, 100, 150, 250, 350, 450, 750, 850):
    bnotch, anotch = iirnotch(f0, 30, fs)
    x = filtfilt(bnotch, anotch, x)
report('above/below the median after hum removal, every 64th', (x[::step] > np.median(x)).astype(np.uint8))

# how many random bits per second could this give, being cautious (the passing stream above, per second of recording)
secs = len(rest) * dt
print('\nresting recording', round(secs, 2), 's;', 'bits from LSB of every 64th sample:', len(rest[::step]), '=', round(len(rest[::step]) / secs), 'bit/s before any post-processing')
# min-entropy of the low byte of every 64th sample (most-common-value estimate, SP 800-90B style)
low = code[::step] & 0xF
cnt = np.bincount(low, minlength=16) / len(low)
print('min-entropy of the low 4 bits (most common value estimate):', round(-math.log2(cnt.max()), 3), 'of 4 bits')
