// Всё, что можно законно узнать об IP-адресе из открытых источников: провайдер/хостинг, сеть (ASN), город,
// обратное имя, мобильный/хостинг/прокси/VPN/Tor, открытые порты и метки Shodan, контакт для жалоб (abuse).
const T = ms => AbortSignal.timeout(ms);
const j = async (url, ms = 8000) => { try { const r = await fetch(url, { signal: T(ms) }); return r.ok ? await r.json() : null; } catch { return null; } };
let tor = { at: 0, set: new Set() };
async function isTor(ip) {
  if (Date.now() - tor.at > 6 * 3600e3) {
    try { const t = await (await fetch('https://check.torproject.org/torbulkexitlist', { signal: T(10000) })).text(); tor = { at: Date.now(), set: new Set(t.split('\n').map(s => s.trim())) }; } catch {}
  }
  return tor.set.has(ip);
}
function abuseFromRdap(r) {
  const out = [];
  const walk = ents => (ents || []).forEach(e => {
    if ((e.roles || []).includes('abuse')) for (const v of (e.vcardArray?.[1] || [])) if (v[0] === 'email') out.push(v[3]);
    walk(e.entities);
  });
  walk(r?.entities); return [...new Set(out)];
}
async function intel(ip) {
  const [info, api, rdap, shodan, torExit] = await Promise.all([
    j(`https://ipinfo.io/${encodeURIComponent(ip)}/json`),
    j(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,isp,org,as,asname,reverse,mobile,proxy,hosting`),
    j(`https://rdap.org/ip/${encodeURIComponent(ip)}`, 10000),
    j(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`),
    isTor(ip)]);
  const a = api?.status === 'success' ? api : {};
  return {
    place: [a.city || info?.city, a.regionName || info?.region, a.country || info?.country].filter(Boolean).join(', '),
    isp: a.isp || '', org: a.org || info?.org || '', asn: a.as || '', rdns: a.reverse || info?.hostname || '',
    mobile: !!a.mobile, hosting: !!a.hosting, proxy: !!a.proxy, tor: torExit,
    net: rdap ? [rdap.name, rdap.startAddress && rdap.endAddress ? `${rdap.startAddress}–${rdap.endAddress}` : ''].filter(Boolean).join(' ') : '',
    abuse: abuseFromRdap(rdap),
    ports: shodan?.ports || [], tags: shodan?.tags || [], hostnames: shodan?.hostnames || [], vulns: (shodan?.vulns || []).length,
  };
}
// текст для Telegram
function card(ip, i, hist) {
  const kind = i.tor ? 'выходной узел Tor (анонимная сеть)' : i.proxy ? 'прокси/VPN' : i.hosting ? 'сервер в дата-центре/облаке' : i.mobile ? 'мобильный интернет' : 'домашний/офисный интернет';
  const L = [`🌐 IP: ${ip}`, `📡 Тип: ${kind}`];
  if (i.place) L.push(`📍 Где: ${i.place}`);
  if (i.isp || i.org) L.push(`🏢 Провайдер: ${[i.isp, i.org].filter((v, k, a) => v && a.indexOf(v) === k).join(' / ')}`);
  if (i.asn) L.push(`🔢 Сеть: ${i.asn}`);
  if (i.net) L.push(`🧱 Блок адресов: ${i.net}`);
  if (i.rdns) L.push(`🔁 Имя хоста: ${i.rdns}`);
  if (i.hostnames.length) L.push(`🔗 Домены на адресе: ${i.hostnames.slice(0, 5).join(', ')}`);
  if (i.ports.length) L.push(`🚪 Открытые порты: ${i.ports.slice(0, 15).join(', ')}`);
  if (i.tags.length) L.push(`🏷 Метки Shodan: ${i.tags.join(', ')}`);
  if (i.vulns) L.push(`🕳 Известных уязвимостей на его сервере: ${i.vulns} (возможно, сам взломан и используется для атак)`);
  if (i.abuse.length) L.push(`📮 Жалобы (abuse): ${i.abuse.slice(0, 3).join(', ')}`);
  if (i.mobile) L.push(`⚠️ Мобильный адрес: за ним могут сидеть и обычные абоненты оператора — если клиенты пожалуются, что сайт не открывается, снимите блокировку командой «разбан ${ip}»`);
  if (hist) {
    L.push('', `📜 История на нашем сайте: ${hist.requests} запросов, с ${hist.first} по ${hist.last}`);
    const codes = Object.entries(hist.codes || {}).map(([c, n]) => `${c}×${n}`).join(' ');
    if (codes) L.push(`Ответы сайта: ${codes}`);
    if (hist.agents?.length) L.push(`Программы: ${hist.agents.join(' | ')}`);
    if (hist.referers?.length) L.push(`Пришёл с: ${hist.referers.join(' | ')}`);
    if (hist.paths?.length) L.push('Что запрашивал:\n' + hist.paths.map(p => '  ' + p).join('\n'));
  }
  return L.join('\n');
}
module.exports = { intel, card };
