/* ==========================================================================
 * presets.js — RPG 音效分类、风格、预设与合成配方
 * 纯逻辑：不依赖 DOM / AudioContext，可在 Node 中测试。
 * ========================================================================== */
(function (global) {
  'use strict';

  var SFX = global.SFX = global.SFX || {};
  var U = SFX.util;
  var clamp = U.clamp;

  var CATEGORIES = [
    { id: 'impact', name: '打击', icon: '⚔️', desc: '命中 / 格挡 / 暴击 / 挥砍' },
    { id: 'ui', name: '交互', icon: '🖱️', desc: '按钮 / 拾取 / 任务提示' },
    { id: 'buff', name: '强化', icon: '✨', desc: '升级 / 附魔 / 精炼' },
    { id: 'skill', name: '技能', icon: '🔥', desc: '火焰 / 冰霜 / 雷电 / 治疗' },
    { id: 'forge', name: '锻造', icon: '🔨', desc: '敲击 / 淬火 / 成功失败' },
    { id: 'world', name: '世界', icon: '🚪', desc: '门 / 宝箱 / 药水 / 脚步' },
    { id: 'monster', name: '怪物', icon: '👹', desc: '低吼 / 受击 / 死亡' }
  ];

  var STYLES = {
    realistic: { id: 'realistic', name: '写实', pitch: 0, bright: 0, space: 1, drive: 1, wave: null },
    pixel: { id: 'pixel', name: '像素', pitch: 0, bright: 0.12, space: 0.15, drive: 0.7, wave: 'square' },
    dark: { id: 'dark', name: '暗黑', pitch: -4, bright: -0.22, space: 1.25, drive: 1.4, wave: 'sawtooth' },
    bright: { id: 'bright', name: '明亮', pitch: 4, bright: 0.18, space: 0.85, drive: 0.9, wave: 'triangle' }
  };

  var BASE_MACROS = {
    weight: 0.5, brightness: 0.55, metallic: 0.35,
    roughness: 0.3, magic: 0.3, space: 0.3, pitch: 0
  };

  // 每个变体在预设基础上做“种子化”的微差，避免 8 个变体听起来一样。
  // 数值是该参数的 ± 抖动幅度；pitch 单位是半音。
  var VARIATION = {
    impact: { weight: 0.10, brightness: 0.13, metallic: 0.12, roughness: 0.08, magic: 0.05, space: 0.06, pitch: 2.4 },
    ui: { brightness: 0.07, metallic: 0.06, space: 0.03, pitch: 1.2 },
    buff: { magic: 0.09, brightness: 0.08, space: 0.05, pitch: 1.6 },
    skill: { magic: 0.09, brightness: 0.08, weight: 0.07, space: 0.05, pitch: 1.6 },
    forge: { weight: 0.08, brightness: 0.08, metallic: 0.09, space: 0.04, pitch: 1.2 },
    world: { brightness: 0.08, roughness: 0.08, space: 0.04, pitch: 1.2 },
    monster: { weight: 0.07, brightness: 0.06, roughness: 0.08, pitch: 1.6 }
  };

  function P(id, cat, name, kind, tags, dur, defaults, opts) {
    return {
      id: id, cat: cat, name: name, kind: kind, tags: tags || [],
      dur: dur || [0.2, 0.6], defaults: defaults || {}, opts: opts || {}
    };
  }

  var PRESETS = [
    /* ---------------- 打击 ---------------- */
    P('blade_light', 'impact', '轻刃', 'slash', ['刃', '金属', '轻'], [0.18, 0.35],
      { weight: 0.2, metallic: 0.85, brightness: 0.84, roughness: 0.3, space: 0.14 },
      { weight: 0.2 }),
    P('blade_heavy', 'impact', '重刃', 'slash', ['刃', '金属', '重'], [0.32, 0.55],
      { weight: 0.72, metallic: 0.8, brightness: 0.56, roughness: 0.45, space: 0.22 },
      { weight: 0.72 }),
    P('metal_clang', 'impact', '金属碰撞', 'impact', ['金属', '格挡'], [0.5, 0.9],
      { weight: 0.5, metallic: 0.95, brightness: 0.8, space: 0.35 },
      { material: 'metal', weight: 0.5, ring: 1.3 }),
    P('wood_hit', 'impact', '木击', 'impact', ['木质', '钝击'], [0.25, 0.5],
      { weight: 0.55, metallic: 0.12, brightness: 0.45, space: 0.18 },
      { material: 'wood', weight: 0.55 }),
    P('stone_hit', 'impact', '石击', 'impact', ['石头', '钝击'], [0.35, 0.7],
      { weight: 0.65, metallic: 0.2, brightness: 0.38, space: 0.28 },
      { material: 'stone', weight: 0.65 }),
    P('flesh_hit', 'impact', '肉体击打', 'impact', ['血肉', '钝击'], [0.2, 0.4],
      { weight: 0.5, metallic: 0.05, brightness: 0.3, space: 0.1 },
      { material: 'flesh', weight: 0.5 }),
    P('critical', 'impact', '暴击', 'slash', ['刃', '暴击'], [0.4, 0.75],
      { weight: 0.45, metallic: 0.88, brightness: 0.86, magic: 0.55, space: 0.24 },
      { weight: 0.45, critical: true }),
    P('block_shield', 'impact', '格挡', 'impact', ['盾牌', '金属'], [0.4, 0.8],
      { weight: 0.6, metallic: 0.85, brightness: 0.6, space: 0.3 },
      { material: 'metal', weight: 0.6, block: true }),
    P('arrow_hit', 'impact', '箭矢命中', 'impact', ['木质', '箭'], [0.25, 0.5],
      { weight: 0.35, metallic: 0.15, brightness: 0.6, space: 0.2 },
      { material: 'wood', weight: 0.35, arrow: true }),
    P('energy_hit', 'impact', '能量命中', 'impact', ['魔法', '能量'], [0.4, 0.8],
      { weight: 0.45, metallic: 0.3, brightness: 0.7, magic: 0.75, space: 0.4 },
      { material: 'energy', weight: 0.45 }),
    P('whoosh_light', 'impact', '轻挥', 'whoosh', ['挥砍', '空气'], [0.25, 0.45],
      { weight: 0.3, brightness: 0.6, metallic: 0.05, space: 0.22 },
      { power: 0.3 }),
    P('whoosh_heavy', 'impact', '重挥', 'whoosh', ['挥砍', '重'], [0.4, 0.7],
      { weight: 0.78, brightness: 0.5, metallic: 0.05, space: 0.3 },
      { power: 0.8 }),

    /* ---------------- 交互 ---------------- */
    P('ui_hover', 'ui', '悬停', 'ui', ['轻', '界面'], [0.05, 0.09],
      { brightness: 0.65, metallic: 0.1, space: 0.03 }, { sound: 'hover' }),
    P('ui_click', 'ui', '点击', 'ui', ['界面', '按钮'], [0.06, 0.1],
      { brightness: 0.7, metallic: 0.12, space: 0.05 }, { sound: 'click' }),
    P('ui_confirm', 'ui', '确认', 'ui', ['界面', '正向'], [0.16, 0.26],
      { brightness: 0.75, metallic: 0.15, space: 0.12 }, { sound: 'confirm' }),
    P('ui_cancel', 'ui', '取消', 'ui', ['界面', '反向'], [0.14, 0.24],
      { brightness: 0.55, metallic: 0.1, space: 0.1 }, { sound: 'cancel' }),
    P('ui_error', 'ui', '错误', 'ui', ['界面', '警示'], [0.2, 0.32],
      { brightness: 0.45, metallic: 0.1, roughness: 0.55, space: 0.06 }, { sound: 'error' }),
    P('ui_coin', 'ui', '金币', 'ui', ['拾取', '清脆'], [0.25, 0.4],
      { brightness: 0.85, metallic: 0.55, space: 0.15 }, { sound: 'coin' }),
    P('ui_pickup', 'ui', '拾取', 'ui', ['物品', '正向'], [0.28, 0.45],
      { brightness: 0.75, metallic: 0.3, space: 0.18 }, { sound: 'pickup' }),
    P('ui_page', 'ui', '翻页', 'ui', ['界面', '纸张'], [0.2, 0.32],
      { brightness: 0.55, roughness: 0.5, space: 0.08 }, { sound: 'page' }),
    P('ui_tab', 'ui', '切换', 'ui', ['界面', '轻'], [0.08, 0.14],
      { brightness: 0.65, metallic: 0.15, space: 0.05 }, { sound: 'tab' }),
    P('ui_quest', 'ui', '任务完成', 'ui', ['任务', '奖励'], [0.7, 1.05],
      { brightness: 0.8, metallic: 0.45, magic: 0.5, space: 0.4 }, { sound: 'quest' }),
    P('ui_levelup', 'ui', '升级', 'ui', ['升级', '奖励'], [0.85, 1.25],
      { brightness: 0.82, metallic: 0.5, magic: 0.65, space: 0.45 }, { sound: 'levelup' }),

    /* ---------------- 强化 ---------------- */
    P('buff_power', 'buff', '力量提升', 'buff', ['属性', '上升'], [0.7, 1.0],
      { magic: 0.55, brightness: 0.6, metallic: 0.35, space: 0.35 }, { sound: 'power' }),
    P('buff_enchant', 'buff', '附魔', 'buff', ['附魔', '魔法'], [0.8, 1.2],
      { magic: 0.85, brightness: 0.75, metallic: 0.4, space: 0.5 }, { sound: 'enchant' }),
    P('buff_gem', 'buff', '镶嵌宝石', 'buff', ['宝石', '清脆'], [0.5, 0.8],
      { magic: 0.6, brightness: 0.9, metallic: 0.55, space: 0.35 }, { sound: 'gem' }),
    P('buff_refine_ok', 'buff', '精炼成功', 'buff', ['精炼', '成功'], [0.6, 0.9],
      { magic: 0.5, brightness: 0.75, metallic: 0.7, space: 0.35 }, { sound: 'refine_ok' }),
    P('buff_refine_fail', 'buff', '精炼失败', 'buff', ['精炼', '失败'], [0.5, 0.8],
      { magic: 0.2, brightness: 0.35, metallic: 0.2, roughness: 0.55, space: 0.2 }, { sound: 'refine_fail' }),
    P('buff_shield', 'buff', '护盾生成', 'buff', ['护盾', '防御'], [0.7, 1.0],
      { magic: 0.6, brightness: 0.55, metallic: 0.35, space: 0.4 }, { sound: 'shield' }),
    P('buff_heal', 'buff', '持续治疗', 'buff', ['治疗', '柔和'], [0.8, 1.2],
      { magic: 0.55, brightness: 0.6, metallic: 0.1, space: 0.55 }, { sound: 'heal' }),
    P('buff_stat', 'buff', '属性提升', 'buff', ['属性', '短'], [0.4, 0.6],
      { magic: 0.45, brightness: 0.7, metallic: 0.25, space: 0.25 }, { sound: 'stat' }),

    /* ---------------- 技能 ---------------- */
    P('skill_fire_cast', 'skill', '火焰施法', 'skill', ['火焰', '施法'], [0.4, 0.7],
      { magic: 0.8, brightness: 0.55, weight: 0.5, space: 0.3 }, { element: 'fire', phase: 'cast' }),
    P('skill_fire_impact', 'skill', '火焰命中', 'skill', ['火焰', '命中'], [0.5, 0.9],
      { magic: 0.7, brightness: 0.5, weight: 0.75, roughness: 0.5, space: 0.3 }, { element: 'fire', phase: 'impact' }),
    P('skill_ice_cast', 'skill', '冰霜施法', 'skill', ['冰霜', '施法'], [0.4, 0.7],
      { magic: 0.75, brightness: 0.85, metallic: 0.45, space: 0.4 }, { element: 'ice', phase: 'cast' }),
    P('skill_ice_shatter', 'skill', '冰晶碎裂', 'skill', ['冰霜', '碎裂'], [0.5, 0.9],
      { magic: 0.5, brightness: 0.9, metallic: 0.7, space: 0.35 }, { element: 'ice', phase: 'impact' }),
    P('skill_lightning_cast', 'skill', '雷电蓄力', 'skill', ['雷电', '施法'], [0.5, 0.8],
      { magic: 0.7, brightness: 0.7, roughness: 0.65, space: 0.3 }, { element: 'lightning', phase: 'cast' }),
    P('skill_lightning_strike', 'skill', '落雷', 'skill', ['雷电', '命中'], [0.6, 1.0],
      { magic: 0.55, brightness: 0.8, weight: 0.85, roughness: 0.75, space: 0.45 }, { element: 'lightning', phase: 'impact' }),
    P('skill_heal', 'skill', '治疗术', 'skill', ['治疗', '神圣'], [0.8, 1.3],
      { magic: 0.75, brightness: 0.7, metallic: 0.15, space: 0.6 }, { element: 'heal' }),
    P('skill_buff_aura', 'skill', '增益光环', 'skill', ['光环', '增益'], [0.8, 1.2],
      { magic: 0.8, brightness: 0.65, metallic: 0.2, space: 0.55 }, { element: 'aura' }),
    P('skill_curse', 'skill', '诅咒', 'skill', ['暗影', '减益'], [0.9, 1.5],
      { magic: 0.7, brightness: 0.25, metallic: 0.2, roughness: 0.55, space: 0.55 }, { element: 'curse' }),
    P('skill_summon', 'skill', '召唤', 'skill', ['召唤', '厚重'], [1.0, 1.6],
      { magic: 0.7, brightness: 0.4, weight: 0.85, space: 0.55 }, { element: 'summon' }),
    P('skill_holy', 'skill', '神圣', 'skill', ['神圣', '光明'], [0.8, 1.3],
      { magic: 0.85, brightness: 0.85, metallic: 0.5, space: 0.65 }, { element: 'holy' }),
    P('skill_dark', 'skill', '暗影', 'skill', ['暗影', '魔法'], [0.7, 1.2],
      { magic: 0.7, brightness: 0.25, metallic: 0.3, roughness: 0.6, space: 0.5 }, { element: 'dark' }),

    /* ---------------- 锻造 ---------------- */
    P('forge_hammer', 'forge', '铁锤敲击', 'forge', ['锤', '金属'], [0.3, 0.55],
      { weight: 0.65, metallic: 0.75, brightness: 0.55, space: 0.25 }, { sound: 'hammer' }),
    P('forge_anvil', 'forge', '铁砧', 'forge', ['铁砧', '金属'], [0.5, 0.9],
      { weight: 0.45, metallic: 0.95, brightness: 0.75, space: 0.35 }, { sound: 'anvil' }),
    P('forge_bellows', 'forge', '风箱', 'forge', ['风箱', '空气'], [0.6, 1.0],
      { brightness: 0.35, roughness: 0.55, metallic: 0.05, space: 0.2 }, { sound: 'bellows' }),
    P('forge_quench', 'forge', '淬火', 'forge', ['水', '蒸汽'], [0.7, 1.1],
      { brightness: 0.6, roughness: 0.8, metallic: 0.1, space: 0.3 }, { sound: 'quench' }),
    P('forge_grind', 'forge', '打磨', 'forge', ['砂轮', '摩擦'], [0.8, 1.2],
      { brightness: 0.65, roughness: 0.85, metallic: 0.35, space: 0.2 }, { sound: 'grind' }),
    P('forge_craft_ok', 'forge', '锻造成功', 'forge', ['成功', '奖励'], [0.9, 1.3],
      { metallic: 0.7, brightness: 0.8, magic: 0.5, space: 0.45 }, { sound: 'craft_ok' }),
    P('forge_craft_fail', 'forge', '锻造失败', 'forge', ['失败', '沉闷'], [0.7, 1.0],
      { metallic: 0.2, brightness: 0.3, roughness: 0.6, space: 0.2 }, { sound: 'craft_fail' }),
    P('forge_ignite', 'forge', '点燃熔炉', 'forge', ['火', '点燃'], [0.7, 1.1],
      { brightness: 0.5, roughness: 0.7, magic: 0.4, space: 0.3 }, { sound: 'ignite' }),

    /* ---------------- 世界 ---------------- */
    P('world_door', 'world', '开门', 'world', ['木门', '吱呀'], [0.7, 1.1],
      { brightness: 0.4, roughness: 0.6, metallic: 0.15, space: 0.35 }, { sound: 'door' }),
    P('world_chest', 'world', '宝箱', 'world', ['木质', '奖励'], [0.7, 1.0],
      { brightness: 0.6, metallic: 0.3, magic: 0.4, space: 0.35 }, { sound: 'chest' }),
    P('world_lever', 'world', '拉杆', 'world', ['机械', '金属'], [0.4, 0.7],
      { brightness: 0.5, metallic: 0.5, roughness: 0.4, space: 0.2 }, { sound: 'lever' }),
    P('world_potion', 'world', '药水', 'world', ['液体', '气泡'], [0.7, 1.1],
      { brightness: 0.55, magic: 0.5, roughness: 0.3, space: 0.3 }, { sound: 'potion' }),
    P('world_step_grass', 'world', '脚步·草地', 'world', ['脚步', '草地'], [0.15, 0.25],
      { brightness: 0.3, roughness: 0.55, metallic: 0.02, space: 0.1 }, { sound: 'step', surface: 'grass' }),
    P('world_step_stone', 'world', '脚步·石头', 'world', ['脚步', '石头'], [0.15, 0.25],
      { brightness: 0.55, roughness: 0.45, metallic: 0.05, space: 0.18 }, { sound: 'step', surface: 'stone' }),
    P('world_step_wood', 'world', '脚步·木板', 'world', ['脚步', '木板'], [0.15, 0.25],
      { brightness: 0.45, roughness: 0.4, metallic: 0.02, space: 0.14 }, { sound: 'step', surface: 'wood' }),
    P('world_torch', 'world', '火把', 'world', ['火', '环境'], [0.6, 0.9],
      { brightness: 0.55, roughness: 0.7, magic: 0.3, space: 0.25 }, { sound: 'torch' }),

    /* ---------------- 怪物 ---------------- */
    P('monster_growl', 'monster', '低吼', 'monster', ['怪物', '低频'], [0.8, 1.3],
      { weight: 0.8, brightness: 0.25, roughness: 0.6, space: 0.35 }, { sound: 'growl' }),
    P('monster_hit', 'monster', '怪物受击', 'monster', ['怪物', '血肉'], [0.3, 0.5],
      { weight: 0.55, brightness: 0.3, metallic: 0.05, roughness: 0.5, space: 0.2 }, { sound: 'hit' }),
    P('monster_death', 'monster', '怪物死亡', 'monster', ['怪物', '死亡'], [1.0, 1.6],
      { weight: 0.85, brightness: 0.2, roughness: 0.6, space: 0.45 }, { sound: 'death' }),
    P('monster_roar', 'monster', '咆哮', 'monster', ['怪物', '强力'], [1.0, 1.6],
      { weight: 0.9, brightness: 0.3, roughness: 0.7, space: 0.45 }, { sound: 'roar' })
  ];

  var BY_ID = {};
  PRESETS.forEach(function (p) { BY_ID[p.id] = p; });

  /* ---------------- 工具 ---------------- */
  function mergeMacros(preset) {
    var out = {};
    Object.keys(BASE_MACROS).forEach(function (k) { out[k] = BASE_MACROS[k]; });
    Object.keys(preset.defaults || {}).forEach(function (k) { out[k] = preset.defaults[k]; });
    return out;
  }

  function makeRecipe(presetId, opts) {
    opts = opts || {};
    var preset = BY_ID[presetId];
    if (!preset) throw new Error('unknown preset ' + presetId);
    var seed = opts.seed === undefined ? Math.floor(Math.random() * 1e9) : opts.seed;
    var macros = {};
    Object.keys(BASE_MACROS).forEach(function (k) { macros[k] = BASE_MACROS[k]; });
    Object.keys(preset.defaults || {}).forEach(function (k) { macros[k] = preset.defaults[k]; });
    if (opts.macros) {
      Object.keys(opts.macros).forEach(function (k) {
        var v = Number(opts.macros[k]);
        if (isFinite(v)) macros[k] = v;
      });
    }
    return {
      presetId: preset.id,
      category: preset.cat,
      name: preset.name,
      seed: seed,
      style: opts.style || 'realistic',
      waveform: opts.waveform || 'auto',
      macros: macros
    };
  }

  function randomMacros(preset, rng, amount) {
    var base = mergeMacros(preset);
    amount = amount === undefined ? 0.14 : amount;
    Object.keys(base).forEach(function (k) {
      if (k === 'pitch') base[k] = clamp(base[k] + Math.round(rng.range(-2.5, 2.5)), -12, 12);
      else base[k] = clamp(base[k] + rng.range(-amount, amount), 0, 1);
    });
    return base;
  }

  function makeCtx(recipe) {
    var preset = BY_ID[recipe.presetId];
    if (!preset) throw new Error('unknown preset ' + recipe.presetId);
    var style = STYLES[recipe.style] || STYLES.realistic;
    var macros = {};
    var src = recipe.macros || {};
    Object.keys(BASE_MACROS).forEach(function (k) {
      var dflt = preset.defaults && preset.defaults[k] !== undefined ? preset.defaults[k] : BASE_MACROS[k];
      var v = Number(src[k]);
      macros[k] = isFinite(v) ? v : dflt;
    });
    macros.pitch = clamp(macros.pitch, -12, 12);
    var baseMacros = Object.assign({}, macros);

    // 每个种子在预设基础上做固定微差：音高、重量、亮度、金属感……
    // 抖动只由 seed + 预设 + 风格决定，调滑块不会打乱同一变体的“性格”。
    var vary = VARIATION[preset.cat] || {};
    var vrng = new U.Rng(recipe.seed + ':' + preset.id + ':' + style.id + ':vary');
    Object.keys(vary).forEach(function (k) {
      var amt = vary[k];
      if (k === 'pitch') {
        macros.pitch = clamp(Math.round(macros.pitch + vrng.range(-amt, amt)), -12, 12);
      } else {
        macros[k] = clamp(macros[k] + vrng.range(-amt, amt), 0, 1);
      }
    });

    var brightness = clamp(macros.brightness + style.bright, 0, 1);
    var pitchMul = Math.pow(2, (macros.pitch + style.pitch) / 12);
    var rng = new U.Rng(recipe.seed + ':' + preset.id + ':' + style.id + ':' + JSON.stringify(macros));
    var waveOverride = recipe.waveform && recipe.waveform !== 'auto' ? recipe.waveform : null;
    return {
      preset: preset, style: style, m: macros, baseMacros: baseMacros,
      brightness: brightness, pitchMul: pitchMul, waveOverride: waveOverride,
      rng: rng,
      hz: function (v) { return Math.max(20, v * pitchMul); },
      wave: function (base) {
        if (waveOverride) return waveOverride;
        if (style.id === 'pixel') return rng.chance(0.5) ? 'square' : 'triangle';
        if (style.id === 'dark') return base === 'sine' ? 'sawtooth' : base;
        if (style.id === 'bright') return base === 'sawtooth' ? 'triangle' : base;
        return base;
      }
    };
  }

  /* ---------------- 层构造小工具 ---------------- */
  function tone(L, o) {
    L.push(Object.assign({
      type: 'tone', t: 0, dur: 0.2, gain: 0.5, pan: 0,
      wave: 'sine', f0: 440, f1: null, pitchTime: null,
      env: { a: 0.002, d: 0.15 }, filter: null,
      fm: null, vibrato: null, panFrom: null, panTo: null
    }, o));
  }
  function noise(L, o) {
    L.push(Object.assign({
      type: 'noise', t: 0, dur: 0.2, gain: 0.5, pan: 0,
      filter: { type: 'bandpass', f0: 1200, f1: 1200, q: 0.8 },
      env: { a: 0.001, d: 0.15 },
      panFrom: null, panTo: null, trem: null
    }, o));
  }
  function metal(L, o) {
    L.push(Object.assign({
      type: 'metal', t: 0, dur: 0.6, gain: 0.25, pan: 0,
      base: 420, ratios: [1, 2.76, 4.07, 5.4, 8.93],
      decays: null, detune: 0
    }, o));
  }

  function pend(L) {
    var end = 0;
    L.forEach(function (l) {
      var e = (l.t || 0) + (l.dur || 0);
      if (e > end) end = e;
    });
    return end;
  }

  function finish(c, L, opts) {
    opts = opts || {};
    var end = pend(L);
    var duration = Math.max(0.06, end + (opts.tail === undefined ? 0.08 : opts.tail));
    duration = Math.min(4.8, duration);
    return {
      duration: duration,
      layers: L,
      fx: {
        reverb: clamp(c.m.space * (opts.reverb === undefined ? 1 : opts.reverb) * c.style.space, 0, 1),
        delay: opts.delay || 0,
        drive: clamp((c.preset.opts.drive || 0) + c.m.roughness * 0.55, 0, 1.2) * c.style.drive,
        width: opts.width === undefined ? 0.7 : opts.width
      },
      meta: {
        presetId: c.preset.id,
        category: c.preset.cat,
        name: c.preset.name,
        seed: null,
        style: c.style.id,
        waveform: c.waveOverride || 'auto',
        macros: Object.assign({}, c.baseMacros || c.m),
        actualMacros: Object.assign({}, c.m)
      }
    };
  }

  function addCrackle(L, c, t0, dur, gain, count) {
    var n = count || 4;
    for (var i = 0; i < n; i++) {
      noise(L, {
        t: t0 + c.rng.range(0, dur * 0.85),
        dur: c.rng.range(0.012, 0.035),
        gain: gain * c.rng.range(0.5, 1),
        filter: { type: 'highpass', f0: c.hz(1500 + 2500 * c.brightness), q: 0.7 },
        env: { a: 0.0005, d: 0.02 }
      });
    }
  }

  function addShimmer(L, c, t0, dur, gain) {
    noise(L, {
      t: t0, dur: dur, gain: gain,
      filter: { type: 'bandpass', f0: c.hz(3200 + 2000 * c.brightness), f1: c.hz(5000 + 3000 * c.brightness), q: 1.8 },
      env: { a: dur * 0.4, d: dur * 0.6 }, pan: c.rng.range(-0.4, 0.4)
    });
  }

  function addBell(L, c, t0, freq, dur, gain, pan) {
    tone(L, {
      t: t0, dur: dur, gain: gain, wave: c.wave('sine'),
      f0: c.hz(freq), f1: c.hz(freq), env: { a: 0.002, d: dur * 0.85 },
      fm: { ratio: 3.01, index: 2.2, decay: dur * 0.4, sustain: 0.05 },
      pan: pan || 0
    });
  }

  function addArp(L, c, freqs, step, dur, gain, pan) {
    freqs.forEach(function (f, i) {
      addBell(L, c, i * step, f, dur, gain, pan === undefined ? c.rng.range(-0.25, 0.25) : pan);
    });
  }

  /* ---------------- 打击 ---------------- */
  function buildImpact(c) {
    var o = c.preset.opts || {};
    var m = c.m, rng = c.rng, L = [];
    var material = o.material || 'metal';
    var weight = clamp(m.weight, 0, 1);

    // 变体个性：音高、起音、衰减、泛音、声像都随种子变化
    var pitchVar = Math.pow(2, rng.range(-1.4, 1.4) / 12);
    var baseRaw = ({ metal: 140, wood: 115, stone: 95, flesh: 78, energy: 170 }[material] || 120);
    var base = c.hz(baseRaw * (1.15 - 0.4 * weight) * pitchVar * rng.range(0.9, 1.12));
    var panDir = rng.chance(0.5) ? -1 : 1;
    var attackDur = rng.range(0.008, 0.038);
    var attackHp = c.hz(rng.range(1500, 6800) * (0.65 + 0.55 * c.brightness));
    var bodyDur = (0.09 + 0.5 * weight) * rng.range(0.72, 1.35);
    var bodyDecay = (0.06 + 0.34 * weight) * rng.range(0.7, 1.4);
    var bodyGain = 0.55 + 0.2 * rng.next();
    var ringDur = (0.22 + 0.9 * weight) * (0.6 + 0.7 * m.metallic) * rng.range(0.65, 1.45) * (o.ring || 1);
    var ringGain = (0.12 + 0.32 * m.metallic) * rng.range(0.7, 1.4) * (o.block ? 1.2 : 1);
    var ringBase = c.hz((240 + 780 * c.brightness) * rng.range(0.7, 1.4));
    var RING_RATIOS = [
      [1, 2.76, 4.07, 5.4, 8.93],
      [1, 2.4, 3.8, 5.2, 7.1],
      [1, 3.1, 5.2, 7.7, 10.1],
      [1, 2.2, 3.5, 4.8, 6.7]
    ];

    noise(L, {
      t: 0, dur: attackDur, gain: (0.32 + 0.42 * c.brightness) * rng.range(0.8, 1.2),
      filter: { type: 'highpass', f0: attackHp, q: rng.range(0.55, 0.9) },
      env: { a: 0.0004, d: attackDur * rng.range(0.8, 1.2) },
      pan: panDir * rng.range(0.05, 0.4)
    });

    tone(L, {
      t: 0, dur: bodyDur, gain: bodyGain, wave: c.wave(rng.chance(0.75) ? 'sine' : 'triangle'),
      f0: base * rng.range(1.55, 2.4), f1: base * rng.range(0.42, 0.68),
      pitchTime: rng.range(0.018, 0.09),
      env: { a: 0.001, d: bodyDecay },
      pan: panDir * rng.range(0, 0.15)
    });

    if (material === 'metal' || m.metallic > 0.45) {
      metal(L, {
        t: rng.range(0, 0.006), dur: ringDur, gain: ringGain, base: ringBase,
        ratios: rng.pick(RING_RATIOS), detune: rng.range(-0.008, 0.008),
        pan: panDir * rng.range(0.1, 0.45)
      });
    }
    if (material === 'wood') {
      noise(L, {
        t: 0, dur: rng.range(0.04, 0.1), gain: rng.range(0.24, 0.42),
        filter: { type: 'bandpass', f0: c.hz(rng.range(560, 1400) * (0.7 + 0.5 * c.brightness)), q: rng.range(1.0, 1.9) },
        env: { a: 0.0005, d: rng.range(0.04, 0.09) }, pan: rng.range(-0.25, 0.25)
      });
    } else if (material === 'stone') {
      noise(L, {
        t: 0, dur: rng.range(0.08, 0.2), gain: rng.range(0.3, 0.5),
        filter: { type: 'lowpass', f0: c.hz(rng.range(800, 2600)), q: rng.range(0.5, 0.8) },
        env: { a: 0.001, d: rng.range(0.07, 0.17) }, pan: rng.range(-0.3, 0.3)
      });
    } else if (material === 'flesh') {
      noise(L, {
        t: 0, dur: rng.range(0.06, 0.13), gain: rng.range(0.3, 0.48),
        filter: { type: 'lowpass', f0: c.hz(rng.range(400, 900)), q: rng.range(0.6, 0.95) },
        env: { a: 0.001, d: rng.range(0.05, 0.12) }, pan: rng.range(-0.2, 0.2)
      });
      tone(L, {
        t: 0, dur: rng.range(0.1, 0.24), gain: rng.range(0.18, 0.32), wave: 'sine',
        f0: c.hz(rng.range(100, 135)), f1: c.hz(rng.range(48, 72)), env: { a: 0.002, d: rng.range(0.08, 0.18) }
      });
    } else if (material === 'energy') {
      var e0 = rng.range(650, 980), e1 = rng.range(1400, 2100);
      tone(L, {
        t: 0.01, dur: rng.range(0.24, 0.4), gain: 0.13 * (0.5 + m.magic), wave: 'sine',
        f0: c.hz(e0), f1: c.hz(e1), env: { a: 0.005, d: rng.range(0.16, 0.3) },
        fm: { ratio: rng.range(2.6, 3.9), index: rng.range(2.4, 4.6), decay: 0.18, sustain: 0.1 }
      });
      addShimmer(L, c, 0.01, rng.range(0.24, 0.38), 0.08 + 0.06 * m.magic);
    }

    if (o.critical) {
      addBell(L, c, 0.01, rng.range(1150, 1750), rng.range(0.4, 0.65), rng.range(0.1, 0.18), 0);
      addShimmer(L, c, 0.02, rng.range(0.3, 0.45), 0.1);
      tone(L, {
        t: 0, dur: rng.range(0.3, 0.55), gain: rng.range(0.14, 0.24), wave: 'sine',
        f0: c.hz(rng.range(60, 85)), f1: c.hz(rng.range(40, 55)), env: { a: 0.002, d: 0.38 }
      });
    }
    if (o.block) {
      metal(L, {
        t: 0, dur: rng.range(0.12, 0.26), gain: rng.range(0.16, 0.28),
        base: c.hz(rng.range(700, 1250)), ratios: [1, 2.9, 4.6, 6.2],
        pan: -panDir * rng.range(0.1, 0.3)
      });
    }
    if (o.arrow) {
      noise(L, {
        t: 0.01, dur: rng.range(0.1, 0.16), gain: rng.range(0.14, 0.22),
        filter: { type: 'bandpass', f0: c.hz(rng.range(1500, 2300)), f1: c.hz(rng.range(450, 750)), q: rng.range(1.2, 2.0) },
        env: { a: 0.01, d: 0.1 }
      });
    }

    // 随机质感：低中频“砂砾”、高频“火花”、超低“胸腔感”
    if (rng.chance(0.45)) {
      noise(L, {
        t: rng.range(0, 0.01), dur: rng.range(0.04, 0.1), gain: rng.range(0.08, 0.18),
        filter: { type: 'bandpass', f0: c.hz(rng.range(260, 820)), q: rng.range(0.9, 1.6) },
        env: { a: 0.0008, d: rng.range(0.04, 0.09) }, pan: rng.range(-0.3, 0.3)
      });
    }
    if (rng.chance(0.3)) {
      noise(L, {
        t: rng.range(0, 0.012), dur: rng.range(0.02, 0.05), gain: rng.range(0.05, 0.12),
        filter: { type: 'highpass', f0: c.hz(rng.range(4200, 7200)), q: 0.7 },
        env: { a: 0.0004, d: 0.03 }, pan: -panDir * rng.range(0.1, 0.35)
      });
    }
    if (weight > 0.62 && rng.chance(0.5)) {
      tone(L, {
        t: 0, dur: rng.range(0.22, 0.48), gain: rng.range(0.12, 0.2), wave: 'sine',
        f0: c.hz(rng.range(42, 60)), f1: c.hz(rng.range(30, 42)), env: { a: 0.004, d: rng.range(0.18, 0.4) }
      });
    }

    return finish(c, L, { tail: 0.06 + m.space * 0.35, reverb: 1 });
  }

  /* ---------------- 刃类：切割 / 挥砍 ---------------- */
  function buildSlash(c) {
    var o = c.preset.opts || {};
    var m = c.m, rng = c.rng, L = [];
    var weight = clamp(m.weight, 0, 1);
    // 亮度决定“刃口”的锋利程度；重量会把重心往下拉
    var sharp = clamp(0.42 + 0.62 * c.brightness - 0.28 * weight, 0.25, 1);
    var dir = rng.chance(0.5) ? 1 : -1;
    var pitchVar = Math.pow(2, rng.range(-0.9, 0.9) / 12);
    var durScale = rng.range(0.88, 1.14);

    // 1) 刃风：高频 → 中频的快速扫频，制造“切开空气”的走向
    noise(L, {
      t: 0, dur: (0.065 + 0.075 * rng.next()) * durScale,
      gain: 0.26 + 0.2 * sharp,
      filter: {
        type: 'bandpass',
        f0: c.hz((7200 + 2800 * sharp) * pitchVar),
        f1: c.hz((1700 + 1200 * sharp) * pitchVar),
        q: 0.85 + 1.15 * m.roughness
      },
      env: { a: 0.0008, d: 0.06 + 0.05 * rng.next() },
      panFrom: -0.55 * dir, panTo: 0.55 * dir
    });

    // 2) 刃口瞬态：4–10ms 的高频噪声 + 高频“叮”
    noise(L, {
      t: 0, dur: 0.004 + 0.006 * rng.next(), gain: 0.36 + 0.26 * sharp,
      filter: { type: 'highpass', f0: c.hz(4200 + 3600 * sharp), q: 0.7 },
      env: { a: 0.0002, d: 0.005 }, pan: dir * 0.2
    });
    tone(L, {
      t: 0, dur: 0.018 + 0.02 * rng.next(), gain: 0.1 + 0.1 * sharp,
      wave: 'sine',
      f0: c.hz((5600 + 2000 * sharp) * pitchVar),
      f1: c.hz((3000 + 1200 * sharp) * pitchVar),
      env: { a: 0.0005, d: 0.02 }, pan: -dir * 0.15
    });

    // 3) 金属 shing：高频非谐波分音，短促、亮，不是低频“哐”
    metal(L, {
      t: 0.001,
      dur: (0.11 + 0.2 * sharp) * durScale * rng.range(0.85, 1.2),
      gain: 0.24 + 0.2 * sharp,
      base: c.hz((2300 + 1200 * sharp) * pitchVar * rng.range(0.92, 1.08)),
      ratios: [1, 1.47, 2.09, 2.71],
      detune: rng.range(0.002, 0.008),
      pan: dir * rng.range(0.12, 0.34)
    });

    // 4) 少量低频“握手感”：只给重量，不抢高频
    if (weight > 0.18) {
      tone(L, {
        t: 0, dur: (0.045 + 0.09 * weight) * durScale,
        gain: 0.08 + 0.14 * weight, wave: 'sine',
        f0: c.hz(rng.range(150, 215)), f1: c.hz(rng.range(55, 85)),
        env: { a: 0.001, d: 0.045 + 0.08 * weight }, pan: dir * 0.1
      });
    }
    if (weight > 0.68) {
      tone(L, {
        t: 0, dur: 0.16 + 0.14 * weight, gain: 0.08 + 0.08 * weight, wave: 'sine',
        f0: c.hz(rng.range(52, 62)), f1: c.hz(rng.range(32, 40)),
        env: { a: 0.003, d: 0.18 }
      });
    }

    // 5) 暴击：第二声更长的 shing + 高频闪光
    if (o.critical) {
      metal(L, {
        t: 0.012, dur: rng.range(0.22, 0.34), gain: 0.16 + 0.08 * sharp,
        base: c.hz((3000 + 800 * sharp) * pitchVar), ratios: [1, 1.51, 2.24, 3.1],
        pan: -dir * rng.range(0.2, 0.35)
      });
      addShimmer(L, c, 0.008, rng.range(0.22, 0.34), 0.1);
      addBell(L, c, 0.02, rng.range(2400, 3600), rng.range(0.28, 0.42), 0.09, 0);
    }

    // 6) 极轻的空气尾音，让切割“收”得干净
    noise(L, {
      t: 0.015, dur: 0.08 + 0.07 * sharp, gain: 0.05 + 0.05 * sharp,
      filter: { type: 'highpass', f0: c.hz(3200), q: 0.7 },
      env: { a: 0.008, d: 0.09 }, pan: dir * 0.45
    });

    return finish(c, L, { tail: 0.05 + m.space * 0.28, reverb: 0.75 });
  }

  /* ---------------- 挥砍 / whoosh ---------------- */
  function buildWhoosh(c) {
    var m = c.m, rng = c.rng, L = [];
    var power = (c.preset.opts || {}).power || 0.5;
    var dur = (0.16 + 0.3 * power + 0.12 * m.weight) * rng.range(0.82, 1.2);
    var dir = rng.chance(0.5) ? 1 : -1;
    noise(L, {
      t: 0, dur: dur, gain: 0.5 * rng.range(0.85, 1.15),
      filter: {
        type: 'bandpass',
        f0: c.hz(rng.range(190, 420) * (0.8 + 0.5 * c.brightness)),
        f1: c.hz(rng.range(1700, 3300) * (0.7 + 0.6 * c.brightness)),
        q: 1.1 + 1.2 * m.roughness
      },
      env: { a: (0.04 + 0.09 * power) * rng.range(0.85, 1.15), d: dur * 0.75 },
      panFrom: -0.65 * dir, panTo: 0.65 * dir
    });
    noise(L, {
      t: 0.02, dur: dur * 0.7, gain: 0.18 * rng.range(0.8, 1.2), panFrom: -0.3 * dir, panTo: 0.4 * dir,
      filter: { type: 'highpass', f0: c.hz(rng.range(1800, 2800)), q: 0.7 },
      env: { a: 0.06, d: dur * 0.6 }
    });
    if (m.magic > 0.55) {
      tone(L, {
        t: 0.02, dur: dur * 0.8, gain: 0.08 * m.magic, wave: 'sine',
        f0: c.hz(rng.range(560, 820)), f1: c.hz(rng.range(1400, 1900)), env: { a: 0.08, d: dur * 0.7 },
        panFrom: -0.3 * dir, panTo: 0.3 * dir
      });
    }
    return finish(c, L, { tail: 0.05, reverb: 0.6 });
  }

  /* ---------------- 交互 ---------------- */
  function uiTone(L, c, freq, t0, dur, gain, wave, pan, fm) {
    tone(L, {
      t: t0, dur: dur, gain: gain, wave: wave || c.wave('sine'),
      f0: c.hz(freq), f1: c.hz(freq), env: { a: 0.002, d: dur * 0.8 },
      fm: fm || null, pan: pan || 0
    });
  }

  function buildUI(c) {
    var s = (c.preset.opts || {}).sound || 'click';
    var m = c.m, rng = c.rng, L = [];
    var pixel = c.style.id === 'pixel';
    switch (s) {
      case 'hover':
        uiTone(L, c, pixel ? 880 : 700 + 160 * c.brightness, 0, 0.045, 0.16, 'triangle');
        break;
      case 'click':
        noise(L, { t: 0, dur: 0.006, gain: 0.22, filter: { type: 'highpass', f0: c.hz(3200), q: 0.7 }, env: { a: 0.0003, d: 0.006 } });
        uiTone(L, c, pixel ? 1200 : 880 + 200 * c.brightness, 0, 0.05, 0.26, 'triangle');
        break;
      case 'confirm':
        uiTone(L, c, 660, 0, 0.08, 0.25, 'triangle');
        uiTone(L, c, 990, 0.07, 0.12, 0.25, 'triangle');
        addBell(L, c, 0.02, 1320, 0.18, 0.06, 0);
        break;
      case 'cancel':
        uiTone(L, c, 660, 0, 0.08, 0.24, 'triangle');
        uiTone(L, c, 440, 0.07, 0.12, 0.22, 'triangle');
        break;
      case 'error':
        uiTone(L, c, 150, 0, 0.12, 0.2, 'square');
        uiTone(L, c, 118, 0.07, 0.16, 0.18, 'square');
        noise(L, { t: 0, dur: 0.08, gain: 0.08, filter: { type: 'bandpass', f0: c.hz(700), q: 1 }, env: { a: 0.001, d: 0.07 } });
        break;
      case 'coin':
        addBell(L, c, 0, 1320, 0.18, 0.2, -0.15);
        addBell(L, c, 0.06, 1760, 0.22, 0.2, 0.15);
        addBell(L, c, 0.11, 2200, 0.2, 0.12, 0);
        break;
      case 'pickup':
        uiTone(L, c, 523, 0, 0.1, 0.18, 'triangle', -0.2);
        uiTone(L, c, 659, 0.05, 0.1, 0.18, 'triangle', 0);
        uiTone(L, c, 784, 0.1, 0.16, 0.2, 'triangle', 0.2);
        break;
      case 'page':
        noise(L, {
          t: 0, dur: 0.2, gain: 0.22,
          filter: { type: 'bandpass', f0: c.hz(700 + 500 * c.brightness), f1: c.hz(2400 + 1200 * c.brightness), q: 1.2 },
          env: { a: 0.03, d: 0.16 }, panFrom: -0.35, panTo: 0.35
        });
        break;
      case 'tab':
        noise(L, { t: 0, dur: 0.008, gain: 0.15, filter: { type: 'highpass', f0: c.hz(3000), q: 0.7 }, env: { a: 0.0003, d: 0.008 } });
        uiTone(L, c, 520, 0, 0.06, 0.18, 'triangle');
        break;
      case 'quest':
        addArp(L, c, [523, 659, 784, 1046], 0.11, 0.42, 0.18);
        addShimmer(L, c, 0.02, 0.7, 0.1);
        break;
      case 'levelup':
        addArp(L, c, [523, 659, 784, 1046, 1318], 0.09, 0.45, 0.17);
        addShimmer(L, c, 0.05, 0.8, 0.13);
        tone(L, { t: 0, dur: 0.6, gain: 0.14, wave: 'sine', f0: c.hz(130), f1: c.hz(196), env: { a: 0.05, d: 0.45 } });
        break;
      default:
        uiTone(L, c, 880, 0, 0.05, 0.2, 'triangle');
    }
    return finish(c, L, { tail: s === 'quest' || s === 'levelup' ? 0.35 : 0.05, reverb: s === 'quest' || s === 'levelup' ? 1 : 0.4 });
  }

  /* ---------------- 强化 ---------------- */
  function buildBuff(c) {
    var s = (c.preset.opts || {}).sound || 'power';
    var m = c.m, rng = c.rng, L = [];
    switch (s) {
      case 'power':
        tone(L, { t: 0, dur: 0.55, gain: 0.22, wave: c.wave('sawtooth'), f0: c.hz(180), f1: c.hz(360), env: { a: 0.12, d: 0.4 }, filter: { type: 'lowpass', f0: c.hz(900), q: 0.8 } });
        addArp(L, c, [523, 659, 784], 0.08, 0.35, 0.14);
        addShimmer(L, c, 0.02, 0.6, 0.1);
        break;
      case 'enchant':
        addShimmer(L, c, 0.02, 0.9, 0.16);
        addBell(L, c, 0.02, 523, 0.9, 0.14, -0.2);
        addBell(L, c, 0.06, 659, 0.9, 0.12, 0);
        addBell(L, c, 0.1, 784, 0.9, 0.12, 0.2);
        tone(L, { t: 0.03, dur: 0.7, gain: 0.1, wave: 'sine', f0: c.hz(196), f1: c.hz(392), env: { a: 0.2, d: 0.5 } });
        break;
      case 'gem':
        addBell(L, c, 0, 1600, 0.35, 0.2, -0.1);
        addBell(L, c, 0.05, 2000, 0.3, 0.14, 0.1);
        addBell(L, c, 0.1, 2400, 0.3, 0.1, 0.2);
        break;
      case 'refine_ok':
        metal(L, { t: 0, dur: 0.35, gain: 0.2, base: c.hz(520 + 300 * c.brightness), ratios: [1, 2.4, 3.8, 5.1] });
        addArp(L, c, [784, 988, 1175], 0.07, 0.3, 0.13);
        break;
      case 'refine_fail':
        tone(L, { t: 0, dur: 0.22, gain: 0.4, wave: 'sine', f0: c.hz(120), f1: c.hz(60), env: { a: 0.002, d: 0.18 } });
        uiTone(L, c, 300, 0.06, 0.25, 0.2, 'square');
        noise(L, { t: 0, dur: 0.12, gain: 0.16, filter: { type: 'lowpass', f0: c.hz(900), q: 0.7 }, env: { a: 0.001, d: 0.1 } });
        break;
      case 'shield':
        tone(L, { t: 0, dur: 0.55, gain: 0.18, wave: c.wave('sine'), f0: c.hz(90), f1: c.hz(110), env: { a: 0.12, d: 0.4 }, filter: { type: 'lowpass', f0: c.hz(600), q: 0.7 } });
        addBell(L, c, 0.02, 880, 0.55, 0.14, 0);
        addShimmer(L, c, 0.05, 0.5, 0.1);
        break;
      case 'heal':
        addArp(L, c, [392, 523, 659], 0.12, 0.5, 0.15);
        addShimmer(L, c, 0.03, 0.8, 0.12);
        break;
      case 'stat':
        addBell(L, c, 0, 880, 0.22, 0.18, -0.1);
        addBell(L, c, 0.07, 1174, 0.24, 0.16, 0.1);
        break;
      default:
        addArp(L, c, [523, 659], 0.08, 0.25, 0.15);
    }
    return finish(c, L, { tail: 0.25, reverb: 1 });
  }

  /* ---------------- 技能 ---------------- */
  function buildSkill(c) {
    var o = c.preset.opts || {};
    var el = o.element || 'fire';
    var phase = o.phase || 'impact';
    var m = c.m, rng = c.rng, L = [];
    var rev = 1;

    if (el === 'fire') {
      if (phase === 'cast') {
        noise(L, {
          t: 0, dur: 0.4, gain: 0.35,
          filter: { type: 'lowpass', f0: c.hz(300), f1: c.hz(2200 + 1600 * c.brightness), q: 0.9 },
          env: { a: 0.28, d: 0.12 }, panFrom: -0.3, panTo: 0.3
        });
        noise(L, { t: 0.02, dur: 0.38, gain: 0.18, filter: { type: 'highpass', f0: c.hz(1500), q: 0.8 }, env: { a: 0.2, d: 0.15 } });
        addCrackle(L, c, 0.05, 0.3, 0.18, 5);
      } else {
        noise(L, {
          t: 0, dur: 0.38 + 0.2 * m.weight, gain: 0.5,
          filter: { type: 'lowpass', f0: c.hz(1800 + 1400 * c.brightness), f1: c.hz(300), q: 0.9 },
          env: { a: 0.002, d: 0.3 }
        });
        tone(L, { t: 0, dur: 0.4 + 0.2 * m.weight, gain: 0.4, wave: c.wave('sine'), f0: c.hz(110), f1: c.hz(45), env: { a: 0.002, d: 0.32 } });
        addCrackle(L, c, 0.02, 0.45, 0.2, 6);
      }
      rev = 1.1;
    } else if (el === 'ice') {
      if (phase === 'cast') {
        addShimmer(L, c, 0.02, 0.5, 0.14);
        tone(L, { t: 0, dur: 0.45, gain: 0.13, wave: 'sine', f0: c.hz(900), f1: c.hz(1800), env: { a: 0.1, d: 0.3 }, fm: { ratio: 2.01, index: 1.4, decay: 0.3, sustain: 0.1 } });
      } else {
        metal(L, { t: 0, dur: 0.65, gain: 0.24, base: c.hz(1100 + 500 * c.brightness), ratios: [1, 2.11, 3.71, 5.23, 7.1] });
        for (var i = 0; i < 5; i++) {
          noise(L, {
            t: 0.01 + c.rng.range(0, 0.25), dur: 0.03 + c.rng.range(0, 0.03),
            gain: 0.16, filter: { type: 'highpass', f0: c.hz(3000 + 2000 * c.brightness), q: 0.8 },
            env: { a: 0.0005, d: 0.03 }, pan: c.rng.range(-0.5, 0.5)
          });
        }
        tone(L, { t: 0, dur: 0.35, gain: 0.22, wave: 'sine', f0: c.hz(120), f1: c.hz(60), env: { a: 0.002, d: 0.28 } });
      }
      rev = 1.2;
    } else if (el === 'lightning') {
      if (phase === 'cast') {
        tone(L, { t: 0, dur: 0.5, gain: 0.14, wave: 'sawtooth', f0: c.hz(60), f1: c.hz(130), env: { a: 0.15, d: 0.3 }, filter: { type: 'lowpass', f0: c.hz(1400), q: 1.2 } });
        addShimmer(L, c, 0.05, 0.45, 0.12);
        addCrackle(L, c, 0.05, 0.4, 0.16, 4);
      } else {
        noise(L, { t: 0, dur: 0.03, gain: 0.55, filter: { type: 'highpass', f0: c.hz(2200), q: 0.6 }, env: { a: 0.0002, d: 0.03 } });
        noise(L, { t: 0.005, dur: 0.18, gain: 0.3, filter: { type: 'bandpass', f0: c.hz(1200), f1: c.hz(400), q: 1.4 }, env: { a: 0.001, d: 0.15 } });
        tone(L, { t: 0, dur: 0.28, gain: 0.2, wave: 'sawtooth', f0: c.hz(95), f1: c.hz(55), env: { a: 0.002, d: 0.22 }, filter: { type: 'lowpass', f0: c.hz(900), q: 1.1 } });
        tone(L, { t: 0, dur: 0.55, gain: 0.35, wave: 'sine', f0: c.hz(70), f1: c.hz(40), env: { a: 0.004, d: 0.45 } });
        addCrackle(L, c, 0.01, 0.3, 0.2, 5);
      }
      rev = 1.3;
    } else if (el === 'heal') {
      addArp(L, c, [392, 523, 659, 784], 0.09, 0.55, 0.15);
      addShimmer(L, c, 0.04, 1.0, 0.12);
      rev = 1.4;
    } else if (el === 'aura') {
      [523, 659, 784].forEach(function (f, i) {
        tone(L, { t: i * 0.05, dur: 0.9, gain: 0.1, wave: 'triangle', f0: c.hz(f), f1: c.hz(f), env: { a: 0.25, d: 0.6 }, pan: (i - 1) * 0.3 });
      });
      addShimmer(L, c, 0.05, 0.9, 0.1);
      rev = 1.5;
    } else if (el === 'curse') {
      tone(L, { t: 0, dur: 1.0, gain: 0.22, wave: 'sawtooth', f0: c.hz(68), f1: c.hz(62), env: { a: 0.2, d: 0.7 }, filter: { type: 'lowpass', f0: c.hz(500), q: 1.5 }, pan: -0.2 });
      tone(L, { t: 0, dur: 0.9, gain: 0.14, wave: 'sawtooth', f0: c.hz(71), f1: c.hz(66), env: { a: 0.2, d: 0.6 }, filter: { type: 'lowpass', f0: c.hz(450), q: 1.5 }, pan: 0.2 });
      noise(L, { t: 0, dur: 0.9, gain: 0.1, filter: { type: 'bandpass', f0: c.hz(260), q: 1.2 }, env: { a: 0.5, d: 0.4 } });
      addBell(L, c, 0.1, 311, 0.6, 0.08, 0);
      rev = 1.4;
    } else if (el === 'summon') {
      tone(L, { t: 0, dur: 1.0, gain: 0.28, wave: 'sine', f0: c.hz(45), f1: c.hz(55), env: { a: 0.4, d: 0.5 } });
      [220, 330, 440].forEach(function (f, i) {
        tone(L, { t: 0.15 + i * 0.08, dur: 0.7, gain: 0.08, wave: 'triangle', f0: c.hz(f), f1: c.hz(f * 1.5), env: { a: 0.2, d: 0.4 }, pan: (i - 1) * 0.25 });
      });
      noise(L, { t: 0.4, dur: 0.4, gain: 0.2, filter: { type: 'lowpass', f0: c.hz(600), q: 0.8 }, env: { a: 0.002, d: 0.3 } });
      rev = 1.3;
    } else if (el === 'holy') {
      addArp(L, c, [523, 659, 784, 1046], 0.06, 0.7, 0.14);
      addShimmer(L, c, 0.03, 0.9, 0.14);
      rev = 1.5;
    } else if (el === 'dark') {
      tone(L, { t: 0, dur: 0.8, gain: 0.22, wave: 'sine', f0: c.hz(85), f1: c.hz(70), env: { a: 0.1, d: 0.6 }, fm: { ratio: 1.41, index: 5, decay: 0.5, sustain: 0.2 } });
      addCrackle(L, c, 0, 0.5, 0.1, 4);
      addBell(L, c, 0.05, 196, 0.7, 0.1, 0);
      rev = 1.4;
    }
    return finish(c, L, { tail: 0.3, reverb: rev });
  }

  /* ---------------- 锻造 ---------------- */
  function buildForge(c) {
    var s = (c.preset.opts || {}).sound || 'hammer';
    var m = c.m, rng = c.rng, L = [];
    switch (s) {
      case 'hammer':
        tone(L, { t: 0, dur: 0.2, gain: 0.65, wave: 'sine', f0: c.hz(150), f1: c.hz(70), env: { a: 0.001, d: 0.16 } });
        noise(L, { t: 0, dur: 0.03, gain: 0.3, filter: { type: 'highpass', f0: c.hz(2000), q: 0.7 }, env: { a: 0.0005, d: 0.025 } });
        metal(L, { t: 0.002, dur: 0.35, gain: 0.18, base: c.hz(360 + 300 * c.brightness), ratios: [1, 2.76, 4.07, 5.4] });
        break;
      case 'anvil':
        metal(L, { t: 0, dur: 0.8, gain: 0.26, base: c.hz(420 + 420 * c.brightness), ratios: [1, 2.76, 4.07, 5.4, 8.93] });
        tone(L, { t: 0, dur: 0.18, gain: 0.35, wave: 'sine', f0: c.hz(130), f1: c.hz(70), env: { a: 0.001, d: 0.14 } });
        noise(L, { t: 0, dur: 0.025, gain: 0.25, filter: { type: 'highpass', f0: c.hz(2200), q: 0.7 }, env: { a: 0.0004, d: 0.02 } });
        break;
      case 'bellows':
        noise(L, {
          t: 0, dur: 0.85, gain: 0.22,
          filter: { type: 'lowpass', f0: c.hz(260), f1: c.hz(700 + 500 * c.brightness), q: 0.8 },
          env: { a: 0.35, d: 0.45 }
        });
        break;
      case 'quench':
        noise(L, { t: 0, dur: 0.5, gain: 0.3, filter: { type: 'highpass', f0: c.hz(1200 + 1200 * c.brightness), q: 0.7 }, env: { a: 0.001, d: 0.4 } });
        for (var i = 0; i < 9; i++) {
          noise(L, {
            t: 0.05 + c.rng.range(0, 0.7), dur: c.rng.range(0.02, 0.06),
            gain: 0.12, filter: { type: 'highpass', f0: c.hz(2800 + 2000 * c.brightness), q: 0.8 },
            env: { a: 0.001, d: 0.03 }, pan: c.rng.range(-0.4, 0.4)
          });
        }
        tone(L, { t: 0, dur: 0.4, gain: 0.18, wave: 'sine', f0: c.hz(140), f1: c.hz(70), env: { a: 0.002, d: 0.3 } });
        break;
      case 'grind':
        noise(L, {
          t: 0, dur: 1.0, gain: 0.2,
          filter: { type: 'bandpass', f0: c.hz(1600 + 900 * c.brightness), q: 1.4 },
          env: { a: 0.08, d: 0.8 },
          trem: { rate: 17 + 8 * c.m.roughness, depth: 0.55 }
        });
        noise(L, { t: 0, dur: 0.9, gain: 0.1, filter: { type: 'highpass', f0: c.hz(3200), q: 0.7 }, env: { a: 0.1, d: 0.7 } });
        break;
      case 'craft_ok':
        tone(L, { t: 0, dur: 0.2, gain: 0.5, wave: 'sine', f0: c.hz(150), f1: c.hz(70), env: { a: 0.001, d: 0.15 } });
        metal(L, { t: 0.01, dur: 0.5, gain: 0.18, base: c.hz(480), ratios: [1, 2.4, 3.8, 5.2] });
        addArp(L, c, [659, 784, 988, 1318], 0.1, 0.45, 0.14);
        break;
      case 'craft_fail':
        tone(L, { t: 0, dur: 0.22, gain: 0.5, wave: 'sine', f0: c.hz(130), f1: c.hz(60), env: { a: 0.001, d: 0.18 } });
        noise(L, { t: 0, dur: 0.08, gain: 0.18, filter: { type: 'lowpass', f0: c.hz(700), q: 0.7 }, env: { a: 0.001, d: 0.07 } });
        uiTone(L, c, 220, 0.08, 0.35, 0.14, 'sawtooth');
        break;
      case 'ignite':
        noise(L, {
          t: 0, dur: 0.7, gain: 0.3,
          filter: { type: 'lowpass', f0: c.hz(250), f1: c.hz(1600 + 800 * c.brightness), q: 0.9 },
          env: { a: 0.3, d: 0.35 }
        });
        addCrackle(L, c, 0.15, 0.5, 0.2, 7);
        break;
      default:
        metal(L, { t: 0, dur: 0.4, gain: 0.2, base: c.hz(420), ratios: [1, 2.76, 4.07] });
    }
    return finish(c, L, { tail: 0.2, reverb: 1 });
  }

  /* ---------------- 世界 ---------------- */
  function buildWorld(c) {
    var o = c.preset.opts || {};
    var s = o.sound || 'door';
    var m = c.m, rng = c.rng, L = [];
    switch (s) {
      case 'door':
        noise(L, {
          t: 0, dur: 0.85, gain: 0.2,
          filter: { type: 'bandpass', f0: c.hz(280), f1: c.hz(520), q: 2.2 },
          env: { a: 0.08, d: 0.7 }, trem: { rate: 6 + 3 * m.roughness, depth: 0.5 }
        });
        tone(L, { t: 0.02, dur: 0.8, gain: 0.14, wave: 'sawtooth', f0: c.hz(90), f1: c.hz(120), env: { a: 0.2, d: 0.5 }, filter: { type: 'lowpass', f0: c.hz(500), q: 0.8 } });
        noise(L, { t: 0.55, dur: 0.06, gain: 0.2, filter: { type: 'bandpass', f0: c.hz(1200), q: 2 }, env: { a: 0.001, d: 0.05 } });
        break;
      case 'chest':
        tone(L, { t: 0, dur: 0.16, gain: 0.4, wave: 'sine', f0: c.hz(170), f1: c.hz(90), env: { a: 0.001, d: 0.12 } });
        noise(L, { t: 0, dur: 0.06, gain: 0.25, filter: { type: 'bandpass', f0: c.hz(900), q: 1.5 }, env: { a: 0.0005, d: 0.05 } });
        noise(L, { t: 0.18, dur: 0.08, gain: 0.16, filter: { type: 'highpass', f0: c.hz(2500), q: 0.8 }, env: { a: 0.001, d: 0.06 } });
        addArp(L, c, [1046, 1318, 1568], 0.08, 0.35, 0.1);
        break;
      case 'lever':
        noise(L, { t: 0, dur: 0.03, gain: 0.3, filter: { type: 'bandpass', f0: c.hz(1800), q: 2 }, env: { a: 0.0003, d: 0.025 } });
        tone(L, { t: 0.02, dur: 0.18, gain: 0.2, wave: 'sine', f0: c.hz(220), f1: c.hz(160), env: { a: 0.001, d: 0.15 } });
        noise(L, { t: 0.04, dur: 0.3, gain: 0.1, filter: { type: 'bandpass', f0: c.hz(600), f1: c.hz(900), q: 2 }, env: { a: 0.02, d: 0.2 } });
        break;
      case 'potion':
        for (var i = 0; i < 7; i++) {
          tone(L, {
            t: 0.02 + c.rng.range(0, 0.6), dur: 0.05 + c.rng.range(0, 0.04),
            gain: 0.06, wave: 'sine',
            f0: c.hz(420 + c.rng.range(0, 500)), f1: c.hz(300 + c.rng.range(0, 300)),
            env: { a: 0.002, d: 0.04 }, pan: c.rng.range(-0.3, 0.3)
          });
        }
        tone(L, { t: 0.05, dur: 0.45, gain: 0.16, wave: 'sine', f0: c.hz(240), f1: c.hz(110), env: { a: 0.02, d: 0.35 } });
        addShimmer(L, c, 0.2, 0.5, 0.08);
        break;
      case 'step': {
        var surface = o.surface || 'grass';
        var lp = surface === 'grass' ? 900 : surface === 'wood' ? 1500 : 3200;
        noise(L, {
          t: 0, dur: 0.07, gain: 0.3,
          filter: { type: 'lowpass', f0: c.hz(lp * (0.7 + 0.5 * c.brightness)), q: 0.7 },
          env: { a: 0.001, d: 0.06 }, pan: c.rng.range(-0.15, 0.15)
        });
        if (surface !== 'grass') {
          tone(L, { t: 0, dur: 0.08, gain: 0.18, wave: 'sine', f0: c.hz(surface === 'wood' ? 120 : 90), f1: c.hz(60), env: { a: 0.001, d: 0.06 } });
        }
        break;
      }
      case 'torch':
        noise(L, { t: 0, dur: 0.7, gain: 0.2, filter: { type: 'bandpass', f0: c.hz(700), f1: c.hz(1200), q: 1.2 }, env: { a: 0.15, d: 0.5 }, trem: { rate: 9, depth: 0.4 } });
        addCrackle(L, c, 0.05, 0.6, 0.16, 6);
        break;
      default:
        noise(L, { t: 0, dur: 0.2, gain: 0.2, filter: { type: 'lowpass', f0: c.hz(1200), q: 0.8 }, env: { a: 0.002, d: 0.15 } });
    }
    return finish(c, L, { tail: 0.2, reverb: 1 });
  }

  /* ---------------- 怪物 ---------------- */
  function addGrowl(L, c, t0, dur, f0, f1, gain) {
    tone(L, {
      t: t0, dur: dur, gain: gain, wave: 'sawtooth',
      f0: c.hz(f0), f1: c.hz(f1),
      env: { a: 0.12, d: dur * 0.75 },
      filter: { type: 'lowpass', f0: c.hz(420 + 260 * c.brightness), q: 1.6 },
      vibrato: { rate: 5.5 + 3 * c.m.roughness, depth: 12, delay: 0.1 },
      pan: c.rng.range(-0.2, 0.2)
    });
    noise(L, {
      t: t0, dur: dur * 0.9, gain: gain * 0.35,
      filter: { type: 'bandpass', f0: c.hz(320 + 200 * c.brightness), q: 1.1 },
      env: { a: 0.15, d: dur * 0.6 },
      trem: { rate: 11, depth: 0.35 }
    });
  }

  function buildMonster(c) {
    var s = (c.preset.opts || {}).sound || 'growl';
    var m = c.m, rng = c.rng, L = [];
    switch (s) {
      case 'growl':
        addGrowl(L, c, 0, 1.0 + 0.4 * m.weight, 72, 58, 0.35);
        break;
      case 'hit':
        tone(L, { t: 0, dur: 0.14, gain: 0.5, wave: 'sine', f0: c.hz(120), f1: c.hz(60), env: { a: 0.001, d: 0.12 } });
        noise(L, { t: 0, dur: 0.1, gain: 0.35, filter: { type: 'lowpass', f0: c.hz(700), q: 0.8 }, env: { a: 0.001, d: 0.09 } });
        addGrowl(L, c, 0.03, 0.28, 90, 60, 0.12);
        break;
      case 'death':
        addGrowl(L, c, 0, 1.1 + 0.3 * m.weight, 100, 48, 0.3);
        tone(L, { t: 0.85, dur: 0.4, gain: 0.4, wave: 'sine', f0: c.hz(90), f1: c.hz(45), env: { a: 0.002, d: 0.3 } });
        noise(L, { t: 0.85, dur: 0.2, gain: 0.2, filter: { type: 'lowpass', f0: c.hz(600), q: 0.8 }, env: { a: 0.001, d: 0.16 } });
        break;
      case 'roar':
        addGrowl(L, c, 0, 1.3, 85, 70, 0.45);
        noise(L, { t: 0, dur: 1.2, gain: 0.2, filter: { type: 'bandpass', f0: c.hz(500), f1: c.hz(900), q: 1.4 }, env: { a: 0.2, d: 0.8 } });
        tone(L, { t: 0, dur: 1.2, gain: 0.18, wave: 'sine', f0: c.hz(55), f1: c.hz(48), env: { a: 0.15, d: 0.9 } });
        break;
      default:
        addGrowl(L, c, 0, 0.8, 80, 60, 0.3);
    }
    return finish(c, L, { tail: 0.3, reverb: 1 });
  }

  var BUILDERS = {
    impact: buildImpact,
    slash: buildSlash,
    whoosh: buildWhoosh,
    ui: buildUI,
    buff: buildBuff,
    skill: buildSkill,
    forge: buildForge,
    world: buildWorld,
    monster: buildMonster
  };

  function buildSpec(recipe) {
    var c = makeCtx(recipe);
    var builder = BUILDERS[c.preset.kind];
    if (!builder) throw new Error('no builder for ' + c.preset.kind);
    var spec = builder(c);
    spec.meta.seed = recipe.seed;
    spec.meta.id = recipe.presetId + '_' + recipe.seed;
    // 基础校验：去掉非法层
    spec.layers = spec.layers.filter(function (l) {
      return l && isFinite(l.dur) && l.dur > 0 && isFinite(l.gain) &&
        isFinite(l.f0 === undefined ? 0 : l.f0);
    });
    if (!isFinite(spec.duration) || spec.duration <= 0) spec.duration = 0.2;
    spec.preset = c.preset;
    return spec;
  }

  SFX.presets = {
    CATEGORIES: CATEGORIES,
    STYLES: STYLES,
    BASE_MACROS: BASE_MACROS,
    list: PRESETS,
    byId: function (id) { return BY_ID[id]; },
    byCategory: function (cat) {
      return PRESETS.filter(function (p) { return p.cat === cat; });
    },
    makeRecipe: makeRecipe,
    randomMacros: randomMacros,
    defaultMacros: mergeMacros,
    buildSpec: buildSpec
  };
})(typeof window !== 'undefined' ? window : globalThis);
