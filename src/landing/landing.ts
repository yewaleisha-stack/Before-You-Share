import '../styles.css';
import './landing.css';
import { detect } from '../engine/resolve';
import { redact } from '../engine/redact';
import type { Mode } from '../engine/types';
import { renderPane } from '../ui/render';

document.documentElement.classList.add('js');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;

// ---------- Hero 3D rig: pointer-driven tilt with easing + idle sway ----------
function initRig() {
  const scene = document.getElementById('scene');
  const rig = document.getElementById('rig');
  const ground = document.getElementById('ground');
  if (!scene || !rig || !ground) return;
  if (reduceMotion) {
    rig.classList.add('still');
    return;
  }
  const base = { x: 14, y: -24 };
  let target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  let hovering = false;
  let visible = true;

  scene.addEventListener('pointermove', (e) => {
    if (!finePointer) return;
    const r = scene.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    target = { x: -ny * 16, y: nx * 22 };
    hovering = true;
  });
  scene.addEventListener('pointerleave', () => {
    hovering = false;
  });
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(scene);

  const tick = (t: number) => {
    if (visible) {
      if (!hovering) target = { x: Math.sin(t / 2600) * 4, y: Math.cos(t / 3400) * 7 };
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      const rx = base.x + cur.x;
      const ry = base.y + cur.y;
      rig.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(3deg)`;
      ground.style.transform = `translate3d(${(-cur.y * 1.6).toFixed(1)}px, 0, 0) scale(${(1 + cur.x / 120).toFixed(3)}, 1)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- Scroll reveals ----------
function initReveal() {
  const els = document.querySelectorAll<HTMLElement>('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  els.forEach((el, i) => {
    el.classList.add(`rv${i % 4}`);
    io.observe(el);
  });
}

// ---------- Count-up stats ----------
function initCounters() {
  const els = document.querySelectorAll<HTMLElement>('[data-count]');
  if (reduceMotion) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      io.unobserve(el);
      const end = Number(el.dataset.count);
      const t0 = performance.now();
      const dur = 1200;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(end * eased));
        if (p < 1) requestAnimationFrame(step);
      };
      el.textContent = '0';
      requestAnimationFrame(step);
    }
  });
  els.forEach((el) => io.observe(el));
}

// ---------- Tilt cards with glare ----------
function initTilt() {
  if (reduceMotion || !finePointer) return;
  for (const card of document.querySelectorAll<HTMLElement>('.tilt')) {
    const inner = card.querySelector<HTMLElement>('.tilt-in');
    const glare = card.querySelector<HTMLElement>('.glare');
    if (!inner || !glare) continue;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(900px) rotateX(${((0.5 - ny) * 10).toFixed(2)}deg) rotateY(${((nx - 0.5) * 12).toFixed(2)}deg) translateZ(0)`;
      glare.style.background = `radial-gradient(420px circle at ${(nx * 100).toFixed(1)}% ${(ny * 100).toFixed(1)}%, rgb(255 255 255 / 0.35), transparent 45%)`;
      glare.style.opacity = '1';
      card.classList.add('tilting');
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
      glare.style.opacity = '0';
      card.classList.remove('tilting');
    });
  }
}

// ---------- Mode prism ----------
function initPrism() {
  const prism = document.getElementById('prism');
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.mode-tab')];
  if (!prism || !tabs.length) return;
  let face = 0;
  let turns = 0; // keep rotating forward for a smooth, continuous spin
  let auto: number | undefined;
  const show = (n: number, fromUser: boolean) => {
    const delta = (((n - face) % 3) + 3) % 3;
    turns += delta;
    face = n;
    prism.style.transform = `rotateX(${-turns * 120}deg)`;
    tabs.forEach((t, i) => {
      t.setAttribute('aria-selected', String(i === n));
      t.tabIndex = i === n ? 0 : -1;
    });
    if (fromUser) window.clearInterval(auto);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i, true));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 2)) % 3;
      show(next, true);
      tabs[next].focus();
    });
  });
  show(0, false);
  if (!reduceMotion) auto = window.setInterval(() => show((face + 1) % 3, false), 3600);
}

// ---------- Live demo using the real engine ----------
function initDemo() {
  const input = document.getElementById('demo-in') as HTMLTextAreaElement | null;
  const out = document.getElementById('demo-out');
  const count = document.getElementById('demo-count');
  if (!input || !out || !count) return;
  const modeOf = () => (document.querySelector<HTMLInputElement>('input[name="dmode"]:checked')?.value ?? 'pseudo') as Mode;
  let timer: number | undefined;
  const run = () => {
    const text = input.value.slice(0, 20_000);
    const mode = modeOf();
    const d = detect(text);
    const r = redact(text, d.matches, mode, d.rejected);
    out.dataset.mode = mode;
    out.replaceChildren(renderPane(text, r.segments, 'result'));
    const n = d.matches.length;
    count.textContent = n ? `${n} item${n === 1 ? '' : 's'} replaced` : 'Nothing to replace';
  };
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 120);
  });
  document.querySelectorAll('input[name="dmode"]').forEach((r) => r.addEventListener('change', run));
  run();
}

// ---------- Live request counter (same rule as the app) ----------
function initNetwork() {
  const nums = document.querySelectorAll<HTMLElement>('[data-net-mirror]');
  const texts = document.querySelectorAll<HTMLElement>('[data-net-mirror-text]');
  if (typeof PerformanceObserver === 'undefined') return;
  const since = performance.now();
  let n = 0;
  const show = () => {
    nums.forEach((el) => (el.textContent = String(n)));
    texts.forEach((el) => (el.textContent = `${n} request${n === 1 ? '' : 's'} since load`));
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const isFont = e.name.startsWith('https://fonts.gstatic.com/');
        if (e.startTime >= since && !isFont && !e.name.startsWith('blob:') && !e.name.startsWith('data:')) n++;
      }
      show();
    }).observe({ type: 'resource', buffered: false });
  } catch {
    return;
  }
  show();
}

// ---------- Nav shadow on scroll ----------
function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

initRig();
initReveal();
initCounters();
initTilt();
initPrism();
initDemo();
initNav();
if (document.readyState === 'complete') initNetwork();
else window.addEventListener('load', initNetwork, { once: true });
