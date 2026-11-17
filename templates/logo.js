// Логотип: светящиеся кристальные столбцы графика с кольцом
window.LOGO = (s=64) => `
<svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
 <defs>
  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6f4ff"/><stop offset=".45" stop-color="#7cc4ff"/><stop offset="1" stop-color="#2f7bff"/></linearGradient>
  <filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
 </defs>
 <ellipse cx="50" cy="74" rx="40" ry="11" fill="none" stroke="#7cc4ff" stroke-width="3" opacity=".85" filter="url(#gl)"/>
 <g filter="url(#gl)">
  <polygon points="22,72 22,50 28,45 34,50 34,72" fill="url(#cg)"/>
  <polygon points="40,72 40,36 46,30 52,36 52,72" fill="url(#cg)"/>
  <polygon points="58,72 58,22 64,15 70,22 70,72" fill="url(#cg)"/>
  <polyline points="28,45 28,72 M46,30 46,72 M64,15 64,72" stroke="#ffffff" stroke-opacity=".55" stroke-width="1" fill="none"/>
 </g>
 <path d="M10,74 A40,11 0 0 0 90,74" fill="none" stroke="#c9e6ff" stroke-width="3" filter="url(#gl)"/>
</svg>`;
