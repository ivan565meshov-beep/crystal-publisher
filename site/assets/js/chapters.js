/* CRYSTAL FINANCE — «Главы»: закреплённая сцена с реалистичными фото.
   Первая глава раскрывается из карточки на весь экран, следующие выезжают поверх с приближением. */
(function () {
  'use strict';
  var sec = document.querySelector('.chapters');
  if (!sec) return;
  var layers = Array.prototype.slice.call(sec.querySelectorAll('.ch'));
  var count = sec.querySelector('.ch-count b');
  var bar = sec.querySelector('.ch-bar i');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var N = layers.length, ticking = false;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }

  function update() {
    ticking = false;
    var r = sec.getBoundingClientRect();
    var total = sec.offsetHeight - innerHeight;
    // 0..1 while the section is pinned; the first 12% is the card-to-fullscreen intro
    var p = clamp(-r.top / Math.max(1, total), 0, 1);
    var intro = ease(clamp(p / 0.12, 0, 1));
    var q = clamp((p - 0.12) / 0.88, 0, 0.9999) * N;   // chapter position
    var cur = Math.floor(q);
    var narrow = innerWidth < 700;
    layers.forEach(function (el, i) {
      var local = q - i;                     // <0 waiting, 0..1 active, >1 covered
      var img = el.querySelector('img');
      var txt = el.querySelector('.ch-text');
      var clip, scale, dim = 0, ty = 0;
      if (i === 0) {
        var ix = (1 - intro) * (narrow ? 6 : 22), iy = (1 - intro) * (narrow ? 16 : 14);
        clip = 'inset(' + iy + '% ' + ix + '% ' + iy + '% ' + ix + '% round ' + ((1 - intro) * 32 + intro * 0) + 'px)';
      } else {
        // next chapter wipes up from the bottom during the last 35% of the previous one
        var e = ease(clamp((local + 0.35) / 0.35, 0, 1));
        clip = 'inset(' + ((1 - e) * 100).toFixed(2) + '% 0 0 0)';
      }
      if (local < 0) scale = 1.22 - 0.22 * ease(clamp((local + 0.35) / 0.35, 0, 1));
      else scale = 1 + Math.min(local, 1) * 0.08;
      if (i === 0 && local < 0.001) scale = 1.12 - 0.12 * intro;
      if (local > 0.65) dim = clamp((local - 0.65) / 0.35, 0, 1) * 0.55;
      var tIn = ease(clamp((local - (i === 0 ? -0.05 : 0.02)) / 0.25, 0, 1)) * (i === 0 ? intro : 1);
      var tOut = clamp((local - 0.7) / 0.25, 0, 1);
      ty = (1 - tIn) * 40 - tOut * 30;
      el.style.clipPath = clip; el.style.webkitClipPath = clip;
      el.style.setProperty('--dim', dim.toFixed(3));
      if (img) img.style.transform = 'scale(' + (reduce ? 1 : scale).toFixed(4) + ')';
      if (txt) { txt.style.opacity = (tIn * (1 - tOut)).toFixed(3); txt.style.transform = 'translate3d(0,' + (reduce ? 0 : ty).toFixed(1) + 'px,0)'; }
      el.classList.toggle('active', i === cur);
    });
    if (count) count.textContent = String(cur + 1).padStart(2, '0');
    if (bar) bar.style.transform = 'scaleX(' + ((q / N) * intro + 0.001).toFixed(4) + ')';
    sec.style.setProperty('--intro', intro.toFixed(3));
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
