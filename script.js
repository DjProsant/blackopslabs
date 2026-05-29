// ── SCROLL REVEAL ──
const revealEls = document.querySelectorAll('.reveal');
const isMobileDevice = window.innerWidth <= 768
  || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));

function revealVisible() {
  const vh = window.innerHeight;
  revealEls.forEach(el => {
    if (el.classList.contains('visible')) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < vh - 40) el.classList.add('visible');
  });
}

if (isMobileDevice) {
  requestAnimationFrame(() => {
    setTimeout(revealVisible, 80);
  });
  window.addEventListener('scroll', revealVisible, { passive: true });
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.05, rootMargin: '0px 0px -60px 0px' });
  revealEls.forEach(el => io.observe(el));
}

setTimeout(() => { revealEls.forEach(el => el.classList.add('visible')); }, 5000);

setTimeout(() => {
  if (loader && loader.style.display !== 'none') {
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 420);
  }
}, 8000);

// ── CONTADOR ANIMADO ──
function animateCounter(el) {
  if (el.dataset.animated) return;
  el.dataset.animated = '1';
  const target   = parseInt(el.dataset.target, 10);
  const prefix   = el.dataset.prefix || '';
  const suffix   = el.dataset.suffix || '';
  const duration = 1800;
  const start    = performance.now();
  function tick(now) {
    const t    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = prefix + Math.round(ease * target) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const metricsEl = document.querySelector('.hero-metrics');
if (metricsEl) {
  const counters = metricsEl.querySelectorAll('.counter');
  const mo = new MutationObserver(() => {
    if (metricsEl.classList.contains('visible')) {
      counters.forEach(animateCounter);
      mo.disconnect();
    }
  });
  mo.observe(metricsEl, { attributes: true, attributeFilter: ['class'] });
  if (metricsEl.classList.contains('visible')) counters.forEach(animateCounter);
}

// ── VIDEO SCROLL SCRUBBING ──
const video   = document.getElementById('scrollVideo');
const canvas  = document.getElementById('scrollCanvas');
const ctx     = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
const section = document.getElementById('videoScroll');
const fill    = document.getElementById('videoFill');
const badge   = document.getElementById('videoBadge');
const loader  = document.getElementById('videoLoader');
const VIDEO_START = 2;
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w   = Math.round(canvas.offsetWidth  * dpr);
  const h   = Math.round(canvas.offsetHeight * dpr);
  if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
    canvas.width  = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', fitCanvas, { passive: true });

const isMobile = isMobileDevice;
video.src = isMobile ? 'assets/hero_mobile.mp4' : 'assets/hero_scrub.mp4';
video.load();

if (isMobile) {
  video.loop = false;
  loader.style.display = 'none';

  video.addEventListener('loadedmetadata', () => {
    canvas.width  = video.videoWidth  || 854;
    canvas.height = video.videoHeight || 480;
  });

  function drawMobile() {
    if (video.readyState >= 2 && canvas.width > 0) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
  }

  video.addEventListener('timeupdate', drawMobile);

  if (hasRVFC) {
    function mobileRVFC() {
      drawMobile();
      if (!video.ended) video.requestVideoFrameCallback(mobileRVFC);
    }
    video.requestVideoFrameCallback(mobileRVFC);
  }

  video.play().catch(() => {});

} else {
  let videoDuration = 0;
  let firstPainted  = false;
  let seekPending   = false;
  let pendingTarget = null;

  const frameCache = new Map();
  const CACHE_FPS  = 24;

  section.style.height = (window.innerHeight * 4) + 'px';
  fitCanvas();

  function hideLoader() {
    if (firstPainted) return;
    firstPainted = true;
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 420);
  }

  function timeToIdx(t) {
    return Math.round((t - VIDEO_START) * CACHE_FPS);
  }

  function coverDraw(source) {
    if (!canvas.width || !canvas.height) return;
    const sw = source.videoWidth  || source.width  || 1280;
    const sh = source.videoHeight || source.height || 720;
    const cw = canvas.width, ch = canvas.height;
    const s  = Math.max(cw / sw, ch / sh);
    ctx.drawImage(source, (cw - sw * s) / 2, (ch - sh * s) / 2, sw * s, sh * s);
    hideLoader();
  }

  function draw() {
    if (video.readyState >= 2) coverDraw(video);
  }

  function seekTo(t) {
    const idx = timeToIdx(t);
    if (frameCache.has(idx)) {
      coverDraw(frameCache.get(idx));
      return;
    }
    if (seekPending) { pendingTarget = t; return; }
    seekPending = true;
    video.currentTime = t;
  }

  video.addEventListener('seeked', () => {
    draw();
    const idx = timeToIdx(video.currentTime);
    if (!frameCache.has(idx) && video.readyState >= 2) {
      createImageBitmap(video)
        .then(bmp => frameCache.set(idx, bmp))
        .catch(() => {});
    }
    seekPending = false;
    if (pendingTarget !== null) {
      const t = pendingTarget;
      pendingTarget = null;
      seekTo(t);
    }
  });

  if (hasRVFC) {
    (function rVFCLoop() { draw(); video.requestVideoFrameCallback(rVFCLoop); })();
  } else {
    video.addEventListener('timeupdate', draw);
  }

  function onMetadata() {
    if (!video.duration || video.duration === Infinity) return;
    videoDuration = video.duration;
    fitCanvas();
    const usable = videoDuration - VIDEO_START;
    section.style.height = Math.max(window.innerHeight * 3, usable * 220) + 'px';
    video.currentTime = VIDEO_START;
    startBackgroundCache(video.src, videoDuration);
  }

  video.addEventListener('loadedmetadata', onMetadata);
  video.addEventListener('loadeddata',     onMetadata);

  const _unlock = video.play();
  if (_unlock && _unlock.then) {
    _unlock.then(() => { video.pause(); video.currentTime = VIDEO_START; })
           .catch(() => { video.currentTime = VIDEO_START; });
  }

  async function startBackgroundCache(src, duration) {
    const cv = document.createElement('video');
    cv.muted  = true; cv.preload = 'auto'; cv.src = src;
    cv.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;z-index:-1;';
    document.body.appendChild(cv);
    cv.load();

    try {
      await new Promise((res, rej) => {
        cv.addEventListener('loadeddata', res, { once: true });
        cv.addEventListener('error', rej, { once: true });
        setTimeout(rej, 12000);
      });
    } catch { cv.remove(); return; }

    const totalFrames = Math.round((duration - VIDEO_START) * CACHE_FPS);

    for (let i = 0; i <= totalFrames; i++) {
      if (frameCache.has(i)) continue;

      cv.currentTime = VIDEO_START + i / CACHE_FPS;
      await new Promise(r => cv.addEventListener('seeked', r, { once: true }));

      if (cv.readyState >= 2) {
        try { frameCache.set(i, await createImageBitmap(cv)); } catch {}
      }

      if (i % 5 === 0) {
        await new Promise(r => 'requestIdleCallback' in window
          ? requestIdleCallback(r, { timeout: 300 })
          : setTimeout(r, 0));
      }
    }

    cv.remove();
  }

  function onScroll() {
    if (!videoDuration) return;
    const rect     = section.getBoundingClientRect();
    const sectionH = section.offsetHeight;
    const vh       = window.innerHeight;
    const progress = Math.max(0, Math.min(1, -rect.top / (sectionH - vh)));
    const usable   = videoDuration - VIDEO_START;
    seekTo(VIDEO_START + progress * usable);
    fill.style.width = (progress * 100) + '%';
    badge.classList.toggle('visible', rect.top <= 0 && rect.bottom >= vh);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
}

// ── HAMBURGER MENU ──
const navBurger   = document.getElementById('navBurger');
const navMobileEl = document.getElementById('navMobile');

navBurger.addEventListener('click', () => {
  const isOpen = navMobileEl.classList.toggle('open');
  navBurger.classList.toggle('open', isOpen);
  navBurger.setAttribute('aria-expanded', isOpen);
  navMobileEl.setAttribute('aria-hidden', !isOpen);
});

function closeMobileMenu() {
  navMobileEl.classList.remove('open');
  navBurger.classList.remove('open');
  navBurger.setAttribute('aria-expanded', 'false');
  navMobileEl.setAttribute('aria-hidden', 'true');
}

// ── CLOUDFLARE TURNSTILE ──
let cfTurnstileToken = null;
function onTurnstileVerified(token) { cfTurnstileToken = token; }

// ── FORM SUBMIT ──

async function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');

  if (!document.getElementById('rgpd').checked) {
    document.getElementById('rgpdError').classList.add('visible');
    return;
  }
  document.getElementById('rgpdError').classList.remove('visible');

  const token = cfTurnstileToken || (typeof turnstile !== 'undefined' && turnstile.getResponse());
  if (!token) {
    if (typeof turnstile !== 'undefined') turnstile.execute();
    return;
  }

  const empresa  = document.getElementById('empresa').value.trim();
  const url      = document.getElementById('url').value.trim();
  const email    = document.getElementById('email').value.trim();
  const whatsapp = document.getElementById('whatsapp').value.trim();

  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="animation:spin .7s linear infinite"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.6" stroke-dasharray="18 16"/></svg> Procesando...`;
  btn.disabled = true;
  btn.style.opacity = '0.72';

  try {
    const res = await fetch('https://n8n.blackopslabs.it.com/webhook/diagnostico-emergencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa, url, email, whatsapp: whatsapp || '—', cf_turnstile_response: token })
    });

    if (res.ok) {
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5L5 10L11.5 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg> Diagnóstico Iniciado`;
      btn.style.opacity = '1';
      btn.style.background = '#00cc52';
      btn.style.boxShadow = '0 0 40px rgba(0,204,82,0.4)';
      document.getElementById('diagForm').reset();
      if (typeof turnstile !== 'undefined') { turnstile.reset(); cfTurnstileToken = null; }
    } else {
      throw new Error('error');
    }
  } catch {
    btn.innerHTML = `Error en Protocolo`;
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.background = '';
    btn.style.boxShadow = '';
    if (typeof turnstile !== 'undefined') { turnstile.reset(); cfTurnstileToken = null; }
    setTimeout(() => {
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 6.5H12M6.5 1L12 6.5L6.5 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg> Ejecutar Diagnóstico`;
    }, 3000);
  }
}
