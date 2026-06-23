# PLAN — Wavr Avatar: Expansion & Integration

Master plan for turning the avatar from a single demo-frame element into a product-wide,
interactive mascot system, plus new gesture/concept content. Supersedes the avatar-build plan
(that work is the **Foundation** below; detailed build history is in git + [AVATAR_SPEC.md](AVATAR_SPEC.md)).

---

## Foundation (DONE — the rig we build on)
Sleek-minimal masked **ninja** avatar (premium dark-UI aesthetic, not cute). **Single-body puppet:**
- Assets `src/assets/avatar/*.webp` (~70 KB): `base_body`, `forearm` (ONE shared forearm), and
  `hand_{open,fist,pointing,victory}`.
- Renderer `src/popup/mascot2d.js`: draws body + (translated) shared forearm + swapped hand; a
  **fill-only** upper-arm capsule (`#41474f`) fills the shoulder gap **only during a swipe**.
  Swipe = forearm+hand **translate** in the direction (2-DOF ⇒ correct up/down/left/right; pure
  translation ⇒ palm stays to camera). Constants: `S=[772,528]`, `AP=[844,502]`, `SWIPE_PX=90`.
- Pipeline scripts in `avatar-assets/` (register → flood-cut → consistent-forearm graft → finalize).
- Verified clean at high-res for all 4 poses × 5 states (`avatar-assets/v2/consistent_all.png`).

---

## Guiding decisions (critical — read before building)
- **DEC-1 — Animation: hybrid (cost-forced).** User wants real motion (code-animated stills "look
  weird"), budget ≤3 cr. **Cost reality (preflighted 2026-06-22):** Seedance=6 cr/4s, Kling/Turbo=
  4.5 cr/3s, **Grok Imagine=1.5 cr/sec** (only affordable). ⇒ **Video CANNOT drive the per-gesture
  demo** (per-combo clips = 6–24+ cr; good models 4.5–6 cr each). So: **per-combo demo stays
  code-driven** (consistent-forearm rig); spend ≤3 cr on **at most one short signature loop**
  (Grok, ~2s) for a single "alive" moment IF a spike proves Grok animates our flat avatar without
  warping. Simple parametric things (zones, cursor dot, arrows, ✓/✗) = SVG/canvas, 0 cr. *(Answers
  "is it necessary to animate via Higgsfield?" → mostly No; video is a luxury for ≤1 loop.)*
  **BLOCKER (2026-06-22): video is plan-gated.** Grok (the only affordable model, 1.5 cr/s) returned
  "Requires basic plan or higher"; free-plan video models cost 4.5–6 cr/clip (over budget). ⇒ **No
  video on the free plan.** All animation is code-driven unless the user upgrades Higgsfield. (No
  credits spent — gen was rejected pre-charge; balance still 8.65.)
- **DEC-2 — Build a reusable `Avatar` component FIRST.** Everything (UI integration, overlay,
  dos/don'ts, zones) depends on a configurable, poolable renderer. Refactor `mascot2d.js` into it.
- **DEC-3 — New poses reuse the shared forearm.** A new gesture = one new **hand sprite** grafted
  at the common wrist (cheap, consistent). No new bodies/forearms.
- **DEC-4 — Credit budget.** ~8.6 Higgsfield credits left (free plan, ~0.15/img). Cap new spend at
  **~2 credits**. Generation needs are listed per phase; author in SVG/canvas where possible
  (zones, arrows, ✓/✗, cursor dot) — zero credits.

---

## Phase 1 — Foundation: reusable Avatar component + quick fixes
- 1.1 ✅ **DONE** — "No action mapped" overlap fixed (was centered behind the avatar in low
  contrast; now hidden — already shown below frame + in badge). `popup.js runExplorerAnimation`.
- 1.2 ✅ **DONE** — `src/popup/avatar.js` = reusable **`Avatar`** class. Shared image cache (load
  once), per-instance **IntersectionObserver off-screen pause**, ResizeObserver, DPR-capped.
  Explorer now consumes it (`explorerAvatar = new Avatar(canvas,{interactive:true})`); `mascot2d.js`
  deleted; build clean.
- 1.3 ✅ **DONE (partial)** — API `play(pose,dir)` + `react('wave')`; click→wave when interactive.
  Idle = **gap-free whole-body breathe**. More reactions (nod/shrug/celebrate) added as needed.
- **Gate:** ⏳ user to confirm in the live extension (explorer works, click-to-wave, breathe).

## Phase 2 — New gestures (thumbs-up)  ❌ DROPPED (2026-06-23, user decision)
The avatar thumbs-up never read well: z_image only produced a smooth-mitten fist with wrong
proportions (huge thumb, tiny blob, no countable fingers); code fixes (two-tone→continuous recolor,
wrist-blend, drawn creases) and a final fist-reuse build still didn't satisfy. After 5 rejections the
user said **"remove the fist option and move on."** **Removed entirely** from the shipped extension:
- avatar.js reverted to the clean 4-pose foundation (no `holdThumb`/`THUMB_RING`/`_thumbRing`/hand_thumb).
- popup.html 👍 chip + `.is-toggle` CSS removed; popup.js `updateExplorer` thumb branch removed.
- `hand_thumb.webp` deleted (src+dist); `draw_thumbsup.cjs`/`strip_white.cjs` + thumb scratch deleted;
  thumb removed from `register.cjs`/`rig_assets.cjs`/`build_consistent.cjs`/`finalize_consistent.cjs`.
- **Kept:** `rig_assets.cjs` skin→glove is now a **continuous luma gradient** (`skinToGlove`) — a net
  improvement to the existing 4 hands' shading; verified they still look right. (Real product feature
  "hold thumb-up to toggle cursor mode" in offscreen.js is untouched — that's gesture detection, not the avatar.)
- **Spend this phase: 0.45 cr (balance 8.20), no result shipped.** Lesson saved: [[feedback_self_review]].

## Phase 3 — Concept visualizers (neutral zone + cursor zone), avatar-driven  ⏳ BUILT, awaiting live confirm (2026-06-23)
- 3.1 ✅ **DONE** — Neutral-zone demo: avatar open palm rests inside a green **dashed circle**
  (rotating dashes, faint fill); on a loop it drifts out in each direction with motion streaks (ring
  brightens = "fires") then returns to re-arm. Caption cycles rest → fires → return. 0 credits.
- 3.2 ✅ **DONE** — Cursor-zone demo: dashed **active-region rectangle** + 3 target buttons; open
  palm moves an **amplified cursor dot** (gain 2.2, mirrors zone→screen) to each target, then a fist
  fires a **click ripple** and lights the target green. Caption cycles move ↔ click. 0 credits.
- 3.3 ✅ **DONE** — Wired in: neutral demo inside the **Neutral zone `<details>`** (bento camera
  tile, scroll panel); cursor demo as the first card of the **#cursor** section. `initZoneDemos()`
  called from popup.js.
- **Implementation:** `src/popup/avatar.js` got `HAND_REST` export + `setArm()/setPose()` +
  `onFrame`/`onAfterDraw` hooks (manual arm overrides swipe/react; overlays drawn in-canvas so they
  track the hand and pause off-screen for free). New `src/popup/zoneDemos.js` holds both demos
  (prefers-reduced-motion → static representative frame). CSS `.zone-demo*` added to popup.html.
  Verified faithfully via `avatar-assets/verify_zones.cjs` → `verify_zones.png` (avatar identity
  preserved, zones read clearly). Build clean.
- **Gate:** ⏳ user to confirm in the live extension (both demos animate, on-brand, no Higgsfield).

## Phase 4 — Dos & Don'ts, shown by the avatar  ⏳ BUILT, awaiting live confirm (2026-06-23)
- 4.1 ✅ **DONE** — Shipped **4 faithful pairs** (0 cr, all composed from the existing rig):
  **Distance** (arm's length ↔ too close), **Framing** (in frame ↔ clipped at edge), **Reset**
  (return to neutral ↔ holding mid-swipe), **Lighting** (even ↔ backlit/dark). *Dropped two from the
  original list:* **palm-vs-angled** (whole-body tilt/squash didn't read as a palm angling — no
  faithful 0-cr composition) and **deliberate-vs-flailing** (overlaps Reset; rapid jitter looked like
  a render bug). Offer to add later if wanted.
- 4.2 ✅ **DONE** — Each pair = side-by-side ✓ green / ✗ red **avatar scenes**, composed via a new
  reusable `Avatar` **transform** (scale=too close, dx offset=clipped) + canvas overlays
  (neutral ring reused from Phase 3, red "stuck" ring+arrow, backlight+vignette). **0 credits.**
- 4.3 ✅ **DONE (popup)** — Visual scenes added to the existing **`#tutorial` section** above the
  text reference lists. *(Compact first-run version deferred — first-run wizard polish belongs with
  Phase 6.)*
- **Implementation:** `avatar.js` gained `transform`/`setTransform()` (scale/dx/dy/rot/origin,
  applied around the body draw). New `src/popup/dosDonts.js` (`initDosDonts()`, 8 scene canvases,
  prefers-reduced-motion holds a frame). `.dd-demos/.dd-demo/.dd-scene*` CSS + markup in popup.html;
  wired from popup.js. Verified faithfully via `avatar-assets/verify_dosdonts.cjs` →
  `verify_dosdonts.png` (identity preserved, every contrast reads). Build clean.
- **Gate:** ⏳ user confirms live (4 pairs animate, on-brand, contrasts clear); approve dropping the
  two pairs above (or ask to add them).

## Phase 5 — Interactivity & idle life
- 5.1 **Click** the avatar → reaction (wave / cycle a pose / small easter egg). **Hover** → subtle
  lean or eye-follow. Cursor-follow glance.
- 5.2 **Idle behaviors:** blink, breathe, occasional glance, periodic wave — randomized, subtle.
- 5.3 Respect `prefers-reduced-motion` (already wired); keep it tasteful, never distracting.
- **Gate:** feels alive but not annoying; a11y respected.

## Phase 6 — Avatar throughout the popup UI
- 6.1 Placements: **hero** (idle, waves on load/CTA), section intros, **empty/none states**
  (shrug), **achievements** (thumbs-up/celebrate), **setup steps** (demonstrates each step's pose),
  first-run wizard guide.
- 6.2 Performance: pooled renderer / shared RAF; pause off-screen; cap DPR.
- **Gate:** cohesive, not cluttered; smooth scroll/perf.

## Phase 7 — Overlay / website webcam PiP integration
- 7.1 Add a small avatar to the on-page **overlay** (shadow-DOM isolated, injected on every page).
  **Decision:** *reaction-confirmation* (mirrors the detected pose + swipe when a gesture fires —
  lighter, purposeful) **vs** *persistent mini-mascot*. Recommend reaction-confirmation, toggleable.
- 7.2 Must be lightweight, not fight the camera feed, respect existing PiP layout/drag.
- **Gate:** works on real pages; no jank; doesn't clobber the camera relay.

## Phase 8 — Polish, perf, a11y, size, ship
- Reduced-motion sweep, asset-size budget + lazy-load, off-screen pausing verified, CWS rezip,
  full self-review against each requirement.
- **Gate:** user sign-off; then summarize lasting changes into CLAUDE.md, delete PLAN.md.

---

## Decisions I need from you (to prioritize / unblock)
1. **Priority / order** — do all phases, or focus first on a subset (e.g., explorer content:
   thumbs-up + zones + dos/don'ts) before the broad UI/overlay integration?
2. **Higgsfield budget** — OK to spend up to ~2 of the ~8.6 credits on new hands/expressions
   (thumbs-up + a few dos/don'ts variants)? Or keep it to the bare minimum (thumbs-up only)?
3. **Dos & Don'ts list** — approve the pair list in 4.1, or adjust.
4. **Overlay avatar** — reaction-confirmation (recommended) vs persistent mini-mascot vs skip for now.

## Risks / watch-items
- Scope is large → phase strictly, gate each, don't batch.
- Multiple live canvases = perf risk → pooling + off-screen pause is mandatory (DEC-2).
- New still poses must hold identity → reuse shared forearm; verify at HIGH RES (lesson learned).
- Overlay is injected on all sites → keep it tiny, isolated, optional.

## Running log
- 2026-06-22: Avatar rig built + motion fixed (consistent-forearm + fill-capsule). User then
  requested a broad expansion (thumbs-up, neutral/cursor-zone viz, dos/don'ts, UI-wide + overlay
  integration, interactivity, Higgsfield-vs-code decision) + flagged the none-label bug. Fixed the
  none-label (1.1). Wrote this master plan.
- 2026-06-22: Decisions: **Foundation first**; budget ≤3 cr; overlay = reaction-confirmation.
  Video pivot explored → **BLOCKED on free plan** (Grok paid-only; others 4.5–6 cr/clip). User: keep
  **code-driven, polish hard**. **Phase 1 DONE:** `src/popup/avatar.js` reusable `Avatar` class
  (shared assets, off-screen pause, click→wave, idle breathe, swipe easing); explorer migrated;
  `mascot2d.js` deleted; build clean. **Next: Phase 2 (thumbs-up hand, ~0.15 cr) after user confirms
  the foundation in the live extension.**
- 2026-06-23: **Phase 2 DONE (after a rework).** Generated thumbs-up still (z_image, 0.15 cr).
  First integration grafted the fist onto the shared forearm → user: "super weird." Root cause: the
  small thumb-fist on the WIDE shared forearm = "ball on a stick" seam. Reworked:
  (1) thumb now uses its **own full natural arm** `arm_thumb.webp` (fist+forearm one piece, own elbow
      `THUMB_AP=[784,502]`) — avatar.js branches on `pose==='thumb'`; no seam.
  (2) `rig_assets.cjs` recolor skin→**two-tone glove** (`GLOVE_HI/LO`) so the fist keeps its volume
      (flat fill had flattened it to a blob); `isSkin` broadened to also catch the warm palm crease.
  (3) `strip_white.cjs` removes the white sticker border z_image added.
  Re-gen attempt for a crisper fist FAILED (came back as a pointing index finger, not a thumb) —
  0.15 cr wasted; **total spent 0.30, balance 8.35** (at the ≤0.3 cap, no more gen).
  - The natural-arm attempt looked WORSE live (oversized blobby arm). **Measured the widths** and
    found the real root cause: the natural thumb arm balloons to w217 at the elbow, but the FIST is
    w129 ≈ the shared forearm (w130). So the **consistent-forearm graft is correct** — the original
    seam was from cutting too LOW (y478) into the balloon. **Final fix:** shared slim forearm +
    `hand_thumb.webp` cut at `CUFF.thumb=[810,450]` (before the balloon) + two-tone shading. Now the
    thumb arm matches the other 4 poses' proportions (verified rest state vs open/fist).
  - Lesson saved to memory ([[feedback_self_review]]): verify the DEFAULT/rest state, not a mock with
    the ring hiding the flaw. `THUMB_RING=[826,334,112]`; `Avatar.holdThumb()` rise+ring+confirm; 👍
    chip + D-pad disable; thumb badge removed.
  - **Wrist SEAM (3rd rejection):** sharp mocks hid it — switched to a FAITHFUL `@napi-rs/canvas`
    renderer replicating avatar.js's exact `drawImage` layering (sharp composite-then-downscale
    smooths seams). Diffed thumb vs open forearm column → seam was a dark band where the fist's
    shaded underside met the lighter forearm. `handSprite` now blends the thumb's bottom wrist rows
    → forearm tone `[68,74,84]`.
  - **"No fingers" (4th rejection):** root cause was the GENERATION — gen1/gen3 fists were a smooth
    mitten with finger detail only as subtle skin shading, which the flat/two-tone recolor merged
    into a blob. Fixes: (a) **re-gen #3** (`thumb3_z`, 0.15 cr, user-approved over budget) gave a
    fist with clear curled-finger creases; (b) replaced two-tone recolor with a **continuous
    luma-preserving skin→glove gradient** (`skinToGlove` in `rig_assets.cjs`, `GLOVE_DARK`..`LIGHT`)
    so creases/knuckles survive; (c) shrank `WRIST_BLEND.thumb` to 18 so it doesn't erase the lower
    finger crease. `CUFF.thumb=[810,454]`, `THUMB_RING=[826,334,112]` (== hand centre). Verified
    faithfully: arm slim, ring centred, other 4 hands unaffected. **Total spent 0.45 cr, balance 8.20.**
  - **"Count the fingers" (5th rejection):** z_image's thumbs-up was fundamentally a smooth mitten
    with wrong proportions (huge thumb, tiny blob fist) — drawing creases on it didn't help. **Root
    realization (vs the 👍 emoji): the FIST must be the dominant mass with countable fingers.**
  - **FINAL approach (6th, 0 extra cr) — reuse the proven CLOSED-FIST hand.** `hand_fist` already
    reads as a proper fist with 4 countable curled fingers + correct proportions and already blends
    into the forearm. A thumbs-up = that fist + a thumb up. New `draw_thumbsup.cjs` draws a thumb
    capsule (glove + `#0b0b0b` outline + highlight) rising from the fist's thumb-side, writes
    `hand_thumb.png`. **Pipeline: build_consistent → draw_thumbsup → finalize.** No CUFF/seam issues
    (reuses the fist's wrist). `THUMB_RING=[800,287,130]` (encircles fist+thumb). Verified from the
    SHIPPED webps via the faithful canvas renderer (`_FINAL_all5.png`, `_FINAL_hold.png`): proper
    thumbs-up, 4 fingers countable, consistent with the family, ring centred. Generated thumb assets
    (`thumb*_z`, register/rig/arm_thumb for thumb) now unused — `draw_fingers.cjs` removed; tidy the
    rest at phase-end. Build clean, `hand_thumb.webp` (8 KB) in dist. **Total spent 0.45 cr, bal 8.20.**
- 2026-06-23: **Phase 2 DROPPED** (see Phase 2 above) and **Phase 3 BUILT (0 cr).** Added
  neutral-zone + cursor-zone avatar-driven demos. Extended `Avatar` with
  `HAND_REST`/`setArm`/`setPose`/`onFrame`/`onAfterDraw`; new `zoneDemos.js`; `.zone-demo` CSS +
  canvases in popup.html (Neutral-zone details + #cursor section); `initZoneDemos()` wired in
  popup.js. Hand position measured (`measure_hands.cjs`: centroid ≈ [800,290] asset px). Faithful
  render check (`verify_zones.cjs` → `verify_zones.png`) looks correct. Build clean. **Next: user
  confirms live; then Phase 4 (dos & don'ts).**
- 2026-06-23: **Committed the foundation+zones** (commit `b550187`, pushed): avatar.js, zoneDemos.js,
  deleted mascot.js, 6 webp assets, pipeline `.cjs`; removed unused `three` dep; gitignored
  `avatar-assets/**/*.png` (45 MB scratch kept out of git). **Phase 4 BUILT (0 cr).** `Avatar` got a
  reusable whole-avatar `transform` (scale/dx/dy/rot/origin) + `setTransform()`; new `dosDonts.js`
  renders 4 ✓/✗ pairs (Distance/Framing/Reset/Lighting) into the `#tutorial` section. Dropped the
  palm-vs-angled and deliberate-vs-flailing pairs (no faithful 0-cr composition / redundant). Faithful
  check `verify_dosdonts.cjs` → `verify_dosdonts.png` confirms identity + clear contrasts. Build clean.
  **Next: user confirms Phases 3 & 4 live; then Phase 5 (interactivity/idle life).**
