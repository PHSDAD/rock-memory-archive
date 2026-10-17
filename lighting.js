(() => {
  'use strict';
  const paper = document.querySelector('.stage-atmosphere');
  if (!paper) return;
  const canvas = document.getElementById('light-dust');
  const context = canvas && canvas.getContext('2d', { alpha: true });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 650px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const target = { x: 0, y: 0, scroll: 0 };
  const current = { x: 0, y: 0, scroll: 0 };
  let width = innerWidth, height = innerHeight, frame = 0, lastFrame = 0, resizeTimer;

  function paintPaper() {
    if (!context) return;
    const scale = compact.matches ? .55 : .7;
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    // Stable marks redraw only on resize: no flickering grain or floating stage dust.
    let seed = 1957;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const marks = compact.matches ? 220 : 480;
    for (let i = 0; i < marks; i++) {
      const x = random() * width, y = random() * height;
      context.fillStyle = random() < .18 ? '#d9432c' : '#182b40';
      context.globalAlpha = .035 + random() * .085;
      context.fillRect(x, y, .45 + random() * 1.1, .4 + random() * .9);
    }
    context.strokeStyle = '#182b40';
    context.lineWidth = .4;
    for (let i = 0; i < (compact.matches ? 24 : 54); i++) {
      const x = random() * width, y = random() * height;
      context.globalAlpha = .025 + random() * .035;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 3 + random() * 8, y + random() * 2 - 1);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function render(now) {
    frame = 0;
    if (motion.matches || document.hidden) return;
    if (lastFrame && now - lastFrame < 1000 / 24) {
      frame = requestAnimationFrame(render);
      return;
    }
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 1/24;
    lastFrame = now;
    const ease = 1 - Math.exp(-dt * 3.2);
    current.x += (target.x - current.x) * ease;
    current.y += (target.y - current.y) * ease;
    current.scroll += (target.scroll - current.scroll) * ease;
    paper.style.setProperty('--print-x', `${current.x.toFixed(2)}px`);
    paper.style.setProperty('--print-y', `${current.y.toFixed(2)}px`);
    paper.style.setProperty('--print-roll', `${(current.x * .035).toFixed(2)}deg`);
    paper.style.setProperty('--print-scroll', `${current.scroll.toFixed(2)}px`);
    if (Math.abs(target.x-current.x) + Math.abs(target.y-current.y) + Math.abs(target.scroll-current.scroll) > .08) frame = requestAnimationFrame(render);
    else lastFrame = 0;
  }

  function requestPrint() {
    if (!frame && !motion.matches && !document.hidden) frame = requestAnimationFrame(render);
  }

  function sync() {
    document.documentElement.classList.toggle('stage-page-hidden', document.hidden);
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    if (motion.matches) {
      current.x = current.y = current.scroll = 0;
      paper.style.setProperty('--print-x', '0px');
      paper.style.setProperty('--print-y', '0px');
      paper.style.setProperty('--print-roll', '0deg');
      paper.style.setProperty('--print-scroll', '0px');
    } else requestPrint();
  }

  addEventListener('pointermove', event => {
    if (!finePointer.matches || motion.matches || document.hidden) return;
    target.x = (event.clientX / Math.max(1, width) - .5) * 10;
    target.y = (event.clientY / Math.max(1, height) - .5) * 7;
    requestPrint();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { target.x = target.y = 0; requestPrint(); });
  addEventListener('scroll', () => {
    if (motion.matches || document.hidden) return;
    target.scroll = Math.sin(scrollY * .0005) * (compact.matches ? 5 : 13);
    requestPrint();
  }, { passive: true });
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { width = innerWidth; height = innerHeight; paintPaper(); sync(); }, 180);
  }, { passive: true });
  document.addEventListener('visibilitychange', sync);
  addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; clearTimeout(resizeTimer); });
  addEventListener('pageshow', sync);
  motion.addEventListener('change', sync);
  compact.addEventListener('change', () => { paintPaper(); sync(); });
  paintPaper();
  sync();
})();
