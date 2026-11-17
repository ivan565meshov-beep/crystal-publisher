const { chromium } = require('playwright');
const { crystal, gena, DEFS } = require('./characters');
const scene = (w, h, body) => `<!doctype html><html><head><style>
@font-face{font-family:Inter;src:local('Inter Display')}
body{margin:0;width:${w}px;height:${h}px;background:radial-gradient(ellipse at 50% 30%,#2a3550,#141820 70%);font-family:'Inter Display',Inter,sans-serif;overflow:hidden;color:#fff}
h1{position:absolute;top:50px;width:100%;text-align:center;font-size:62px;margin:0;font-weight:800;letter-spacing:-1px}
h1 b{color:#7cc4ff}
.l{position:absolute;font-size:38px;font-weight:700;text-align:center}
.l small{display:block;font-size:26px;font-weight:500;color:#9fb0c8;margin-top:6px}
</style></head><body>${body}</body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  // 1) главный кадр
  await p.setContent(scene(1080, 1350, `<h1>Кристалл <b>спешит на помощь</b></h1>
   <svg width="1080" height="1350" viewBox="0 0 1080 1350" style="position:absolute;top:0">${DEFS}
    <rect x="0" y="1130" width="1080" height="220" fill="#0e1117"/>
    <g transform="translate(300 1150) scale(.95)">${gena({ mood: 'wow', phone: 1, sweat: 1 })}</g>
    <g transform="translate(790 1150) scale(.95)">${crystal({ mood: 'smile', arm: 1, ring: .2 })}</g>
   </svg>
   <div class="l" style="left:100px;top:1185px;width:400px">Гена<small>таксист, пятый отказ подряд</small></div>
   <div class="l" style="left:590px;top:1185px;width:400px">Кристалл<small>знает, что делать</small></div>`));
  await p.screenshot({ path: 'sheet_main.png' });
  // 2) эмоции
  await p.setViewportSize({ width: 1080, height: 1350 });
  const C = [['calm', 0, 'спокоен'], ['happy', 0, 'радуется'], ['smile', 2, 'объясняет'], ['wow', 0, 'удивлён']];
  const G = [['sad', 0, 1, 'расстроен'], ['angry', 2, 1, 'злится'], ['wow', 1, 0, 'паника'], ['happy', 1, 2, 'одобрили!']];
  await p.setContent(scene(1080, 1350, `<h1 style="font-size:46px;top:30px">Эмоции героев</h1>
   <svg width="1080" height="1350" viewBox="0 0 1080 1350" style="position:absolute;top:0">${DEFS}
    ${C.map(([m, a], i) => `<g transform="translate(${135 + i * 270} 640) scale(.48)">${crystal({ mood: m, arm: a, ring: i * .3 })}</g>`).join('')}
    ${G.map(([m, a, ph], i) => `<g transform="translate(${135 + i * 270} 1250) scale(.48)">${gena({ mood: m, arm: a, phone: ph, sweat: m === 'wow' ? 1 : 0 })}</g>`).join('')}
   </svg>
   ${C.map((c, i) => `<div class="l" style="left:${i * 270}px;top:660px;width:270px;font-size:28px">${c[2]}</div>`).join('')}
   ${G.map((g, i) => `<div class="l" style="left:${i * 270}px;top:1270px;width:270px;font-size:28px">${g[3]}</div>`).join('')}`));
  await p.screenshot({ path: 'sheet_emotions.png' });
  await b.close();
})();
