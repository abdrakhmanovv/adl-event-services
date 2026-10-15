/**
 * Плеер сцен главной страницы.
 *
 * Страница листается как обычно (колесо, свайп вверх-вниз). Сцены листаются отдельно:
 * свайп влево или вправо, стрелки «‹ ›» на экране, клик по сцене, стрелки клавиатуры,
 * горизонтальная прокрутка тачпадом. Если посетитель ничего не трогает, сцены идут сами:
 * сцена оживает, стоит пару секунд на последнем кадре и переходит к следующей.
 * Вперёд — видеопереход, назад — быстрая мягкая смена кадра.
 *
 * Каждый клип заранее скачивается целиком в память (blob). Телефоны, особенно iPhone, иначе
 * подгружают видео по кусочку уже во время показа, и переход дёргается или стоит на первом кадре.
 * Пока клип не готов, сцена спокойно стоит на своём кадре.
 *
 * Без видео (только фото и мягкая смена) страница работает при «уменьшении движения»,
 * в режиме экономии трафика и если телефон не дал запустить видео (энергосбережение на iPhone).
 */
import { gsap } from 'gsap';
import Lenis from 'lenis';

const root = document.querySelector<HTMLElement>('[data-scenes]');

if (root) init(root);

function init(stack: HTMLElement) {
  const scenes = Array.from(stack.querySelectorAll<HTMLElement>('.scene'));
  const navButtons = Array.from(stack.querySelectorAll<HTMLButtonElement>('[data-goto]'));
  const counter = stack.querySelector<HTMLElement>('[data-counter-current]');
  const hintButton = stack.querySelector<HTMLButtonElement>('[data-down]');
  const prevButton = stack.querySelector<HTMLButtonElement>('[data-prev]');
  const nextButton = stack.querySelector<HTMLButtonElement>('[data-next]');
  const pauseButton = stack.querySelector<HTMLButtonElement>('[data-pause]');
  const header = document.getElementById('site-header');
  const after = document.getElementById('content');
  const last = scenes.length - 1;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // экономия трафика в браузере телефона (Chrome Lite mode и т.п.)
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  const lite = reduced || saveData;
  // телефон вертикально: берём лёгкие вырезанные клипы (-m), то же условие, что у картинок в разметке
  const portrait = window.matchMedia('(max-aspect-ratio: 2/3)').matches;

  // Lenis: плавная прокрутка страницы колесом мыши
  const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  let current = 0;
  let busy = false;
  let lastActionAt = 0;
  const COOLDOWN = 450; // мс после перехода, чтобы «дожёвывание» тачпада не листало дальше

  // Автопоказ: сколько сцена стоит на последнем кадре, прежде чем перейти дальше
  const AUTO_HOLD = 2500;
  // иллюминатор (бесконечные облака) и сцены без видео показываются столько
  const AUTO_STILL = 5000;
  // при «уменьшении движения» сцены сами не листаются
  let autoplay = !reduced;
  let autoTimer = 0;
  let heroVisible = true;

  // Первая сцена: сколько надпись «Добро пожаловать в Казахстан» видна на закрытой шторке
  // до начала открытия, и во сколько раз ускорить клип открытия (клипы Higgsfield не короче 3 с).
  const INTRO_DELAY = 1500;
  const INTRO_RATE = 2;
  // Скорость переходов между сценами
  const TRANSITION_RATE = 1.35;
  // Сколько ждать загрузки перехода, прежде чем сдаться и сменить кадр мягко
  const TRANSITION_LOAD_WAIT = 4000;
  // Сколько сцена может постоять на своём кадре, ожидая загрузки оживления
  const LIVE_LOAD_WAIT = 2000;

  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

  // ---------- элементы сцен ----------
  const loopOf = (i: number) => scenes[i].querySelector<HTMLVideoElement>('.scene__loop');
  const transitionOf = (i: number) => scenes[i].querySelector<HTMLVideoElement>('.scene__transition');
  const liveOf = (i: number) => scenes[i].querySelector<HTMLVideoElement>('.scene__live');
  const endOf = (i: number) => scenes[i].querySelector<HTMLElement>('.scene__end');
  const textOf = (i: number) => scenes[i].querySelector<HTMLElement>('.scene__text')!;
  /** Точка фокуса сцены по горизонтали (0…1): что видно на вертикальном экране телефона. */
  const focusOf = (i: number) => Number(scenes[i].dataset.focus ?? 0.5);

  const safePlay = (v: HTMLVideoElement | null) => {
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  // ---------- загрузка клипов целиком в память ----------
  //
  // У видео два флажка:
  //   dataset.inUse   — клип назначен к показу (ещё может ждать загрузки);
  //   dataset.started — клип уже запущен: подменять ему источник нельзя, он перезапустится.
  const blobUrls = new Map<string, Promise<string>>();

  // На телефоне сразу переключаем видео на лёгкие версии: и для загрузки в память,
  // и на случай, если она не удастся и видео пойдёт прямо из сети.
  if (portrait && !lite) {
    stack.querySelectorAll<HTMLVideoElement>('video[data-src-m]').forEach((v) => {
      v.setAttribute('src', v.dataset.srcM!);
      v.dataset.mobile = '1'; // сдвиг кадра уже вшит в клип
    });
  }

  const sourceOf = (v: HTMLVideoElement) => v.getAttribute('src') || v.querySelector('source')?.getAttribute('src') || '';

  const fetchBlobUrl = (src: string) => {
    let p = blobUrls.get(src);
    if (!p) {
      p = fetch(src)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        })
        .then((b) => URL.createObjectURL(b));
      blobUrls.set(src, p);
      p.catch(() => blobUrls.delete(src)); // при сбое сети попробуем снова в следующий раз
    }
    return p;
  };

  /** Скачать клип целиком и переключить видео на копию в памяти. true — клип готов. */
  const ensureBlob = async (v: HTMLVideoElement): Promise<boolean> => {
    if (v.dataset.blob) return true;
    const src = sourceOf(v);
    if (!src) return false;
    const url = await fetchBlobUrl(src);
    if (v.dataset.blob) return true;
    if (v.dataset.started) return false; // уже играет из сети — не перебиваем
    v.dataset.blob = '1';
    v.src = url;
    v.load();
    return true;
  };

  /** Дождаться загрузки клипа, но не дольше ms. */
  const readyWithin = (v: HTMLVideoElement, ms: number) =>
    Promise.race([ensureBlob(v).catch(() => false), wait(ms).then(() => false)]);

  /**
   * Очередь заблаговременной загрузки: клипы качаются по одному, в порядке нужности.
   * На слабом интернете параллельные загрузки делили бы канал, и ни один клип не успевал бы.
   * Клип, который нужен прямо сейчас, грузится вне очереди (readyWithin) — повторно он не скачается.
   */
  const queue: HTMLVideoElement[] = [];
  let pumping = false;
  const pump = async () => {
    if (pumping) return;
    pumping = true;
    while (queue.length) {
      const v = queue.shift()!;
      if (v.dataset.blob) continue;
      await ensureBlob(v).catch(() => {});
    }
    pumping = false;
  };

  /** Поставить клипы в начало очереди в указанном порядке. */
  const preloadFirst = (list: (HTMLVideoElement | null)[]) => {
    if (lite) return;
    const items = list.filter((v): v is HTMLVideoElement => Boolean(v && !v.dataset.blob));
    for (const v of items) {
      const k = queue.indexOf(v);
      if (k >= 0) queue.splice(k, 1);
    }
    queue.unshift(...items);
    pump();
  };

  /** Что понадобится дальше, по порядку: переход отсюда, оживление следующей сцены, переход после неё. */
  const preloadAround = (i: number) => {
    preloadFirst([
      loopOf(i),
      transitionOf(i),
      i + 1 <= last ? loopOf(i + 1) : null,
      i + 1 <= last ? liveOf(i + 1) : null,
      i + 1 <= last ? transitionOf(i + 1) : null,
      i + 2 <= last ? liveOf(i + 2) : null,
    ]);
  };

  /** Сбросить флажки показа: клип снова свободен. */
  const release = (v: HTMLVideoElement) => {
    delete v.dataset.inUse;
    delete v.dataset.started;
  };

  // ---------- иллюминатор: бесконечная петля облаков ----------
  /**
   * Запустить петлю с первого кадра. Пока клип грузится, виден poster.webp —
   * тот же первый кадр, поэтому ожидание незаметно.
   */
  const showLoop = (i: number) => {
    const v = loopOf(i);
    if (!v || lite) return;
    v.dataset.inUse = '1';
    readyWithin(v, LIVE_LOAD_WAIT).then(() => {
      if (!v.dataset.inUse) return; // посетитель уже ушёл со сцены
      v.dataset.started = '1';
      try {
        v.currentTime = 0;
      } catch {
        /* начнёт с нуля и так */
      }
      v.addEventListener('playing', () => v.classList.add('is-visible'), { once: true });
      safePlay(v);
    });
  };

  const stopLoop = (i: number) => {
    const v = loopOf(i);
    if (!v) return;
    release(v);
    v.pause();
    v.classList.remove('is-visible');
  };

  // ---------- сцены на фото: оживают один раз и замирают ----------
  /**
   * Показать сцену. play — оживление с начала, после конца видео остаётся на последнем кадре.
   * frozen — сразу последний кадр (возврат назад). У иллюминатора вместо этого петля облаков.
   */
  const startScene = (i: number, how: 'play' | 'frozen') => {
    const live = liveOf(i);
    if (!live) return showLoop(i);
    if (lite) return; // без видео — просто фото
    const end = endOf(i);
    if (how === 'frozen') {
      release(live);
      live.pause();
      live.classList.remove('is-visible');
      end?.classList.add('is-visible');
      return;
    }
    end?.classList.remove('is-visible');
    live.classList.remove('is-visible');
    live.dataset.inUse = '1';
    // пока оживление грузится, виден poster.webp — это его первый кадр
    readyWithin(live, LIVE_LOAD_WAIT).then(() => {
      if (!live.dataset.inUse) return;
      live.dataset.started = '1';
      live.playbackRate = 1;
      try {
        live.currentTime = 0;
      } catch {
        /* начнёт с нуля и так */
      }
      live.addEventListener('playing', () => live.classList.add('is-visible'), { once: true });
      safePlay(live);
    });
  };

  const stopScene = (i: number) => {
    stopLoop(i);
    const live = liveOf(i);
    if (live) {
      release(live);
      live.pause();
      live.classList.remove('is-visible');
    }
    endOf(i)?.classList.remove('is-visible');
  };

  /**
   * Если посетитель листает дальше, пока сцена ещё оживает, быстро доигрываем её до конца:
   * переход начинается именно с последнего кадра, так стыка не видно.
   */
  const finishLive = async (i: number) => {
    const live = liveOf(i);
    if (!live || lite) return;
    // оживление назначено, но ещё не стартовало — дождёмся старта, иначе кадр прыгнет
    if (live.dataset.inUse && !live.dataset.started) {
      await Promise.race([new Promise((r) => live.addEventListener('playing', r, { once: true })), wait(LIVE_LOAD_WAIT + 500)]);
    }
    if (live.ended || live.paused) return;
    const FAST = 6;
    live.playbackRate = FAST;
    const remaining = isFinite(live.duration) ? ((live.duration - live.currentTime) / FAST) * 1000 : 600;
    await Promise.race([new Promise((r) => live.addEventListener('ended', r, { once: true })), wait(remaining + 300)]);
  };

  // ---------- текст и состояние ----------
  const setActive = (i: number) => {
    scenes.forEach((s, k) => {
      const active = k === i;
      s.classList.toggle('is-active', active);
      if (active) {
        s.removeAttribute('aria-hidden');
        s.removeAttribute('inert');
      } else {
        s.setAttribute('aria-hidden', 'true');
        s.setAttribute('inert', '');
      }
    });
    navButtons.forEach((b, k) => {
      if (k === i) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    if (counter) counter.textContent = String(i + 1);
  };

  /** Что анимировать в тексте сцены: элементы с data-anim (первая сцена), иначе прямые потомки. */
  const partsOf = (i: number) => {
    const el = textOf(i);
    const marked = el.querySelectorAll<HTMLElement>('[data-anim]');
    return marked.length ? Array.from(marked) : Array.from(el.children);
  };

  const textIn = (i: number, delay = 0) => {
    const el = textOf(i);
    const parts = partsOf(i);
    gsap.killTweensOf(parts);
    gsap.set(el, { opacity: 1 });
    return gsap.fromTo(
      parts,
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: reduced ? 0.01 : 0.55, stagger: reduced ? 0 : 0.1, ease: 'power3.out', delay },
    );
  };

  const textOut = (i: number) => {
    const parts = partsOf(i);
    gsap.killTweensOf(parts);
    return gsap.to(parts, {
      opacity: 0,
      y: -16,
      duration: reduced ? 0.01 : 0.22,
      stagger: reduced ? 0 : 0.03,
      ease: 'power2.in',
    });
  };

  // ---------- переходы ----------
  const crossfade = (from: number, to: number, how: 'play' | 'frozen') => {
    const fromEl = scenes[from];
    const toEl = scenes[to];
    toEl.classList.add('is-active');
    gsap.set(toEl, { opacity: 0, scale: 1.05, visibility: 'visible' });
    gsap.set(textOf(to), { opacity: 0 });
    startScene(to, how);
    return gsap
      .timeline()
      .to(toEl, { opacity: 1, scale: 1, duration: reduced ? 0.01 : 0.5, ease: 'power2.out' }, 0)
      .to(fromEl, { opacity: 0, duration: reduced ? 0.01 : 0.4, ease: 'power2.in' }, 0)
      .set(fromEl, { clearProps: 'opacity,scale,visibility' })
      .set(toEl, { clearProps: 'opacity,scale,visibility' });
  };

  /**
   * Сыграть видеопереход. Сначала клип должен оказаться в памяти целиком: пока он грузится,
   * сцена стоит на своём кадре, а счётчик сцен мягко пульсирует. Если за TRANSITION_LOAD_WAIT
   * не загрузился или видео не стартовало — false, и goTo сменит кадр мягко.
   *
   * На вертикальном экране кадр сдвигается от фокуса этой сцены к фокусу следующей. Сдвиг
   * привязан ко времени самого видео и идёт во второй половине движения: если видео
   * притормозит, сдвиг тоже остановится и не будет выглядеть как поворот на месте.
   */
  const START_WAIT = 1500;
  const playTransitionVideo = async (from: number, to: number): Promise<boolean> => {
    const v = transitionOf(from);
    if (!v || lite) return false;

    if (!v.dataset.blob) {
      stack.classList.add('is-loading');
      const ok = await readyWithin(v, TRANSITION_LOAD_WAIT);
      stack.classList.remove('is-loading');
      if (!ok && !v.dataset.blob) return false;
    }

    return new Promise<boolean>((resolve) => {
      // в лёгких клипах для телефона сдвиг уже вшит — браузеру двигать нечего
      const baked = v.dataset.mobile === '1';
      const f0 = baked ? 0.5 : focusOf(from);
      const f1 = baked ? 0.5 : focusOf(to);
      let done = false;
      let started = false;
      let endTimer = 0;

      const pan = () => {
        const d = v.duration;
        if (!d || !isFinite(d)) return;
        const t = Math.min(1, Math.max(0, (v.currentTime / d - 0.25) / 0.65));
        const e = t * t * (3 - 2 * t);
        v.style.objectPosition = `${(f0 + (f1 - f0) * e) * 100}% 50%`;
      };

      /**
       * Подстраховка на случай, если ended не придёт: срок пересчитывается по фактическому
       * положению видео, поэтому короткая задержка воспроизведения не обрывает переход раньше времени.
       */
      const armEndTimer = () => {
        clearTimeout(endTimer);
        const d = v.duration && isFinite(v.duration) ? v.duration : 3;
        const left = Math.max(0, d - v.currentTime) / (v.playbackRate || TRANSITION_RATE);
        endTimer = window.setTimeout(() => finish(true), left * 1000 + 1500);
      };
      const onTimeUpdate = () => armEndTimer();

      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        v.removeEventListener('playing', onPlaying);
        v.removeEventListener('timeupdate', onTimeUpdate);
        v.removeEventListener('ended', onEnded);
        v.removeEventListener('error', onError);
        gsap.ticker.remove(pan);
        clearTimeout(startTimer);
        clearTimeout(endTimer);
        if (!ok) {
          v.pause();
          v.classList.remove('is-playing');
          v.style.objectPosition = '';
          release(v);
        }
        resolve(ok);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(false);
      const onPlaying = () => {
        if (started) return;
        started = true;
        v.classList.add('is-playing');
        armEndTimer();
        v.addEventListener('timeupdate', onTimeUpdate);
      };

      v.dataset.inUse = '1';
      v.dataset.started = '1';
      if (!baked) v.style.objectPosition = `${f0 * 100}% 50%`;
      try {
        v.currentTime = 0;
      } catch {
        /* начнёт с нуля и так */
      }
      v.playbackRate = TRANSITION_RATE;
      v.addEventListener('playing', onPlaying);
      v.addEventListener('ended', onEnded);
      v.addEventListener('error', onError);
      if (f0 !== f1) gsap.ticker.add(pan);
      const startTimer = window.setTimeout(() => {
        if (!started) finish(false);
      }, START_WAIT);

      // Следующая сцена стартует только после перехода (в goTo), с первого кадра:
      // последний кадр перехода = первый кадр её видео = poster следующей сцены.
      safePlay(v);
    });
  };

  // ---------- автопоказ ----------
  const clearAuto = () => {
    clearTimeout(autoTimer);
    autoTimer = 0;
  };

  const scheduleAuto = (ms: number) => {
    clearTimeout(autoTimer);
    autoTimer = window.setTimeout(autoNext, ms);
  };

  /**
   * Запланировать переход к следующей сцене: после конца оживления и паузы AUTO_HOLD,
   * у сцен без оживления — через AUTO_STILL.
   */
  const armAuto = (i: number) => {
    clearAuto();
    if (!autoplay) return;
    const live = liveOf(i);
    if (live && !lite) {
      live.addEventListener(
        'ended',
        () => {
          if (current === i && autoplay) scheduleAuto(AUTO_HOLD);
        },
        { once: true },
      );
      scheduleAuto(12000); // подстраховка: если оживление так и не стартовало
    } else {
      scheduleAuto(i === 0 ? AUTO_STILL + 1500 : AUTO_STILL);
    }
  };

  /** Следующая сцена по таймеру. Пока сцены не видно на экране или вкладка свёрнута — ждём. */
  function autoNext() {
    if (!autoplay) return;
    if (busy || !heroVisible || document.hidden) {
      scheduleAuto(1000);
      return;
    }
    if (current === last) goTo(0, 'jump');
    else goTo(current + 1, 'forward');
  }

  const setAutoplay = (on: boolean) => {
    autoplay = on;
    pauseButton?.setAttribute('aria-pressed', String(!on));
    pauseButton?.setAttribute('aria-label', on ? 'Остановить автопоказ' : 'Включить автопоказ');
    stack.classList.toggle('is-paused', !on);
    if (on) armAuto(current);
    else clearAuto();
  };

  // ---------- переключение сцен ----------
  const goTo = async (to: number, direction: 'forward' | 'backward' | 'jump') => {
    if (busy || to === current || to < 0 || to > last) return;
    busy = true;
    clearAuto();
    stack.classList.add('has-moved');
    const from = current;

    textOut(from);

    // видеопереход есть только к соседней следующей сцене; прыжки по точкам — мягкой сменой
    const adjacentForward = direction === 'forward' && to === from + 1;

    if (adjacentForward && !lite) {
      await finishLive(from); // переход начинается с последнего кадра оживления
      const played = await playTransitionVideo(from, to);
      if (played) {
        // переход закончился на первом кадре следующей сцены: показываем её и оживляем с нуля
        setActive(to);
        startScene(to, 'play');
        const v = transitionOf(from);
        if (v) {
          v.classList.remove('is-playing');
          v.pause();
          v.currentTime = 0;
          v.style.objectPosition = '';
          release(v);
        }
        stopScene(from);
      } else {
        await crossfade(from, to, 'play');
        setActive(to);
        stopScene(from);
      }
    } else {
      await crossfade(from, to, direction === 'backward' ? 'frozen' : 'play');
      setActive(to);
      stopScene(from);
    }

    current = to;
    textIn(to, 0.05);
    preloadAround(to);
    lastActionAt = performance.now();
    busy = false;
    armAuto(to);
  };

  // по кругу: после проводов снова иллюминатор, назад с иллюминатора — проводы
  const next = () => {
    if (busy) return;
    if (current === last) goTo(0, 'jump');
    else goTo(current + 1, 'forward');
  };

  const prev = () => {
    if (busy) return;
    if (current === 0) goTo(last, 'jump');
    else goTo(current - 1, 'backward');
  };

  // ---------- ввод ----------
  const inCooldown = () => performance.now() - lastActionAt < COOLDOWN;

  // Горизонтальная прокрутка тачпадом над сценами листает их; вертикальная — страницу
  let wheelAccum = 0;
  stack.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // вертикаль — обычная прокрутка страницы
      e.preventDefault(); // не даём браузеру уйти «назад» жестом
      if (busy || inCooldown()) {
        wheelAccum = 0;
        return;
      }
      wheelAccum += e.deltaX;
      if (Math.abs(wheelAccum) < 30) return;
      const dir = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      dir > 0 ? next() : prev();
    },
    { passive: false },
  );

  // Свайп по сценам: влево — дальше, вправо — назад. Вверх-вниз страница листается сама
  // (у .scenes стоит touch-action: pan-y, браузер отдаёт нам только горизонтальные жесты).
  const SWIPE = 40;
  let touchX: number | null = null;
  let touchY: number | null = null;
  let swiped = false;
  stack.addEventListener(
    'touchstart',
    (e) => {
      touchX = e.touches[0]?.clientX ?? null;
      touchY = e.touches[0]?.clientY ?? null;
      swiped = false;
    },
    { passive: true },
  );
  stack.addEventListener(
    'touchend',
    (e) => {
      if (touchX === null || touchY === null) return;
      const t = e.changedTouches[0];
      const dx = touchX - (t?.clientX ?? touchX); // > 0: палец ушёл влево
      const dy = touchY - (t?.clientY ?? touchY);
      touchX = touchY = null;
      if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      swiped = true;
      if (busy || inCooldown()) return;
      dx > 0 ? next() : prev();
    },
    { passive: true },
  );

  // Клик или тап по свободному месту сцены — следующая сцена (кнопки и ссылки работают как обычно)
  stack.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, label')) return;
    if (swiped) {
      swiped = false;
      return;
    }
    if (busy || inCooldown()) return;
    next();
  });

  prevButton?.addEventListener('click', prev);
  nextButton?.addEventListener('click', next);
  pauseButton?.addEventListener('click', () => setAutoplay(!autoplay));

  // Стрелки влево-вправо на клавиатуре, пока сцены на экране
  window.addEventListener('keydown', (e) => {
    if (!heroVisible) return;
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  });

  navButtons.forEach((b, i) => {
    b.addEventListener('click', () => goTo(i, i > current ? 'forward' : 'backward'));
  });

  // «Вниз» — к услугам
  hintButton?.addEventListener('click', () => {
    if (after) lenis.scrollTo(after, { duration: 0.9 });
  });

  // Переход по ссылке вида /#hotel уже на открытой странице
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    const idx = scenes.findIndex((s) => s.dataset.scene === id);
    if (idx < 0 || idx === current) return;
    lenis.scrollTo(0, { immediate: true });
    goTo(idx, idx > current ? 'forward' : 'backward');
  });

  // В облегчённом режиме видео не нужны — не тянем их из сети
  if (lite) {
    stack.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
      v.preload = 'none';
    });
  }

  if ('IntersectionObserver' in window) {
    // Шапка становится светлой, когда сцены ушли из вида
    if (header) {
      new IntersectionObserver(([entry]) => header.classList.toggle('is-light', !entry.isIntersecting), {
        threshold: 0.02,
      }).observe(stack);
    }
    // Автопоказ и стрелки клавиатуры работают, пока сцены хотя бы наполовину на экране
    new IntersectionObserver(
      ([entry]) => {
        heroVisible = entry.isIntersecting;
      },
      { threshold: 0.5 },
    ).observe(stack);
  }

  // ---------- старт ----------
  const first = scenes[0];
  const intro = first.querySelector<HTMLVideoElement>('.scene__intro');
  const introPoster = first.querySelector<HTMLImageElement>('.scene__intro-poster');
  const shadeText = first.querySelector<HTMLElement>('[data-shade-text]');

  /** Убрать закрытую шторку и надпись на ней: после открытия или если зашли сразу на другую сцену. */
  const skipIntro = () => {
    intro?.classList.add('is-hidden');
    introPoster?.classList.add('is-hidden');
    shadeText?.classList.add('is-hidden');
    intro?.pause();
  };

  const startFromHash = () => {
    const hash = location.hash.replace('#', '');
    if (!hash) return false;
    const idx = scenes.findIndex((s) => s.dataset.scene === hash);
    if (idx <= 0) return false;
    skipIntro();
    scenes[0].classList.remove('is-active');
    scenes[idx].classList.add('is-active');
    current = idx;
    setActive(idx);
    gsap.set(partsOf(idx), { opacity: 1, y: 0 });
    startScene(idx, 'play');
    preloadAround(idx);
    stack.classList.add('has-moved');
    armAuto(idx);
    return true;
  };

  /**
   * Первая сцена: закрытая шторка с надписью → через INTRO_DELAY шторка сама поднимается
   * (клип intro.mp4) → за окном плывут облака (петля) → выходит заголовок.
   */
  const startIntro = () => {
    gsap.set(partsOf(0), { opacity: 0 });

    let finished = false;
    const finish = (textDelay: number, dissolve = false) => {
      if (finished) return;
      finished = true;
      showLoop(0); // петля облаков стартует под открытой шторкой
      textIn(0, textDelay);
      armAuto(0);
      if (dissolve && intro && !reduced) {
        // облака в петле плывут, поэтому последний кадр открытия мягко растворяем в неё
        gsap.to([intro, introPoster].filter(Boolean), { opacity: 0, duration: 0.4, ease: 'power1.inOut', onComplete: skipIntro });
      } else {
        skipIntro();
      }
    };

    // надпись уезжает вверх вместе со шторкой
    const hideShadeText = (duration: number) => {
      if (!shadeText) return;
      gsap.to(shadeText, { opacity: 0, yPercent: -70, duration: reduced ? 0.01 : duration, ease: 'power2.in' });
    };

    // мягкое открытие без видео: закрытый кадр растворяется в открытый
    let softOpened = false;
    const softOpen = () => {
      if (softOpened || finished) return;
      softOpened = true;
      intro?.pause();
      if (!introPoster) return finish(0.4);
      hideShadeText(0.35);
      gsap.to(introPoster, {
        opacity: 0,
        duration: reduced ? 0.01 : 0.6,
        ease: 'power2.inOut',
        onComplete: () => finish(0.05),
      });
    };

    const play = async () => {
      if (finished || softOpened) return;
      if (!intro) return softOpen();
      // клип открытия маленький; ждём его, пока на экране закрытая шторка с надписью
      await readyWithin(intro, 2500);
      if (finished || softOpened) return;
      intro.defaultPlaybackRate = INTRO_RATE;
      intro.playbackRate = INTRO_RATE;
      intro.dataset.inUse = '1';
      intro.dataset.started = '1';
      let started = false;
      // показываем клип, только когда он реально пошёл: первый кадр = закрытый кадр, подмены не видно
      intro.addEventListener(
        'playing',
        () => {
          started = true;
          intro.classList.add('is-visible');
          hideShadeText(0.45);
        },
        { once: true },
      );
      intro.addEventListener('ended', () => finish(0.1, true), { once: true });
      intro.addEventListener('error', softOpen, { once: true });
      safePlay(intro);
      // телефон не дал запустить видео (энергосбережение, нет сети) — мягкая смена кадра
      window.setTimeout(() => {
        if (!started) softOpen();
      }, 2500);
      window.setTimeout(() => finish(0.1), 9000); // подстраховка, если ended не придёт
    };

    // отсчёт INTRO_DELAY идёт с момента, когда закрытая шторка с надписью уже на экране
    const kick = () => window.setTimeout(lite ? softOpen : play, INTRO_DELAY);
    if (!introPoster || introPoster.complete) kick();
    else {
      introPoster.addEventListener('load', kick, { once: true });
      introPoster.addEventListener('error', kick, { once: true });
    }

    // клип открытия грузим первым, следом всё для первого перехода
    if (!lite && intro) {
      ensureBlob(intro)
        .catch(() => {})
        .finally(() => preloadAround(0));
    } else {
      preloadAround(0);
    }
  };

  setAutoplay(autoplay);
  if (!startFromHash()) startIntro();
}
