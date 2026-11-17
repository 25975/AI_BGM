/* ==========================================================================
 * prompt.js — 中文 / 英文自然语言解析
 * 把「一句话画面」翻译成风格、调式、速度、密度、强度
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;
  var T = GBG.theory;

  function norm(text) {
    return String(text || '').toLowerCase().replace(/[，。；、,.!！?？:：\n]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* 风格关键词（权重叠加） */
  var STYLE_WORDS = {
    epic: ['史诗', '宏大', '交响', '管弦', '电影感', '决战', '最终', '王座', '巨龙', '英雄', '传奇', 'orchestral', 'epic', 'cinematic', 'symphonic'],
    triumph: ['凯旋', '胜利', '加冕', 'triumph', 'victory', 'victorious', 'celebration'],
    adventure: ['冒险', '探索', '旅途', '开放世界', '草原', '平原', '村庄', '田园', '阳光', '希望', '启程', 'adventure', 'explore', 'journey', 'overworld'],
    battle: ['战斗', '交战', '厮杀', '战斗音乐', '厮杀', '进攻', '军团', '战鼓', 'battle', 'combat', 'fight', 'war'],
    cyberpunk: ['赛博', '赛博朋克', '霓虹', '未来都市', '义体', '黑客', '雨夜', '都市夜景', '机械', 'cyberpunk', 'neon', 'hacker', 'dystopia'],
    edm: ['电音', '电子舞曲', 'edm', '舞曲', '狂欢', '派对', '竞技场', '节奏感', '蹦迪', 'festival', 'dance', 'rave'],
    space: ['太空', '宇宙', '星海', '星际', '科幻', '失重', '轨道', '空间站', '银河', 'space', 'sci-fi', 'cosmic', 'galaxy'],
    lofi: ['lo-fi', 'lofi', '低保真', '慵懒', '放松', '治愈', '咖啡馆', '雨声', '日常', 'chill', 'relax', 'cozy', 'study'],
    dnb: ['dnb', '鼓打贝斯', 'drum and bass', '追逐', '飙车', '跑酷', '高速', '疾驰', 'chase', 'racing', 'speed'],
    chiptune: ['8-bit', '8bit', '芯片', '像素', '红白机', 'fc', '复古游戏', '街机', 'bit', 'chiptune', 'pixel', 'retro'],
    guofeng: ['国风', '古风', '仙侠', '五声', '宫商角徵羽', '古筝', '二胡', '笛子', '琵琶', '武侠', '江湖', 'china', 'chinese', 'wuxia', 'guzheng'],
    japanese: ['和风', '日式', '武士', '忍者', '樱花', '尺八', '三味线', '太鼓', '神社', 'japanese', 'samurai', 'shakuhachi', 'koto'],
    celtic: ['凯尔特', '奇幻', '精灵', '绿野', '酒馆', '田园风', '城堡', '锡笛', 'celtic', 'fantasy', 'elf', 'tavern'],
    tribal: ['部落', '原始', '蛮族', '祭祀', '荒野', '手鼓', '图腾', 'tribal', 'ritual', 'wild'],
    horror: ['恐怖', '惊悚', '诡异', '阴森', '精神污染', '怪物', '鬼', '邪神', 'horror', 'creepy', 'eerie', 'dark ambient'],
    tension: ['悬疑', '紧张', '潜行', '调查', '倒计时', '解谜', '线索', '不安', 'suspense', 'tension', 'stealth', 'mystery'],
    jazz: ['爵士', '酒馆音乐', '萨克斯', '摇摆', '慵懒爵士', '赌场', '黑色电影', 'jazz', 'swing', 'lounge', 'noir'],
    casual: ['休闲', '可爱', '轻快', '三消', '模拟经营', '小游戏', '糖果', '动物', 'casual', 'cute', 'happy', 'cozy game'],
    sad: ['悲伤', '忧郁', '煽情', '离别', '回忆', '钢琴曲', '叙事', '结局', '孤独', 'sad', 'emotional', 'piano', 'melancholy']
  };

  /* 风格 ↔ 场景 */
  var SCENES = [
    { words: ['主菜单', '标题界面', '开始界面', 'menu', 'title'], styles: { epic: 2.2, space: 1.4, cyberpunk: 1.2, sad: 0.8 }, label: '主菜单' },
    { words: ['boss', '首领', '最终战', '决战', '魔王'], styles: { epic: 2.4, battle: 2.6, dnb: 1.2 }, label: 'Boss 战' },
    { words: ['胜利', '加冕', '凯旋', 'victory', 'triumph'], styles: { triumph: 3, epic: 1 }, label: '胜利' },
    { words: ['战斗', '打怪', '副本', '战场'], styles: { battle: 2.6, epic: 1.2, dnb: 1 }, label: '战斗' },
    { words: ['探索', '大地图', '开放世界', '跑图'], styles: { adventure: 2.4, celtic: 1, space: 0.8 }, label: '探索' },
    { words: ['城镇', '村庄', '主城', '城市'], styles: { adventure: 1.8, casual: 1.2, celtic: 1.1, lofi: 0.8 }, label: '城镇' },
    { words: ['酒馆', '旅店', '客栈'], styles: { celtic: 1.8, jazz: 1.6, lofi: 0.9 }, label: '酒馆' },
    { words: ['地牢', '地下城', '迷宫', '洞窟'], styles: { tension: 1.6, horror: 1.4, epic: 1 }, label: '地牢' },
    { words: ['恐怖', '医院', '鬼屋', '精神'], styles: { horror: 2.6, tension: 1 }, label: '恐怖场景' },
    { words: ['太空', '星球', '银河', '飞船'], styles: { space: 2.8, epic: 0.8 }, label: '太空' },
    { words: ['赛博', '未来都市', '街区', '霓虹'], styles: { cyberpunk: 2.8, dnb: 0.8 }, label: '赛博都市' },
    { words: ['追逐', '跑酷', '载具', '赛车'], styles: { dnb: 2.2, edm: 1.2, cyberpunk: 1.2 }, label: '追逐' },
    { words: ['潜行', '暗杀', '谍战'], styles: { tension: 2.4, horror: 1, jazz: 0.8 }, label: '潜行' },
    { words: ['剧情', '过场', '动画', '演出'], styles: { sad: 1.6, epic: 1.4, adventure: 1 }, label: '剧情演出' },
    { words: ['结局', '终章', '告别'], styles: { sad: 2.2, epic: 1.2 }, label: '结局' },
    { words: ['商店', '日常', '房间', '家园'], styles: { lofi: 2.2, casual: 1.6, jazz: 1 }, label: '日常' },
    { words: ['解谜', '小游戏', '三消', '经营'], styles: { casual: 2.6, lofi: 1 }, label: '休闲玩法' },
    { words: ['竞技场', '活动', '限时'], styles: { edm: 2.4, battle: 1.2 }, label: '活动关卡' },
    { words: ['中国', '仙侠', '武侠', '江湖'], styles: { guofeng: 2.8, japanese: 0.4 }, label: '东方世界' },
    { words: ['和风', '武士', '忍者'], styles: { japanese: 2.8, guofeng: 0.5 }, label: '和风世界' },
    { words: ['新手村', '教学', '开场'], styles: { adventure: 2.2, casual: 1.2 }, label: '开场' }
  ];

  var MOODS = [
    { words: ['史诗', '宏大', '震撼', '磅礴'], styles: { epic: 1.6, battle: 0.8 }, bpm: 0, intensity: 3, density: 0.7 },
    { words: ['紧张', '压迫', '危机', '急促'], styles: { tension: 1.8, battle: 1, dnb: 0.8 }, bpm: 12, intensity: 3, density: 0.75 },
    { words: ['放松', '治愈', '温柔', '舒服', '慵懒'], styles: { lofi: 1.8, casual: 1.2, sad: 0.6 }, bpm: -14, intensity: 1, density: 0.4 },
    { words: ['悲伤', '忧郁', '孤独', '失落'], styles: { sad: 2, lofi: 0.8 }, bpm: -18, intensity: 1, density: 0.32 },
    { words: ['神秘', '空灵', '梦幻', '飘渺'], styles: { space: 1.6, japanese: 1, horror: 0.6 }, bpm: -20, intensity: 1, density: 0.36 },
    { words: ['黑暗', '阴森', '恐怖'], styles: { horror: 2, tension: 1.2 }, bpm: -16, intensity: 2, density: 0.3 },
    { words: ['欢快', '明亮', '开心', '活力', '阳光'], styles: { casual: 1.6, adventure: 1.4 }, bpm: 8, intensity: 2, density: 0.62 },
    { words: ['燃', '热血', '激烈', '高能'], styles: { battle: 1.6, edm: 1.2, dnb: 0.8 }, bpm: 14, intensity: 3, density: 0.8 },
    { words: ['俏皮', '可爱', '轻松'], styles: { casual: 2, adventure: 0.6 }, bpm: 4, intensity: 2, density: 0.6 },
    { words: ['神圣', '庄严', '仪式'], styles: { epic: 1.4, tribal: 0.9, space: 0.8 }, bpm: -12, intensity: 2, density: 0.45 }
  ];

  var SCALE_WORDS = [
    { re: /大调|\bmajor\b/, id: 'major' },
    { re: /和声小调|harmonic minor/, id: 'harmonicMinor' },
    { re: /小调|minor|min\b/, id: 'minor' },
    { re: /多利亚|dorian/, id: 'dorian' },
    { re: /弗里几亚|phrygian/, id: 'phrygian' },
    { re: /利底亚|lydian/, id: 'lydian' },
    { re: /混合利底亚|mixolydian/, id: 'mixolydian' },
    { re: /五声|pentatonic|宫商角徵羽|宫调|五声音阶/, id: 'majorPent' },
    { re: /羽调/, id: 'minorPent' },
    { re: /平调子|hirajoshi/, id: 'hirajoshi' },
    { re: /都节|miyako/, id: 'miyako' },
    { re: /蓝调|blues/, id: 'blues' },
    { re: /全音阶|whole tone/, id: 'wholeTone' }
  ];

  function scoreStyles(text) {
    var scores = {};
    Object.keys(STYLE_WORDS).forEach(function (id) {
      var total = 0;
      STYLE_WORDS[id].forEach(function (w) {
        if (text.indexOf(w) !== -1) {
          total += w.length >= 4 ? 1.4 : 1;
        }
      });
      if (total > 0) scores[id] = (scores[id] || 0) + total;
    });
    return scores;
  }

  function parse(text) {
    var raw = String(text || '');
    var t = norm(raw);
    var result = {
      ok: false,
      styleId: null,
      confidence: 0,
      candidates: [],
      bpm: null,
      scaleId: null,
      rootPc: null,
      density: null,
      complexity: null,
      intensity: null,
      form: null,
      noDrums: false,
      tags: [],
      scene: null,
      explanation: ''
    };
    if (!t) return result;

    var scores = scoreStyles(t);
    var matched = [];

    SCENES.forEach(function (sc) {
      sc.words.forEach(function (w) {
        if (t.indexOf(w) !== -1) {
          matched.push(w);
          Object.keys(sc.styles).forEach(function (id) {
            scores[id] = (scores[id] || 0) + sc.styles[id];
          });
          result.scene = result.scene || sc.label;
        }
      });
    });

    MOODS.forEach(function (m) {
      m.words.forEach(function (w) {
        if (t.indexOf(w) !== -1) {
          matched.push(w);
          Object.keys(m.styles).forEach(function (id) {
            scores[id] = (scores[id] || 0) + m.styles[id];
          });
          if (m.bpm && result.bpm === null) result._bpmHint = (result._bpmHint || 0) + m.bpm;
          if (m.intensity !== undefined) result.intensity = Math.max(result.intensity || 0, m.intensity);
          if (m.density !== undefined) result.density = result._densityHint = result.density === null ? m.density : (result.density + m.density) / 2;
        }
      });
    });

    var ranked = Object.keys(scores).map(function (id) {
      return { id: id, score: scores[id] };
    }).sort(function (a, b) { return b.score - a.score; });

    if (!ranked.length) {
      // 无明确关键词：按画面词兜底
      if (/战斗|打|敌|war|fight/.test(t)) ranked = [{ id: 'battle', score: 1 }];
      else if (/夜|雨|城|city|night/.test(t)) ranked = [{ id: 'cyberpunk', score: 1 }];
      else if (/森林|山|自然|forest|nature/.test(t)) ranked = [{ id: 'adventure', score: 1 }];
      else ranked = [{ id: 'epic', score: 0.8 }];
    }

    result.candidates = ranked.slice(0, 4).map(function (r) {
      return { styleId: r.id, score: +r.score.toFixed(2), name: GBG.styles.byId(r.id).name };
    });
    result.styleId = ranked[0].id;
    result.confidence = Math.min(0.98, 0.35 + ranked[0].score * 0.12);

    var style = GBG.styles.byId(result.styleId);

    // BPM
    var bpmMatch = t.match(/(?:bpm|速度|节拍)\s*[:：]?\s*(\d{2,3})|(\d{2,3})\s*bpm/);
    if (bpmMatch) {
      var bpmVal = parseInt(bpmMatch[1] || bpmMatch[2], 10);
      if (bpmVal >= 40 && bpmVal <= 200) result.bpm = bpmVal;
    }
    if (result.bpm === null) {
      var base = Math.round((style.bpm[0] + style.bpm[1]) / 2);
      var hint = result._bpmHint || 0;
      result.bpm = U.clamp(base + hint, style.bpm[0] - 12, style.bpm[1] + 18);
    }

    // 调性
    var keyMatch = raw.match(/([A-Ga-g])\s*([#♯b♭]?)\s*(大调|小调|多利亚|和声小调|五声|宫调|羽调|major|minor|dorian|lydian|mixolydian|phrygian)/);
    if (keyMatch) {
      var pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[keyMatch[1].toUpperCase()];
      if (keyMatch[2] === '#' || keyMatch[2] === '♯') pc++;
      if (keyMatch[2] === 'b' || keyMatch[2] === '♭') pc--;
      result.rootPc = T.mod12(pc);
    }
    SCALE_WORDS.forEach(function (sw) {
      if (result.scaleId === null && sw.re.test(t)) result.scaleId = sw.id;
    });
    if (result.rootPc === null && result.scaleId === null) {
      result.rootPc = null;
    }

    // 结构
    if (/完整|全曲|电影|叙事|成曲|过场|cinematic/.test(t)) result.form = 'full';
    if (/循环|loop|无缝/.test(t)) result.form = 'loop';

    // 时长 / 小节
    var barMatch = t.match(/(\d{1,3})\s*(?:小节|bars?|小节循环)/);
    if (barMatch) {
      var bars = parseInt(barMatch[1], 10);
      if (bars >= 8 && bars <= 128) result.bars = bars;
    }

    // 配器排除
    if (/不要鼓|无鼓|没有鼓|no drums|drumless/.test(t)) result.noDrums = true;

    // 密度 / 复杂度
    if (/极简|简约|稀疏|minimal|sparse/.test(t)) {
      result.density = 0.3;
      result.complexity = 0.35;
    }
    if (/复杂|丰富|层次多|layered|complex/.test(t)) {
      result.complexity = 0.82;
      result.density = result.density === null ? 0.7 : result.density;
    }
    if (/密集|紧凑|busy/.test(t)) result.density = 0.85;

    result.tags = matched.filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 6);
    result.intensity = result.intensity === null ? 2 : result.intensity;
    result.density = result.density === null ? null : U.clamp(result.density, 0.15, 0.95);
    result.complexity = result.complexity === null ? null : U.clamp(result.complexity, 0.15, 0.95);
    result.ok = true;
    result.explanation = buildExplanation(result, style);
    delete result._bpmHint;
    delete result._densityHint;
    return result;
  }

  function buildExplanation(r, style) {
    var bits = [];
    bits.push(style.emoji + ' ' + style.name);
    if (r.scene) bits.push('场景「' + r.scene + '」');
    if (r.tags.length) bits.push('关键词 ' + r.tags.slice(0, 4).join('/'));
    bits.push(r.bpm + ' BPM');
    if (r.scaleId) bits.push(T.scaleById(r.scaleId).name);
    bits.push('强度 ' + r.intensity);
    return bits.join(' · ');
  }

  /* 随机灵感短句（用于「换一个画面」按钮） */
  var SEEDS = [
    '雨夜的赛博都市，霓虹倒映在积水里，主角潜入大厦',
    '新手村的清晨，阳光穿过风车，远处有竖琴声',
    '最终 Boss 第二阶段，弦乐不断加速，铜管压上来',
    '废弃医院的地下三层，只剩心跳和金属回响',
    '星际航行的第七个月，窗外是无边的星海',
    '酒馆里的爵士三重奏，窗外下着雪',
    '竹林深处，剑客在月下独行',
    '像素勇者跳过最后一块浮空平台',
    '三消关卡，糖果色的小乐器在跳',
    '结局动画，钢琴独奏，主角转身离开',
    '部落篝火祭祀，鼓声由远及近',
    '赛车在高速公路上追逐，鼓点像心跳',
    '太空站警报响起，电子音墙逼近',
    '治愈系的午后，磁带底噪和电钢琴',
    '古战场，战鼓与号角齐鸣，大军压境',
    '解谜房间，八音盒发条缓缓转动'
  ];

  function randomIdea(rng) {
    var r = rng || new U.Rng(Date.now());
    return r.pick(SEEDS);
  }

  GBG.prompt = {
    parse: parse,
    randomIdea: randomIdea,
    SEEDS: SEEDS
  };
})(typeof window !== 'undefined' ? window : globalThis);
