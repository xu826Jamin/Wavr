export function initHeroCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const section = canvas.parentElement;
  let w, h;

  function resize() {
    w = canvas.width  = section.offsetWidth;
    h = canvas.height = section.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const COLORS = ['#4ade80', '#a78bfa', '#ffffff'];
  const COUNT = 55;
  const particles = Array.from({ length: COUNT }, () => ({
    x: Math.random() * (w || 800),
    y: Math.random() * (h || 600),
    vx: (Math.random() - 0.5) * 0.36,
    vy: (Math.random() - 0.5) * 0.36,
    baseVx: 0, baseVy: 0,
    r: 1 + Math.random() * 1.5,
    opacity: 0.08 + Math.random() * 0.14,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  particles.forEach(p => { p.baseVx = p.vx; p.baseVy = p.vy; });

  let mouseX = -999, mouseY = -999;
  section.addEventListener('mousemove', e => {
    const rect = section.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }, { passive: true });
  section.addEventListener('mouseleave', () => { mouseX = -999; mouseY = -999; });

  let lastTime = 0;
  function draw(timestamp) {
    requestAnimationFrame(draw);
    const delta = timestamp - lastTime;
    if (delta < 33) return;
    lastTime = timestamp;

    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      if (mouseX > 0) {
        const dx = p.x - mouseX, dy = p.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 80 && dist > 0) {
          const force = 1 / (dist * dist);
          p.vx += dx * force * 600;
          p.vy += dy * force * 600;
        }
      }
      p.vx += (p.baseVx - p.vx) * (1 / 60);
      p.vy += (p.baseVy - p.vy) * (1 / 60);
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 1.2) { p.vx = (p.vx / speed) * 1.2; p.vy = (p.vy / speed) * 1.2; }
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x += w; if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h; if (p.y > h) p.y -= h;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    const cx = w / 2, cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'rgba(8,8,8,0)');
    grad.addColorStop(1, '#080808');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  requestAnimationFrame(draw);
}
