// Рендер карусели: renderCarousel(spec, outDir) -> [png...]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
async function renderCarousel(spec, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch({ args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await p.addInitScript(s => { window.SPEC = s; }, spec);
  await p.goto('file://' + path.join(__dirname, 'templates', 'carousel.html'));
  await p.evaluate(() => document.fonts.ready);
  const slides = await p.$$('.slide'), files = [];
  for (let i = 0; i < slides.length; i++) {
    const f = path.join(outDir, `slide${String(i + 1).padStart(2, '0')}.png`);
    await slides[i].screenshot({ path: f }); files.push(f);
  }
  await b.close();
  return files;
}
module.exports = { renderCarousel };
if (require.main === module) {
  const [specF, out] = process.argv.slice(2);
  renderCarousel(JSON.parse(fs.readFileSync(specF)), out).then(f => console.log(f.length + ' слайдов'));
}
