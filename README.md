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

Семь эпизодов пути гостя: `window`, `airport`, `transfer`, `hotel`, `expo`, `evening`, `departure`. Один жест прокрутки или свайп = один переход. Видео играет и на компьютере, и на телефоне. Без видео, только фото с мягкой сменой, страница показывается при включённом «уменьшении движения», в режиме экономии трафика и если телефон не дал запустить видео (например, iPhone в режиме энергосбережения).

Файлы сцены в `public/media/scenes/<id>/`:

- `window`: `intro-poster.webp` и `intro.mp4` (закрытая шторка открывается), `poster.webp` и `loop.mp4` (бесконечные облака), `transition.mp4`
- остальные: `poster.webp` (фото), `live.mp4` (оживление, проигрывается один раз), `end.webp` (последний кадр), `transition.mp4` (переход к следующей сцене, у последней нет)

Видео подключается на странице, только если файл есть, поэтому сцену можно временно оставить на одном фото.

**Телефон.** Вертикальный экран видит только полосу широкого кадра. Куда она смотрит, задаёт `focus` сцены в `src/content/ru/home.ts` (0 левый край, 1 правый). Во время перехода кадр плавно смещается от фокуса одной сцены к фокусу следующей.

**Генерация через Higgsfield** (`tools/higgsfield/`, ключи в `tools/higgsfield/.env` по образцу `.env.example`). Описания сцен и промпты лежат в `scenes.json`, выбранные варианты в `select.json`.

1. `node tools/higgsfield/prep-photos.mjs` обрезает фото из `photo/фото анимации` до 16:9, загружает в Higgsfield и чистит надписи (поле `clean`).
2. `node tools/higgsfield/gen-videos.mjs --what live` оживляет сцены.
3. `node tools/higgsfield/extract-last.mjs` берёт последний кадр каждого оживления: с него начинается переход.
4. `node tools/higgsfield/gen-videos.mjs --what transitions` делает переходы.
5. `node tools/higgsfield/postprocess.mjs` сжимает выбранные клипы в `public/media/scenes/`.
6. `node tools/media/make-demo.mjs` собирает ролик-превью всего пути в `tools/higgsfield/out/demo-full.mp4`.

Чтобы переделать одну сцену, добавьте `--only hotel` и `--force`, а лишний вариант выберите в `select.json`. Если переделано оживление, переход после него тоже нужно перегенерировать: он стартует с последнего кадра.

## Публикация

Пуш в `main` запускает `.github/workflows/deploy.yml`: сборка Astro и деплой на GitHub Pages. Адрес: `https://<логин>.github.io/adl-event-services/`. В настройках репозитория (Settings → Pages) источник должен быть «GitHub Actions».

Свой домен: добавьте его в Settings → Pages, создайте файл `public/CNAME` с доменом и задайте в workflow переменные окружения `SITE_URL=https://ваш-домен` и `SITE_BASE=/`.
