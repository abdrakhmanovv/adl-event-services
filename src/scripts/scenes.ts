/**
 * Плеер сцен главной страницы.
 * Один жест прокрутки = один переход между эпизодами. Вперёд — видеопереход,
 * назад — быстрый кроссфейд. На мобильных и при prefers-reduced-motion видео не грузится.
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
  const small = window.matchMedia('(max-width: 768px)').matches;
  const lite = reduced || small;

  // Lenis: плавная прокрутка светлой части. Пока мы внутри сцен — остановлен.
  const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  let current = 0;
  let busy = false;
  let released = false;
  let lastActionAt = 0;
  const COOLDOWN = 450; // мс после перехода, чтобы «дожёвывание» тачпада не листало дальше

  // ---------- вспомогательные ----------
  const loopOf = (i: number) => scenes[i].querySelector<HTMLVideoElement>('.scene__loop');
  const transitionOf = (i: number) => scenes[i].querySelector<HTMLVideoElement>('.scene__transition');
  const textOf = (i: number) => scenes[i].querySelector<HTMLElement>('.scene__text')!;

  const safePlay = (v: HTMLVideoElement | null) => {
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  const loadVideo = (v: HTMLVideoElement | null) => {
    if (!v || lite) return;
    if (v.preload !== 'auto') {
      v.preload = 'auto';
      v.load();
    }
  };

  const showLoop = (i: number) => {
    const v = loopOf(i);
    if (!v || lite) return;
    v.classList.add('is-visible');
    safePlay(v);
  };

  const stopLoop = (i: number) => {
    const v = loopOf(i);
    if (!v) return;
    v.pause();
  };

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

  const textIn = (i: number, delay = 0) => {
    const el = textOf(i);
    const parts = Array.from(el.children);
    gsap.killTweensOf(parts);
    gsap.set(el, { opacity: 1 });
    return gsap.fromTo(
      parts,
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: reduced ? 0.01 : 0.55, stagger: reduced ? 0 : 0.08, ease: 'power3.out', delay },
    );
  };

  const textOut = (i: number) => {
    const el = textOf(i);
    const parts = Array.from(el.children);
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
  const crossfade = (from: number, to: number) => {
    const fromEl = scenes[from];
    const toEl = scenes[to];
    toEl.classList.add('is-active');
    gsap.set(toEl, { opacity: 0, scale: 1.05, visibility: 'visible' });
    gsap.set(textOf(to), { opacity: 0 });
    showLoop(to);
    return gsap
      .timeline()
      .to(toEl, { opacity: 1, scale: 1, duration: reduced ? 0.01 : 0.5, ease: 'power2.out' }, 0)
      .to(fromEl, { opacity: 0, duration: reduced ? 0.01 : 0.4, ease: 'power2.in' }, 0)
      .set(fromEl, { clearProps: 'opacity,scale,visibility' })
      .set(toEl, { clearProps: 'opacity,scale,visibility' });
  };

  const playTransitionVideo = (from: number, to: number) =>
    new Promise<boolean>((resolve) => {
      const v = transitionOf(from);
      if (!v || lite) return resolve(false);
      if (v.readyState < 3) return resolve(false); // не успело загрузиться — пойдём кроссфейдом

      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        v.removeEventListener('ended', onEnded);
        v.removeEventListener('error', onError);
        clearTimeout(timer);
        resolve(ok);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(false);

      v.currentTime = 0;
      v.playbackRate = 1.35;
      v.classList.add('is-playing');
      v.addEventListener('ended', onEnded);
      v.addEventListener('error', onError);

      // подстраховка, если ended не придёт
      const expected = (v.duration && isFinite(v.duration) ? v.duration / v.playbackRate : 3) * 1000 + 400;
      const timer = window.setTimeout(() => finish(true), expected);

      // следующая сцена уже должна играть под переходом, чтобы стык был бесшовным
      const nextLoop = loopOf(to);
      if (nextLoop) {
        nextLoop.currentTime = 0;
        showLoop(to);
      }
      safePlay(v);
    });

  const goTo = async (to: number, direction: 'forward' | 'backward' | 'jump') => {
    if (busy || to === current || to < 0 || to > last) return;
    busy = true;
    stack.classList.add('has-moved');
    const from = current;

    textOut(from);

    if (direction === 'forward' && !lite) {
      const played = await playTransitionVideo(from, to);
      if (played) {
        // переход закончился на первом кадре следующей сцены
        setActive(to);
        const v = transitionOf(from);
        if (v) {
          v.classList.remove('is-playing');
          v.pause();
          v.currentTime = 0;
        }
        stopLoop(from);
      } else {
        await crossfade(from, to);
        setActive(to);
        stopLoop(from);
      }
    } else {
      await crossfade(from, to);
      setActive(to);
      stopLoop(from);
    }

    current = to;
    textIn(to, 0.05);
    preloadAround(to);
    lastActionAt = performance.now();
    busy = false;
  };

  const preloadAround = (i: number) => {
    loadVideo(transitionOf(i));
    if (i + 1 <= last) loadVideo(loopOf(i + 1));
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
  const startFromHash = () => {
    const hash = location.hash.replace('#', '');
    if (!hash) return false;
    const idx = scenes.findIndex((s) => s.dataset.scene === hash);
    if (idx <= 0) return false;
    scenes[0].classList.remove('is-active');
    scenes[idx].classList.add('is-active');
    current = idx;
    setActive(idx);
    gsap.set(Array.from(textOf(idx).children), { opacity: 1, y: 0 });
    showLoop(idx);
    preloadAround(idx);
    stack.classList.add('has-moved');
    return true;
  };

  const startIntro = () => {
    const first = scenes[0];
    const intro = first.querySelector<HTMLVideoElement>('.scene__intro');
    const introPoster = first.querySelector<HTMLElement>('.scene__intro-poster');
    const loop = loopOf(0);
    gsap.set(Array.from(textOf(0).children), { opacity: 0 });

    const finishIntro = () => {
      intro?.classList.add('is-hidden');
      introPoster?.classList.add('is-hidden');
      showLoop(0);
      textIn(0, 0.1);
      preloadAround(0);
    };

    if (lite || !intro) {
      // облегчённый режим: сразу открытый иллюминатор
      introPoster?.classList.add('is-hidden');
      intro?.classList.add('is-hidden');
      showLoop(0);
      textIn(0, 0.4);
      preloadAround(0);
      return;
    }

    let finished = false;
    const once = () => {
      if (finished) return;
      finished = true;
      finishIntro();
    };

    // шторка открывается сама через ~0.5 с после загрузки, без действий пользователя
    const play = () => {
      if (loop) safePlay(loop); // loop уже крутится под интро, чтобы кадр совпал
      intro.classList.add('is-visible');
      intro.addEventListener('ended', once, { once: true });
      intro.addEventListener('error', once, { once: true });
      safePlay(intro);
      // подстраховка, если видео не запустилось
      window.setTimeout(once, 6000);
    };

    const ready = () => window.setTimeout(play, 500);
    if (intro.readyState >= 3) ready();
    else {
      intro.addEventListener('canplaythrough', ready, { once: true });
      intro.addEventListener('error', once, { once: true });
      // если сеть медленная — не ждём вечно
      window.setTimeout(() => {
        if (!finished && intro.readyState < 3) once();
      }, 5000);
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
