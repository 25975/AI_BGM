/* ==========================================================================
 * styles.js — 19 种游戏 BGM 风格预设
 * 每种风格定义：速度范围 / 调式 / 和声进行 / 鼓组 / 配器分层 / 混音参数
 * 纯数据，无副作用。
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};

  // 层定义小工具
  function L(id, name, role, instrument, pattern, opts) {
    opts = opts || {};
    return {
      id: id,
      name: name,
      role: role,
      instrument: instrument,
      pattern: pattern,
      gain: opts.gain === undefined ? 0.6 : opts.gain,
      minIntensity: opts.minIntensity || 0,
      octave: opts.octave || 0,
      low: opts.low || 48,
      high: opts.high || 76,
      pan: opts.pan || 0,
      // 力度/人性化
      humanize: opts.humanize === undefined ? 0.012 : opts.humanize,
      vel: opts.vel || 0.8
    };
  }

  var STYLES = [
    /* ------------------------------------------------------------------ */
    {
      id: 'epic', name: '史诗管弦', en: 'Epic Orchestral', emoji: '🏰',
      family: 'orchestral', color: '#e8b062',
      desc: '大编制弦乐铺底、铜管主题与定音鼓推进，适合主菜单、过场与最终决战。',
      tags: ['管弦', '史诗', '宏大'],
      usage: ['主菜单', 'Boss 战', '过场动画'],
      bpm: [66, 88], swing: 0,
      modes: ['minor', 'harmonicMinor', 'dorian'], defaultMode: 'minor',
      progs: ['i_Vi_III_VII', 'i_VII_VI_VII', 'i_III_VII_VI'],
      extension: 1, density: 0.6, complexity: 0.55,
      drums: {
        kit: 'orch',
        steps: {
          kick: 'X.......X.......',
          snare: '....x.......x...',
          hat: '..x...x...x...x.',
          taiko: 'X.....x.X.....x.',
          tom: '..............x.',
          crash: ''
        },
        fillEvery: 8, fillType: 'taiko', swing: 0,
        intensity: { 1: ['hat'], 2: ['tom', 'taiko'], 3: ['crash'] }
      },
      layers: [
        L('pad', '弦乐铺底', 'pad', 'stringPad', 'sustain', { gain: 0.5, low: 45, high: 72, pan: -0.25 }),
        L('low', '低音弦乐', 'bass', 'cello', 'pulse8', { gain: 0.55, low: 33, high: 50 }),
        L('ost', '弦乐固定音型', 'arp', 'stringsStacc', 'arp8', { gain: 0.3, low: 55, high: 79, minIntensity: 1, pan: -0.15 }),
        L('harp', '竖琴分解', 'arp', 'harp', 'arp8', { gain: 0.36, low: 55, high: 84, minIntensity: 1, pan: 0.3 }),
        L('brass', '铜管主题', 'lead', 'brassSection', 'melody', { gain: 0.62, low: 55, high: 79 }),
        L('choir', '人声合唱', 'pad', 'choirPad', 'sustain', { gain: 0.34, low: 52, high: 76, minIntensity: 2, pan: 0.2 }),
        L('horn', '圆号对位', 'counter', 'frenchHorn', 'counter', { gain: 0.32, low: 46, high: 67, minIntensity: 2 })
      ],
      reverb: 0.42, delay: 0.08, width: 0.85, lowpass: 0, gain: 0.92
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'triumph', name: '凯旋史诗', en: 'Triumphal Epic', emoji: '🏆',
      family: 'orchestral', color: '#f5c86b',
      desc: '女高音无词独唱、弦乐断奏固定音型、太鼓与铜管推进；适合最终决战、胜利与加冕。',
      tags: ['管弦', '凯旋', '女声'],
      usage: ['最终决战', '胜利', '加冕'],
      bpm: [134, 148], swing: 0,
      modes: ['minor', 'harmonicMinor', 'dorian'], defaultMode: 'minor',
      progs: ['i_Vi_III_VII', 'i_VII_VI_VII', 'i_III_VII_VI'],
      extension: 1, density: 0.72, complexity: 0.64,
      drums: {
        kit: 'orch',
        steps: {
          kick: 'X...X...X...X...',
          snare: '....x.......x...',
          hat: 'x.x.x.x.x.x.x.x.',
          taiko: 'X..x..X...x..X..',
          tom: '..............x.',
          crash: 'X...............'
        },
        fillEvery: 4, fillType: 'taiko', swing: 0,
        intensity: { 1: ['hat'], 2: ['tom', 'taiko'], 3: ['crash', 'snare'] }
      },
      layers: [
        L('ost', '弦乐断奏', 'arp', 'stringsStacc', 'arp8', { gain: 0.52, low: 55, high: 79, pan: -0.2 }),
        L('low', '低音弦乐', 'bass', 'cello', 'pulse8', { gain: 0.55, low: 33, high: 50 }),
        L('solo', '女高音独唱', 'lead', 'sopranoSolo', 'melody', { gain: 0.6, low: 69, high: 88, minIntensity: 0 }),
        L('pad', '弦乐铺底', 'pad', 'stringPad', 'sustain', { gain: 0.4, low: 45, high: 72, pan: -0.3 }),
        L('choir', '混声合唱', 'pad', 'choirPad', 'sustain', { gain: 0.3, low: 52, high: 76, minIntensity: 2, pan: 0.25 }),
        L('brass', '铜管号角', 'counter', 'brassSection', 'counter', { gain: 0.4, low: 50, high: 74, minIntensity: 1 })
      ],
      reverb: 0.5, delay: 0.1, width: 0.9, lowpass: 0, gain: 0.9
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'adventure', name: '冒险旅途', en: 'Adventure', emoji: '🧭',
      family: 'orchestral', color: '#f2c94c',
      desc: '竖琴琶音与长笛旋律，明亮开阔，适合开放世界探索与城镇。',
      tags: ['管弦', '明亮', '探索'],
      usage: ['大世界探索', '城镇', '任务'],
      bpm: [96, 126], swing: 0,
      modes: ['major', 'mixolydian', 'dorian'], defaultMode: 'major',
      progs: ['I_IV_vi_V', 'I_V_vi_IV', 'I_iii_IV_V'],
      extension: 0, density: 0.55, complexity: 0.45,
      drums: {
        kit: 'orch',
        steps: {
          kick: 'X.......X.......',
          snare: '....x.......x...',
          hat: '..x...x...x...x.',
          shaker: 'x.x.x.x.x.x.x.x.',
          tom: '..............x.'
        },
        fillEvery: 8, fillType: 'tom', swing: 0,
        intensity: { 1: ['hat'], 2: ['shaker'], 3: ['tom'] }
      },
      layers: [
        L('pad', '弦乐和声', 'pad', 'strings', 'sustain', { gain: 0.42, low: 48, high: 72, pan: -0.2 }),
        L('harp', '竖琴琶音', 'arp', 'harp', 'arp8', { gain: 0.44, low: 55, high: 84, pan: 0.25 }),
        L('bass', '拨弦低音', 'bass', 'pizzStrings', 'root', { gain: 0.5, low: 36, high: 52 }),
        L('flute', '长笛主题', 'lead', 'flute', 'melody', { gain: 0.55, low: 64, high: 86 }),
        L('horn', '圆号副旋律', 'counter', 'frenchHorn', 'counter', { gain: 0.3, low: 50, high: 70, minIntensity: 2 }),
        L('glock', '钟琴点缀', 'arp', 'celesta', 'arpUpDown', { gain: 0.22, low: 72, high: 96, minIntensity: 2, pan: 0.35 })
      ],
      reverb: 0.34, delay: 0.1, width: 0.75, lowpass: 0, gain: 0.9
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'battle', name: '战斗管弦', en: 'Orchestral Battle', emoji: '⚔️',
      family: 'orchestral', color: '#e05d5d',
      desc: '弦乐固定音型 + 铜管重击 + 战鼓，高强度战斗与 Boss 二阶段。',
      tags: ['管弦', '战斗', '紧张'],
      usage: ['Boss 战', '战斗高潮', '追逐'],
      bpm: [132, 160], swing: 0,
      modes: ['minor', 'harmonicMinor', 'phrygian'], defaultMode: 'minor',
      progs: ['i_V_VI_iv', 'i_VII_VI_VII', 'i_VII_VII_i'],
      extension: 0, density: 0.78, complexity: 0.65,
      drums: {
        kit: 'battle',
        steps: {
          kick: 'X.x.X.x.X.x.X.x.',
          snare: '....X.......X...',
          hat: 'x.x.x.x.x.x.x.x.',
          taiko: 'X.....x.X.....x.',
          crash: 'X...........X...',
          tom: '..............xx'
        },
        fillEvery: 4, fillType: 'tom', swing: 0,
        intensity: { 1: ['hat'], 2: ['taiko'], 3: ['crash'] }
      },
      layers: [
        L('ost', '弦乐固定音型', 'arp', 'stringsStacc', 'ostinato16', { gain: 0.46, low: 45, high: 72, pan: -0.25 }),
        L('bass', '低音推进', 'bass', 'cello', 'pulse16', { gain: 0.62, low: 33, high: 50 }),
        L('brass', '铜管重击', 'stab', 'brassStab', 'stab', { gain: 0.6, low: 48, high: 72 }),
        L('lead', '铜管主题', 'lead', 'brassSection', 'melody', { gain: 0.58, low: 57, high: 81 }),
        L('choir', '战吼合唱', 'pad', 'choirPad', 'stab', { gain: 0.32, low: 48, high: 67, minIntensity: 2 }),
        L('horn', '圆号对位', 'counter', 'frenchHorn', 'counter', { gain: 0.3, low: 45, high: 65, minIntensity: 3 })
      ],
      reverb: 0.3, delay: 0.06, width: 0.75, lowpass: 0, gain: 0.95
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'cyberpunk', name: '赛博朋克', en: 'Cyberpunk', emoji: '🌆',
      family: 'electronic', color: '#22d3ee',
      desc: 'Reese 贝斯、锯齿和弦与霓虹琶音，适合赛博都市、黑客与夜行任务。',
      tags: ['电子', '暗黑', '都市'],
      usage: ['赛博都市', '潜入任务', '主菜单'],
      bpm: [96, 124], swing: 0,
      modes: ['minor', 'phrygian', 'harmonicMinor'], defaultMode: 'minor',
      progs: ['i_VII_VI_VII', 'i_VI_iv_V', 'i_II'],
      extension: 2, density: 0.66, complexity: 0.6,
      drums: {
        kit: 'elec',
        steps: {
          kick: 'X...X...X...X...',
          snare: '....X.......X...',
          clap: '....X.......X..x',
          hat: '..x...x...x...x.',
          openhat: '..x...x...x...x.',
          rim: '..x.......x.....'
        },
        fillEvery: 8, fillType: 'hat', swing: 0,
        intensity: { 1: ['hat'], 2: ['clap'], 3: ['openhat', 'rim'] }
      },
      layers: [
        L('pad', '锯齿和弦', 'pad', 'supersaw', 'sustain', { gain: 0.42, low: 48, high: 76, pan: -0.15 }),
        L('bass', 'Reese 低音', 'bass', 'reeseBass', 'pulse8', { gain: 0.62, low: 28, high: 45 }),
        L('arp', '霓虹琶音', 'arp', 'pulse25', 'arp16', { gain: 0.3, low: 60, high: 88, minIntensity: 1, pan: 0.3 }),
        L('lead', '主音合成器', 'lead', 'sawLead', 'melody', { gain: 0.5, low: 57, high: 84 }),
        L('bell', 'FM 钟声', 'counter', 'fmBell', 'arpUpDown', { gain: 0.22, low: 72, high: 96, minIntensity: 2, pan: -0.3 }),
        L('fx', '空气质感', 'texture', 'airTexture', 'air', { gain: 0.18, low: 60, high: 90, minIntensity: 3 })
      ],
      reverb: 0.32, delay: 0.24, width: 0.9, lowpass: 0, gain: 0.9
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'edm', name: '电子舞曲', en: 'EDM / Festival', emoji: '🎛️',
      family: 'electronic', color: '#a855f7',
      desc: '四踩底鼓、侧链和弦与上升音效，适合竞技场、体育小游戏与活力 UI。',
      tags: ['电子', '律动', '高能'],
      usage: ['竞技场', '街机模式', '活动界面'],
      bpm: [124, 132], swing: 0,
      modes: ['minor', 'major', 'mixolydian'], defaultMode: 'minor',
      progs: ['i_VI_III_VII', 'I_V_vi_IV', 'vi_IV_I_V'],
      extension: 1, density: 0.72, complexity: 0.55,
      drums: {
        kit: 'edm',
        steps: {
          kick: 'X...X...X...X...',
          clap: '....X.......X...',
          hat: '..x...x...x...x.',
          openhat: '..x...x...x...x.',
          ride: 'x.x.x.x.x.x.x.x.'
        },
        fillEvery: 4, fillType: 'clap', swing: 0,
        intensity: { 1: ['hat'], 2: ['openhat'], 3: ['ride'] }
      },
      layers: [
        L('chords', '侧链和弦', 'pad', 'supersaw', 'stab', { gain: 0.46, low: 50, high: 76 }),
        L('bass', '律动贝斯', 'bass', 'sawBass', 'offbeat', { gain: 0.6, low: 28, high: 45 }),
        L('arp', '琶音层', 'arp', 'pluckSynth', 'arp16', { gain: 0.3, low: 60, high: 88, minIntensity: 1, pan: 0.28 }),
        L('lead', '主旋律', 'lead', 'sawLead', 'melody', { gain: 0.5, low: 60, high: 84 }),
        L('bell', '铃音点缀', 'counter', 'fmBell', 'arp8', { gain: 0.2, low: 72, high: 96, minIntensity: 2, pan: -0.3 }),
        L('fx', '上升音效', 'texture', 'noiseRiser', 'sweep', { gain: 0.16, low: 60, high: 90, minIntensity: 3 })
      ],
      reverb: 0.26, delay: 0.18, width: 0.92, lowpass: 0, gain: 0.92
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'space', name: '太空科幻', en: 'Space Ambient', emoji: '🚀',
      family: 'electronic', color: '#818cf8',
      desc: '缓慢演化的合成器音床、FM 钟声与失重感，适合星图、科幻探索与过场。',
      tags: ['氛围', '科幻', '空灵'],
      usage: ['星图界面', '太空探索', '过场'],
      bpm: [58, 84], swing: 0,
      modes: ['lydian', 'dorian', 'wholeTone'], defaultMode: 'lydian',
      progs: ['I_II_I_II', 'i_iv_VII_III', 'I_IV_vi_V'],
      extension: 1, density: 0.34, complexity: 0.5,
      drums: {
        kit: 'ambient',
        steps: { kick: 'X...............', sub: 'X.......x.......', hat: '', tick: '........x.......' },
        fillEvery: 16, fillType: 'sub', swing: 0,
        intensity: { 1: ['tick'], 2: ['sub'], 3: ['hat'] }
      },
      layers: [
        L('pad', '玻璃音垫', 'pad', 'glassPad', 'swell', { gain: 0.5, low: 45, high: 76, pan: -0.2 }),
        L('drone', '低频持续音', 'bass', 'sineSub', 'pedal', { gain: 0.42, low: 24, high: 38 }),
        L('bell', 'FM 星铃声', 'arp', 'fmBell', 'arpUpDown', { gain: 0.28, low: 72, high: 96, minIntensity: 1, pan: 0.3 }),
        L('lead', '主旋律', 'lead', 'glassBell', 'melody', { gain: 0.36, low: 64, high: 88, minIntensity: 1 }),
        L('air', '空间质感', 'texture', 'airTexture', 'air', { gain: 0.22, low: 60, high: 92, minIntensity: 0 }),
        L('choir', '人声垫', 'pad', 'choirPad', 'sustain', { gain: 0.26, low: 48, high: 72, minIntensity: 2 })
      ],
      reverb: 0.55, delay: 0.28, width: 0.95, lowpass: 0, gain: 0.86
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'lofi', name: 'Lo-Fi 慵懒', en: 'Lo-Fi Chill', emoji: '☕',
      family: 'urban', color: '#d9a066',
      desc: '磁带噪底、电钢琴与摇摆鼓组，适合生活系统、商店、存档房间与日常场景。',
      tags: ['Lo-Fi', '放松', '日常'],
      usage: ['商店', '房间', '日常系统'],
      bpm: [72, 92], swing: 0.18,
      modes: ['major', 'dorian', 'minor'], defaultMode: 'major',
      progs: ['ii_V_I_VI', 'I_vi_ii_V', 'I_V_vi_IV'],
      extension: 2, density: 0.44, complexity: 0.62,
      drums: {
        kit: 'lofi',
        steps: {
          kick: 'X......x..X.....',
          snap: '....X.......X...',
          hat: '..x...x...x...x.',
          shaker: 'x..x..x...x..x..',
          rim: '..x.......x..x..'
        },
        fillEvery: 8, fillType: 'snap', swing: 0.18,
        intensity: { 1: ['hat'], 2: ['shaker'], 3: ['rim'] }
      },
      layers: [
        L('keys', '电钢琴和声', 'arp', 'ePiano', 'comp', { gain: 0.5, low: 48, high: 76, pan: -0.15 }),
        L('bass', '行走贝斯', 'bass', 'uprightBass', 'walk', { gain: 0.55, low: 28, high: 45 }),
        L('lead', '主旋律', 'lead', 'vibes', 'melody', { gain: 0.42, low: 60, high: 84 }),
        L('pad', '暖色铺底', 'pad', 'warmPad', 'sustain', { gain: 0.3, low: 48, high: 72, minIntensity: 1, pan: 0.2 }),
        L('bell', '点缀音', 'counter', 'fmBell', 'arp8', { gain: 0.16, low: 72, high: 96, minIntensity: 2, pan: -0.35 }),
        L('fx', '磁带噪底', 'texture', 'vinylNoise', 'vinyl', { gain: 0.16, low: 40, high: 90, minIntensity: 0 })
      ],
      reverb: 0.24, delay: 0.12, width: 0.7, lowpass: 9000, gain: 0.88
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'dnb', name: '疾速追逐', en: 'Drum & Bass', emoji: '🥁',
      family: 'electronic', color: '#f43f5e',
      desc: '碎拍鼓组与 Reese 贝斯，适合载具追逐、跑酷与高速战斗。',
      tags: ['电子', '高速', '紧迫'],
      usage: ['追逐战', '跑酷', '高速移动'],
      bpm: [168, 178], swing: 0,
      modes: ['minor', 'phrygian', 'dorian'], defaultMode: 'minor',
      progs: ['i_VII_VI_VII', 'i_VI_iv_V', 'i_II'],
      extension: 1, density: 0.8, complexity: 0.7,
      drums: {
        kit: 'dnb',
        steps: {
          kick: 'X.........X.....',
          snare: '....X.......X..x',
          hat: 'x.x.x.x.x.x.x.x.',
          openhat: '......x.......x.',
          ghost: '..x.......x.....'
        },
        fillEvery: 4, fillType: 'snare', swing: 0,
        intensity: { 1: ['hat'], 2: ['ghost'], 3: ['openhat'] }
      },
      layers: [
        L('bass', 'Reese 贝斯', 'bass', 'reeseBass', 'sub', { gain: 0.65, low: 26, high: 43 }),
        L('pad', '暗色铺底', 'pad', 'warmPad', 'sustain', { gain: 0.32, low: 48, high: 72, pan: -0.2 }),
        L('stab', '切分和弦', 'stab', 'brassStab', 'stab', { gain: 0.44, low: 50, high: 72 }),
        L('arp', '高速琶音', 'arp', 'pluckSynth', 'arp16', { gain: 0.28, low: 60, high: 88, minIntensity: 1, pan: 0.3 }),
        L('lead', '主旋律', 'lead', 'sawLead', 'melody', { gain: 0.4, low: 60, high: 84, minIntensity: 1 }),
        L('fx', '冲击音效', 'texture', 'noiseRiser', 'sweep', { gain: 0.18, low: 60, high: 92, minIntensity: 3 })
      ],
      reverb: 0.28, delay: 0.12, width: 0.88, lowpass: 0, gain: 0.94
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'chiptune', name: '8-bit 像素', en: 'Chiptune', emoji: '👾',
      family: 'chiptune', color: '#4ade80',
      desc: '方波主旋律 + 三角波贝斯 + 噪声鼓，纯正 FC 味道，适合像素平台跳跃。',
      tags: ['芯片', '复古', '像素'],
      usage: ['平台跳跃', '像素 RPG', '街机'],
      bpm: [132, 168], swing: 0,
      modes: ['major', 'minor', 'mixolydian'], defaultMode: 'major',
      progs: ['I_V_vi_IV', 'i_VII_VI_VII', 'I_IV_vi_V'],
      extension: 0, density: 0.66, complexity: 0.55,
      drums: {
        kit: 'chip',
        steps: {
          kick: 'X...X...X...X...',
          snare: '....x.......x...',
          hat: 'x.x.x.x.x.x.x.x.',
          tom: '..............xx'
        },
        fillEvery: 4, fillType: 'tom', swing: 0,
        intensity: { 1: ['hat'], 2: ['tom'], 3: ['hat'] }
      },
      layers: [
        L('lead', '方波主旋律', 'lead', 'pulse25', 'melody', { gain: 0.45, low: 60, high: 88 }),
        L('harm', '和声方波', 'arp', 'pulse12', 'arp8', { gain: 0.26, low: 55, high: 79, minIntensity: 1, pan: 0.2 }),
        L('bass', '三角波贝斯', 'bass', 'triangleBass', 'pulse8', { gain: 0.55, low: 28, high: 45 }),
        L('echo', '副旋律', 'counter', 'pulse25', 'counter', { gain: 0.24, low: 62, high: 86, minIntensity: 2, pan: -0.3 }),
        L('arp', '快速琶音', 'arp', 'pulse12', 'arp16', { gain: 0.18, low: 67, high: 91, minIntensity: 3 })
      ],
      reverb: 0.08, delay: 0.14, width: 0.55, lowpass: 0, gain: 0.85
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'guofeng', name: '国风古典', en: 'Chinese Classical', emoji: '🏮',
      family: 'ethnic', color: '#ef4444',
      desc: '古筝、笛子、二胡与五声音阶，保留原站气质，适合仙侠与东方幻想。',
      tags: ['国风', '五声', '东方'],
      usage: ['仙侠', '主城', '剧情'],
      bpm: [64, 88], swing: 0,
      modes: ['majorPent', 'minorPent', 'hirajoshi'], defaultMode: 'majorPent',
      progs: ['pent_1_5_6_3', 'pent_6_1_5_3', 'pent_1_4_5_1'],
      extension: 0, density: 0.5, complexity: 0.5,
      drums: {
        kit: 'ethnic',
        steps: {
          kick: 'X.......X.......',
          taiko: 'X.....x.X.....x.',
          wood: '..x...x...x...x.',
          gong: 'X...............'
        },
        fillEvery: 8, fillType: 'taiko', swing: 0,
        intensity: { 1: ['wood'], 2: ['taiko'], 3: ['gong'] }
      },
      layers: [
        L('pad', '弦乐铺底', 'pad', 'stringPad', 'sustain', { gain: 0.38, low: 45, high: 72, pan: -0.2 }),
        L('guzheng', '古筝分解', 'arp', 'guzheng', 'arp8', { gain: 0.46, low: 55, high: 84, pan: 0.25 }),
        L('bass', '低音', 'bass', 'pluckSynth', 'root', { gain: 0.4, low: 33, high: 50 }),
        L('dizi', '笛子主题', 'lead', 'dizi', 'melody', { gain: 0.45, low: 67, high: 88 }),
        L('erhu', '二胡对位', 'counter', 'erhu', 'counter', { gain: 0.3, low: 55, high: 76, minIntensity: 2 }),
        L('pipa', '琵琶点缀', 'counter', 'pipa', 'arpUpDown', { gain: 0.22, low: 67, high: 91, minIntensity: 3, pan: -0.3 })
      ],
      reverb: 0.4, delay: 0.12, width: 0.72, lowpass: 0, gain: 0.88
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'japanese', name: '和风物语', en: 'Japanese Traditional', emoji: '⛩️',
      family: 'ethnic', color: '#f87171',
      desc: '筝、尺八与太鼓，平调子/都节音阶的寂寥与肃杀，适合武士与和风幻想。',
      tags: ['和风', '东方', '寂寥'],
      usage: ['武士题材', '和风主城', '剧情'],
      bpm: [60, 88], swing: 0,
      modes: ['hirajoshi', 'miyako', 'yo'], defaultMode: 'hirajoshi',
      progs: ['pent_1_4_5_1', 'pent_6_1_5_3', 'i_VII_VI_VII'],
      extension: 0, density: 0.44, complexity: 0.5,
      drums: {
        kit: 'ethnic',
        steps: {
          kick: 'X.......X.......',
          taiko: 'X.....x.X.......',
          wood: '..x...x...x...x.',
          shaker: '....x.......x...'
        },
        fillEvery: 8, fillType: 'taiko', swing: 0,
        intensity: { 1: ['wood'], 2: ['shaker'], 3: ['taiko'] }
      },
      layers: [
        L('pad', '弦乐底', 'pad', 'stringPad', 'swell', { gain: 0.34, low: 45, high: 72, pan: -0.2 }),
        L('koto', '筝琶音', 'arp', 'koto', 'arp8', { gain: 0.44, low: 55, high: 84, pan: 0.28 }),
        L('bass', '低音', 'bass', 'pluckSynth', 'root', { gain: 0.38, low: 33, high: 50 }),
        L('shaku', '尺八主题', 'lead', 'shakuhachi', 'melody', { gain: 0.42, low: 64, high: 86 }),
        L('shami', '三味线节奏', 'counter', 'shamisen', 'ostinato16', { gain: 0.24, low: 57, high: 79, minIntensity: 2, pan: -0.3 }),
        L('bell', '铜铃', 'counter', 'musicBox', 'arpUpDown', { gain: 0.2, low: 76, high: 96, minIntensity: 3, pan: 0.35 })
      ],
      reverb: 0.44, delay: 0.1, width: 0.7, lowpass: 0, gain: 0.86
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'celtic', name: '凯尔特奇幻', en: 'Celtic Fantasy', emoji: '🍀',
      family: 'ethnic', color: '#34d399',
      desc: '小提琴、锡笛与竖琴的三拍/六拍律动，适合绿野、酒馆与英雄旅程。',
      tags: ['凯尔特', '奇幻', '田园'],
      usage: ['奇幻世界', '酒馆', '旅程'],
      bpm: [88, 118], swing: 0,
      modes: ['dorian', 'mixolydian', 'major'], defaultMode: 'dorian',
      progs: ['I_IV_vi_V', 'I_iii_IV_V', 'i_VII_VI_VII'],
      extension: 0, density: 0.6, complexity: 0.5,
      drums: {
        kit: 'celtic',
        steps: {
          kick: 'X.......X.......',
          snare: '....x.......x...',
          shaker: 'x.x.x.x.x.x.x.x.',
          tom: '..............x.'
        },
        fillEvery: 8, fillType: 'tom', swing: 0,
        intensity: { 1: ['shaker'], 2: ['snare'], 3: ['tom'] }
      },
      layers: [
        L('pad', '弦乐和声', 'pad', 'strings', 'sustain', { gain: 0.34, low: 48, high: 72, pan: -0.2 }),
        L('harp', '竖琴分解', 'arp', 'harp', 'arp8', { gain: 0.4, low: 55, high: 84, pan: 0.25 }),
        L('bass', '低音', 'bass', 'pluckSynth', 'root', { gain: 0.42, low: 33, high: 50 }),
        L('fiddle', '小提琴主题', 'lead', 'fiddle', 'melody', { gain: 0.48, low: 62, high: 84 }),
        L('whistle', '锡笛副旋律', 'counter', 'whistle', 'counter', { gain: 0.3, low: 67, high: 88, minIntensity: 2 }),
        L('lute', '鲁特琴扫弦', 'stab', 'lute', 'strum', { gain: 0.26, low: 50, high: 72, minIntensity: 2, pan: -0.3 })
      ],
      reverb: 0.3, delay: 0.08, width: 0.78, lowpass: 0, gain: 0.88
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'tribal', name: '部落战鼓', en: 'Tribal Percussion', emoji: '🪘',
      family: 'ethnic', color: '#fb923c',
      desc: '层层叠加的手鼓与太鼓、人声长音与异域管乐，适合荒野、祭祀与蛮族。',
      tags: ['打击乐', '异域', '原始'],
      usage: ['荒野地图', '祭祀', '蛮族营地'],
      bpm: [100, 128], swing: 0,
      modes: ['minor', 'hungarian', 'phrygianDom'], defaultMode: 'minor',
      progs: ['i_VII_VII_i', 'i_VII_VI_VII', 'i_II'],
      extension: 0, density: 0.85, complexity: 0.6,
      drums: {
        kit: 'tribal',
        steps: {
          kick: 'X..x..X.X..x..X.',
          taiko: 'X..x..x.X..x..x.',
          snare: '....x.......x...',
          shaker: 'x.xxx.xxx.xxx.xx',
          tom: '..x..x..x..x..x.'
        },
        fillEvery: 4, fillType: 'tom', swing: 0,
        intensity: { 1: ['shaker'], 2: ['tom', 'taiko'], 3: ['snare'] }
      },
      layers: [
        L('drone', '低频持续音', 'bass', 'sineSub', 'pedal', { gain: 0.48, low: 24, high: 38 }),
        L('choir', '人声长音', 'pad', 'choirPad', 'sustain', { gain: 0.4, low: 45, high: 69 }),
        L('flute', '骨笛主题', 'lead', 'dizi', 'melody', { gain: 0.36, low: 64, high: 86 }),
        L('call', '人声呼喊', 'stab', 'choirPad', 'stab', { gain: 0.3, low: 48, high: 72, minIntensity: 2 }),
        L('bell', '图腾铃', 'counter', 'musicBox', 'arp8', { gain: 0.18, low: 72, high: 93, minIntensity: 3, pan: 0.35 })
      ],
      reverb: 0.36, delay: 0.12, width: 0.8, lowpass: 0, gain: 0.92
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'horror', name: '恐怖悬疑', en: 'Horror Ambience', emoji: '🕯️',
      family: 'horror', color: '#7c3aed',
      desc: '无调性音簇、金属撞击与心跳低频，适合恐怖探索与精神污染场景。',
      tags: ['恐怖', '氛围', '无调性'],
      usage: ['恐怖探索', '精神空间', '怪物巢穴'],
      bpm: [48, 72], swing: 0,
      modes: ['phrygian', 'wholeTone', 'hungarian'], defaultMode: 'phrygian',
      progs: ['i_II', 'i_VII_IV_iv', 'I_II_I_II'],
      extension: 0, density: 0.22, complexity: 0.55,
      drums: {
        kit: 'horror',
        steps: {
          kick: 'X..x............',
          metal: '........X.......',
          tick: '....x.......x...'
        },
        fillEvery: 16, fillType: 'metal', swing: 0,
        intensity: { 1: ['tick'], 2: ['metal'], 3: ['metal'] }
      },
      layers: [
        L('cluster', '音簇铺底', 'pad', 'choirPad', 'swell', { gain: 0.4, low: 45, high: 76, pan: -0.25 }),
        L('drone', '低频嗡鸣', 'bass', 'sineSub', 'pedal', { gain: 0.36, low: 24, high: 38 }),
        L('box', '八音盒', 'lead', 'musicBox', 'melody', { gain: 0.22, low: 72, high: 93 }),
        L('air', '空气噪底', 'texture', 'airTexture', 'air', { gain: 0.24, low: 55, high: 95, minIntensity: 0 }),
        L('hit', '金属撞击', 'stab', 'brassStab', 'stab', { gain: 0.2, low: 45, high: 67, minIntensity: 2 })
      ],
      reverb: 0.62, delay: 0.3, width: 0.9, lowpass: 0, gain: 0.82
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'tension', name: '悬疑紧张', en: 'Suspense', emoji: '🔍',
      family: 'horror', color: '#94a3b8',
      desc: '脉冲式固定音型、拨弦与滴答声，适合调查、潜行与解谜倒计时。',
      tags: ['悬疑', '紧张', '极简'],
      usage: ['调查', '潜行', '解谜'],
      bpm: [88, 116], swing: 0,
      modes: ['minor', 'harmonicMinor', 'phrygian'], defaultMode: 'minor',
      progs: ['i_VII_VII_i', 'i_iv_VII_III', 'i_II'],
      extension: 0, density: 0.5, complexity: 0.6,
      drums: {
        kit: 'tension',
        steps: {
          kick: 'X.......X.......',
          tick: '..x...x...x...x.',
          hat: 'x.x.x.x.x.x.x.x.',
          rim: '....x.......x...'
        },
        fillEvery: 8, fillType: 'rim', swing: 0,
        intensity: { 1: ['hat'], 2: ['rim'], 3: ['tick'] }
      },
      layers: [
        L('ost', '弦乐脉冲', 'arp', 'strings', 'ostinato16', { gain: 0.4, low: 48, high: 72 }),
        L('bass', '低音固定音', 'bass', 'cello', 'pulse8', { gain: 0.48, low: 28, high: 45 }),
        L('piano', '点状钢琴', 'lead', 'piano', 'sparse', { gain: 0.34, low: 55, high: 84 }),
        L('stab', '铜管刺杀', 'stab', 'brassStab', 'stab', { gain: 0.3, low: 45, high: 67, minIntensity: 2 }),
        L('air', '空气噪底', 'texture', 'airTexture', 'air', { gain: 0.2, low: 60, high: 90, minIntensity: 0 })
      ],
      reverb: 0.38, delay: 0.16, width: 0.7, lowpass: 0, gain: 0.86
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'jazz', name: '爵士酒馆', en: 'Jazz Lounge', emoji: '🎷',
      family: 'jazz', color: '#f59e0b',
      desc: 'Walking Bass、电钢 Comping 与摇摆鼓刷，适合酒馆、赌场与黑色电影。',
      tags: ['爵士', '摇摆', '慵懒'],
      usage: ['酒馆', '赌场', '对话场景'],
      bpm: [88, 120], swing: 0.32,
      modes: ['major', 'minor', 'dorian'], defaultMode: 'major',
      progs: ['ii_V_I_VI', 'I_vi_ii_V', 'i_iv_VII_III7'],
      extension: 2, density: 0.58, complexity: 0.75,
      drums: {
        kit: 'jazz',
        steps: {
          kick: 'X.......x.......',
          ride: 'x.x.x.x.x.x.x.x.',
          brush: '....o.......o...',
          pedal: '....x.......x...',
          rim: '..x.......x.....'
        },
        fillEvery: 8, fillType: 'rim', swing: 0.32,
        intensity: { 1: ['ride'], 2: ['pedal'], 3: ['brush'] }
      },
      layers: [
        L('comp', '电钢 Comping', 'arp', 'ePiano', 'comp', { gain: 0.46, low: 48, high: 76, pan: -0.2 }),
        L('bass', 'Walking Bass', 'bass', 'uprightBass', 'walk', { gain: 0.58, low: 28, high: 45 }),
        L('lead', '颤音琴主题', 'lead', 'vibes', 'melody', { gain: 0.4, low: 60, high: 84 }),
        L('trumpet', '弱音小号', 'counter', 'brassSection', 'counter', { gain: 0.26, low: 57, high: 79, minIntensity: 2 }),
        L('brush', '鼓刷质感', 'texture', 'vinylNoise', 'vinyl', { gain: 0.1, low: 40, high: 90, minIntensity: 1 })
      ],
      reverb: 0.28, delay: 0.06, width: 0.65, lowpass: 0, gain: 0.86
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'casual', name: '休闲解谜', en: 'Casual Puzzle', emoji: '🍬',
      family: 'casual', color: '#38bdf8',
      desc: '马林巴、拨弦与钟琴的轻快律动，适合三消、模拟经营与休闲关卡。',
      tags: ['休闲', '轻快', '可爱'],
      usage: ['休闲关卡', '模拟经营', 'UI'],
      bpm: [96, 124], swing: 0.06,
      modes: ['major', 'majorPent', 'mixolydian'], defaultMode: 'major',
      progs: ['I_V_vi_IV', 'I_vi_IV_V', 'I_IV_vi_V'],
      extension: 1, density: 0.62, complexity: 0.4,
      drums: {
        kit: 'casual',
        steps: {
          kick: 'X.......X.......',
          snap: '....x.......x...',
          shaker: '..x...x...x...x.',
          wood: '..x..x...x..x...'
        },
        fillEvery: 8, fillType: 'wood', swing: 0.06,
        intensity: { 1: ['shaker'], 2: ['wood'], 3: ['snap'] }
      },
      layers: [
        L('marimba', '马林巴和声', 'arp', 'marimba', 'arp8', { gain: 0.44, low: 48, high: 76, pan: -0.2 }),
        L('bass', '拨弦贝斯', 'bass', 'pizzStrings', 'root', { gain: 0.46, low: 33, high: 50 }),
        L('lead', '钟琴主题', 'lead', 'celesta', 'melody', { gain: 0.4, low: 67, high: 91 }),
        L('pad', '柔和铺底', 'pad', 'warmPad', 'sustain', { gain: 0.24, low: 48, high: 72, minIntensity: 1 }),
        L('glock', '高音点缀', 'counter', 'musicBox', 'arpUpDown', { gain: 0.18, low: 76, high: 96, minIntensity: 2, pan: 0.35 }),
        L('pluck', '拨弦琶音', 'arp', 'pluckSynth', 'arp16', { gain: 0.16, low: 60, high: 84, minIntensity: 3 })
      ],
      reverb: 0.26, delay: 0.1, width: 0.72, lowpass: 0, gain: 0.86
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'sad', name: '叙事钢琴', en: 'Cinematic Piano', emoji: '🎹',
      family: 'cinematic', color: '#c084fc',
      desc: '钢琴分解和弦与大提琴长音，克制而深情，适合剧情演出与失去的场景。',
      tags: ['钢琴', '叙事', '悲伤'],
      usage: ['剧情演出', '回忆', '结局'],
      bpm: [56, 76], swing: 0,
      modes: ['minor', 'major', 'harmonicMinor'], defaultMode: 'minor',
      progs: ['i_VI_iv_V', 'i_VII_VI_VII', 'I_vi_IV_V'],
      extension: 1, density: 0.38, complexity: 0.5,
      drums: {
        kit: 'ambient',
        steps: { kick: 'X...............', sub: 'X.......x.......' },
        fillEvery: 16, fillType: 'sub', swing: 0,
        intensity: { 1: ['sub'], 2: ['kick'], 3: ['sub'] }
      },
      layers: [
        L('piano', '钢琴分解', 'arp', 'piano', 'broken', { gain: 0.52, low: 48, high: 79, pan: -0.1 }),
        L('melody', '钢琴旋律', 'lead', 'piano', 'melody', { gain: 0.46, low: 60, high: 86 }),
        L('cello', '大提琴长音', 'counter', 'cello', 'sustain', { gain: 0.34, low: 40, high: 60, minIntensity: 1 }),
        L('pad', '弦乐铺底', 'pad', 'stringPad', 'sustain', { gain: 0.26, low: 45, high: 72, minIntensity: 2, pan: 0.2 }),
        L('air', '空气质感', 'texture', 'airTexture', 'air', { gain: 0.14, low: 60, high: 90, minIntensity: 3 })
      ],
      reverb: 0.46, delay: 0.12, width: 0.7, lowpass: 0, gain: 0.84
    }
  ];

  var BY_ID = {};
  STYLES.forEach(function (s) { BY_ID[s.id] = s; });

  var FAMILIES = [
    { id: 'all', name: '全部' },
    { id: 'orchestral', name: '管弦' },
    { id: 'electronic', name: '电子' },
    { id: 'chiptune', name: '芯片' },
    { id: 'ethnic', name: '民族' },
    { id: 'urban', name: '都市' },
    { id: 'horror', name: '悬疑' },
    { id: 'jazz', name: '爵士' },
    { id: 'casual', name: '休闲' },
    { id: 'cinematic', name: '叙事' }
  ];

  GBG.styles = {
    list: STYLES,
    byId: function (id) { return BY_ID[id] || STYLES[0]; },
    families: FAMILIES
  };
})(typeof window !== 'undefined' ? window : globalThis);
