// Ключи площадок присылаются владельцем боту с телефона: «/key VK_TOKEN значение»
// Пишем в .env, сразу применяем; сообщение с ключом бот удаляет из чата.
const fs = require('fs'), path = require('path');
const ENV = path.join(__dirname, '..', '.env');
const ALLOWED = ['VK_TOKEN', 'VK_GROUP_ID', 'MAX_TOKEN', 'MAX_CHAT_ID', 'TG_CHANNEL', 'IG_TOKEN', 'IG_USER_ID', 'PUBLIC_URL'];
function set(name, value) {
  if (!ALLOWED.includes(name)) throw new Error(`Можно задать только: ${ALLOWED.join(', ')}`);
  if (!value || /\s/.test(value)) throw new Error('Пустое значение или пробелы внутри');
  let s = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  const line = `${name}=${value}`;
  s = new RegExp(`^${name}=.*$`, 'm').test(s) ? s.replace(new RegExp(`^${name}=.*$`, 'm'), line) : s.replace(/\n?$/, '\n') + line + '\n';
  fs.writeFileSync(ENV, s, { mode: 0o600 });
  process.env[name] = value;
}
const mask = v => v ? (v.length > 8 ? v.slice(0, 3) + '…' + v.slice(-3) : 'задан') : '—';

// проверка всех площадок: что подключено и работает
async function status(tg) {
  const out = [];
  const auto = require('./autopost').on();
  out.push(`Автопостинг: ${auto ? '🟢 включён' : '⚪️ выключен'} (команды /autopost_on и /autopost_off)`);
  // Telegram
  try {
    const ch = process.env.TG_CHANNEL; if (!ch) throw new Error('не задан канал');
    const me = await tg.call('getMe');
    const m = await tg.call('getChatMember', { chat_id: ch, user_id: me.id });
    out.push(m.status === 'administrator' && m.can_post_messages !== false ? `✅ Telegram ${ch}: бот — админ, может публиковать` : `⚠️ Telegram ${ch}: бот не админ канала — добавьте @${me.username} администратором с правом публикации`);
  } catch (e) { out.push(`⚠️ Telegram: ${e.message}`); }
  // VK
  if (!process.env.VK_TOKEN || !process.env.VK_GROUP_ID) out.push('⚪️ VK: не подключён (нужны VK_TOKEN и VK_GROUP_ID)');
  else try {
    const r = await (await fetch('https://api.vk.com/method/groups.getById', { method: 'POST', body: new URLSearchParams({ group_id: process.env.VK_GROUP_ID, access_token: process.env.VK_TOKEN, v: '5.199' }) })).json();
    if (r.error) throw new Error(r.error.error_msg);
    const g = r.response.groups?.[0] || r.response[0];
    out.push(`✅ VK: «${g.name}» (vk.com/${g.screen_name})`);
  } catch (e) { out.push(`⚠️ VK: ${e.message}`); }
  // MAX
  if (!process.env.MAX_TOKEN) out.push('⚪️ MAX: не подключён (нужен MAX_TOKEN)');
  else try {
    const max = require('./max'), me = await max.me();
    const ch = (await max.chats()).filter(c => c.type === 'channel');
    if (!process.env.MAX_CHAT_ID && ch.length === 1) set('MAX_CHAT_ID', String(ch[0].chat_id));
    const cur = ch.find(c => String(c.chat_id) === String(process.env.MAX_CHAT_ID));
    out.push(cur ? `✅ MAX: бот ${me.name || me.username} публикует в «${cur.title}»`
      : ch.length ? `⚠️ MAX: бот в каналах ${ch.map(c => `«${c.title}» (${c.chat_id})`).join(', ')} — выберите: /key MAX_CHAT_ID <id>`
      : `⚠️ MAX: бот ${me.name || ''} не добавлен в канал — добавьте его администратором канала`);
  } catch (e) { out.push(`⚠️ MAX: ${e.message}`); }
  // Instagram
  if (!process.env.IG_TOKEN) out.push('⚪️ Instagram: не подключён — выкладываете сами (пакет приходит в бот)');
  else try {
    const r = await (await fetch(`https://graph.instagram.com/me?fields=username&access_token=${process.env.IG_TOKEN}`)).json();
    if (r.error) throw new Error(r.error.message);
    out.push(`✅ Instagram: @${r.username}${process.env.PUBLIC_URL ? '' : ' (для каруселей нужен PUBLIC_URL)'}`);
  } catch (e) { out.push(`⚠️ Instagram: ${e.message}`); }
  out.push('Threads: выкладываете сами (12 веток в день приходят в бот)');
  return out.join('\n');
}
module.exports = { set, status, mask, ALLOWED };
