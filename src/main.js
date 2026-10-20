import './style.css';
import gsap from 'gsap';
import { createAmbience } from './audio.js';

const media = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = media.matches;
let scene;
let progress = 0;
let smoothProgress = 0;
let raf;
let lastProgressValue = -1;
let currentChapter = -1;
let documentHeight = 1;
const awakening = document.querySelector('.awakening');
const paradise = document.querySelector('.paradise');
// Public assets need the same base in development and project-site hosting.
awakening.style.backgroundImage = `url("${import.meta.env.BASE_URL}images/awakening.webp")`;
paradise.style.backgroundImage = `url("${import.meta.env.BASE_URL}images/infinite.webp")`;
const glow = document.querySelector('.world-glow');
const shade = document.querySelector('.world-shade');
const header = document.querySelector('.site-header');
const progressBar = document.querySelector('.progress-track');
const progressFill = progressBar.firstElementChild;
const chapterLinks = [...document.querySelectorAll('.chapter-nav a')];
const motionButton = document.querySelector('.motion-toggle');
const soundButton = document.querySelector('.sound-toggle');
const status = document.querySelector('#experience-status');
const ambience = createAmbience();
const clamp = (n) => Math.max(0, Math.min(1, n));
const smoothstep = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };

function measure() {
  documentHeight = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  updateScroll();
}
function updateScroll() {
  progress = clamp(scrollY / documentHeight);
  header.classList.toggle('is-scrolled', scrollY > 50);
}
function updateMotion() {
  document.body.classList.toggle('is-reduced-motion', reducedMotion);
  document.documentElement.style.scrollBehavior = reducedMotion ? 'auto' : 'smooth';
  motionButton.setAttribute('aria-pressed', String(reducedMotion));
  motionButton.setAttribute('aria-label', reducedMotion ? 'Resume ambient animation' : 'Pause ambient animation');
  motionButton.querySelector('span').textContent = reducedMotion ? 'Motion off' : 'Motion on';
  scene?.setReducedMotion?.(reducedMotion);
  if (reducedMotion) {
    gsap.killTweensOf('.title-line, .intro-element, .reveal');
    gsap.set('.title-line, .intro-element, .reveal', { clearProps: 'all' });
  }
}
motionButton.addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  updateMotion();
});
media.addEventListener('change', (event) => {
  reducedMotion = event.matches;
  updateMotion();
});
soundButton.addEventListener('click', async () => {
  soundButton.disabled = true;
  try {
    const on = await ambience.toggle();
    soundButton.setAttribute('aria-pressed', String(on));
    soundButton.setAttribute('aria-label', `Turn ambient sound ${on ? 'off' : 'on'}`);
    soundButton.querySelector('.sound-label').textContent = `Sound ${on ? 'on' : 'off'}`;
    status.textContent = on ? 'Ambient sound on.' : 'Ambient sound off.';
  } catch {
    status.textContent = 'Ambient sound could not start. You can continue the journey silently or try again.';
  } finally {
    soundButton.disabled = false;
  }
});
document.querySelector('.replay-button').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
  history.replaceState(null, '', location.pathname + location.search);
  document.querySelector('.brand').focus({ preventScroll: true });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    if (!reducedMotion) {
      gsap.fromTo(entry.target, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 1.3, ease: 'power2.out', clearProps: 'all' });
    }
    observer.unobserve(entry.target);
  });
}, { threshold: .15 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

function tick() {
  smoothProgress += (progress - smoothProgress) * (reducedMotion ? 1 : .065);
  const p = smoothProgress;
  const heroFade = 1 - smoothstep(.055, .28, p);
  const paradiseFade = smoothstep(.53, .74, p);
  awakening.style.opacity = heroFade;
  awakening.style.transform = reducedMotion ? 'none' : `scale(${1.04 + p * .62}) translate3d(0,${-p * 140}px,0)`;
  paradise.style.opacity = paradiseFade * (1 - smoothstep(.87, 1, p) * .63);
  paradise.style.transform = reducedMotion ? 'none' : `scale(${1.17 - smoothstep(.53, .95, p) * .14})`;
  glow.style.opacity = Math.sin(p * Math.PI) * .9;
  shade.style.opacity = 1 - smoothstep(.14, .3, p) * .25;
  shade.style.setProperty('--late-shade', smoothstep(.54, .69, p));
  progressFill.style.transform = `scaleX(${progress})`;
  const rounded = Math.round(progress * 100);
  if (rounded !== lastProgressValue) {
    progressBar.setAttribute('aria-valuenow', String(rounded));
    lastProgressValue = rounded;
  }
  const chapter = progress < .31 ? 0 : progress < .66 ? 1 : 2;
  if (chapter !== currentChapter) {
    chapterLinks.forEach((link, index) => {
      if (index === chapter) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    currentChapter = chapter;
  }
  raf = requestAnimationFrame(tick);
}

window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', measure, { passive: true });
new ResizeObserver(measure).observe(document.body);
measure();
updateMotion();
tick();

// Art is present before the WebGL chunk loads. The experience remains navigable
// when GPU acceleration is disabled or unavailable.
import('./scene.js').then(({ createCelestialScene }) => {
  scene = createCelestialScene({
    canvas: document.querySelector('#celestial-canvas'),
    getProgress: () => smoothProgress,
    reducedMotion,
  });
  document.body.dataset.renderer = 'webgl';
}).catch(() => {
  document.body.dataset.renderer = 'fallback';
  document.querySelector('#celestial-canvas').hidden = true;
});

document.fonts.ready.then(() => {
  measure();
  if (reducedMotion) return;
  gsap.from('.title-line', { opacity: 0, y: 35, rotateX: 8, duration: 1.5, stagger: .14, ease: 'power3.out', clearProps: 'all' });
  gsap.from('.intro-element', { opacity: 0, y: 13, duration: 1.3, stagger: .1, delay: .4, ease: 'power2.out', clearProps: 'all' });
});

// Avoid running an animation loop in a background tab.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(raf);
  else { measure(); tick(); }
});
