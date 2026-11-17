/* ==========================================================================
 * reference.js — 参考曲目分析（本地）
 * 只提取 BPM / 调性 / 亮度 / 频段比例 / 节奏密度 / 动态等宏观特征，
 * 不复制参考曲目的旋律、和声或录音。
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;

  function decodeArrayBuffer(ab) {
    return new Promise(function (resolve, reject) {
      var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
      var AC = global.AudioContext || global.webkitAudioContext;
      var ctx;
      try {
        ctx = OAC ? new OAC(1, 1, 44100) : new AC();
      } catch (e) {
        reject(new Error('浏览器不支持音频解码'));
        return;
      }
      if (ctx.decodeAudioData.length > 1) {
        ctx.decodeAudioData(ab, resolve, reject);
      } else {
        ctx.decodeAudioData(ab).then(resolve, reject);
      }
    });
  }

  function toMono(buf, maxSeconds) {
    var sr = buf.sampleRate;
    var n = Math.min(buf.length, Math.floor(sr * (maxSeconds || 45)));
    var out = new Float32Array(n);
    var chs = buf.numberOfChannels;
    for (var ch = 0; ch < chs; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < n; i++) out[i] += d[i] / chs;
    }
    return { data: out, sr: sr };
  }

  function fft(re, im) {
    var n = re.length;
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wlR = Math.cos(ang), wlI = Math.sin(ang);
      for (var s = 0; s < n; s += len) {
        var wr = 1, wi = 0;
        for (var k = 0; k < len / 2; k++) {
          var uR = re[s + k], uI = im[s + k];
          var vR = re[s + k + len / 2] * wr - im[s + k + len / 2] * wi;
          var vI = re[s + k + len / 2] * wi + im[s + k + len / 2] * wr;
          re[s + k] = uR + vR;
          im[s + k] = uI + vI;
          re[s + k + len / 2] = uR - vR;
          im[s + k + len / 2] = uI - vI;
          var nextR = wr * wlR - wi * wlI;
          wi = wr * wlI + wi * wlR;
          wr = nextR;
        }
      }
    }
  }

  function keyProfiles() {
    return {
      major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
      minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function analyzeBuffer(buf) {
    var mono = toMono(buf, 45);
    var d = mono.data;
    var sr = mono.sr;
    var seconds = d.length / sr;
    if (seconds < 2) throw new Error('音频太短，至少需要 2 秒');

    // 全局电平
    var peak = 0, sum = 0;
    for (var i = 0; i < d.length; i++) {
      var a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
    }
    var rms = Math.sqrt(sum / d.length);
    var crest = 20 * Math.log10(Math.max(peak, 1e-6) / Math.max(rms, 1e-6));

    // 节奏包络 / onset
    var envHop = Math.max(128, Math.round(sr / 86));
    var envWin = envHop * 2;
    var env = [];
    for (var e = 0; e + envWin < d.length; e += envHop) {
      var es = 0;
      for (var j = 0; j < envWin; j++) es += d[e + j] * d[e + j];
      env.push(Math.sqrt(es / envWin));
    }
    var envMax = 0;
    for (i = 0; i < env.length; i++) envMax = Math.max(envMax, env[i]);
    var flux = [];
    for (i = 1; i < env.length; i++) flux.push(Math.max(0, env[i] - env[i - 1]) / Math.max(envMax, 1e-6));

    var fMean = 0;
    for (i = 0; i < flux.length; i++) fMean += flux[i];
    fMean /= Math.max(1, flux.length);
    var fVar = 0;
    for (i = 0; i < flux.length; i++) fVar += (flux[i] - fMean) * (flux[i] - fMean);
    fVar = Math.sqrt(fVar / Math.max(1, flux.length));

    var envRate = sr / envHop;
    var maxLag = Math.min(120, flux.length - 2);
    var ac = new Array(maxLag + 2).fill(0);
    for (var lag = 1; lag <= maxLag; lag++) {
      var s = 0, c = 0;
      for (i = lag; i < flux.length; i++) { s += flux[i] * flux[i - lag]; c++; }
      ac[lag] = s / Math.max(1, c);
    }
    var best = -1, bpm = 120;
    for (lag = 16; lag <= 100; lag++) {
      var cand = 60 * envRate / lag;
      if (cand < 60 || cand > 200) continue;
      var sc = ac[lag] || 0;
      if (lag * 2 <= maxLag) sc += 0.5 * (ac[lag * 2] || 0);
      if (lag * 3 <= maxLag) sc += 0.3 * (ac[lag * 3] || 0);
      if (sc > best) { best = sc; bpm = cand; }
    }
    if (bpm < 70) bpm *= 2;
    if (bpm > 180) bpm /= 2;
    bpm = Math.round(clamp(bpm, 60, 180));

    // 频谱 / chroma
    var N = 4096;
    var hop = 4096;
    var chroma = new Array(12).fill(0);
    var bassChroma = new Array(12).fill(0);
    var centroidSum = 0, magSum = 0;
    var low = 0, mid = 0, high = 0;
    var specFlux = 0, prevMag = null, frames = 0;
    var maxFrames = Math.min(Math.floor(d.length / hop), Math.floor(30 * sr / hop));
    var win = new Float32Array(N);
    for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    for (var f = 0; f < maxFrames; f++) {
      var off = f * hop;
      var frameRms = 0;
      for (i = 0; i < N; i++) frameRms += d[off + i] * d[off + i];
      if (Math.sqrt(frameRms / N) < 0.003) continue;
      var re = new Float32Array(N), im = new Float32Array(N);
      for (i = 0; i < N; i++) re[i] = d[off + i] * win[i];
      fft(re, im);
      var frameMag = new Float32Array(N / 2);
      for (var k = 1; k < N / 2; k++) {
        var m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
        frameMag[k] = m;
        var freq = k * sr / N;
        if (freq < 30 || freq > 16000) continue;
        if (freq < 250) low += m;
        else if (freq < 2000) mid += m;
        else high += m;
        if (freq >= 40 && freq <= 250) {
          var bmidi = 69 + 12 * Math.log2(freq / 440);
          var bpc = ((Math.round(bmidi) % 12) + 12) % 12;
          bassChroma[bpc] += Math.sqrt(m);
        }
        if (freq >= 50 && freq <= 5000) {
          var midi = 69 + 12 * Math.log2(freq / 440);
          var pc = ((Math.round(midi) % 12) + 12) % 12;
          chroma[pc] += Math.sqrt(m);
        }
        centroidSum += freq * m;
        magSum += m;
      }
      if (prevMag) {
        var sf = 0;
        for (k = 1; k < N / 2; k += 4) sf += Math.abs(frameMag[k] - prevMag[k]);
        specFlux += sf;
      }
      prevMag = frameMag;
      frames++;
    }
    var total = low + mid + high;
    if (total < 1e-9) throw new Error('参考音频几乎是静音');
    var lowRatio = low / total, midRatio = mid / total, highRatio = high / total;
    var centroid = centroidSum / Math.max(magSum, 1e-9);
    var brightness = clamp((centroid - 400) / 3000, 0, 1);

    // 调性：用低频声部确定主音，再用完整 chroma 判断大/小调
    var profiles = keyProfiles();
    var chromaSum = chroma.reduce(function (a, b) { return a + b; }, 0);
    var bassSum = bassChroma.reduce(function (a, b) { return a + b; }, 0);
    var bassRoot = 0, bassMax = -1;
    for (var br = 0; br < 12; br++) {
      if (bassChroma[br] > bassMax) { bassMax = bassChroma[br]; bassRoot = br; }
    }
    var bestKey = { score: -1, root: 0, mode: 'minor' };
    Object.keys(profiles).forEach(function (mode) {
      var prof = profiles[mode];
      for (var root = 0; root < 12; root++) {
        var dot = 0;
        for (var pc = 0; pc < 12; pc++) dot += (chroma[pc] / Math.max(chromaSum, 1e-9)) * prof[(pc - root + 12) % 12];
        if (dot > bestKey.score) bestKey = { score: dot, root: root, mode: mode };
      }
    });
    var keyRoot = bassSum > 1e-9 ? bassRoot : bestKey.root;
    var majorScore = 0, minorScore = 0;
    for (var kp = 0; kp < 12; kp++) {
      var cv = chroma[kp] / Math.max(chromaSum, 1e-9);
      majorScore += cv * profiles.major[(kp - keyRoot + 12) % 12];
      minorScore += cv * profiles.minor[(kp - keyRoot + 12) % 12];
    }
    var keyMode = minorScore >= majorScore ? 'minor' : 'major';

    // 节奏密度 / 复杂度 / 强度
    var onsetRate = 0;
    var thresh = fMean + fVar * 1.0;
    var lastOnset = -1;
    var minGap = 0.12;
    for (i = 1; i < flux.length - 1; i++) {
      if (flux[i] > thresh && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
        var ot = i / envRate;
        if (ot - lastOnset >= minGap) {
          onsetRate++;
          lastOnset = ot;
        }
      }
    }
    onsetRate /= Math.max(1, seconds);
    var density = clamp((onsetRate - 1.2) / 6.5, 0.25, 0.88);
    var complexity = clamp(0.4 + onsetRate * 0.05 + highRatio * 0.4, 0.32, 0.88);
    var intensity = Math.round(clamp(1.0 + (crest - 8) / 8 + lowRatio * 1.1, 0, 3));
    var clarity = clamp(0.48 + highRatio * 0.28, 0.35, 0.72);

    var scaleId = keyMode === 'major' ? 'major' : 'minor';
    var keyLabel = GBG.theory && GBG.theory.keyLabelShort
      ? GBG.theory.keyLabelShort(keyRoot, scaleId)
      : (keyRoot + (scaleId === 'major' ? ' major' : ' minor'));

    var suggested = 'epic';
    if (bpm >= 115 && onsetRate > 3.0 && brightness > 0.5) suggested = 'edm';
    else if (bpm >= 110 && lowRatio > 0.5 && onsetRate > 2.0) suggested = 'battle';
    else if (brightness > 0.55 && bpm >= 90) suggested = 'cyberpunk';
    else if (bpm < 92 && brightness < 0.38 && onsetRate < 1.6) suggested = 'lofi';
    else if (brightness < 0.34 && onsetRate < 1.2) suggested = 'ambient';
    else if (bpm < 80 && lowRatio > 0.45) suggested = 'sad';

    var style = GBG.styles && GBG.styles.byId ? GBG.styles.byId(suggested) : null;
    return {
      bpm: bpm,
      rootPc: keyRoot,
      scaleId: scaleId,
      keyShort: keyLabel,
      brightness: +brightness.toFixed(2),
      centroid: Math.round(centroid),
      low: +lowRatio.toFixed(2),
      mid: +midRatio.toFixed(2),
      high: +highRatio.toFixed(2),
      density: +density.toFixed(2),
      complexity: +complexity.toFixed(2),
      clarity: +clarity.toFixed(2),
      intensity: intensity,
      crest: +crest.toFixed(1),
      onsetRate: +onsetRate.toFixed(2),
      duration: +seconds.toFixed(1),
      suggestedStyle: { id: suggested, name: style ? style.name : suggested }
    };
  }

  function analyze(arrayBuffer) {
    return decodeArrayBuffer(arrayBuffer).then(analyzeBuffer);
  }

  GBG.reference = {
    analyze: analyze,
    analyzeBuffer: analyzeBuffer
  };
})(typeof window !== 'undefined' ? window : globalThis);
