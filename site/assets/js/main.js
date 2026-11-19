/* CRYSTAL FINANCE — interactions, motion, calculators, forms. No dependencies. */
(function () {
  'use strict';
  var root = document.documentElement;
  var CFG = window.CF_CONFIG || {};
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var fine = window.matchMedia('(pointer: fine)').matches;
  // на телефонах тяжёлые эффекты выключены, обработчики прокрутки — не чаще одного раза за кадр
  var raf = function (fn) { var t = false; return function () { if (t) return; t = true; requestAnimationFrame(function () { t = false; fn(); }); }; };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  function rub(n) { return nf.format(Math.round(n)) + ' ₽'; }

  /* ---------- Theme ---------- */
  var toggles = $$('.theme-toggle');
  function setTheme(t) {
    if (t === 'light') root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    store('cf-theme', t);
    var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'light' ? '#f4f6f9' : '#080a0e');
  }
  toggles.forEach(function (b) {
    b.addEventListener('click', function (e) {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      if (!document.startViewTransition || reduce) { setTheme(next); return; }
      var r = b.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      var vt = document.startViewTransition(function () { setTheme(next); });
      vt.ready.then(function () {
        root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 700, easing: 'cubic-bezier(.2,.7,.1,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(function () {});
    });
  });

  /* ---------- Header, progress, mobile bar ---------- */
  var hdr = $('.hdr'), prog = $('.progress'), mbar = $('.mbar');
  function onScroll() {
    var y = window.scrollY;
    if (hdr) hdr.classList.toggle('scrolled', y > 10);
    if (prog) { var h = document.documentElement.scrollHeight - innerHeight; prog.style.transform = 'scaleX(' + (h > 0 ? y / h : 0) + ')'; }
    if (mbar) mbar.classList.toggle('show', y > innerHeight * 0.6);
  }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  var burger = $('.burger');
  if (burger) burger.addEventListener('click', function () {
    var open = document.body.classList.toggle('menu-open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    $$('.mmenu .m-link').forEach(function (a, i) { a.style.transitionDelay = open ? (120 + i * 60) + 'ms' : '0ms'; });
  });
  $$('.mmenu a').forEach(function (a) { a.addEventListener('click', function () { document.body.classList.remove('menu-open'); }); });

  /* ---------- Reveal & split headings ---------- */
  $$('.split').forEach(function (el) {
    var i = 0;
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
            var o = document.createElement('span'); o.className = 'w';
            var s = document.createElement('span'); s.textContent = w; s.style.setProperty('--i', i++);
            o.appendChild(s); frag.appendChild(o);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          // wrap element as a single word unit
          var o2 = document.createElement('span'); o2.className = 'w';
          var s2 = document.createElement('span'); s2.style.setProperty('--i', i++);
          node.replaceChild(o2, n); s2.appendChild(n); o2.appendChild(s2);
        }
      });
    };
    walk(el);
  });
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;
  $$('.rv,.rv-scale,.split,.art-line,[data-count]').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); });

  /* ---------- Counters ---------- */
  function approvedMln() {
    // Сумма одобренных кредитов: базовое значение на дату + небольшой ежедневный прирост
    var base = CFG.approvedBase || 640, perDay = CFG.approvedPerDay || 0.12;
    var d0 = new Date(CFG.approvedFrom || '2026-11-10T00:00:00+07:00').getTime();
    var days = Math.max(0, Math.floor((Date.now() - d0) / 864e5));
    return base + days * perDay;
  }
  $$('[data-count]').forEach(function (el) {
    var target = el.getAttribute('data-count') === 'approved' ? approvedMln() : parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    var fmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    var num = el.querySelector('.n') || el;
    num.textContent = fmt.format(target);
    var run = function () {
      if (reduce) return;
      var t0 = performance.now(), dur = 1800;
      (function tick(now) {
        var p = Math.min(1, (now - t0) / dur); p = 1 - Math.pow(1 - p, 4);
        num.textContent = fmt.format(target * p);
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    };
    if (io) {
      var o = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { run(); o.disconnect(); } }, { threshold: .4 });
      o.observe(el);
    }
  });

  /* ---------- Scroll-scrubbed statement ---------- */
  $$('.statement').forEach(function (el) {
    var words = [];
    var walk = function (node, hl) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
            var s = document.createElement('span'); s.className = 'sw' + (hl ? ' hl' : ''); s.textContent = w;
            frag.appendChild(s); words.push(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) { walk(n, hl || n.classList.contains('hl')); }
      });
    };
    walk(el, false);
    var upd = function () {
      var r = el.getBoundingClientRect();
      var p = (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.45);
      p = Math.max(0, Math.min(1, p));
      var k = Math.round(p * words.length);
      words.forEach(function (w, i) { w.classList.toggle('on', i < k || reduce); });
    };
    window.addEventListener('scroll', raf(upd), { passive: true }); upd();
  });

  /* ---------- Story steps (sticky ring) ---------- */
  $$('.story').forEach(function (st) {
    var steps = $$('.step', st), phs = $$('.story-ph', st), bar = $('.story-bar i', st), num = $('.story-chip b', st), lbl = $('.story-chip span', st);
    var cur = -1;
    var set = function (i) {
      if (i === cur) return; cur = i;
      steps.forEach(function (s, j) { s.classList.toggle('active', j === i); });
      phs.forEach(function (p, j) { p.classList.toggle('on', j === i); });
      if (bar) bar.style.transform = 'scaleX(' + ((i + 1) / steps.length) + ')';
      if (num) num.textContent = '0' + (i + 1);
      if (lbl) lbl.textContent = steps[i].getAttribute('data-label') || '';
    };
    var upd = function () {
      var best = 0, bd = 1e9;
      steps.forEach(function (s, j) { var r = s.getBoundingClientRect(); var d = Math.abs(r.top + r.height / 2 - innerHeight * 0.55); if (d < bd) { bd = d; best = j; } });
      set(best);
    };
    window.addEventListener('scroll', raf(upd), { passive: true }); upd();
  });

  /* ---------- Spotlight + tilt + magnetic ---------- */

  $$('.spot').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
  if (fine && !reduce) {
    $$('[data-tilt]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.style.transform = 'perspective(900px) rotateX(' + (-y * 6) + 'deg) rotateY(' + (x * 8) + 'deg) translateZ(0)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
    $$('.btn-primary').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .18) + 'px,' + ((e.clientY - r.top - r.height / 2) * .28) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }

  /* ---------- FAQ smooth open ---------- */
  $$('.faq details').forEach(function (d) {
    var s = $('summary', d), a = $('.ans', d);
    s.addEventListener('click', function (e) {
      if (reduce || !a.animate) return;
      e.preventDefault();
      if (d.open) {
        var h = a.offsetHeight;
        a.animate({ height: [h + 'px', '0px'], opacity: [1, 0] }, { duration: 380, easing: 'cubic-bezier(.2,.7,.1,1)' }).onfinish = function () { d.open = false; };
      } else {
        d.open = true; var h2 = a.offsetHeight;
        a.animate({ height: ['0px', h2 + 'px'], opacity: [0, 1] }, { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
    });
  });

  /* ---------- Copy buttons + toast ---------- */
  var toastEl = $('.toast');
  function toast(t) { if (!toastEl) return; toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2200); }
  function copyText(text) {
    var done = function () { toast('Скопировано'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (b) { e.preventDefault(); copyText(b.getAttribute('data-copy')); }
  });

  /* ---------- Cookie consent + Яндекс.Метрика (только после согласия) ---------- */
  var ck = $('.cookie');
  function loadMetrika() {
    var id = CFG.metrikaId; if (!id || window.ym) return;
    (function (m, e, t, r, i, k, a) { m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date();
      k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a); })
      (window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }
  var consent = store('cf-cookie');
  if (consent === 'all') loadMetrika();
  if (ck && !consent) setTimeout(function () { ck.classList.add('show'); }, 1200);
  // «Настройки cookie» в подвале: сбросить выбор и показать плашку снова
  $$('[data-cookie-reset]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); try { localStorage.removeItem('cf-cookie'); } catch (x) {} if (ck) ck.classList.add('show'); });
  });
  $$('[data-cookie]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-cookie'); store('cf-cookie', v); ck.classList.remove('show');
      if (v === 'all') loadMetrika();
    });
  });

  /* ---------- Forms ---------- */
  $$('form.lead-form').forEach(function (f) {
    var msg = $('.form-out', f.parentElement) || $('.form-out');
    var tel = $('input[type=tel]', f);
    if (tel) tel.addEventListener('input', function () {
      var d = tel.value.replace(/\D/g, ''); if (d[0] === '8') d = '7' + d.slice(1); if (d && d[0] !== '7') d = '7' + d; d = d.slice(0, 11);
      var o = d ? '+7' : ''; if (d.length > 1) o += ' (' + d.slice(1, 4); if (d.length >= 4) o += ') ' + d.slice(4, 7); if (d.length >= 7) o += '-' + d.slice(7, 9); if (d.length >= 9) o += '-' + d.slice(9, 11);
      tel.value = o;
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      $$('[required]', f).forEach(function (i) {
        var bad = i.type === 'checkbox' ? !i.checked : (i.type === 'tel' ? i.value.replace(/\D/g, '').length < 11 : !i.value.trim());
        var w = i.closest('.inp,.check'); if (w) w.classList.toggle('err', bad); if (bad) ok = false;
      });
      if (!ok) { toast('Заполните отмеченные поля'); return; }
      var data = new FormData(f);
      data.append('page', document.title);
      var text = 'Заявка с сайта CRYSTAL FINANCE\nИмя: ' + (data.get('name') || '') + '\nТелефон: ' + (data.get('phone') || '') +
        '\nУслуга: ' + (data.get('service') || '—') + (data.get('comment') ? '\nКомментарий: ' + data.get('comment') : '');
      var btn = $('button[type=submit]', f); btn.disabled = true; var old = btn.innerHTML; btn.textContent = 'Отправляем…';
      var showFallback = function () {
        msg.hidden = false; msg.className = 'form-out form-msg fb';
        msg.innerHTML = '<b>Отправьте заявку нам в Telegram или MAX — так быстрее.</b><span class="small muted">Скопируйте текст и вставьте в чат.</span><pre></pre>' +
          '<div class="row"><button type="button" class="btn btn-ghost btn-sm" data-copy="">Скопировать текст</button>' +
          '<a class="btn btn-primary btn-sm" href="' + CFG.telegramUrl + '" target="_blank" rel="noopener">Открыть Telegram</a>' +
          '<a class="btn btn-ghost btn-sm" href="' + CFG.maxUrl + '" target="_blank" rel="noopener">MAX</a></div>';
        $('pre', msg).textContent = text; $('[data-copy]', msg).setAttribute('data-copy', text);
      };
      var done = function (good) {
        btn.disabled = false; btn.innerHTML = old;
        if (good) {
          msg.hidden = false; msg.className = 'form-out form-msg ok';
          msg.innerHTML = '<b>Заявка принята.</b><span>Перезвоним или напишем в течение рабочего дня. Если удобнее — напишите нам в <a href="' + CFG.telegramUrl + '" target="_blank" rel="noopener">Telegram</a>.</span>';
          f.reset();
          if (window.ym && CFG.metrikaId) window.ym(CFG.metrikaId, 'reachGoal', 'lead');
        } else showFallback();
      };
      if (!CFG.formEndpoint || location.protocol === 'file:') { done(false); return; }
      fetch(CFG.formEndpoint, { method: 'POST', body: new URLSearchParams(data), headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); }).then(function (j) { done(j && j.ok); }).catch(function () { done(false); });
    });
  });

  /* ---------- Calculators ---------- */
  function rangeFill(r) {
    var p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%');
  }
  function tween(el, to, fmt) {
    var from = parseFloat(el.getAttribute('data-v') || '0'); el.setAttribute('data-v', to);
    if (reduce) { el.textContent = fmt(to); return; }
    var t0 = performance.now();
    cancelAnimationFrame(el._r);
    (function tk(now) { var p = Math.min(1, (now - t0) / 500); p = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * p); if (p < 1) el._r = requestAnimationFrame(tk); })(t0);
  }
  function annuity(P, ratePct, n) { var r = ratePct / 1200; if (n <= 0) return 0; if (r === 0) return P / n; return P * r / (1 - Math.pow(1 + r, -n)); }
  function bindRanges(box, fn) {
    $$('input', box).forEach(function (i) {
      i.addEventListener('input', function () { if (i.type === 'range') rangeFill(i); fn(); });
      i.addEventListener('change', fn);
      if (i.type === 'range') rangeFill(i);
    });
    fn();
  }
  function out(box, name, text) { var o = $('[data-o="' + name + '"]', box); if (o) o.textContent = text; }

  var refi = $('#calc-refi');
  if (refi) bindRanges(refi, function () {
    var P = +$('#r-sum', refi).value, r1 = +$('#r-rate', refi).value, n = +$('#r-term', refi).value, r2 = +$('#r-new', refi).value;
    out(refi, 'sum', rub(P)); out(refi, 'rate', r1.toLocaleString('ru-RU') + '%'); out(refi, 'term', n + ' мес.'); out(refi, 'new', r2.toLocaleString('ru-RU') + '%');
    var m1 = annuity(P, r1, n), m2 = annuity(P, Math.min(r1, r2), n);
    var dm = Math.max(0, m1 - m2), total = dm * n, year = dm * Math.min(12, n);
    tween($('[data-o="year"]', refi), year, rub);
    out(refi, 'm1', rub(m1)); out(refi, 'm2', rub(m2)); out(refi, 'dm', rub(dm)); out(refi, 'total', rub(total));
  });

  var hol = $('#calc-hol');
  if (hol) bindRanges(hol, function () {
    var pay = +$('#h-pay', hol).value, months = +$('#h-months', hol).value;
    var modeEl = $('input[name="h-mode"]:checked', hol); var share = modeEl ? +modeEl.value : 1;
    out(hol, 'pay', rub(pay)); out(hol, 'months', months + ' мес.');
    var monthFree = pay * share, freed = monthFree * months;
    tween($('[data-o="freed"]', hol), freed, rub);
    out(hol, 'mfree', rub(monthFree)); out(hol, 'mleft', rub(pay - monthFree)); out(hol, 'period', months + ' мес.');
  });

  var ch = $('#calc-chance');
  if (ch) {
    var C = Math.PI * 120;
    var bar = $('.g-bar', ch); if (bar) { bar.style.strokeDasharray = C; bar.style.strokeDashoffset = C; }
    bindRanges(ch, function () {
      var v = function (n) { var e = $('input[name="' + n + '"]:checked', ch); return e ? +e.value : 0; };
      var load = +$('#c-load', ch).value; out(ch, 'load', load + '%');
      var s = 56 + v('c-hist') + v('c-inc') + v('c-ref') + v('c-who');
      s += load <= 30 ? 10 : load <= 50 ? 3 : load <= 70 ? -9 : -20;
      s += CFG.chanceBoost || 7;            // учёт подбора банков со спецусловиями
      s = Math.max(32, Math.min(94, Math.round(s)));
      tween($('.g-val b', ch), s, function (x) { return Math.round(x) + '%'; });
      if (bar) bar.style.strokeDashoffset = C * (1 - s / 100);
      var vd = $('.verdict', ch);
      vd.innerHTML = s >= 75 ? '<b>Шансы высокие.</b> Подберём банк с лучшими условиями под ваш профиль и подадим заявку так, чтобы не испортить историю лишними запросами.'
        : s >= 55 ? '<b>Шансы хорошие.</b> Важно правильно выбрать банк и порядок подачи — с этим мы и помогаем.'
        : '<b>Шансы есть.</b> Начнём с анализа кредитной истории и плана улучшения. Часто решение находится у банков-партнёров со специальными условиями.';
    });
  }

  /* ---------- Calculator subnav active ---------- */
  var sn = $$('.subnav a');
  if (sn.length && io) {
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) sn.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id); }); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sn.forEach(function (a) { var t = $(a.getAttribute('href')); if (t) so.observe(t); });
  }

  /* ---------- Contacts: abstract city grid ---------- */
  var mc = $('#mapart');
  if (mc && mc.getContext) {
    var ctx = mc.getContext('2d');
    var draw = function (t) {
      var r = mc.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      if (mc.width !== Math.round(r.width * d)) { mc.width = Math.round(r.width * d); mc.height = Math.round(r.height * d); }
      var w = mc.width, h = mc.height; ctx.clearRect(0, 0, w, h);
      var cs = getComputedStyle(root);
      var line = cs.getPropertyValue('--line-2').trim(), acc = cs.getPropertyValue('--accent').trim();
      ctx.strokeStyle = line; ctx.lineWidth = d;
      var step = 34 * d;
      for (var x = (t * 0.004 * d) % step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - h * .35, h); ctx.stroke(); }
      for (var y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + w * .08); ctx.stroke(); }
      ctx.strokeStyle = acc; ctx.lineWidth = 3 * d; ctx.globalAlpha = .55;
      ctx.beginPath(); ctx.moveTo(0, h * .72); ctx.bezierCurveTo(w * .3, h * .6, w * .45, h * .62, w * .5, h * .5); ctx.bezierCurveTo(w * .6, h * .35, w * .8, h * .3, w, h * .22); ctx.stroke();
      ctx.globalAlpha = 1;
      if (!reduce && fine && mcVis) requestAnimationFrame(draw);
    };
    var mcVis = false;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { var v = es[0].isIntersecting; if (v && !mcVis) { mcVis = true; requestAnimationFrame(draw); } mcVis = v; }).observe(mc);
    requestAnimationFrame(draw);
  }

  /* ---------- Marquee duplicate ---------- */
  $$('.marquee-track').forEach(function (t) { t.innerHTML += t.innerHTML; });

  /* ---------- Photo parallax ---------- */
  if ($('.hero')) document.body.classList.add('hero-page');
  var heroImg = $('.hero-photo img'), heroEl = $('.hero');
  if (heroImg && !reduce) {
    var mx = 0, my = 0, tx = 0, ty = 0;
    if (fine) window.addEventListener('pointermove', function (e) { tx = (e.clientX / innerWidth - .5) * -22; ty = (e.clientY / innerHeight - .5) * -14; }, { passive: true });
    var heroUpd = function () {
      mx += (tx - mx) * .06; my += (ty - my) * .06;
      var r = heroEl.getBoundingClientRect(), sp = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
      if (r.bottom > 0) { heroImg.style.setProperty('--px', mx.toFixed(2) + 'px'); heroImg.style.setProperty('--py', my.toFixed(2) + 'px'); heroImg.style.setProperty('--sp', sp.toFixed(3)); }
      return r.bottom > 0;
    };
    if (fine) (function loopH() { if (heroUpd()) requestAnimationFrame(loopH); else setTimeout(function () { requestAnimationFrame(loopH); }, 250); })();
    else { window.addEventListener('scroll', raf(heroUpd), { passive: true }); heroUpd(); }
  }
  var px = $$('.parallax img');
  if (px.length && !reduce && fine) {
    var upd = function () { px.forEach(function (im) { var r = im.parentElement.getBoundingClientRect(); var c = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; im.style.setProperty('--ty', (c * -40).toFixed(1) + 'px'); }); };
    window.addEventListener('scroll', raf(upd), { passive: true }); upd();
  }

  root.classList.add('ready');
})();
