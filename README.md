# Публикатор CRYSTAL FINANCE

Сам собирает рилсы (живые кадры с людьми, графика, озвучка, субтитры, звуковые акценты) и карусели по сценариям, которые SMM-роль пишет в Notion. Присылает вам превью в Telegram с кнопками «✅ Одобрить» и «✏️ Переделать», а после одобрения публикует в Telegram-канал и VK в назначенное время.

```
SMM (Claude, каждое утро) → карточка «На проверке» + сценарий в Notion
        ↓
Публикатор (ваш сервер, проверяет каждую минуту)
  ├─ собирает видео или слайды → присылает превью вам в Telegram
  ├─ «✅ Одобрить» → статус «Одобрено»
  ├─ «✏️ Переделать» + ваш комментарий → SMM переделает на следующий день
  └─ в «Дату публикации» → Telegram + VK → «Опубликовано» + ссылка
```

## Что понадобится (ключи)

| Что | Где взять | Обязательно |
|---|---|---|
| Ключ Notion | Настройки (Settings) → вкладка «Connections» → включить Developer Mode → «+ New connection» → «•••» рядом с ним → скопировать токен. Делать на компьютере, под аккаунтом-владельцем пространства. Затем в Notion открыть «Crystal Finance — Штаб» → «•••» → «Connections» → добавить эту интеграцию | да |
| Бот Telegram | @BotFather → /newbot → токен. Добавить бота администратором канала @crystalfin1 с правом публикации | да |
| Ваш chat_id | после запуска напишите своему боту /start — он ответит вашим chat_id | да |
| Pexels | pexels.com/api → бесплатный ключ (живые кадры с людьми) | для рилсов |
| Озвучка | ElevenLabs (тариф Starter или Creator) **или** Yandex SpeechKit | для рилсов |
| VK | ключ администратора группы с правами wall, photos, video, groups, offline — этот шаг пройдём вместе | для VK |

## Сервер

Подойдёт любой VPS с Ubuntu 22.04 или 24.04, 2 ГБ ОЗУ, 20 ГБ диска (Timeweb Cloud, Beget, Selectel и т. п.). Сервер в России подходит: Telegram, VK, Notion, Pexels и ElevenLabs с него доступны.

```bash
sudo apt update && sudo apt install -y ffmpeg fonts-inter unzip
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
unzip crystal-publisher.zip && cd publisher
npm install && npx playwright install --with-deps chromium
cp .env.example .env && nano .env        # вставить ключи
npm run test-carousel                    # проверка: в папке test_slides появятся 7 слайдов
npm run test-reel                        # проверка: test_reel.mp4 (с голосом и кадрами, если ключи есть)
sudo npm i -g pm2 && pm2 start index.js --name publisher && pm2 save && pm2 startup
```

Логи: `pm2 logs publisher`. Перезапуск после правки .env: `pm2 restart publisher`.

## Что где лежит

- `templates/` — дизайн рилсов и каруселей (фирменные цвета, логотип, шрифт Inter)
- `film.js` — сборка рилса: графика + стоковое видео + голос + звуки
- `render.js` — сборка карусели
- `lib/` — Notion, Telegram, VK, озвучка, стоковое видео
- `examples/` — образцы сценариев: рилс «Почему банк отказал №1» и карусель «5 причин отказа»

## Если что-то не так

Ошибка пишется в поле «Ошибка» карточки в Notion и приходит вам в Telegram. Перешлите её мне, разберёмся.
