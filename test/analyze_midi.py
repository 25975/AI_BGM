import struct, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

path = sys.argv[1]
data = open(path, 'rb').read()

def read_vlq(d, p):
    v = 0
    while True:
        b = d[p]; p += 1
        v = (v << 7) | (b & 0x7F)
        if not (b & 0x80):
            return v, p

assert data[:4] == b'MThd'
hlen = struct.unpack('>I', data[4:8])[0]
fmt, ntrk, div = struct.unpack('>HHH', data[8:14])
print('header     : format', fmt, 'tracks', ntrk, 'division', div)
p = 8 + hlen
tracks = []
for t in range(ntrk):
    assert data[p:p+4] == b'MTrk', (t, data[p:p+4])
    tlen = struct.unpack('>I', data[p+4:p+8])[0]
    body = data[p+8:p+8+tlen]
    p += 8 + tlen
    tracks.append(body)

total_on = 0
total_off = 0
markers = []
tempos = []
programs = []
for ti, body in enumerate(tracks):
    q = 0
    tick = 0
    running = None
    events = []
    ons = collections.Counter()
    while q < len(body):
        delta, q = read_vlq(body, q)
        tick += delta
        status = body[q]
        if status < 0x80:
            status = running
        else:
            q += 1
        running = status
        if status == 0xFF:
            meta = body[q]; q += 1
            ln, q = read_vlq(body, q)
            payload = body[q:q+ln]; q += ln
            if meta == 0x51:
                us = (payload[0] << 16) | (payload[1] << 8) | payload[2]
                tempos.append((tick, 60000000 / us))
            elif meta == 0x06:
                markers.append((tick, payload.decode('utf-8', 'replace')))
            elif meta == 0x03:
                print(f'  track {ti} name: {payload.decode("utf-8", "replace")}')
        elif status in (0xF0, 0xF7):
            ln, q = read_vlq(body, q); q += ln
        else:
            hi = status & 0xF0
            ch = status & 0x0F
            if hi in (0xC0, 0xD0):
                d1 = body[q]; q += 1
                if hi == 0xC0:
                    programs.append((ti, ch, d1))
            else:
                d1 = body[q]; d2 = body[q+1]; q += 2
                if hi == 0x90 and d2 > 0:
                    ons[(ch, d1)] += 1
                    total_on += 1
                elif hi == 0x80 or (hi == 0x90 and d2 == 0):
                    ons[(ch, d1)] -= 1
                    total_off += 1
    hanging = {k: v for k, v in ons.items() if v != 0}
    print(f'  track {ti}: {len(body)} bytes, last tick {tick}, hanging notes {hanging if hanging else "none"}')

print('tempo      :', tempos[:3], '...' if len(tempos) > 3 else '')
print('markers    :', [m[1] for m in markers][:12])
print('programs   :', programs)
print('note on/off:', total_on, total_off, 'balanced' if total_on == total_off else 'UNBALANCED')
print('total ticks:', max((0,)))
