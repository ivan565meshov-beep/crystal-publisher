// Забирает новые заявки с сайта (сервер в России) и присылает их в Telegram-бот заявок.
// .env: SITE_PULL_KEY, LEADS_BOT_TOKEN, LEADS_CHAT_ID, SITE_PULL_URL (по умолчанию https://crystalfinance.ru/api/pull)
const fs = require('fs'), path = require('path');
const STATE = path.join(__dirname, '..', 'data', 'site_leads_since.txt');
// первая проверка забирает заявки за последние сутки, дальше — только новые после последней отправленной
const since = () => { try { return fs.readFileSync(STATE, 'utf8').trim(); } catch {
  const t = new Date(Date.now() - 864e5).toISOString(); fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, t); return t; } };

async function pull(log) {
  const { SITE_PULL_KEY: K, LEADS_BOT_TOKEN: T, LEADS_CHAT_ID: C } = process.env;
  if (!K || !T || !C) return;
  const url = (process.env.SITE_PULL_URL || 'https://crystalfinance.ru/api/pull') + '?since=' + encodeURIComponent(since()); + '&ssince=' + encodeURIComponent(ssince());
  const r = await fetch(url, { headers: { 'X-Key': K }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('сайт ответил ' + r.status);
  const { leads = [], security = [] } = await r.json();
  await secReport(security, T, C, log);
  for (const l of leads) {
    const text = l.phone
      ? `🔔 Заявка с сайта\n\n👤 ${l.name}\n📞 ${l.phone}\n📌 ${l.service}` + (l.comment ? `\n💬 ${l.comment}` : '') +
        `\n🕒 ${new Date(l.at).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' })}`
      : `🔔 Новая заявка с сайта\n📌 ${l.service || 'услуга не указана'}\n🕒 ${new Date(l.at).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' })}\n\nОткрыть: https://crystalfinance.ru/admin/leads`;
    const s = await fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: C, text }), signal: AbortSignal.timeout(15000) });
    if (!s.ok) throw new Error('Telegram ' + s.status);
    fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, l.at);
    fs.appendFileSync(path.join(path.dirname(STATE), 'site_leads_log.txt'), l.at + '\n');   // для итогов недели
    log && log('заявка с сайта', l.at);
  }
}

// защита сайта: итог автозащиты — сразу; отсечённые подозрительные отправки — сводкой не чаще раза в 6 часов
const SSTATE = path.join(__dirname, '..', 'data', 'site_security_since.txt');
const SPEND = path.join(__dirname, '..', 'data', 'site_security_pending.json');
const ssince = () => { try { return fs.readFileSync(SSTATE, 'utf8').trim(); } catch { return new Date(Date.now() - 864e5).toISOString(); } };
async function secReport(events, T, C, log) {
  const tg = text => fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: C, text, link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(15000) });
  let pend = { since: Date.now(), items: [] }; try { pend = JSON.parse(fs.readFileSync(SPEND, 'utf8')); } catch {}
  for (const e of events) {
    if (e.type === 'report') {
      const pr = (e.probes || []).map(p => `• ${p.ip}${p.ua ? ' — ' + p.ua : ''}`).join('\n');
      await tg('🛡 Защита сайта включена\n\n' + (e.ok ? '✅ ' + e.ok : '') + (e.bad ? '\n⚠️ Не получилось: ' + e.bad : '') +
        (pr ? '\n\nАдреса, с которых проверяли форму на взлом (заблокированы):\n' + pr : ''));
    } else if (e.type === 'blocked' && /взлом|проверочн/.test(e.reason || '')) {
      // попытка взлома — сразу, но не чаще раза в час с одного адреса
      const k = 'h:' + e.ip; pend.alerts = pend.alerts || {};
      if (!pend.alerts[k] || Date.now() - pend.alerts[k] > 3600e3) {
        pend.alerts[k] = Date.now();
        let who = ''; try { const j = await (await fetch(`https://ipinfo.io/${encodeURIComponent(e.ip)}/json`, { signal: AbortSignal.timeout(8000) })).json();
          who = [j.org, j.city, j.country].filter(Boolean).join(', '); } catch {}
        await tg(`🚨 Попытка взлома формы на сайте\n\n🌐 IP: ${e.ip}${who ? '\n🏢 ' + who : ''}\n🖥 Программа: ${e.ua || 'не указана'}\n` +
          `✍️ Ввели: имя «${e.name || ''}», телефон «${e.phone || ''}»${e.comment ? ', комментарий «' + e.comment + '»' : ''}\n` +
          `❓ Причина: ${e.reason}\n🕒 ${new Date(e.at).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' })}\n\nЗаявка отклонена, в базу не попала. Повторы с этого адреса в течение часа — без уведомлений.`);
        log && log('попытка взлома', e.ip);
      } else pend.items.push(e);
    } else if (e.type === 'blocked') pend.items.push(e);
  }
  if (events.length) { fs.mkdirSync(path.dirname(SSTATE), { recursive: true }); fs.writeFileSync(SSTATE, events[events.length - 1].at); }
  if (pend.items.length && Date.now() - pend.since > 6 * 3600e3) {
    const by = {}; for (const e of pend.items) { const k = e.ip; by[k] = by[k] || { n: 0, reason: e.reason, ua: e.ua }; by[k].n++; }
    const lines = Object.entries(by).slice(0, 10).map(([ip, v]) => `• ${ip} — ${v.n} шт., ${v.reason}${v.ua ? ' (' + v.ua.slice(0, 60) + ')' : ''}`).join('\n');
    await tg(`🛡 Отсечено подозрительных отправок формы: ${pend.items.length}\nВ бот заявок они не попали.\n\n${lines}`);
    log && log('сводка защиты', pend.items.length);
    pend = { since: Date.now(), items: [] };
  } else if (!pend.items.length) pend.since = Date.now();
  fs.writeFileSync(SPEND, JSON.stringify(pend));
}
module.exports = { pull };
