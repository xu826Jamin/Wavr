# Wavr popup — performance baseline (P0, 2026-06-23)

**How measured:** the BUILT `dist/` popup booted headless (Playwright) with a `chrome.*` shim, profiled
with the **CDP sampling Profiler** (`avatar-assets/capture/prof.cjs`). MediaPipe wasm is skipped (it's
on-demand and not part of the avatar-UI cost). Numbers are % of CPU samples (self time) over a 3s window.

> Methodology note: `Performance.getMetrics` `ScriptDuration` was tried first and gave **bogus** numbers
> (reported 98% "script" where the sampling profiler showed 87% idle) — corrupted by headless rAF
> throttling when scrolled off the top + a one-time slow ArrayBuffer wasm compile landing in the window.
> The **sampling profiler is the source of truth.** `rafIn1s` idle probe is also unreliable in headless
> (rAF throttles on occlusion); continuous-RAF-at-idle is judged by code inspection instead.

## Results (DPR 1; DPR 2 has the same ranking)

| Location | main-thread busy | notes |
|---|---|---|
| **Top** (hero + explorer avatars) | **14.7%** (JS ~0.5%, rest compositor) | healthy |
| **Dos & Don'ts** (8 avatars) | **100% (0% idle)** | saturated → janky scroll |

### Ranked cost contributors at Dos & Don'ts (the heavy section)
1. **`drawImage` — 33%.** Per-frame resampling of the **1024×768** body+forearm+hand sprites,
   ×3 sprites ×8 avatars ×~30–60 fps. *(confirms the static-audit hypothesis)*
2. **`matchMedia` — 18%.** 🆕 `prefers-reduced-motion` is re-evaluated **every frame**, 3–4× per avatar
   (`avatar.js` `prefersReduce()` in `_tick` + `_updateLife`; `dosDonts.js`/`zoneDemos.js` `reduce()` in
   `onFrame`/`onAfterDraw`). `window.matchMedia(query)` re-parses the query string each call. Not in the
   original hypothesis; trivially eliminable by caching one `MediaQueryList`.
3. **Canvas overlay/draw ops — ~25%** (`save` 10 + `clearRect` 7 + `fillRect` 4 + `stroke` 1.6 +
   `addColorStop`/`createRadialGradient` ~3). Much of this is the **6 static scenes** (distance ×2,
   framing ×2, lighting ×2) needlessly redrawing full-size images + gradients every frame for a 2px
   "breathe" — pure waste. Only **reset ×2** (and the zone demos) genuinely need to animate.
4. **GC — 3%.** Per-frame allocations (`createRadialGradient`, arrays).

### Other findings
- **Continuous RAF at idle (by code):** `heroCanvas.js` unconditionally reschedules its rAF (never pauses
  off-screen or on `document.hidden`); hero/explorer avatars are `life:true` so they never leave the
  shared ticker while visible. Cost at the top is low (~0.5% JS) but it's never truly 0, and it doesn't
  pause when the tab is hidden. → P3.1/P3.2/P2.5.
- **MediaPipe loads at popup open:** `preview-detect.js` calls `init()` at module load (line 431),
  fetching/compiling the ~11 MB gesture wasm + 8 MB model and starting a `setInterval(processFrame,33)`
  **even though preview is off by default**. One-time startup cost + an always-on (cheap) timer; not the
  continuous-smoothness complaint but worth deferring to "Start Preview". → P3.4.

## Fix priority (impact × ease) — drives P2/P3 order
1. **Cache `matchMedia`** — kills ~18% in the heavy section, helps everywhere, zero visual risk. *(trivial)*
2. **Static scenes truly static** — distance/framing/lighting (6) paint once and stop; only reset (2) +
   zone demos animate. Removes most of the 8-avatar per-frame load. *(structural, biggest lever)*
3. **Pre-scaled sprite cache** — render each sprite to a per-display-size bitmap once; `drawImage` the
   small bitmap each frame. Cuts the remaining `drawImage` cost for avatars that DO animate.
4. **Pause heroCanvas off-screen + on `document.hidden`; pause avatar ticker on hidden.** Idle/bg cleanliness.

## RESULTS — after (same harness, DPR 1)

| Location | busy (before → after) | fps (before → after) |
|---|---|---|
| **Top** (hero + explorer) | 14.7% → 16.7% | 59.7 → 60 |
| **Dos & Don'ts** (8 avatars) | **100% → 23.3%** | **0.7 → 60** |

`count.cjs` drawImage/s per reset avatar at dos: **294,912 → 183** (=61 fps × 3 sprites). Static scenes
(distance/framing/lighting ×6): **0** draws in steady state. No page errors. Visual regression check:
`#tutorial` + `#hero` screenshots unchanged; swipe filmstrip animates correctly; reduced-motion diff = 0.

### What actually fixed it (ranked by real impact)
1. **rAF storm guard** (`_tickAll`: `if (_active.size && !_rafId)`) — THE fix. Eliminated the exponential
   pending-rAF multiplication that demo avatars triggered by calling `_start()` from inside `onFrame`.
2. **`matchMedia` cached** — removed an 18%-of-heavy-section main-thread cost (real on any machine).
3. **6 static scenes `idle:false`** — paint once & leave the ticker (was redrawing full-size every frame).
4. **heroCanvas** pauses off-screen + on `document.hidden`; **avatar ticker** pauses on `document.hidden`.
5. **preview-detect lazy-load** — MediaPipe wasm+model (~19 MB) + the 33 ms detection interval now start
   only when the camera preview starts, not on every options-page open.

**Skipped:** pre-scaled sprite cache (P2.3) — `drawImage` is now 0.4%; numbers don't justify it.

## P1 policy (best practices to implement against)
- **Mascot fps:** 30–40 fps is plenty for the avatar; the eye won't read the difference on a 2px breathe
  or a 700ms swipe. (Throttle only if re-measurement shows the shared ticker is still hot after 1–3.)
- **Static ≠ looping:** any avatar with no time-based motion paints once and leaves the ticker; it must
  repaint on resize/visibility-regain (one frame), never poll.
- **No per-frame allocation or media-query parsing** in the draw path — hoist/caches.
- **Source images are huge (1024×768); display sizes are small** — never resample the source per frame;
  cache at display size and refresh only on resize/DPR change.
- **Nothing runs when the tab is hidden** (`visibilitychange` stops every loop).
- **Keep the look:** A/B each change against the capture harness + a screenshot before keeping it.
