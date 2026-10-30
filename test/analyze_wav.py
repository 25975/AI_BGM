import struct, sys, wave, os
import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

path = sys.argv[1]
with open(path, 'rb') as f:
    data = f.read()

assert data[:4] == b'RIFF' and data[8:12] == b'WAVE', 'not a wav'
pos = 12
fmt = None
smpl = None
info = {}
data_bytes = None
while pos + 8 <= len(data):
    cid = data[pos:pos+4]
    size = struct.unpack('<I', data[pos+4:pos+8])[0]
    body = data[pos+8:pos+8+size]
    if cid == b'fmt ':
        fmt = struct.unpack('<HHIIHH', body[:16])
    elif cid == b'smpl':
        fields = struct.unpack('<IIIIIIIIII', body[:40])
        loops = []
        base = 36
        for i in range(fields[7]):
            lp = struct.unpack('<IIIIII', body[base:base+24])
            loops.append(lp)
            base += 24
        smpl = {'unity': fields[3], 'numLoops': fields[7], 'loops': loops}
    elif cid == b'LIST':
        sub = body[4:]
        p = 0
        while p + 8 <= len(sub):
            sid = sub[p:p+4].decode('latin1')
            ssz = struct.unpack('<I', sub[p+4:p+8])[0]
            info[sid] = sub[p+8:p+8+ssz].rstrip(b'\x00').decode('utf-8', 'replace')
            p += 8 + ssz + (ssz % 2)
    elif cid == b'data':
        data_bytes = body
    pos += 8 + size + (size % 2)

ch, sr, byte_rate, block, bits = fmt[1], fmt[2], fmt[3], fmt[4], fmt[5]
print('file      :', os.path.basename(path), f'{len(data)/1024/1024:.2f} MB')
print('format    :', ch, 'ch', bits, 'bit', sr, 'Hz')
print('info      :', info)
print('smpl      :', smpl)

if bits == 16:
    x = np.frombuffer(data_bytes, dtype='<i2').astype(np.float32) / 32768.0
else:
    raise SystemExit('only 16-bit handled')
x = x.reshape(-1, ch).T

dur = x.shape[1] / sr
peak = float(np.max(np.abs(x)))
rms = float(np.sqrt(np.mean(x ** 2)))
dc = float(np.mean(x))
mono = x.mean(axis=0)
print(f'duration  : {dur:.3f} s, {x.shape[1]} frames')
print(f'peak      : {peak:.4f} ({20*np.log10(peak+1e-12):.2f} dBFS)')
print(f'rms       : {rms:.4f} ({20*np.log10(rms+1e-12):.2f} dBFS), crest {20*np.log10(peak/(rms+1e-12)):.2f} dB')
print(f'dc offset : {dc:+.5f}')
print(f'clipped   : {int(np.sum(np.abs(x) >= 0.999))} samples')

# 静音比例
print(f'silence   : {float(np.mean(np.abs(mono) < 0.001))*100:.1f}% samples < -60dB')

# 频段能量
spec = np.abs(np.fft.rfft(mono))
freqs = np.fft.rfftfreq(len(mono), 1/sr)
energy = spec ** 2
total = energy.sum() + 1e-12
bands = [(20, 120, 'sub'), (120, 400, 'low'), (400, 1200, 'lowmid'), (1200, 4000, 'mid'), (4000, 10000, 'high'), (10000, 22050, 'air')]
for lo, hi, name in bands:
    m = (freqs >= lo) & (freqs < hi)
    print(f'band {name:6s}: {energy[m].sum()/total*100:5.1f}%')
centroid = float((freqs * spec).sum() / (spec.sum() + 1e-12))
print(f'centroid  : {centroid:.0f} Hz')

# 1/1 倍频程 & A 加权
def a_weight(f):
    f = np.maximum(f, 1e-9)
    ra = (12194**2 * f**4) / ((f**2 + 20.6**2) * np.sqrt((f**2 + 107.7**2) * (f**2 + 737.9**2)) * (f**2 + 12194**2))
    return 20 * np.log10(ra + 1e-12) + 2.0

aw = 10 ** (a_weight(freqs) / 10)
aw_energy = energy * aw
print('octave bands (dBFS, A-weighted contribution %):')
for center in [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]:
    lo, hi = center / np.sqrt(2), center * np.sqrt(2)
    m = (freqs >= lo) & (freqs < hi)
    p = energy[m].sum()
    db = 10 * np.log10(p / len(mono) ** 2 + 1e-15)
    print(f'  {center:7.0f} Hz : {db:7.1f} dBFS   A-weight {aw_energy[m].sum()/aw_energy.sum()*100:5.1f}%')

# 立体声
if ch == 2:
    corr = float(np.corrcoef(x[0], x[1])[0, 1])
    side = (x[0] - x[1]) / 2
    mid = (x[0] + x[1]) / 2
    print(f'stereo    : corr {corr:.3f}, side/mid {np.sqrt(np.mean(side**2))/(np.sqrt(np.mean(mid**2))+1e-9):.3f}')

# 响度随时间的起伏（每 0.5s）
win = int(sr * 0.5)
n = len(mono) // win
levels = np.array([np.sqrt(np.mean(mono[i*win:(i+1)*win]**2)) for i in range(n)])
print('RMS curve :', ' '.join(f'{v:.2f}' for v in levels))

# 循环接缝
if smpl and smpl['numLoops']:
    lp = smpl['loops'][0]
    s, e = lp[2], lp[3]
    print(f'loop      : start {s} end {e} (end-start {e-s} frames = {(e-s)/sr:.3f}s)')
    if e < x.shape[1]:
        a = mono[e]
        b = mono[0]
        print(f'seam jump : |last-start| {abs(a-b):.5f}, last5ms rms {np.sqrt(np.mean(mono[max(0,e-220):e+1]**2)):.4f}, first5ms rms {np.sqrt(np.mean(mono[:220]**2)):.4f}')
        # 循环内首尾衔接的频谱连续性
print('OK')
