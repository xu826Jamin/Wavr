# PLAN — Wavr UI Performance Optimization

The avatar work made the options page (popup.html) heavy enough that it "almost can't run smoothly on
a normal computer." Goal: **measure the real costs, then massively cut them** — for the avatar AND the
rest of the UI — without losing the look. Measurement-first (no unverified claims; see
[[feedback-verify-real-browser]]).

## Targets (the gate for "done")
- Idle popup (nothing animating, mouse still): **~0% CPU**, no continuous RAF.
- Active (scrolling / hovering / an avatar reacting): **≥50 fps on a mid laptop**, main-thread frame
  work **< ~10 ms**.
- Scroll stays smooth through every section (esp. Dos & Don'ts with its avatars).
- No visual regression vs current (verify with the capture harness + screenshots before/after).

---

## Baseline cost map (from static audit, 2026-06-23 — to be confirmed by profiling in P0)
On popup load, **12 `Avatar` instances** are constructed immediately:
hero(1, interactive/life) · explorer(1, interactive/life) · zone demos(2, idle+onFrame) ·
dos/don'ts(**8**: 6 `idle:true` static-but-breathing + 2 `onFrame`).
Each avatar per frame: `clearRect` + DPR-scaled `drawImage` of the **1024×768** body/forearm/hand
images → expensive resampling, ×N visible instances. Plus:
- `heroCanvas.js`: 55-particle RAF, always running (mouse repulsion).
- `popup.js`: ambient-glow lerp RAF, always running.
- `preview-detect.js`: a 2nd MediaPipe `GestureRecognizer` loop (on-demand: only after "Start Preview").
- Uncoordinated RAF loops; nothing pauses on `document.hidden`.

**Hypothesis (rank to confirm in P0):** dominant cost = (1) many avatars redrawing full-size images
every frame, (2) 12 upfront instances, (3) heroCanvas particles, (4) ambient glow, (5) preview MediaPipe.

---

## STATUS: P0 ✅ · P1 ✅ · P2 ✅ (core) — Dos&Don'ts FIXED: 0.7→60 fps, busy 100%→21.5%. P2.5/P3/P4 left.
**🔑 ROOT CAUSE (not the original hypothesis): an exponential rAF storm.** The shared ticker zeroes
`_rafId` at the top of `_tickAll`, then demo avatars (reset, zone demos) call `setArm`→`_start`→`_wake`
from inside `onFrame`, which schedules a frame mid-loop; the end-of-loop reschedule then added a SECOND
→ pending-rAF count multiplied every frame. At Dos&Don'ts the 2 reset avatars hit **294,912 drawImage/s
each** (count.cjs). Life avatars (hero/explorer) never call _start mid-tick, so the top stayed 60fps —
which is why dos was catastrophic but top fine. **Fix:** one guard `if (_active.size && !_rafId)` in
`_tickAll`. Now 183 drawImage/s/avatar (=61fps×3 sprites). `drawImage`/`matchMedia` were symptoms.
**Done so far:** (1) ticker storm guard [THE fix], (2) `matchMedia` cached (was 18%), (3) 6 static
dos/donts scenes `idle:false` → paint once & leave ticker (count.cjs: 0 draws), `_resize` repaints once.
**P2.3 pre-scaled sprite cache: SKIP** — drawImage is now 0.4%; numbers don't justify the complexity/risk.
**Tooling:** `prof.cjs` (CDP sampling profiler), `count.cjs` (drawImage-per-canvas — the diagnostic that
cracked it), `diag.cjs`, `shim.cjs`. Note: headless rasters Canvas2D in software → absolute fps only
trustworthy once work is light; `count.cjs` (draw calls) and sample composition are the reliable signals.
**Left:** P2.5 pause on document.hidden · P3.1 heroCanvas pause off-screen+hidden · P3.4 preview-detect
lazy-load (loads ~19MB wasm+model on every popup open + always-on 33ms interval) · P4 verify+ship.

## P0 — Instrument & profile (RESEARCH FIRST, no fixes yet) ✅ DONE
- 0.1 **Real popup profiling.** Drive the built popup in headless Chromium via Playwright + CDP
  tracing (`Performance`/`Tracing` domains): record frame durations / long tasks while (a) idle,
  (b) scrolling top→bottom, (c) hovering the hero, (d) sitting on the Dos&Don'ts section. Needs a
  `chrome.*` shim for storage so popup.js boots headless. Output: `perf/` report with fps + scripting
  time per scenario. *(This is the source of truth — confirms/!refutes the hypothesis above.)*
- 0.2 **Avatar micro-bench** (extend `avatar-assets/capture/`): measured frame time for 1 vs 4 vs 8 vs
  12 simultaneous avatars; and the cost delta of each optimization (static-stop, pre-scaled bitmaps,
  DPR cap, fps throttle). Pure A/B numbers so each P2 change is justified by data.
- 0.3 **RAF/handler inventory:** enumerate every RAF, `setInterval`, scroll/resize/mousemove listener
  on the page; note which run continuously vs on-demand. Decide a single coordinator vs per-feature.
- **Gate:** a ranked, numbers-backed list of the top cost contributors. Optimize in that order.

## P1 — Research best practices (lightweight, parallel to P0)
- 1.1 Canvas perf: pre-scaling source images (`createImageBitmap` at display size) vs per-frame
  `drawImage` resampling; offscreen-canvas caching of static layers; DPR caps for small canvases;
  `desynchronized`/`alpha:false` contexts. Use `ui-ux-pro-max` (`--domain ux "animation performance"`
  → `main-thread-budget`, `transform-performance`, `debounce-throttle`).
- 1.2 Decide policy: target fps for the mascot (30–40 is plenty), when motion is "worth it," and how
  many live avatars are acceptable at once.
- **Gate:** a short written policy that P2/P3 implement against.

## P2 — Avatar engine optimization (biggest lever)
Apply in P0-ranked order; **re-measure after each** (0.2 harness) and keep only what the numbers justify.
- 2.1 **Lazy construction.** Don't build all 12 on load — construct each Avatar only when its
  container first nears the viewport (IntersectionObserver), destroy/teardown when far away. Cuts
  upfront cost and keeps off-screen sections at zero.
- 2.2 **Static scenes truly static.** Dos/don'ts distance/framing/lighting (6) → paint once and stop
  (no `idle` breathe, no loop). Only `reset` (2) animates. Same for any decorative avatar.
- 2.3 **Pre-scaled sprite cache.** Render each sprite to a per-display-size `ImageBitmap`/offscreen
  canvas once (on resize), then `drawImage` the small bitmap each frame — eliminates 1024×768
  resampling per frame. Optionally cache the whole static body+forearm composite per pose.
- 2.4 **Frame-rate throttle** the shared ticker to ~30–40 fps (mascot doesn't need 60); cap DPR to 1
  for small avatars (overlay 64×48, dos/don'ts thumbnails).
- 2.5 **Pause on `document.hidden`** (visibilitychange) — stop the shared ticker entirely when the tab
  isn't visible.
- 2.6 Consider **reducing instance count** (e.g., one shared canvas cycling the dos/don'ts, or fewer
  always-live demos) if 0.2 shows N is the bottleneck.
- **Gate:** Dos&Don'ts section scrolls smoothly; idle popup ~0% CPU; harness shows the target frame time.

## P3 — Rest-of-UI optimization
- 3.1 **heroCanvas:** cut particle count / throttle fps / pause when hero off-screen and on
  `document.hidden`. Measure 55→fewer.
- 3.2 **Ambient glow:** make it CSS-driven or pause when idle/off-screen/hidden (no perpetual lerp RAF).
- 3.3 **Scroll/mouse handlers:** ensure passive listeners + rAF-batched; coalesce the progress bar,
  topbar-shadow, and section-nav scroll work into one handler; throttle mousemove (tilt/glow).
- 3.4 **preview-detect:** confirm it fully stops (camera + RAF + recognizer.close) when preview is
  stopped or the page is hidden; never runs unless explicitly started.
- 3.5 Reduce layout thrash / forced reflows in popup.js animations (batch reads/writes).
- **Gate:** whole page smooth on a mid laptop; no continuous work when idle.

## P4 — Verify, regress-check, ship
- Re-run P0 profiling → before/after numbers in `perf/`. Capture-harness before/after to confirm **no
  visual regression** (avatar still looks/moves right; reduced-motion still static).
- Update CLAUDE.md (perf architecture + the new avatar render/caching model + any removed knobs),
  bump version, rezip, delete PLAN.md.
- **Gate:** user confirms it runs smoothly; sign-off.

---

## Risks / watch-items
- Don't optimize blind — P0 numbers drive the order; re-measure each change (avoid the earlier
  "verified but not really" trap).
- Lazy construction must not break the shared image cache, IntersectionObserver pause, or reduced-motion.
- Pre-scaled bitmaps must refresh on resize/DPR change; watch memory (don't cache huge bitmaps ×12).
- Keep the look: every change A/B'd against a screenshot/clip before keeping it.

## P4 status — implemented & harness-verified; AWAITING USER SIGN-OFF on real hardware
Before/after (prof.cjs, DPR1): **Dos&Don'ts 0.7→60 fps, busy 100%→23%**; top stays 60 fps. count.cjs:
reset avatars 294,912→183 drawImage/s; static scenes 0. No visual regression (`#tutorial`/`#hero`
shots, swipe filmstrip, reduced-motion diff=0). Lint clean, 14/14 tests pass. Version bumped 2.2.0→2.2.1.
**Remaining gate:** user confirms it runs smoothly on their machine → then fold into CLAUDE.md (DONE
already) + delete PLAN.md. (Done: CLAUDE.md perf-invariants section, [perf/baseline.md](perf/baseline.md).)
Minor un-done (low value, gates met): P3.3 coalesce the scroll-shadow listener into a rAF-batched handler.

## Running log
- 2026-06-23: Plan created after user reported the avatar makes the UI "super heavy, almost impossible
  to run smoothly." Static audit found 12 avatars on load (8 in Dos&Don'ts, 6 needlessly breathing),
  per-frame full-size image resampling, always-on heroCanvas(55) + ambient-glow RAF, uncoordinated
  loops, no hidden-tab pausing. Next: P0 instrument & profile to rank the real costs.
- 2026-06-23 (P0–P4): Profiled the built popup headless (CDP sampling profiler). Found Dos&Don'ts at
  0.7 fps / 100% busy while the top was a fine 60 fps. `count.cjs` exposed the true cause: an
  **exponential rAF storm** (reset avatars at 294,912 drawImage/s) from the shared ticker
  double-scheduling when demo avatars call `_start` inside `onFrame`. NOT the hypothesised drawImage
  resampling (those were symptoms). Fixes: (1) ticker `!_rafId` guard [THE fix → 60 fps], (2) cached
  `matchMedia` (was 18%), (3) 6 static dos/donts scenes `idle:false`, (4) heroCanvas pauses
  off-screen+hidden, avatar ticker pauses on hidden, (5) preview-detect MediaPipe lazy-loads on camera
  start. Skipped pre-scaled sprite cache (drawImage now 0.4% — not justified). Verified no visual
  regression; built v2.2.1. Awaiting user sign-off on real hardware before deleting PLAN.md.
