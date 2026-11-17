// Персонажи мультсериала «Кристалл спешит на помощь» — SVG, по частям (глаза, рот, руки),
// чтобы их можно было анимировать. Каждая функция возвращает <g> в своей системе координат:
// точка (0,0) — у ног персонажа по центру, рост ~ 600.

// mood: 'calm' | 'smile' | 'wow' | 'sad' | 'angry' | 'happy'; talk: 0..1 — насколько открыт рот
function eyes(cx, cy, r, mood, look = 0, blink = 0) {
  const ry = r * (1 - blink * 0.92);
  const brow = { calm: [0, 0], smile: [-4, 0], wow: [-22, 0], sad: [-6, 14], angry: [4, -16], happy: [-10, 0] }[mood] || [0, 0];
  const one = (x, s) => `
    <ellipse cx="${x}" cy="${cy}" rx="${r * 0.82}" ry="${ry}" fill="#fff" stroke="#1d2433" stroke-width="5"/>
    ${blink < 0.6 ? `<circle cx="${x + look * r * 0.3}" cy="${cy + r * 0.12}" r="${r * 0.42}" fill="#1d2433"/>
    <circle cx="${x + look * r * 0.3 - r * 0.15}" cy="${cy - r * 0.05}" r="${r * 0.14}" fill="#fff"/>` : ''}
    <path d="M${x - r * 0.75} ${cy - r * 1.25 + brow[0] * 0.4 + s * brow[1] * 0.5} Q${x} ${cy - r * 1.55 + brow[0] * 0.5} ${x + r * 0.75} ${cy - r * 1.25 + brow[0] * 0.4 - s * brow[1] * 0.5}"
      stroke="#1d2433" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  return one(cx - r * 1.05, -1) + one(cx + r * 1.05, 1);
}

function mouth(cx, cy, w, mood, talk = 0) {
  const o = Math.max(talk, mood === 'wow' ? 0.8 : 0);
  if (o > 0.08) {
    const h = w * 0.55 * o;
    return `<path d="M${cx - w / 2} ${cy} Q${cx} ${cy - h * 0.25} ${cx + w / 2} ${cy} Q${cx} ${cy + h * 1.6} ${cx - w / 2} ${cy}Z" fill="#5b1a24" stroke="#1d2433" stroke-width="5"/>
      <path d="M${cx - w * 0.22} ${cy + h * 0.95} Q${cx} ${cy + h * 0.6} ${cx + w * 0.22} ${cy + h * 0.95}" fill="#ff7a8a"/>`;
  }
  const curve = { calm: 0.15, smile: 0.45, happy: 0.7, sad: -0.35, angry: -0.2 }[mood] ?? 0.2;
  return `<path d="M${cx - w / 2} ${cy} Q${cx} ${cy + w * curve} ${cx + w / 2} ${cy}" stroke="#1d2433" stroke-width="8" fill="none" stroke-linecap="round"/>`;
}

// ===== Кристалл: светящийся голубой кристалл-помощник с кольцом, как в логотипе =====
function crystal({ mood = 'smile', talk = 0, look = 0, blink = 0, arm = 0, glow = 1, ring = 0 } = {}) {
  // arm: 0 — руки опущены, 1 — указывает вверх-вправо, 2 — «ладони вперёд» (объясняет)
  const armR = arm === 1 ? 'M120 -300 Q200 -380 240 -470' : arm === 2 ? 'M120 -300 Q210 -300 250 -350' : 'M120 -300 Q180 -240 190 -170';
  const armL = arm === 2 ? 'M-120 -300 Q-210 -300 -250 -350' : 'M-120 -300 Q-180 -240 -190 -170';
  const handR = arm === 1 ? [240, -470] : arm === 2 ? [250, -350] : [190, -170];
  const handL = arm === 2 ? [-250, -350] : [-190, -170];
  const rt = ring * 360;
  return `<g class="crystal">
    <ellipse cx="0" cy="-8" rx="150" ry="22" fill="#000" opacity=".28"/>
    <circle cx="0" cy="-330" r="${300 * glow}" fill="url(#crGlow)"/>
    <!-- кольцо сзади -->
    <ellipse cx="0" cy="-260" rx="230" ry="58" fill="none" stroke="url(#ring)" stroke-width="16" opacity=".55" transform="rotate(${-8 + Math.sin(rt / 57) * 4} 0 -260)" stroke-dasharray="720 1000" stroke-dashoffset="${-rt}"/>
    <!-- руки -->
    <path d="${armL}" stroke="#2f7fd8" stroke-width="22" fill="none" stroke-linecap="round"/>
    <path d="${armR}" stroke="#2f7fd8" stroke-width="22" fill="none" stroke-linecap="round"/>
    <circle cx="${handL[0]}" cy="${handL[1]}" r="30" fill="#fff" stroke="#1d2433" stroke-width="5"/>
    <circle cx="${handR[0]}" cy="${handR[1]}" r="30" fill="#fff" stroke="#1d2433" stroke-width="5"/>
    <!-- тело: гранёный кристалл -->
    <g stroke="#1d2433" stroke-width="7" stroke-linejoin="round">
      <path d="M0 -640 L150 -500 L150 -150 L0 -60 L-150 -150 L-150 -500Z" fill="url(#crBody)"/>
      <path d="M0 -640 L60 -500 L0 -60 L-60 -500Z" fill="#bfe6ff" opacity=".55" stroke="none"/>
      <path d="M-150 -500 L-60 -500 L0 -640" fill="#e9f7ff" opacity=".7" stroke="none"/>
      <path d="M150 -500 L60 -500 L0 -640" fill="#7cc4ff" opacity=".6" stroke="none"/>
      <path d="M-150 -150 L0 -60 L150 -150 L60 -200 L-60 -200Z" fill="#1d5fb8" opacity=".55" stroke="none"/>
      <path d="M0 -640 L150 -500 L150 -150 L0 -60 L-150 -150 L-150 -500Z" fill="none"/>
    </g>
    <path d="M-110 -470 L-110 -300" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".75"/>
    <path d="M-110 -270 L-110 -245" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".75"/>
    ${eyes(0, -400, 42, mood, look, blink)}
    ${mood === 'happy' || mood === 'smile' ? '<ellipse cx="-95" cy="-320" rx="22" ry="12" fill="#ff8fb1" opacity=".55"/><ellipse cx="95" cy="-320" rx="22" ry="12" fill="#ff8fb1" opacity=".55"/>' : ''}
    ${mouth(0, -320, 86, mood, talk)}
    <!-- кольцо спереди -->
    <path d="M-228 -262 Q0 -170 228 -258" fill="none" stroke="url(#ring)" stroke-width="16" stroke-linecap="round" transform="rotate(${-8 + Math.sin(rt / 57) * 4} 0 -260)"/>
    <circle cx="${Math.cos(rt / 57) * 200}" cy="${-235 + Math.sin(rt / 57) * 30}" r="9" fill="#fff"/>
  </g>`;
}

// ===== Гена: таксист в кепке с шашечками, усы, кожанка, телефон в руке =====
function gena({ mood = 'wow', talk = 0, look = 0, blink = 0, phone = 1, arm = 0, sweat = 0 } = {}) {
  // arm: 0 — телефон у груди, 1 — руки вверх (паника/радость), 2 — рука у затылка (растерян)
  const skin = '#f2c3a0', line = '#1d2433';
  const armsUp = arm === 1;
  return `<g class="gena">
    <ellipse cx="0" cy="-8" rx="170" ry="22" fill="#000" opacity=".28"/>
    <!-- ноги -->
    <rect x="-95" y="-200" width="70" height="190" rx="18" fill="#2b3446" stroke="${line}" stroke-width="6"/>
    <rect x="25" y="-200" width="70" height="190" rx="18" fill="#2b3446" stroke="${line}" stroke-width="6"/>
    <path d="M-110 -10 h95 v-30 q-40 -22 -95 0z" fill="#1a1a1a"/><path d="M15 -10 h95 v-30 q-55 -22 -95 0z" fill="#1a1a1a"/>
    <!-- кожанка -->
    <path d="M-165 -190 Q-180 -390 -110 -430 L110 -430 Q180 -390 165 -190Z" fill="#7a4a2b" stroke="${line}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M-55 -430 L0 -330 L55 -430" fill="#e8e4da" stroke="${line}" stroke-width="5"/>
    <path d="M0 -330 L0 -195" stroke="${line}" stroke-width="5"/>
    <path d="M-110 -430 L-40 -360 L-70 -330" fill="none" stroke="#5a341d" stroke-width="10"/>
    <path d="M110 -430 L40 -360 L70 -330" fill="none" stroke="#5a341d" stroke-width="10"/>
    <!-- руки -->
    ${armsUp ? `
      <path d="M-150 -400 Q-230 -480 -220 -590" stroke="#7a4a2b" stroke-width="54" fill="none" stroke-linecap="round"/>
      <path d="M150 -400 Q230 -480 220 -590" stroke="#7a4a2b" stroke-width="54" fill="none" stroke-linecap="round"/>
      <circle cx="-222" cy="-610" r="34" fill="${skin}" stroke="${line}" stroke-width="6"/>
      <circle cx="222" cy="-610" r="34" fill="${skin}" stroke="${line}" stroke-width="6"/>`
    : arm === 2 ? `
      <path d="M-150 -400 Q-200 -300 -120 -250" stroke="#7a4a2b" stroke-width="54" fill="none" stroke-linecap="round"/>
      <circle cx="-110" cy="-245" r="34" fill="${skin}" stroke="${line}" stroke-width="6"/>
      <path d="M150 -400 Q250 -470 160 -600" stroke="#7a4a2b" stroke-width="54" fill="none" stroke-linecap="round"/>
      <circle cx="150" cy="-610" r="34" fill="${skin}" stroke="${line}" stroke-width="6"/>`
    : `
      <path d="M-150 -400 Q-210 -300 -150 -230" stroke="#7a4a2b" stroke-width="54" fill="none" stroke-linecap="round"/>
      <circle cx="-140" cy="-225" r="34" fill="${skin}" stroke="${line}" stroke-width="6"/>
      <path d="M150 -400 Q220 -330 120 -300" stroke="#7a4a2b" stroke-width="54" fill="none" stroke-linecap="round"/>
      ${phone ? `<g transform="rotate(-12 95 -330)"><rect x="60" y="-400" width="74" height="130" rx="14" fill="#1d2433"/><rect x="68" y="-390" width="58" height="104" rx="8" fill="${phone === 2 ? '#3ddc84' : '#ff4d5e'}"/>
        <text x="97" y="-330" font-family="Inter" font-weight="900" font-size="34" fill="#fff" text-anchor="middle">${phone === 2 ? '✓' : '✕'}</text></g>` : ''}
      <circle cx="110" cy="-300" r="34" fill="${skin}" stroke="${line}" stroke-width="6"/>`}
    <!-- шея и голова -->
    <rect x="-40" y="-470" width="80" height="60" fill="${skin}" stroke="${line}" stroke-width="6"/>
    <ellipse cx="-150" cy="-600" rx="30" ry="40" fill="${skin}" stroke="${line}" stroke-width="6"/>
    <ellipse cx="150" cy="-600" rx="30" ry="40" fill="${skin}" stroke="${line}" stroke-width="6"/>
    <ellipse cx="0" cy="-600" rx="155" ry="160" fill="${skin}" stroke="${line}" stroke-width="7"/>
    <!-- щетина -->
    <path d="M-120 -540 Q0 -420 120 -540 Q110 -470 0 -445 Q-110 -470 -120 -540Z" fill="#c9a084" opacity=".55"/>
    ${eyes(0, -612, 36, mood, look, blink)}
    <!-- нос -->
    <ellipse cx="0" cy="-565" rx="38" ry="32" fill="#e9967a" stroke="${line}" stroke-width="6"/>
    <!-- усы -->
    <path d="M-95 -520 Q-50 -560 0 -530 Q50 -560 95 -520 Q60 -505 0 -515 Q-60 -505 -95 -520Z" fill="#4a3426" stroke="${line}" stroke-width="5"/>
    ${mouth(0, -495, 70, mood, talk)}
    <!-- кепка таксиста с шашечками -->
    <g transform="translate(0 -58)">
    <path d="M-160 -655 Q-150 -800 0 -805 Q150 -800 160 -655Z" fill="#2b3446" stroke="${line}" stroke-width="7"/>
    <path d="M-160 -660 Q0 -700 160 -660 L160 -690 Q0 -728 -160 -690Z" fill="#ffd23f" stroke="${line}" stroke-width="5"/>
    ${Array.from({ length: 8 }, (_, i) => `<rect x="${-150 + i * 40}" y="${-700 + Math.abs(i - 3.5) * 2.5}" width="20" height="16" fill="#1d2433"/>`).join('')}
    <path d="M-170 -655 Q0 -640 235 -648 Q180 -622 0 -628 Q-120 -628 -170 -655Z" fill="#1d2433"/>
    </g>
    ${sweat ? `<path d="M165 -650 q14 26 0 36 q-14 -10 0 -36z" fill="#7cc4ff" stroke="${line}" stroke-width="4" opacity="${sweat}"/>
    <path d="M-180 -640 q12 22 0 31 q-12 -9 0 -31z" fill="#7cc4ff" stroke="${line}" stroke-width="4" opacity="${sweat}"/>` : ''}
  </g>`;
}

const DEFS = `<defs>
  <linearGradient id="crBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fdcff"/><stop offset=".55" stop-color="#3d97f0"/><stop offset="1" stop-color="#1b4fa8"/></linearGradient>
  <radialGradient id="crGlow"><stop offset="0" stop-color="#7cc4ff" stop-opacity=".55"/><stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="ring" x1="0" x2="1"><stop offset="0" stop-color="#e9f7ff"/><stop offset=".5" stop-color="#7cc4ff"/><stop offset="1" stop-color="#2f7fd8"/></linearGradient>
</defs>`;

if (typeof module !== 'undefined') module.exports = { crystal, gena, eyes, mouth, DEFS };
