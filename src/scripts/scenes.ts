/**
 * Плеер сцен главной страницы.
 * Один жест прокрутки = один переход между эпизодами. Вперёд — видеопереход,
 * назад — быстрый кроссфейд. Видео играет и на телефонах; без видео (только фото и мягкая смена)
 * страница работает при «уменьшении движения» и режиме экономии трафика, а также если
 * телефон не дал запустить видео (например, iPhone в режиме энергосбережения).
 */
import { gsap } from 'gsap';
import Lenis from 'lenis';

const root = document.querySelector<HTMLElement>('[data-scenes]');

if (root) init(root);

function init(stack: HTMLElement) {
  const scenes = Array.from(stack.querySelectorAll<HTMLElement>('.scene'));
  const navButtons = Array.from(stack.querySelectorAll<HTMLButtonElement>('[data-goto]'));
  const counter = stack.querySelector<HTMLElement>('[data-counter-current]');
  const hintButton = stack.querySelector<HTMLButtonElement>('[data-next]');
  const header = document.getElementById('site-header');
  const after = document.getElementById('content');
  const last = scenes.length - 1;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // экономия трафика в браузере телефона (Chrome Lite mode и т.п.)
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  const lite = reduced || saveData;
  // сенсорные устройства: iPhone и многие Android не грузят видео заранее, пока его не запустить
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // Lenis: плавная прокрутка светлой части. Пока мы внутри сцен — остановлен.
  const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  let current = 0;
  let busy = false;
  let released = false;
  let lastActionAt = 0;
  const COOLDOWN = 450; // мс после перехода, чтобы «дожёвывание» тачпада не листало дальше

  // Первая сцена: сколько надпись «Добро пожаловать в Казахстан» видна на закрытой шторке
  // до начала открытия, и во сколько раз ускорить клип открытия (клипы Higgsfield не короче 3 с).
  const INTRO_DELAY = 1500;
  const INTRO_RATE = 2;
  // Скорость переходов между сценами
  const TRANSITION_RATE = 1.35;

  // ---------- вспомогательные ----------
  const loopOf = (i: number) => scenes[i].querySelector<HTMLVideoElement>('.scene__loop');
  const transitionOf = (i: number) => scenes[i].querySelector<HTMLVideoElement>('.scene__transition');
  const textOf = (i: number) => scenes[i].querySelector<HTMLElement>('.scene__text')!;

  const safePlay = (v: HTMLVideoElement | null) => {
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  /**
   * «Прогрев» на сенсорных устройствах: короткий запуск невидимого видео и сразу пауза.
   * Так телефон начинает его скачивать, и к моменту перехода оно уже готово.
   * dataset.inUse защищает видео, которое за это время успели запустить по-настоящему.
   */
  const prime = (v: HTMLVideoElement) => {
    if (v.dataset.primed) return;
    v.dataset.primed = '1';
    const p = v.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (v.dataset.inUse) return;
        v.pause();
        try {
          v.currentTime = 0;
        } catch {
          /* не страшно */
        }
      }).catch(() => {});
    }
  };

  const loadVideo = (v: HTMLVideoElement | null) => {
    if (!v || lite) return;
    if (v.preload !== 'auto') {
      v.preload = 'auto';
      v.load();
    }
    if (coarse) prime(v);
  };

  /** Точка фокуса сцены по горизонтали (0…1): что видно на вертикальном экране телефона. */
  const focusOf = (i: number) => Number(scenes[i].dataset.focus ?? 0.5);

  /**
   * Запустить фоновую петлю сцены с первого кадра. Пока видео не выдало кадр, виден
   * poster.webp — это тот же первый кадр, поэтому стык с переходом не заметен.
   */
  const showLoop = (i: number) => {
    const v = loopOf(i);
    if (!v || lite) return;
    v.dataset.inUse = '1';
    try {
      v.currentTime = 0;
    } catch {
      /* метаданные ещё не загружены — видео и так начнёт с нуля */
    }
    v.addEventListener('playing', () => v.classList.add('is-visible'), { once: true });
    safePlay(v);
  };

  const stopLoop = (i: number) => {
    const v = loopOf(i);
    if (!v) return;
    delete v.dataset.inUse;
    v.pause();
    v.classList.remove('is-visible');
  };

  // ---------- сцены на фото: оживают один раз и замирают ----------
  const liveOf = (i: number) => scenes[i].querySelector<HTMLVideoElement>('.scene__live');
  const endOf = (i: number) => scenes[i].querySelector<HTMLElement>('.scene__end');

  /**
   * Показать сцену. play — оживление с начала, после конца видео остаётся на последнем кадре.
   * frozen — сразу последний кадр (возврат назад). У иллюминатора вместо этого петля облаков.
   */
  const startScene = (i: number, how: 'play' | 'frozen') => {
    const live = liveOf(i);
    if (!live) return showLoop(i);
    if (lite) return; // на телефоне и при reduced motion — просто фото
    const end = endOf(i);
    if (how === 'frozen') {
      live.pause();
      live.classList.remove('is-visible');
      end?.classList.add('is-visible');
      return;
    }
    end?.classList.remove('is-visible');
    live.dataset.inUse = '1';
    live.playbackRate = 1;
    try {
      live.currentTime = 0;
    } catch {
      /* ещё не загружено — начнёт с нуля */
    }
    live.addEventListener('playing', () => live.classList.add('is-visible'), { once: true });
    safePlay(live);
  };

  const stopScene = (i: number) => {
    stopLoop(i);
    const live = liveOf(i);
    if (live) {
      delete live.dataset.inUse;
      live.pause();
      live.classList.remove('is-visible');
    }
    endOf(i)?.classList.remove('is-visible');
  };

  /**
   * Если посетитель листает дальше, пока сцена ещё оживает, быстро доигрываем её до конца:
   * переход начинается именно с последнего кадра, так стыка не видно.
   */
  const finishLive = (i: number) =>
    new Promise<void>((resolve) => {
      const live = liveOf(i);
      if (!live || lite || live.ended || live.paused) return resolve();
      const FAST = 6;
      live.playbackRate = FAST;
      const remaining = isFinite(live.duration) ? ((live.duration - live.currentTime) / FAST) * 1000 : 600;
      const timer = window.setTimeout(done, remaining + 300);
      function done() {
        clearTimeout(timer);
        live!.removeEventListener('ended', done);
        resolve();
      }
      live.addEventListener('ended', done, { once: true });
    });

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
    const id = scenes[i].dataset.scene;
    if (id) history.replaceState(null, '', i === 0 ? location.pathname : `#${id}`);
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

  // ---------- захват / освобождение прокрутки ----------
  const capture = () => {
    released = false;
    lenis.stop();
    header?.classList.remove('is-light');
    document.documentElement.classList.add('scenes-captured');
  };

  const release = () => {
    released = true;
    lenis.start();
    lenis.resize();
    document.documentElement.classList.remove('scenes-captured');
    if (after) {
      // числовая цель надёжнее: Lenis только что «проснулся» и мог не знать размеры
      const top = stack.offsetTop + stack.offsetHeight;
      lenis.scrollTo(top, { duration: 0.9, easing: (t) => 1 - Math.pow(1 - t, 3), force: true });
    }
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
   * Сыграть видеопереход. Показываем его только когда видео реально пошло: на телефоне оно
   * может догружаться долю секунды. Если за START_WAIT не стартовало (нет сети, энергосбережение),
   * отвечаем false — goTo сделает мягкую смену кадра.
   * Во время перехода кадр плавно смещается от фокуса этой сцены к фокусу следующей, поэтому
   * на вертикальном экране стык с новой сценой не прыгает.
   */
  const START_WAIT = 1500;
  const playTransitionVideo = (from: number, to: number) =>
    new Promise<boolean>((resolve) => {
      const v = transitionOf(from);
      if (!v || lite) return resolve(false);

      let done = false;
      let started = false;
      let endTimer = 0;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        v.removeEventListener('playing', onPlaying);
        v.removeEventListener('ended', onEnded);
        v.removeEventListener('error', onError);
        clearTimeout(startTimer);
        clearTimeout(endTimer);
        if (!ok) {
          v.pause();
          v.classList.remove('is-playing');
          delete v.dataset.inUse;
        }
        resolve(ok);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(false);
      const onPlaying = () => {
        if (started) return;
        started = true;
        v.classList.add('is-playing');
        const rate = v.playbackRate || TRANSITION_RATE;
        const seconds = v.duration && isFinite(v.duration) ? v.duration / rate : 3;
        gsap.fromTo(
          v,
          { objectPosition: `${focusOf(from) * 100}% 50%` },
          { objectPosition: `${focusOf(to) * 100}% 50%`, duration: seconds, ease: 'power1.inOut' },
        );
        // подстраховка, если ended не придёт
        endTimer = window.setTimeout(() => finish(true), seconds * 1000 + 400);
      };

      v.dataset.inUse = '1';
      try {
        v.currentTime = 0;
      } catch {
        /* ещё не загружено — начнёт с нуля */
      }
      v.playbackRate = TRANSITION_RATE;
      v.addEventListener('playing', onPlaying);
      v.addEventListener('ended', onEnded);
      v.addEventListener('error', onError);
      const startTimer = window.setTimeout(() => {
        if (!started) finish(false);
      }, START_WAIT);

      // Следующая сцена стартует только после перехода (в goTo), с первого кадра:
      // последний кадр перехода = первый кадр её видео = poster следующей сцены.
      safePlay(v);
    });

  const goTo = async (to: number, direction: 'forward' | 'backward' | 'jump') => {
    if (busy || to === current || to < 0 || to > last) return;
    busy = true;
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
          delete v.dataset.inUse;
          gsap.set(v, { clearProps: 'objectPosition' });
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
  };

  const preloadAround = (i: number) => {
    loadVideo(transitionOf(i));
    if (i + 1 <= last) {
      loadVideo(loopOf(i + 1));
      loadVideo(liveOf(i + 1));
    }
    if (i - 1 >= 0) loadVideo(loopOf(i - 1));
  };

  const next = () => {
    if (busy) return;
    if (current === last) {
      if (!released) release();
      return;
    }
    goTo(current + 1, 'forward');
  };

  const prev = () => {
    if (busy || current === 0) return;
    goTo(current - 1, 'backward');
  };

  // ---------- ввод ----------
  const inCooldown = () => performance.now() - lastActionAt < COOLDOWN;

  let wheelAccum = 0;
  window.addEventListener(
    'wheel',
    (e) => {
      if (released) {
        // вернуться в сцены, если на самом верху и крутят вверх
        if (window.scrollY <= 1 && e.deltaY < 0 && !busy) {
          e.preventDefault();
          capture();
          lastActionAt = performance.now();
        }
        return;
      }
      e.preventDefault();
      if (busy || inCooldown()) {
        wheelAccum = 0;
        return;
      }
      wheelAccum += e.deltaY;
      if (Math.abs(wheelAccum) < 12) return;
      const dir = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      dir > 0 ? next() : prev();
    },
    { passive: false },
  );

  let touchY: number | null = null;
  window.addEventListener(
    'touchstart',
    (e) => {
      touchY = e.touches[0]?.clientY ?? null;
    },
    { passive: true },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      if (!released) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener('touchend', (e) => {
    if (touchY === null) return;
    const y = e.changedTouches[0]?.clientY ?? touchY;
    const dy = touchY - y;
    touchY = null;
    if (released) {
      if (window.scrollY <= 1 && dy < -40 && !busy) {
        capture();
        lastActionAt = performance.now();
      }
      return;
    }
    if (busy || inCooldown() || Math.abs(dy) < 40) return;
    dy > 0 ? next() : prev();
  });

  window.addEventListener('keydown', (e) => {
    if (released) return;
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        next();
        break;
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        prev();
        break;
      case 'Home':
        e.preventDefault();
        goTo(0, 'backward');
        break;
      case 'End':
        e.preventDefault();
        goTo(last, 'jump');
        break;
    }
  });

  navButtons.forEach((b, i) => {
    b.addEventListener('click', () => {
      if (released) capture();
      goTo(i, i > current ? 'forward' : 'backward');
    });
  });

  hintButton?.addEventListener('click', next);

  // Переход по ссылке вида /#hotel уже на открытой странице
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    const idx = scenes.findIndex((s) => s.dataset.scene === id);
    if (idx < 0 || idx === current) return;
    if (released) {
      capture();
      lenis.scrollTo(0, { immediate: true });
    }
    goTo(idx, idx > current ? 'forward' : 'backward');
  });

  // В облегчённом режиме видео не нужны — не тянем их из сети
  if (lite) {
    stack.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
      v.preload = 'none';
    });
  }

  // Шапка становится светлой, когда сцены ушли из вида
  if (header && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      ([entry]) => header.classList.toggle('is-light', !entry.isIntersecting),
      { threshold: 0.02 },
    );
    io.observe(stack);
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
      preloadAround(0);
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
      if (!introPoster) return finish(0.4);
      hideShadeText(0.35);
      gsap.to(introPoster, {
        opacity: 0,
        duration: reduced ? 0.01 : 0.6,
        ease: 'power2.inOut',
        onComplete: () => finish(0.05),
      });
    };

    if (lite || !intro) {
      // без видео (reduced motion, экономия трафика): закрытый кадр с надписью, затем мягкая смена
      if (!introPoster) return finish(0.4);
      const open = () => window.setTimeout(softOpen, INTRO_DELAY);
      if (introPoster.complete) open();
      else {
        introPoster.addEventListener('load', open, { once: true });
        introPoster.addEventListener('error', () => finish(0.2), { once: true });
      }
      return;
    }

    const play = () => {
      if (finished || softOpened) return;
      intro.defaultPlaybackRate = INTRO_RATE;
      intro.playbackRate = INTRO_RATE;
      intro.dataset.inUse = '1';
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

    const ready = () => window.setTimeout(play, INTRO_DELAY);
    // телефоны не грузят видео заранее, поэтому там не ждём готовности, а сразу запускаем
    if (intro.readyState >= 3 || coarse) ready();
    else {
      intro.addEventListener('canplaythrough', ready, { once: true });
      intro.addEventListener('error', softOpen, { once: true });
      // медленная сеть: не держим посетителя перед закрытой шторкой
      window.setTimeout(() => {
        if (!finished && intro.readyState < 3) softOpen();
      }, 4000);
    }
  };

  capture();
  window.scrollTo(0, 0);
  if (!startFromHash()) startIntro();

  // Если открыли главную с #form или #content — отдать обычную прокрутку
  if (location.hash === '#form' || location.hash === '#content') {
    release();
  }
}
