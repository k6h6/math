/* ============================================================
   Math Adventures — Shared progress store (localStorage)
   Versioned, corruption-safe, migration-aware.
   Keys owned by this app: ma_progress, ma_settings
   Legacy key migrated: math_stars
   ============================================================ */
(function (global) {
  'use strict';

  var PROGRESS_KEY = 'ma_progress';
  var SETTINGS_KEY = 'ma_settings';
  var LEGACY_STARS_KEY = 'math_stars';
  var SCHEMA_VERSION = 2;
  var ADAPTIVE_MAX_ENTRIES = 150;

  var DEFAULT_SETTINGS = {
    theme: 'system',          // 'dark' | 'light' | 'system'
    numerals: 'western',      // 'western' | 'arabic'
    sound: true,
    reducedMotion: false
  };

  function defaultProgress() {
    return {
      version: SCHEMA_VERSION,
      stats: {
        attempted: 0, correct: 0, incorrect: 0,
        roundsCompleted: 0, starsEarned: 0,
        multCorrect: 0, placeCorrect: 0,
        bestMultScore: 0, bestPlaceScore: 0, bestStreak: 0,
        bestDailyScore: 0,
        worksheetsGenerated: 0
      },
      daily: {},            // { "YYYY-MM-DD": { score, total, reward: bool } }
      achievements: {},     // { id: earnedAtISO }
      adaptive: {}          // { "a*b": { w: wrongCount, r: rightCount, t: lastTouch } }
    };
  }

  /* ---------- safe storage ---------- */
  var memoryFallback = { available: false, data: {} };

  function storageOK() {
    try {
      var k = '__ma_probe__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  function rawGet(key) {
    if (memoryFallback.available) {
      return Object.prototype.hasOwnProperty.call(memoryFallback.data, key)
        ? memoryFallback.data[key] : null;
    }
    try { return global.localStorage.getItem(key); }
    catch (e) { return null; }
  }

  function rawSet(key, val) {
    if (memoryFallback.available) { memoryFallback.data[key] = val; return true; }
    try { global.localStorage.setItem(key, val); return true; }
    catch (e) { /* quota or private mode */ return false; }
  }

  function rawRemove(key) {
    if (memoryFallback.available) { delete memoryFallback.data[key]; return true; }
    try { global.localStorage.removeItem(key); return true; }
    catch (e) { return false; }
  }

  /* ---------- load / save / migrate ---------- */
  function deepMergeDefaults(defaults, stored) {
    // Fill missing fields from defaults; keep every stored field (incl. extra flags).
    if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
      return defaults;
    }
    var out = {};
    Object.keys(defaults).forEach(function (k) {
      var d = defaults[k], s = stored[k];
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        out[k] = deepMergeDefaults(d, (s && typeof s === 'object') ? s : {});
      } else {
        out[k] = (s === undefined || s === null) ? d : s;
      }
    });
    Object.keys(stored).forEach(function (k) {
      if (!(k in out)) out[k] = stored[k];
    });
    return out;
  }

  function parseJSONSafe(text) {
    if (typeof text !== 'string') return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function loadProgress() {
    var def = defaultProgress();
    var stored = parseJSONSafe(rawGet(PROGRESS_KEY));
    if (!stored) {
      // Corrupt or missing: start fresh but still try legacy migration.
      var fresh = def;
      migrateLegacyStars(fresh);
      return fresh;
    }
    var merged = deepMergeDefaults(def, stored);
    merged.version = SCHEMA_VERSION;
    // sanitize numbers; normalize boolean capability flags (_acc90, _boss)
    var s = merged.stats;
    Object.keys(s).forEach(function (k) {
      if (k.charAt(0) === '_') {
        if (s[k] === true || s[k] === 1) s[k] = true;
        else delete s[k];
        return;
      }
      if (typeof s[k] === 'boolean') return;
      if (typeof s[k] !== 'number' || !isFinite(s[k]) || s[k] < 0) s[k] = 0;
    });
    if (typeof merged.daily !== 'object' || !merged.daily) merged.daily = {};
    if (typeof merged.achievements !== 'object' || !merged.achievements) merged.achievements = {};
    if (typeof merged.adaptive !== 'object' || !merged.adaptive) merged.adaptive = {};
    migrateLegacyStars(merged);
    return merged;
  }

  function migrateLegacyStars(progress) {
    var legacy = parseJSONSafe(rawGet(LEGACY_STARS_KEY));
    if (typeof legacy === 'number' && isFinite(legacy) && legacy > progress.stats.starsEarned) {
      progress.stats.starsEarned = legacy;
      progress.stats.bestMultScore = Math.max(progress.stats.bestMultScore, legacy);
    }
  }

  function loadSettings() {
    var stored = parseJSONSafe(rawGet(SETTINGS_KEY));
    var merged = deepMergeDefaults(DEFAULT_SETTINGS, stored || {});
    if (['dark', 'light', 'system'].indexOf(merged.theme) === -1) merged.theme = 'system';
    if (['western', 'arabic'].indexOf(merged.numerals) === -1) merged.numerals = 'western';
    merged.sound = !!merged.sound;
    merged.reducedMotion = !!merged.reducedMotion;
    return merged;
  }

  /* ---------- achievements catalog ---------- */
  var ACHIEVEMENTS = [
    { id: 'first_round',    icon: '🚩', title: 'بداية الرحلة',    desc: 'أكملت أول جولة في أي أداة.',           test: function (p) { return p.stats.roundsCompleted >= 1; } },
    { id: 'mult_star',      icon: '✖️', title: 'نجم الضرب',       desc: 'أجبت عن 50 سؤال ضرب إجابة صحيحة.',      test: function (p) { return p.stats.multCorrect >= 50; } },
    { id: 'places_master',  icon: '🏛️', title: 'سيد المنازل',     desc: 'أجبت عن 25 سؤال قيمة منزلية صحيحاً.',    test: function (p) { return p.stats.placeCorrect >= 25; } },
    { id: 'lightning',      icon: '⚡', title: 'البرق',           desc: 'حققت سلسلة 10 إجابات صحيحة متتالية.',   test: function (p) { return p.stats.bestStreak >= 10; } },
    { id: 'accuracy_king',  icon: '🎯', title: 'بطل الدقة',       desc: 'أنهِ جولة من 10 أسئلة فأكثر بدقة 90%.',  test: function (p) { return p.stats._acc90 === true; },
      check: function (p) { return p.stats._acc90 === true; } },
    { id: 'math_champion',  icon: '🏆', title: 'بطل الرياضيات',   desc: '20 إجابة صحيحة في الضرب و20 في القيمة المنزلية.', test: function (p) { return p.stats.multCorrect >= 20 && p.stats.placeCorrect >= 20; } },
    { id: 'daily_player',   icon: '📅', title: 'مليوم اليوم',      desc: 'أكملت تحدي اليوم مرة واحدة على الأقل.',  test: function (p) { return Object.keys(p.daily).length >= 1; } },
    { id: 'boss_win',       icon: '👹', title: 'هزيمة الزعيم',    desc: 'أنهيت تحدي الزعيم بنجاح.',              test: function (p) { return p.stats._boss === true; },
      check: function (p) { return p.stats._boss === true; } },
    { id: 'star_treasure',  icon: '💎', title: 'كنز النجوم',      desc: 'جمعت 100 نجمة إجمالاً.',                 test: function (p) { return p.stats.starsEarned >= 100; } }
  ];

  /* ---------- public API ---------- */
  var progress = null;
  var settings = null;
  var storageAvailable = false;

  var MAStore = {
    init: function () {
      storageAvailable = storageOK();
      memoryFallback.available = !storageAvailable;
      progress = loadProgress();
      settings = loadSettings();
      this.save();
      return this;
    },

    storageAvailable: function () { return storageAvailable; },

    getStats: function () { return progress.stats; },
    getAchievements: function () { return progress.achievements; },
    getDailyMap: function () { return progress.daily; },
    getAdaptive: function () { return progress.adaptive; },

    getSettings: function () { return Object.assign({}, settings); },

    setSetting: function (key, value) {
      if (!(key in DEFAULT_SETTINGS)) return false;
      settings[key] = value;
      rawSet(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    },

    save: function () {
      rawSet(PROGRESS_KEY, JSON.stringify(progress));
    },

    /* ----- stat recording ----- */
    recordAnswer: function (correct, tool) {
      progress.stats.attempted++;
      if (correct) {
        progress.stats.correct++;
        if (tool === 'mult') progress.stats.multCorrect++;
        if (tool === 'place') progress.stats.placeCorrect++;
      } else {
        progress.stats.incorrect++;
      }
      this.save();
    },

    recordStreak: function (streak) {
      if (streak > progress.stats.bestStreak) {
        progress.stats.bestStreak = streak;
        this.save();
      }
    },

    addStars: function (n) {
      if (typeof n === 'number' && n > 0) {
        progress.stats.starsEarned += n;
        this.save();
      }
    },

    recordRound: function (roundStars) {
      progress.stats.roundsCompleted++;
      if (typeof roundStars === 'number' && roundStars > 0) {
        progress.stats.starsEarned += roundStars;
      }
      this.save();
      return this.checkAchievements();
    },

    recordBestScore: function (tool, score) {
      var key = tool === 'mult' ? 'bestMultScore' : tool === 'daily' ? 'bestDailyScore' : 'bestPlaceScore';
      if (typeof score === 'number' && score > progress.stats[key]) {
        progress.stats[key] = score;
        this.save();
      }
    },

    recordWorksheet: function () {
      progress.stats.worksheetsGenerated++;
      this.save();
    },

    markFlag: function (flag) { // '_acc90', '_boss' — one-time capability flags
      progress.stats[flag] = true;
      this.save();
    },

    /* ----- daily ----- */
    getDaily: function (dateKey) { return progress.daily[dateKey] || null; },
    setDaily: function (dateKey, score, total, rewarded) {
      var prev = progress.daily[dateKey] || { score: 0, total: total, reward: false };
      var best = Math.max(prev.score || 0, score);
      progress.daily[dateKey] = {
        score: best,
        total: total,
        reward: prev.reward || !!rewarded,
        at: new Date().toISOString()
      };
      this.save();
      return this.checkAchievements();
    },
    dailyRewarded: function (dateKey) {
      return !!(progress.daily[dateKey] && progress.daily[dateKey].reward);
    },

    /* ----- adaptive practice ----- */
    adaptiveKey: function (a, b) { return a + '*' + b; },
    bumpAdaptive: function (a, b, correct) {
      var key = this.adaptiveKey(a, b);
      var rec = progress.adaptive[key] || { w: 0, r: 0, t: 0 };
      if (correct) rec.r++; else rec.w++;
      rec.t = Date.now();
      progress.adaptive[key] = rec;
      this.trimAdaptive();
      this.save();
    },
    trimAdaptive: function () {
      var keys = Object.keys(progress.adaptive);
      if (keys.length <= ADAPTIVE_MAX_ENTRIES) return;
      keys.sort(function (x, y) { return (progress.adaptive[x].t || 0) - (progress.adaptive[y].t || 0); });
      var excess = keys.length - ADAPTIVE_MAX_ENTRIES;
      for (var i = 0; i < excess; i++) delete progress.adaptive[keys[i]];
    },
    resetAdaptive: function () {
      progress.adaptive = {};
      this.save();
    },
    // Weight in [1..8]: more past mistakes -> higher weight; solid correct history -> lower.
    adaptiveWeight: function (a, b) {
      var rec = progress.adaptive[this.adaptiveKey(a, b)];
      if (!rec) return 3;
      var w = 3 + Math.min(rec.w * 2, 5) - Math.min(Math.floor(rec.r / 3), 2);
      return Math.max(1, Math.min(8, w));
    },

    /* ----- achievements ----- */
    checkAchievements: function () {
      var newly = [];
      var self = this;
      ACHIEVEMENTS.forEach(function (a) {
        if (progress.achievements[a.id]) return;
        var earned = a.check ? a.check(progress) : a.test(progress);
        if (earned) {
          progress.achievements[a.id] = new Date().toISOString();
          newly.push(a);
        }
      });
      if (newly.length) this.save();
      return newly;
    },
    isEarned: function (id) { return !!progress.achievements[id]; },
    catalog: function () { return ACHIEVEMENTS.slice(); },

    /* ----- reset ----- */
    resetAll: function () {
      rawRemove(PROGRESS_KEY);
      rawRemove(SETTINGS_KEY);
      rawRemove(LEGACY_STARS_KEY); // our documented legacy key only
      progress = defaultProgress();
      settings = Object.assign({}, DEFAULT_SETTINGS);
      this.save();
      rawSet(SETTINGS_KEY, JSON.stringify(settings));
    }
  };

  global.MAStore = MAStore.init();
})(typeof window !== 'undefined' ? window : globalThis);
