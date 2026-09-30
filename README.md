# ADL Event Services — сайт

Статический сайт на [Astro](https://astro.build) с анимированной главной (GSAP + Lenis) и клипами, сгенерированными через Higgsfield API. Публикуется на GitHub Pages автоматически при пуше в `main`.

## Быстрый старт

```bash
npm install          # один раз
npm run dev          # локально: http://127.0.0.1:4321/adl-event-services/
npm run build        # сборка в dist/
```

## Где что лежит

| Что менять | Где |
|---|---|
| Телефон, email, WhatsApp, Telegram, адрес, часы, ключ формы | `src/content/ru/site.ts` |
| Список услуг (карточки и меню) | `src/content/ru/services.ts` |
| Тексты страниц услуг, FAQ, чекбоксы формы | `src/content/ru/pages/*.ts` |
| Тексты семи сцен главной, «Для кого», «Почему ADL», FAQ главной | `src/content/ru/home.ts` |
| Мероприятия | `src/pages/events.astro` (массив `events`) |
| Кейсы и рекомендательные письма | `src/pages/cases.astro`, `src/pages/letters.astro` (массивы вверху файла) |
| Цвета, шрифты, отступы | `src/styles/tokens.css` |
| Клипы сцен главной | `public/media/scenes/<сцена>/` |
| Фото-референсы для генерации | `public/ref/` |
| Исходные документы и бриф | `docs/` |

Страницы: `/` главная, `/accommodation`, `/transfers`, `/visa-support`, `/delivery`, `/logistics`, `/event-support`, `/for-exhibitors`, `/for-delegations`, `/events`, `/cases`, `/letters`, `/contacts`.

## Форма заявки

Без бэкенда. Пока в `site.ts` пустой `formAccessKey`, кнопка «Отправить запрос» открывает WhatsApp с готовым текстом заявки. Чтобы заявки приходили на email, зарегистрируйте бесплатный ключ на [web3forms.com](https://web3forms.com) (нужен только email) и вставьте его в `formAccessKey`.

## Главная: сцены и клипы

Семь эпизодов пути гостя: `window → airport → transfer → hotel → expo → evening → departure`. Один жест прокрутки = один переход. Для каждой сцены в `public/media/scenes/<id>/`:

- `poster.webp` — первый кадр (показывается мгновенно и на мобильных)
- `loop.mp4` — зацикленный фон (5 с)
- `transition.mp4` — переход к следующей сцене (нет у последней)
- `intro.mp4` + `intro-poster.webp` — только у `window`: закрытая шторка → открытая

Генерация через Higgsfield (`tools/higgsfield/`):

1. Скопируйте `tools/higgsfield/.env.example` в `.env` и вставьте ключи из Higgsfield Console.
2. `npm run media:keyframes` — кадры сцен (Soul V2, по 4 варианта). Промпты в `scenes.json`.
3. Отсмотрите `tools/higgsfield/out/<сцена>/keyframe-*.jpg`, укажите номера выбранных в `select.json`.
4. `npm run media:videos -- --what all` — петли, переходы и интро (Kling O3 first-last-frame).
5. Укажите выбранные клипы в `select.json`, затем `npm run media:post` — ffmpeg сожмёт их в `public/media/scenes/`.
6. Проверьте главную и закоммитьте.

Чтобы перегенерировать одну сцену: `node tools/higgsfield/gen-keyframes.mjs --only hotel --force`, затем шаги 3–5 с `--only hotel`.

Временные заглушки (цветные градиенты) делаются командой `node tools/media/make-placeholders.mjs`.

## Публикация

Пуш в `main` запускает `.github/workflows/deploy.yml`: сборка Astro и деплой на GitHub Pages. Адрес: `https://<логин>.github.io/adl-event-services/`. В настройках репозитория (Settings → Pages) источник должен быть «GitHub Actions».

Свой домен: добавьте его в Settings → Pages, создайте файл `public/CNAME` с доменом и задайте в workflow переменные окружения `SITE_URL=https://ваш-домен` и `SITE_BASE=/`.
