// Пересобрать чек-лист PDF: npm run pdf
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const p = await b.newPage();
  await p.goto('file://' + path.join(__dirname, '..', 'templates', 'checklist.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: path.join(__dirname, '..', 'templates', 'checklist.pdf'), format: 'A4', printBackground: true });
  await b.close();
  console.log('Чек-лист пересобран');
})();
