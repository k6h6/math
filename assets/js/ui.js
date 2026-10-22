/* ============================================================
   Math Adventures — shared UI layer
   Theme, numerals, toasts, modal, confetti, nav shell.
   Depends on: store.js (required), audio.js (optional), confetti (optional)
   ============================================================ */
(function (global) {
  'use strict';

  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  function toWesternDigits(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
  }

  function toArabicDigits(str) {
    return String(str).replace(/[0-9]/g, function (d) { return AR_DIGITS[+d]; });
  }

  function mediaDark() {
    try { return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches; }
    catch (e) { return true; }
  }

  var MA = {
    /* ---------- numerals ---------- */
    parseNum: function (str) {
      var cleaned = toWesternDigits(str).replace(/[^0-9]/g, '');
      if (cleaned === '') return null;
      var n = parseInt(cleaned, 10);
      return isFinite(n) ? n : null;
    },

    fmt: function (n) {
      if (typeof n !== 'number' || !isFinite(n)) return (n === null || n === undefined) ? '' : String(n);
      var s = n.toLocaleString('en-US');
      if (MA.numerals() === 'arabic') s = toArabicDigits(s).replace(/,/g, '٬');
      return s;
    },

    digits: function (n) { // digits only, no grouping (timers, single digits)
      var s = String(n);
      return MA.numerals() === 'arabic' ? toArabicDigits(s) : s;
    },

    numerals: function () {
      try { return MAStore.getSettings().numerals || 'western'; }
      catch (e) { return 'western'; }
    },

    /* ---------- settings application ---------- */
    applySettings: function () {
      var s = MAStore.getSettings();
      var forced = document.documentElement.getAttribute('data-force-theme');
      var theme = forced || (s.theme === 'system' ? (mediaDark() ? 'dark' : 'light') : s.theme);
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-numerals', s.numerals);
      document.documentElement.setAttribute('data-reduced-motion', s.reducedMotion ? 'true' : 'false');
      if (global.MAAudio) global.MAAudio.setEnabled(s.sound);
    },

    initThemeListener: function () {
      try {
        var mq = global.matchMedia('(prefers-color-scheme: dark)');
        var handler = function () {
          if (MAStore.getSettings().theme === 'system') MA.applySettings();
        };
        if (mq.addEventListener) mq.addEventListener('change', handler);
        else if (mq.addListener) mq.addListener(handler);
      } catch (e) { /* ignore */ }
    },

    /* ---------- sound helpers ---------- */
    unlockAudioOnce: function () {
      var unlock = function () {
        if (global.MAAudio) global.MAAudio.unlock();
      };
      document.addEventListener('pointerdown', unlock, { once: true });
      document.addEventListener('keydown', unlock, { once: true });
    },

    play: function (name) {
      if (global.MAAudio) global.MAAudio.play(name);
    },

    bindSoundToggle: function (btnId, iconId) {
      var btn = document.getElementById(btnId);
      var icon = document.getElementById(iconId);
      if (!btn) return;
      var render = function () {
        var on = MAStore.getSettings().sound;
        btn.setAttribute('aria-pressed', String(on));
        if (icon) icon.className = on ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
      };
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var on = !MAStore.getSettings().sound;
        MAStore.setSetting('sound', on);
        MA.applySettings();
        render();
        if (on) MA.play('click');
        MA.toast(on ? 'تم تشغيل الصوت' : 'تم إيقاف الصوت', 'muted');
      });
      render();
    },

    /* ---------- toast ---------- */
    _toastEl: null,
    _toastTimer: null,
    toast: function (msg, type, ms) {
      if (!MA._toastEl) {
        var el = document.createElement('div');
        el.className = 'ma-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
        MA._toastEl = el;
      }
      var el = MA._toastEl;
      el.className = 'ma-toast' + (type === 'success' ? ' ma-toast--success' : type === 'danger' ? ' ma-toast--danger' : '');
      el.textContent = msg;
      // re-apply direction-aware centering (inline-start respects RTL)
      requestAnimationFrame(function () { el.classList.add('is-visible'); });
      clearTimeout(MA._toastTimer);
      MA._toastTimer = setTimeout(function () {
        el.classList.remove('is-visible');
      }, ms || 2800);
    },

    achievementToast: function (a) {
      MA.toast('وسام جديد: ' + a.title + ' ' + a.icon, 'success', 4200);
    },

    /* ---------- confetti ---------- */
    celebrate: function () {
      try {
        var reduced = MAStore.getSettings().reducedMotion ||
          (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (reduced) return;
        if (typeof global.confetti === 'function') {
          global.confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
        }
      } catch (e) { /* decorative only */ }
    },

    /* ---------- achievements pipeline (call after any round) ---------- */
    notifyNewAchievements: function (newly) {
      (newly || []).forEach(function (a, i) {
        setTimeout(function () { MA.achievementToast(a); }, 400 + i * 1200);
      });
    },

    /* ---------- modal ---------- */
    _modalEl: null,
    _modalKeyHandler: null,
    confirm: function (title, message, confirmLabel, onConfirm) {
      if (!MA._modalEl) {
        var wrap = document.createElement('div');
        wrap.className = 'ma-modal';
        wrap.innerHTML =
          '<div class="ma-modal__box" role="dialog" aria-modal="true" aria-labelledby="maModalTitle">' +
          '  <h2 id="maModalTitle"></h2>' +
          '  <p class="text-muted" id="maModalMsg"></p>' +
          '  <div class="ma-modal__actions">' +
          '    <button type="button" class="ma-btn ma-btn--secondary" data-act="cancel">إلغاء</button>' +
          '    <button type="button" class="ma-btn ma-btn--danger" data-act="ok"></button>' +
          '  </div>' +
          '</div>';
        document.body.appendChild(wrap);
        MA._modalEl = wrap;
      }
      var wrap = MA._modalEl;
      wrap.querySelector('#maModalTitle').textContent = title;
      wrap.querySelector('#maModalMsg').textContent = message;
      var okBtn = wrap.querySelector('[data-act="ok"]');
      okBtn.textContent = confirmLabel || 'تأكيد';
      var prevFocus = document.activeElement;
      if (MA._modalKeyHandler) {
        document.removeEventListener('keydown', MA._modalKeyHandler, true);
        MA._modalKeyHandler = null;
      }
      var close = function () {
        wrap.classList.remove('is-open');
        if (MA._modalKeyHandler === onKey) {
          document.removeEventListener('keydown', onKey, true);
          MA._modalKeyHandler = null;
        }
        if (prevFocus && prevFocus.focus) prevFocus.focus();
      };
      var onKey = function (e) {
        if (!wrap.classList.contains('is-open')) {
          if (MA._modalKeyHandler === onKey) {
            document.removeEventListener('keydown', onKey, true);
            MA._modalKeyHandler = null;
          }
          return;
        }
        if (e.key === 'Escape') {
          if (e.preventDefault) e.preventDefault();
          close();
          return;
        }
        if (e.key === 'Tab') {
          var focusables = wrap.querySelectorAll('button');
          if (!focusables.length) return;
          var first = focusables[0], last = focusables[focusables.length - 1];
          var inside = false;
          try { inside = wrap.contains(document.activeElement); } catch (err) { inside = false; }
          if (e.shiftKey) {
            if (!inside || document.activeElement === first) {
              if (e.preventDefault) e.preventDefault();
              last.focus();
            }
          } else if (!inside || document.activeElement === last) {
            if (e.preventDefault) e.preventDefault();
            first.focus();
          }
        }
      };
      MA._modalKeyHandler = onKey;
      document.addEventListener('keydown', onKey, true);
      wrap.querySelector('[data-act="cancel"]').onclick = close;
      okBtn.onclick = function () { close(); onConfirm(); };
      wrap.onclick = function (e) { if (e.target === wrap) close(); };
      wrap.classList.add('is-open');
      okBtn.focus();
    },

    /* ---------- dates ---------- */
    todayKey: function () {
      var d = new Date();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    },

    /* ---------- nav shell ---------- */
    initShell: function (activeKey) {
      MA.applySettings();
      MA.initThemeListener();
      MA.unlockAudioOnce();

      var toggle = document.querySelector('.ma-nav__toggle');
      var links = document.querySelector('.ma-nav__links');
      if (toggle && links) {
        toggle.addEventListener('click', function () {
          var open = links.classList.toggle('is-open');
          toggle.setAttribute('aria-expanded', String(open));
        });
      }
      if (activeKey) {
        var a = document.querySelector('.ma-nav__links a[data-key="' + activeKey + '"]');
        if (a) a.setAttribute('aria-current', 'page');
      }
      document.querySelectorAll('[data-year]').forEach(function (el) {
        el.textContent = String(new Date().getFullYear());
      });
    }
  };

  global.MA = MA;
})(typeof window !== 'undefined' ? window : globalThis);
