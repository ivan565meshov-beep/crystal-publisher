# Генератор страниц услуг под город (SEO): python3 tools/city-pages.py
# Тексты — в tools/city-content.py. Шапка, подвал и форма заявки берутся с site/kontakty.html.
import json, os, re, html, importlib.util
ROOT = os.path.join(os.path.dirname(__file__), '..', 'site')
SITE = 'https://crystalfinance.ru'
spec = importlib.util.spec_from_file_location('c', os.path.join(os.path.dirname(__file__), 'city-content.py'))
C = importlib.util.module_from_spec(spec); spec.loader.exec_module(C)

src = open(os.path.join(ROOT, 'kontakty.html'), encoding='utf-8').read()
head = src[:src.index('<main id="main">')].replace(' aria-current="page"', '')
tail = src[src.index('</main>') + 7:]
zayavka = src[src.index('<section class="sec" id="zayavka">'):src.index('</main>')]
esc = lambda s: html.escape(s, quote=True)

def inline(s):
    s = esc(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    return re.sub(r'\[(.+?)\]\((.+?)\)', r'<a href="\2">\1</a>', s)

def body(md):
    out, lst = [], None
    for line in md.strip().split('\n'):
        line = line.strip()
        m = re.match(r'^(-|\d+\.) (.*)', line)
        if m:
            tag = 'ul' if m.group(1) == '-' else 'ol'
            if lst != tag:
                if lst: out.append(f'</{lst}>')
                out.append(f'<{tag}>'); lst = tag
            out.append(f'<li>{inline(m.group(2))}</li>'); continue
        if lst: out.append(f'</{lst}>'); lst = None
        if not line: continue
        if line.startswith('## '): out.append(f'<h2>{inline(line[3:])}</h2>')
        elif line.startswith('### '): out.append(f'<h3>{inline(line[4:])}</h3>')
        elif line.startswith('> '): out.append(f'<p class="box">{inline(line[2:])}</p>')
        else: out.append(f'<p>{inline(line)}</p>')
    if lst: out.append(f'</{lst}>')
    return '\n'.join(out)

ORG = {'@type': 'FinancialService', 'name': 'CRYSTAL FINANCE', 'url': SITE + '/', 'telephone': '+7 996 333-25-35',
       'image': SITE + '/assets/img/logo.svg', 'priceRange': 'Консультация бесплатно',
       'address': {'@type': 'PostalAddress', 'streetAddress': 'ул. Запорожская, 37а', 'addressLocality': 'Новокузнецк',
                   'addressRegion': 'Кемеровская область — Кузбасс', 'addressCountry': 'RU'},
       'areaServed': ['Новокузнецк', 'Кемеровская область — Кузбасс', 'Россия']}

ARROW = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M11 5l5 5-5 5"/></svg>'

def render(p):
    url = f"{SITE}/{p['slug']}.html"
    h = head
    h = re.sub(r'<title>[\s\S]*?</title>', f"<title>{esc(p['title'])}</title>", h)
    for prop in ('description',):
        h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(p["desc"])}">', h)
    h = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', h)
    h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(p["title"])}">', h)
    h = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(p["desc"])}">', h)
    h = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', h)
    ld = [dict(ORG, **{'@context': 'https://schema.org'}),
          {'@context': 'https://schema.org', '@type': 'Service', 'name': p['h1'], 'serviceType': p['service'], 'provider': {'@type': 'FinancialService', 'name': 'CRYSTAL FINANCE'},
           'areaServed': 'Новокузнецк', 'description': p['desc'], 'url': url},
          {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
              {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in p['faq']]},
          {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
              {'@type': 'ListItem', 'position': 1, 'name': 'Главная', 'item': SITE + '/'},
              {'@type': 'ListItem', 'position': 2, 'name': p['crumb'], 'item': url}]}]
    h = h.replace('</head>', ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in ld) + '</head>')
    faq = ''.join(f'<details><summary>{esc(q)}<span class="pm" aria-hidden="true"></span></summary><div class="ans"><div><p>{inline(a)}</p></div></div></details>' for q, a in p['faq'])
    others = ''.join(f'<li><a href="{o["slug"]}.html">{esc(o["crumb"])}</a></li>' for o in C.PAGES if o['slug'] != p['slug'])
    z = zayavka.replace(f'<option>{p["service"]}</option>', f'<option selected>{p["service"]}</option>')
    main = f'''<main id="main"><section class="phero"><div class="orb" aria-hidden="true"></div><div class="wrap">
<div class="crumbs rv"><a href="index.html">Главная</a><span>/</span><span>{esc(p['crumb'])}</span></div>
<div style="display:grid;gap:24px;max-width:900px">
<span class="eyebrow rv">Новокузнецк и вся Россия</span><h1 class="h1 split" style="font-size:clamp(34px,5vw,64px)">{esc(p['h1'])}</h1><p class="lead rv" style="--d:2">{esc(p['lead'])}</p>
<div class="hero-cta rv" style="--d:3"><a class="btn btn-primary" href="#zayavka">Бесплатная консультация {ARROW}</a><a class="btn btn-ghost" href="https://t.me/crystalfin54" target="_blank" rel="noopener">Написать в Telegram</a></div>
</div></div></section>
<section class="sec-tight"><div class="wrap"><article class="legal rv">
{body(p['body'])}
<h2>Как мы работаем</h2>
<ol><li><b>Бесплатная консультация.</b> Вы рассказываете о задаче — в Telegram, MAX, по телефону или в офисе на Запорожской, 37а.</li>
<li><b>Разбор ситуации.</b> Смотрим кредитную историю, доход и нагрузку, находим, что мешает одобрению.</li>
<li><b>Подбор банков.</b> Выбираем среди 50+ банков-партнёров те, что подходят под ваш профиль, и готовим заявку.</li>
<li><b>Оплата после результата.</b> За помощь с кредитом вы платите после получения денег — это закреплено в официальном договоре.</li></ol>
<p class="box">CRYSTAL FINANCE не является банком. Решение о выдаче кредита принимает банк, поэтому гарантировать одобрение не может никто — мы повышаем шансы за счёт правильного подбора и подготовки заявки.</p>
<h2>Другие услуги в Новокузнецке</h2>
<ul>{others}<li><a href="blog/">Блог: разборы и советы по кредитам</a></li></ul>
</article></div></section>
<section class="sec"><div class="wrap"><div class="sec-head center"><span class="eyebrow rv">Вопросы</span><h2 class="h2 split">Частые вопросы</h2></div><div class="faq rv">{faq}</div></div></section>
{z}</main>'''
    return h + main + tail

for p in C.PAGES:
    open(os.path.join(ROOT, p['slug'] + '.html'), 'w', encoding='utf-8').write(render(p))
    print('ok', p['slug'], len(p['body']))
