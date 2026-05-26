(function () {
  'use strict';
  if (window.__wavrLoaded) return;
  window.__wavrLoaded = true;

  const HOST_ID = 'wavr-pip-host';
  const WAVR_CWS_URL = 'https://chromewebstore.google.com/detail/wavr/placeholder';

  const CSS = `
    :host {
      all: initial;
      position: fixed;
      z-index: 2147483647;
      bottom: 24px;
      right: 24px;
      width: 288px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      user-select: none;
    }
    .widget {
      background: #0f0f0f;
      border: 1px solid #252525;
      border-top-color: rgba(255,255,255,0.05);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 3px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4);
      animation: widgetSlideUp 0.3s cubic-bezier(0.16,1,0.3,1);
      transition: border-color 0.3s cubic-bezier(0.4,0,0.2,1),
                  box-shadow   0.3s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes widgetSlideUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .widget.gesture-glow {
      border-color: rgba(74,222,128,0.28);
      box-shadow: 0 0 0 3px rgba(74,222,128,0.1), 0 0 32px rgba(74,222,128,0.12),
                  0 1px 3px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: #141414;
      border-bottom: 1px solid #1e1e1e;
      cursor: grab;
    }
    .header:active { cursor: grabbing; }
    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4ade80;
      flex-shrink: 0;
      animation: livePulse 1.8s ease-in-out infinite;
    }
    @keyframes livePulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }
    .header-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.3px;
      background: linear-gradient(135deg, #fff 40%, #555 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .icon-btn {
      width: 26px;
      height: 26px;
      border-radius: 8px;
      background: transparent;
      border: 1px solid #252525;
      color: #555;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background    0.2s cubic-bezier(0.4,0,0.2,1),
                  border-color  0.2s cubic-bezier(0.4,0,0.2,1),
                  color         0.2s cubic-bezier(0.4,0,0.2,1);
      flex-shrink: 0;
    }
    .icon-btn:hover { background: #1a1a1a; border-color: #333; color: #aaa; }
    .icon-btn.stop:hover { border-color: rgba(248,113,113,0.35); color: #f87171; background: rgba(248,113,113,0.06); }
    .header-right { display: flex; align-items: center; gap: 5px; }
    .camera-area {
      position: relative;
      width: 100%;
      aspect-ratio: 4/3;
      background: #080808;
      overflow: hidden;
      transition: box-shadow 0.2s cubic-bezier(0.4,0,0.2,1);
    }
    .camera-area:hover { box-shadow: inset 0 0 0 1px rgba(74,222,128,0.1); }
    video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .cam-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .cam-placeholder svg { opacity: 0.15; }
    .cam-placeholder .ph-text {
      font-size: 11px;
      color: #444;
      font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
      letter-spacing: 0.3px;
    }
    .live-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 2px 6px;
      background: rgba(0,0,0,0.65);
      border: 1px solid rgba(74,222,128,0.22);
      border-radius: 4px;
      font-size: 9px;
      font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
      font-weight: 600;
      color: #4ade80;
      letter-spacing: 0.8px;
      pointer-events: none;
      user-select: none;
    }
    .gesture-bar {
      padding: 10px 14px;
      background: #080808;
      border-top: 1px solid #1e1e1e;
      font-size: 12px;
      font-weight: 500;
      font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
      color: #4ade80;
      letter-spacing: 0.3px;
      min-height: 40px;
      display: flex;
      align-items: center;
      transition: opacity 0.2s cubic-bezier(0.4,0,0.2,1);
    }
    .gesture-bar.dim { color: #2a2a2a; }
    .gesture-idle-label {
      font-size: 9px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #333;
    }
    .settings-btn {
      width: 100%;
      padding: 10px;
      background: #0f0f0f;
      border: none;
      border-top: 1px solid #1e1e1e;
      color: #444;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      transition: background       0.2s cubic-bezier(0.4,0,0.2,1),
                  color            0.2s cubic-bezier(0.4,0,0.2,1),
                  border-top-color 0.2s cubic-bezier(0.4,0,0.2,1);
      letter-spacing: 0.2px;
    }
    .settings-btn:hover { background: #141414; color: #4ade80; border-top-color: rgba(74,222,128,0.18); }
    .widget.minimized .camera-area,
    .widget.minimized .gesture-bar,
    .widget.minimized .settings-btn { display: none; }
    @keyframes flash {
      0%   { box-shadow: inset 0 0 0 2px rgba(74,222,128,0.55), 0 0 20px rgba(74,222,128,0.15); }
      100% { box-shadow: inset 0 0 0 2px transparent, 0 0 0 transparent; }
    }
    .flash { animation: flash 0.5s ease-out forwards; }
    .gesture-share-btn {
      margin-left: auto;
      padding: 2px 7px;
      background: rgba(74,222,128,0.08);
      border: 1px solid rgba(74,222,128,0.18);
      border-radius: 6px;
      color: #4ade80;
      font-size: 9px;
      font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
      font-weight: 600;
      letter-spacing: 0.3px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background   0.15s cubic-bezier(0.4,0,0.2,1),
                  border-color 0.15s cubic-bezier(0.4,0,0.2,1);
      line-height: 1.6;
    }
    .gesture-share-btn:hover { background: rgba(74,222,128,0.18); border-color: rgba(74,222,128,0.35); }
    .cam-watermark {
      position: absolute;
      bottom: 8px;
      left: 10px;
      font-size: 9px;
      font-weight: 700;
      font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace;
      color: rgba(255,255,255,0.18);
      letter-spacing: 0.8px;
      pointer-events: none;
      user-select: none;
      text-shadow: 0 1px 4px rgba(0,0,0,0.9);
    }
  `;

  let host = null;
  let shadow = null;
  let videoEl = null;
  let canvasEl = null;
  let canvasCtx = null;
  let stream = null;
  let gestureBar = null;
  let gestureTimer = null;
  let glowTimer = null;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let latestFrameImg = null;
  let camPlaceholder = null;
  let liveBadgeAdded = false;

  // ── Cursor state ─────────────────────────────────────────────────────────────
  const CURSOR_CSS = `
    :host {
      all: initial;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 2147483647;
      pointer-events: none !important;
    }
    .cursor {
      position: fixed;
      left: 0; top: 0;
      display: none;
      pointer-events: none;
      will-change: transform;
    }
    .cursor.active { display: block; }
    .cursor-svg {
      display: block;
      overflow: visible;
      transform-origin: 0 0;
      filter: drop-shadow(0 2px 5px rgba(0,0,0,0.55));
      transition: filter 0.12s;
    }
    .cursor.hovering .cursor-svg {
      filter: drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 9px rgba(74,222,128,0.65));
    }
    .cursor-path {
      fill: white;
      stroke: rgba(0,0,0,0.72);
      stroke-width: 1.5;
      stroke-linejoin: round;
      stroke-linecap: round;
      transition: fill 0.08s;
    }
    .cursor.hovering .cursor-path { fill: #e8fff2; }
    @keyframes gs-click {
      0%   { transform: scale(1); }
      35%  { transform: scale(0.72); }
      100% { transform: scale(1); }
    }
    .cursor.clicking .cursor-svg { animation: gs-click 0.22s ease-out forwards; }
  `;

  let cursorHost    = null;
  let cursorDot     = null;
  let cursorCX      = 0;
  let cursorCY      = 0;
  let overlayMirrorX = false;

  function buildCursor() {
    if (document.getElementById('wavr-cursor-host')) return;
    cursorHost = document.createElement('div');
    cursorHost.id = 'wavr-cursor-host';
    const sh = cursorHost.attachShadow({ mode: 'closed' });
    const st = document.createElement('style');
    st.textContent = CURSOR_CSS;

    cursorDot = document.createElement('div');
    cursorDot.className = 'cursor';

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cursor-svg');
    svg.setAttribute('width', '23');
    svg.setAttribute('height', '30');
    svg.setAttribute('viewBox', '0 0 23 30');
    svg.setAttribute('fill', 'none');

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('class', 'cursor-path');
    // Classic pointer arrow: tip at (0,0), left edge down, notch, shaft, right side of head
    path.setAttribute('d', 'M 0 0 L 0 28 L 8 20.5 L 11.5 29 L 15.5 27.5 L 12 19 L 21 19 Z');

    svg.appendChild(path);
    cursorDot.appendChild(svg);
    sh.append(st, cursorDot);
    document.body.appendChild(cursorHost);
  }

  function isClickable(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (['a', 'button', 'input', 'select', 'textarea', 'label'].includes(tag)) return true;
    return window.getComputedStyle(el).cursor === 'pointer';
  }

  function updateCursor(state) {
    if (!cursorDot) buildCursor();
    if (!cursorDot) return;
    cursorCX = state.x * window.innerWidth;
    cursorCY = state.y * window.innerHeight;
    cursorDot.style.transform = `translate(${cursorCX}px,${cursorCY}px)`;
    cursorDot.classList.add('active');

    const el = document.elementFromPoint(cursorCX, cursorCY);
    cursorDot.classList.toggle('hovering', isClickable(el));

    if (state.clicking && !cursorDot.classList.contains('clicking')) {
      cursorDot.classList.add('clicking');
      setTimeout(() => cursorDot?.classList.remove('clicking'), 350);
    }
  }

  function fireCursorClick(x, y) {
    const sx = x * window.innerWidth;
    const sy = y * window.innerHeight;
    const el = document.elementFromPoint(sx, sy);
    if (el) {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
      el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
    }
    if (cursorDot) {
      cursorDot.classList.remove('clicking');
      void cursorDot.offsetWidth;
      cursorDot.classList.add('clicking');
      setTimeout(() => cursorDot?.classList.remove('clicking'), 350);
    }
  }

  function hideCursor() {
    if (cursorDot) cursorDot.classList.remove('active', 'clicking', 'hovering');
  }

  function setMirrorX(mirrored) {
    overlayMirrorX = mirrored;
    if (videoEl) videoEl.style.transform = mirrored ? 'scaleX(-1)' : '';
  }

  function buildWidget() {
    host = document.createElement('div');
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    const widget = document.createElement('div');
    widget.className = 'widget';

    // Header
    const header = document.createElement('div');
    header.className = 'header';

    const left = document.createElement('div');
    left.className = 'header-left';

    const liveDot = document.createElement('div');
    liveDot.className = 'live-dot';

    const title = document.createElement('span');
    title.className = 'header-title';
    title.textContent = 'wavr';

    left.append(liveDot, title);

    const SVG_MINUS = '<svg width="10" height="2" viewBox="0 0 10 2" fill="none"><rect width="10" height="2" rx="1" fill="currentColor"/></svg>';
    const SVG_PLUS  = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    const SVG_CLOSE = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

    let isMinimized = false;

    const minBtn = document.createElement('button');
    minBtn.className = 'icon-btn';
    minBtn.innerHTML = SVG_MINUS;
    minBtn.title = 'Minimize';
    minBtn.addEventListener('click', () => {
      isMinimized = !isMinimized;
      widget.classList.toggle('minimized', isMinimized);
      minBtn.innerHTML = isMinimized ? SVG_PLUS : SVG_MINUS;
      minBtn.title = isMinimized ? 'Expand' : 'Minimize';
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn stop';
    closeBtn.innerHTML = SVG_CLOSE;
    closeBtn.title = 'Stop Wavr';
    closeBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'STOP' });
    });

    const headerRight = document.createElement('div');
    headerRight.className = 'header-right';
    headerRight.append(minBtn, closeBtn);

    header.append(left, headerRight);

    // Camera area
    const cameraArea = document.createElement('div');
    cameraArea.className = 'camera-area';

    const placeholder = document.createElement('div');
    placeholder.className = 'cam-placeholder';
    placeholder.innerHTML = '<svg width="28" height="24" viewBox="0 0 28 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M27 21a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4.5L9 4h10l1.5 2H25a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="13" r="4.5" stroke="currentColor" stroke-width="1.5"/></svg><span class="ph-text">Starting camera…</span>';
    camPlaceholder = placeholder;

    videoEl = document.createElement('video');
    videoEl.autoplay = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.style.display = 'none';

    canvasEl = document.createElement('canvas');
    canvasCtx = canvasEl.getContext('2d');

    const camWatermark = document.createElement('div');
    camWatermark.className = 'cam-watermark';
    camWatermark.textContent = 'wavr';
    cameraArea.append(placeholder, videoEl, canvasEl, camWatermark);

    // Gesture bar
    gestureBar = document.createElement('div');
    gestureBar.className = 'gesture-bar dim';
    gestureBar.innerHTML = '<span class="gesture-idle-label">● waiting</span>';

    // Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'settings-btn';
    settingsBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.6 2.6l1.06 1.06M8.34 8.34l1.06 1.06M9.4 2.6L8.34 3.66M3.66 8.34L2.6 9.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>Settings';
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    });

    widget.append(header, cameraArea, gestureBar, settingsBtn);
    shadow.appendChild(widget);
    document.body.appendChild(host);

    setupDrag(header);

    chrome.storage.local.get('cursorMirrorX', (r) => {
      if (r.cursorMirrorX) setMirrorX(true);
    });
  }

  function startCamera(placeholder) {
    navigator.mediaDevices.getUserMedia({ video: { width: 288, height: 216 }, audio: false })
      .then((s) => {
        stream = s;
        videoEl.srcObject = s;
        videoEl.style.display = 'block';
        placeholder.style.display = 'none';
      })
      .catch(() => {
        placeholder.querySelector('.ph-text').textContent = 'Camera in use';
      });
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.style.display = 'none';
    }
  }

  function drawState(state) {
    if (!canvasEl || !canvasCtx) return;

    const W = canvasEl.offsetWidth;
    const H = canvasEl.offsetHeight;
    if (!W || !H) return;
    if (canvasEl.width !== W || canvasEl.height !== H) {
      canvasEl.width  = W;
      canvasEl.height = H;
    }

    const ctx = canvasCtx;
    if (latestFrameImg) {
      drawFrame(latestFrameImg);
    } else {
      ctx.clearRect(0, 0, W, H);
    }

    const flipX = (v) => overlayMirrorX ? (1 - v) * W : v * W;

    const px = flipX(state.wristX);
    const py = state.wristY * H;

    // ── Dead zone indicator ──────────────────────────────────────
    if (state.waitingForReset && state.originX != null) {
      const ox = flipX(state.originX);
      const oy = state.originY * H;
      const r  = state.deadZoneRadius * W;

      const ddx  = px - ox;
      const ddy  = py - oy;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const near = dist < r;
      const zoneColor = near ? '#4ade80' : '#f59e0b';

      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fillStyle = near ? 'rgba(74,222,128,0.08)' : 'rgba(245,158,11,0.08)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.strokeStyle = zoneColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(px, py);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = zoneColor;
      ctx.fillText(near ? '✓ Ready' : '↩ Return', ox, Math.max(oy - r - 5, 12));
    }

    // ── Wrist dot ────────────────────────────────────────────────
    const dotColor = state.waitingForReset ? '#f59e0b' : '#4ade80';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    // ── Buffer bar ───────────────────────────────────────────────
    const segCount = state.bufferMax;
    const barW = W * 0.6;
    const segW = barW / segCount;
    const barX = (W - barW) / 2;
    const barY = H - 14;
    const segH = 4;

    for (let i = 0; i < segCount; i++) {
      ctx.beginPath();
      ctx.roundRect(barX + i * segW + 1, barY, segW - 2, segH, 1.5);
      ctx.fillStyle = i < state.bufferFill ? '#4ade80' : 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
  }

  function drawCursorZone(state) {
    if (!canvasEl || !canvasCtx || !state.cursorZone) return;
    const W = canvasEl.offsetWidth;
    const H = canvasEl.offsetHeight;
    if (!W || !H) return;
    if (canvasEl.width !== W || canvasEl.height !== H) {
      canvasEl.width  = W;
      canvasEl.height = H;
    }
    const ctx = canvasCtx;
    if (latestFrameImg) {
      drawFrame(latestFrameImg);
    } else {
      ctx.clearRect(0, 0, W, H);
    }
    const z  = state.cursorZone;
    const zl = overlayMirrorX ? (1 - z.cx - z.w / 2) * W : (z.cx - z.w / 2) * W;
    const zt = (z.cy - z.h / 2) * H;
    const zw = z.w * W;
    const zh = z.h * H;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(74,222,128,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(zl, zt, zw, zh);
    ctx.setLineDash([]);
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(74,222,128,0.35)';
    ctx.fillText('cursor zone', zl + zw / 2, Math.max(zt - 4, 10));

    // ── Wrist dot ────────────────────────────────────────────────
    if (state.wristX != null && state.wristY != null) {
      const flipX = (v) => overlayMirrorX ? (1 - v) * W : v * W;
      const wx = flipX(state.wristX);
      const wy = state.wristY * H;
      ctx.beginPath();
      ctx.arc(wx, wy, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(wx, wy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#4ade80';
      ctx.fill();
    }
  }

  function showWidget() {
    if (document.getElementById(HOST_ID)) return;
    buildWidget();
  }

  function hideWidget() {
    stopCamera();
    clearTimeout(gestureTimer);
    clearTimeout(glowTimer);
    latestFrameImg = null;
    camPlaceholder = null;
    liveBadgeAdded = false;
    if (host) {
      host.remove();
      host = null;
      shadow = null;
      videoEl = null;
      canvasEl = null;
      canvasCtx = null;
      gestureBar = null;
    }
  }

  function showGesture(label) {
    if (!gestureBar) return;

    gestureBar.innerHTML = '';
    gestureBar.classList.remove('dim');

    const txt = document.createElement('span');
    txt.style.flex = '1';
    txt.textContent = label;

    const shareBtn = document.createElement('button');
    shareBtn.className = 'gesture-share-btn';
    shareBtn.textContent = '↗ share';
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = encodeURIComponent('Just waved to scroll Chrome 🖐 — no touching required. Try Wavr:');
      const url  = encodeURIComponent(WAVR_CWS_URL);
      chrome.runtime.sendMessage({ type: 'OPEN_URL', url: `https://twitter.com/intent/tweet?text=${text}&url=${url}` });
    });

    gestureBar.append(txt, shareBtn);

    clearTimeout(gestureTimer);
    gestureTimer = setTimeout(() => {
      if (gestureBar) {
        gestureBar.innerHTML = '<span class="gesture-idle-label">● waiting</span>';
        gestureBar.classList.add('dim');
      }
    }, 1500);

    const w = shadow?.querySelector('.widget');
    if (w) {
      w.classList.add('gesture-glow');
      clearTimeout(glowTimer);
      glowTimer = setTimeout(() => w?.classList.remove('gesture-glow'), 700);
    }

    const cam = shadow?.querySelector('.camera-area');
    if (cam) {
      cam.classList.remove('flash');
      void cam.offsetWidth;
      cam.classList.add('flash');
    }
  }

  function setupDrag(handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      const rect = host.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !host) return;
      const x = e.clientX - dragOffsetX;
      const y = e.clientY - dragOffsetY;
      host.style.left = Math.max(0, Math.min(x, window.innerWidth - host.offsetWidth)) + 'px';
      host.style.top = Math.max(0, Math.min(y, window.innerHeight - host.offsetHeight)) + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => { isDragging = false; });
  }

  function drawFrame(img) {
    if (!canvasEl || !canvasCtx) return;
    const W = canvasEl.offsetWidth;
    const H = canvasEl.offsetHeight;
    if (!W || !H) return;
    if (canvasEl.width !== W || canvasEl.height !== H) {
      canvasEl.width  = W;
      canvasEl.height = H;
    }
    if (overlayMirrorX) {
      canvasCtx.save();
      canvasCtx.translate(W, 0);
      canvasCtx.scale(-1, 1);
      canvasCtx.drawImage(img, 0, 0, W, H);
      canvasCtx.restore();
    } else {
      canvasCtx.drawImage(img, 0, 0, W, H);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'VIDEO_FRAME') {
      const img = new Image();
      img.onload = () => {
        latestFrameImg = img;
        if (camPlaceholder) camPlaceholder.style.display = 'none';
        drawFrame(img);
        if (!liveBadgeAdded && shadow) {
          const cam = shadow.querySelector('.camera-area');
          if (cam) {
            const badge = document.createElement('div');
            badge.className = 'live-badge';
            badge.textContent = '● LIVE';
            cam.appendChild(badge);
            liveBadgeAdded = true;
          }
        }
      };
      img.src = message.data;
    }
    if (message.type === 'START_OVERLAY')     showWidget();
    if (message.type === 'HIDE_OVERLAY')    { hideWidget(); hideCursor(); }
    if (message.type === 'GESTURE_DISPLAY')   showGesture(message.label);
    if (message.type === 'OVERLAY_STATE')     drawState(message);
    if (message.type === 'SET_MIRROR_X')      setMirrorX(message.mirrorX);
    if (message.type === 'CURSOR_MODE_CHANGE') {
      if (message.active) buildCursor(); else hideCursor();
    }
    if (message.type === 'CURSOR_STATE') { updateCursor(message); drawCursorZone(message); }
    if (message.type === 'CURSOR_CLICK')  fireCursorClick(message.x, message.y);
  });

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.enabled) showWidget();
  });
})();
