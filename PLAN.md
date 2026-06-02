# Wavr — Retention Plan (Hands-Busy Reading wedge)

> Reconciled against `DIAGNOSTIC_FINDINGS.md` (six-phase teardown). Items now cite the
> phase/finding that grounds them. **Changes from the prior plan are marked `[NEW]`,
> `[SHARPENED]`, or `[DOWNGRADED]`.**

## Status legend: todo / in-progress / done

---

## Thesis

**Wedge: hands-busy reading — desk-eating primary, cooking secondary.** Derived from the
Section 4 criteria (Finding 6C/6D), not asserted: presentations fail C4 (no slide action),
sterile/medical fail C5 (false positives unacceptable), RSI fails C2/C5 (cadence + gorilla-arm
are their own strain). Hands-busy reading is the only candidate that passes C1–C4, and its
C5 failures are all in the *reliable core* — persistence, idle cost, false positives, PDF/target
handling — fixable without adding surface area.

**Indispensable moment:** greasy/occupied hands, the page needs to scroll, and reaching for the
trackpad means stopping to clean up or smudging the device — one brief raised-hand wave scrolls
it. A desk-eater hits this daily; a cook a few times a week.

**The one constraint that bounds everything (Finding 5B / H5):** when a hand is free and on the
device, the incumbent (trackpad/mouse/keyboard) beats Wavr on *every* action in the set. Wavr only
wins where touching the device is physically costly. So the plan optimizes a *small, rock-solid,
low-frequency* scroll loop and treats cursor mode, 16 mappings, and gamification as deletable.

**Make-or-break precondition (Section 6 gate) — MET.** Can false positives (Finding 3A) be driven low
*during active eating/cooking* — the worst case for incidental wrist motion? This needed the A4 fix
**and a live-hardware measurement**. ✅ Validated on real hardware: false fires are near-zero during
active eating/cooking and small intentional flicks still register, with the shipped A4 defaults
unchanged. The wedge is no longer gated on this; double-down is confirmed.

**Success metrics (instrumented locally only — nothing leaves device):**
- **Activation:** ≥3 successful `GESTURE_DETECTED` (action ≠ NONE) in the first session. Already
  counted in `background.js:273-279`; add a `firstSessionGestures` tally + timestamp.
- **7-day retention (the proof metric):** gesture fired with action ≠ NONE on ≥3 distinct calendar
  days within 7 days post-install. Add an `activeDays` set in `chrome.storage.local`; surface it to
  the user as their own streak, never phoned home.

---

## A. Reliability & feel  *(a flaky/false-firing scroller never earns trust)*

- [x] **A1 — Auto-pause inference when no hand seen for N seconds** `done`
  *Retention: high · Effort: M.* In `offscreen.js processFrame`, track `lastHandSeen`; after ~4s
  with no landmarks, drop the `setInterval(processFrame)` cadence from 33ms to ~300ms and stop the
  `VIDEO_FRAME` relay; resume full rate on hand reappearance. **Grounding (Phase 2C):** `processFrame`
  runs the expensive `recognizeForVideo` every 33ms *unconditionally* — `offscreen.js:169` executes
  before the no-hand early-return at `:171-177` — so idle cost is paid with no hand present. Biggest
  battery/trust win. Depends on nothing.
  **Done:** added `lastHandSeen`/`idle`/`frameTimer` + `setFrameRate(ms)` (clears & re-creates the
  processFrame interval). After `IDLE_AFTER_MS` (4s) with no landmarks → `idle=true`,
  `setFrameRate(IDLE_FRAME_MS=300)`, and the VIDEO_FRAME relay early-returns. Hand reappearance flips
  back to `ACTIVE_FRAME_MS=33` immediately. `lastHandSeen` seeded at loop start so idle kicks in even
  if a hand is never shown.

- [x] **A2 — Gate VIDEO_FRAME *and the PiP widget* to the active tab only** `[SHARPENED]` `done`
  *Retention: high · Effort: S/M.* Two separate fan-outs to fix (Phase 2C):
  (a) `background.js broadcastToTabs` pushes JPEG frames to *every* tab 10×/sec — send `VIDEO_FRAME`
  only to the active tab in the focused window.
  (b) `START_OVERLAY` is broadcast to *every* tab (`background.js:157`), so the PiP camera panel is
  built in **all** open tabs simultaneously, each decoding the JPEG. Build/show the widget only in the
  active tab (and self-heal on tab activation). Cuts idle CPU dramatically; pairs with A1.
  **Done:** new `overlayTabId` tracks the single overlay-owning tab. `showOverlayOnActiveTab()` builds
  the widget on the active tab of the focused window (`{active:true, lastFocusedWindow:true}`) and hides
  it on the prior owner; wired to `tabs.onActivated` + `windows.onFocusChanged` via `moveOverlayIfEnabled()`.
  VIDEO_FRAME / OVERLAY_STATE / GESTURE_DISPLAY / CURSOR_STATE|CLICK|MODE_CHANGE now `routeToOverlayTab()`
  instead of broadcasting. `GET_STATUS` from a content script returns `enabled:true` only if that tab is
  the active one (and adopts it as `overlayTabId`, re-establishing ownership after a SW restart); the
  popup (no `sender.tab`) still gets raw global state. Toggle paths collapsed into `enableWavr()`/
  `disableWavr()` helpers. HIDE_OVERLAY + CAMERA_ERROR remain broadcasts.

- [x] **A4 — Real false-positive suppression** `[SHARPENED — make-or-break]` `done · HARDWARE VALIDATED`
  *Retention: critical · Effort: M.* **Root cause (Finding 3A):** the 0.75 pose-confidence gate does
  **not** gate whether a swipe fires — only which mapping prefix is used. `pose` becomes `'None'` when
  unconfident (`offscreen.js:183`), and `isOpen = pose === 'Open_Palm' || pose === 'None'`
  (`offscreen.js:185`), so the fire condition `if (isOpen || isClosed || ...)` (`offscreen.js:314`)
  fires `open_*` (default scroll) for *any* ambiguous hand. Detection is also endpoint-only over an
  8-sample window (`detectSwipe`, `offscreen.js:135-151`), so incidental motion ≥0.12 fires.
  **Fix:** (1) treat `'None'` as no-action — require a *confident* actionable pose to fire; (2) require
  sustained/monotonic directional motion across the buffer, not just oldest-vs-newest delta;
  optionally require pose stability across the window. **This is the wedge's existential item — validate
  on real hardware during active eating/cooking, not just on review.** Validate against A3 so small
  intentional gestures still register.
  **Done (code):** (1) `isOpen` no longer includes `'None'`; firing now requires `dominantPose()` — a
  confident actionable pose held across ≥60% (`settings.poseAgree`) of the buffer — which also derives
  the mapping prefix. Ambiguous/`None` frames count toward nothing, so an unconfident hand can't fire.
  (2) `detectSwipe()` rewritten: dominant-axis net displacement must clear `velocityThreshold` AND be a
  ≥0.7 (`settings.directness`) fraction of total path travelled (monotonicity), AND off-axis travel must
  be <0.7 (`settings.axisPurity`) of dominant-axis travel — rejecting back-and-forth wander and diagonal
  flails. Applied to both swipe mode and the cursor-mode pointing/victory path.
  **A4 algorithmic pass (done):** extracted the pure core into `src/offscreen/detect.js` (imported by
  offscreen.js) and added `test/detect.test.mjs` (`npm test`, 14 cases). The pass **found and fixed a
  real bug**: the original axis-purity guard `|offNet| > |net|` was dead code (net is by construction the
  dominant axis, so off ≤ net always) — a 45° diagonal flail slipped through. Replaced with the ratio
  test + new `axisPurity` setting. Tests confirm: clean up/down/left/right swipes fire; eating jitter,
  sub-threshold motion, diagonals, and pose-flicker (None half the frames) are all suppressed; a short
  flick (dy 0.13) just over threshold still fires (A3 probe).
  **Section 6 gate — CLEARED (hardware validated):** the live eating/cooking measurement was run
  against the rebuilt `dist/`. Result: false fires near-zero during active eating/cooking AND small
  intentional flicks still register, with **no tuning changes needed** — the shipped
  `directness`/`axisPurity`/`poseAgree`/`velocityThreshold` defaults hold up on real hardware. The
  make-or-break precondition for the hands-busy reading wedge is met; double-down is confirmed.

- [ ] **A3 — Support small/lazy gestures (tunable swipe distance / buffer)** `todo`
  *Retention: high · Effort: M.* Make `velocityThreshold` (0.12) and `bufferSize` (8) tunable and lower
  defaults so a short flick registers. **Must be co-tuned with A4** — there is direct tension between
  "register small motions" and "suppress incidental motion"; treat them as one validation pass.

- [x] **A9 — Correct target-tab selection; never act on an invisible tab** `[NEW]` `done`
  *Retention: high · Effort: S.* **Grounding (Finding 4B):** `background.js:281-291` uses
  `{active:true, currentWindow:true}` (unreliable from an offscreen-driven event) and falls back to the
  most-recently-accessed eligible tab across *all windows* — so a gesture can scroll, or `CLOSE_TAB`,
  a page the user can't see. Use `lastFocusedWindow`, and if the focused tab is ineligible, do nothing
  rather than retarget a background tab. Critical because misfires reaching `CLOSE_TAB` are destructive
  (Finding 4E) — pairs with A4.
  **Done:** the `GESTURE_DETECTED` handler now resolves the target via a single
  `chrome.tabs.query({active:true, lastFocusedWindow:true})` and bails if that tab is missing or
  `isRestrictedUrl` — the all-windows most-recently-accessed fallback is gone, so a stray fire can no
  longer scroll or close a tab the user can't see.

- [x] **A7 — Scroll-target robustness for modern layouts** `[NEW]` `done`
  *Retention: high · Effort: M.* **Grounding (Finding 4D):** injected `getScrollTarget`
  (`background.js:308-325`) only checks `document.scrollingElement` then *direct* `document.body.children`,
  and `executeScript` targets the top frame only (no `allFrames`). Nested-container SPAs return the
  non-scrolling fallback, and iframed content never scrolls — the gesture fires but nothing moves.
  Improve the heuristic (deeper scan / element under the last pointer position / consider `allFrames`)
  so real reading sites actually move. A "fired but nothing happened" reads as flakiness.
  **Done:** new `getScrollTarget` tries (1) the element under the viewport centre, walking up to a
  scrollable ancestor (catches nested SPA panes the old direct-children scan missed), then (2) the page
  scroller, then (3) a bounded deep DFS for the largest scrollable container. The injected fn now
  **returns** whether it found a usable target; if the top frame returns false, the action is re-run with
  `allFrames:true` so iframed reading content (embedded docs/viewers) scrolls (avoids double-scroll in
  the common case since the fallback only fires when the top frame had nothing). Nav actions act on the
  top frame only (`window.top === window` guard).

- [x] **A8 — Don't silently misfire on PDFs (ideally support them)** `[NEW]` `done (minimum) · stretch deferred`
  *Retention: med/high · Effort: M.* **Grounding (Finding 4C):** `.pdf` is in `isRestrictedUrl`
  (`background.js:63`), so on a PDF the overlay isn't injected and a gesture scrolls a *different*
  eligible tab silently. PDFs (recipes, papers) are a core reading surface. Minimum: when the active tab
  is a PDF, do nothing instead of retargeting. Stretch: scroll Chrome's PDF viewer.
  **Done (minimum):** the silent-misfire is resolved by A9 — the `GESTURE_DETECTED` handler resolves the
  target as the active tab in the focused window and bails when it's `isRestrictedUrl` (which includes
  `.pdf`). So on a PDF the gesture now does nothing instead of scrolling another tab, and the toolbar
  badge already shows `OFF` for restricted tabs. **Stretch deferred:** in-PDF scrolling targets Chrome's
  built-in PDF plugin, whose scroll container lives in a closed extension-origin frame that content
  scripts/`executeScript` can't reliably reach; not attempting it blind without hardware to verify, as a
  broken attempt would regress the now-correct "do nothing" behaviour. Revisit if the wedge proves out
  and PDF reading is a frequent surface.

- [ ] **A5 — Make the dead-zone reset optional for repeated scrolls** `todo`
  *Retention: med · Effort: S.* The forced return-to-circle (`waitingForReset`, `offscreen.js:300-309`)
  plus 600ms cooldown plus 8-sample buffer refill makes repeat scrolling a slow multi-step cycle
  (~1 scroll/1–1.5s, Finding 3B). For repeated same-direction scrolls, replace the spatial reset with a
  short cooldown only; keep the dead zone for navigation/tab actions. Re-read CLAUDE.md pitfall #1 first.

- [ ] **A6 — Bad-lighting robustness pass** `todo`
  *Retention: med · Effort: M.* Confirm the 0.75 pose gate (`offscreen.js:183`) behaves in dim kitchen
  light; if detection collapses, surface a one-line "low light — move closer / add light" hint in the
  gesture bar rather than failing silently. Note this interacts with A4 (low confidence currently →
  `'None'` → open-fire; after A4 it will → no-action, which is correct).

## B. Activation friction  *(reach a working scroll fast, and stay on)*

- [x] **B1 — Persist enabled state + auto-resume on startup** `[SHARPENED]` `done`
  *Retention: high · Effort: M.* **Grounding (Finding 1A — highest-severity root cause):** no enabled
  flag is persisted anywhere (only `firstRunDone`/`onboardingComplete` exist); "enabled" is derived live
  from `chrome.offscreen.hasDocument()`; `onStartup`/`onInstalled` (`background.js:375-383`) never call
  `createOffscreen()`; and the keepAlive alarm handler (`:365-373`) actively *tears down* on startup. So
  Wavr is OFF after every restart with no way back. Add a `wavrEnabled` key set on toggle; on
  `onStartup`/`onInstalled`, if set, recreate the offscreen doc and broadcast `START_OVERLAY`. Foundation
  for the whole habit loop — nothing else retains users if they must re-arm daily.
  **Done:** `wavrEnabled` is now set inside `createOffscreen()` (→true) / `closeOffscreen()` (→false),
  so all four toggle paths persist intent. New `resumeIfEnabled()` recreates the offscreen doc +
  broadcasts `START_OVERLAY` on `onStartup`/`onInstalled`. The keepAlive alarm handler now re-arms via
  `resumeIfEnabled()` when `wavrEnabled` but no doc, instead of tearing the UI down. `closeOffscreen()`
  also clears the keepAlive alarm.

- [x] **B2 — First toolbar click turns Wavr ON** `[SHARPENED]` `done`
  *Retention: high · Effort: S.* **Grounding (Finding 2A):** the first `chrome.action.onClicked`
  (`background.js:142-148`) only opens the options page; the camera prompt that follows is for the
  options *preview*, not for enabling. Flip it so the first click requests camera + enables, with the
  wizard as a thin overlay, so the first interaction produces a working feed.
  **Done:** first click still opens the wizard (the thin blur-backdrop overlay) — it *must*, because an
  offscreen `getUserMedia` can't show a permission prompt, so the grant has to happen in a visible page.
  The wizard's "Allow camera" now both grants permission AND enables the live controller (B5), so the
  first real interaction yields a working on-page feed. Documented the constraint in the `onClicked`
  handler. **Note:** this means onboarding now routinely runs the preview stream + the offscreen stream
  together → makes C3 (two-camera collision) the top hardware-validation watch item.

- [x] **B5 — Finishing the wizard must leave Wavr actually ON** `[NEW]` `done`
  *Retention: high · Effort: S.* **Grounding (Finding 6B):** the wizard's "try your first gesture →
  success" is simulated by the popup's *own* preview recognizer; `frFinish` (`popup.js:497-501`) sets only
  `onboardingComplete` and no wizard path sends `TOGGLE`/creates the offscreen doc. A user completes
  onboarding and Wavr is still OFF. Make `frAllowCamera`/`frFinish` enable the real controller so the
  demoed gesture and the live tool are the same thing.
  **Done:** new idempotent `ENABLE` message in background.js (`enableWavr()` only if no offscreen doc) +
  `ensureEnabled()` in popup.js. `frAllowCamera` calls it on camera grant; `frFinish` calls it as a
  backstop guarded on `previewStream` (skip-camera users stay off rather than triggering CAMERA_ERROR).
  Used `ENABLE` not `TOGGLE` so an already-on instance isn't flipped off.

- [x] **B3 — Scroll-first defaults; demote destructive actions** `[SHARPENED]` `done`
  *Retention: high · Effort: S.* Default `gestureMap` should make open-palm up/down = scroll and add
  page-up/down (actions exist: `SCROLL_UP_PAGE`/`SCROLL_DOWN_PAGE`) so a cooking user never opens the
  16-key grid. **Also (Finding 4E):** the current default `closed_swipe_left = CLOSE_TAB` is destructive
  and reachable by a false positive — default destructive actions (CLOSE_TAB) to `NONE` for the wedge
  until A4 lands.
  **Done:** new default across all fallback copies (offscreen.js — the effective firing default since
  `GET_GESTURE_MAP` returns null on a fresh install — plus popup.js, options.js, preview-detect.js, and
  the background.js 4-key migration): open palm up/down = `SCROLL_UP`/`SCROLL_DOWN`, open palm left/right
  = `GO_BACK`/`GO_FORWARD`, **closed fist up/down = `SCROLL_UP_PAGE`/`SCROLL_DOWN_PAGE`** (page scroll
  reachable without the grid), **closed fist left/right = `NONE`** (demoted from `CLOSE_TAB`/`NEW_TAB` —
  both removed from defaults so no destructive/disruptive action is reachable by a false positive).
  Presets (Navigation Pro etc.) are opt-in and left unchanged.

- [x] **B4 — Self-heal overlay on tab/navigation reloads** `[DOWNGRADED — already works]` `done (verified)`
  *Retention: n/a.* **Grounding (Finding 1B):** the static content script (`<all_urls>`, `manifest.json:33-40`)
  auto-injects `overlay.js` on every load; the `GET_STATUS` probe (`overlay.js:899-902`) shows the widget
  if enabled; the cursor self-heals via `buildCursor()` on the next `CURSOR_STATE`. This path is sound —
  keep only a regression guard, no build work needed.

## C. Trust & resource posture

- [ ] **C3 — Prevent the two-camera collision at enable time** `[NEW]` `todo`
  *Retention: med · Effort: S.* **Grounding (Finding 2B):** the options page holds its own preview stream
  + a second MediaPipe recognizer (`popup.js:380`, `preview-detect.js:139-147`) while the offscreen doc
  opens its own (`offscreen.js:87`). Enabling Wavr while the preview is live can fail the offscreen
  `getUserMedia` → `CAMERA_ERROR` at the exact moment of enabling. Stop the preview stream when enabling
  the live controller (or coordinate a shared stream). Confirm rate on real hardware.

- [ ] **C1 — In-overlay "camera only while on / nothing leaves device" affordance** `todo`
  *Retention: med · Effort: S.* Onboarding copy already reassures (Finding 6A, `popup.html:2336`), but the
  day-to-day signal is the always-on light + PiP in (after A2) the active tab. Add the `● LIVE` badge plus
  a one-line in-widget reassurance. Cheap; addresses residual privacy unease.

- [ ] **C2 — Idle CPU budget target + verification** `todo`
  *Retention: med · Effort: S.* After A1/A2, document and spot-check idle CPU (no hand, backgrounded)
  stays near zero. Add a dev-mode log of inference rate. Prevents regressions reintroducing the drain.

## D. Habit loop  *(daily ritual, not a toy — be ruthless)*

- [ ] **D1 — Cut the share/tweet surface from the core path** `todo`
  *Retention: low (sharpens focus) · Effort: S.* Remove the per-gesture "↗ share" button
  (`overlay.js:771`) and topbar tweet; keep export/import in settings only. Frees the gesture bar for
  status that matters (A6 lighting hint, streak).

- [ ] **D2 — Replace achievements with a genuine usage streak** `todo`
  *Retention: med · Effort: M.* Repurpose the `achievements` plumbing into the `activeDays` streak from
  the metrics section ("scrolled hands-free 4 days running"). Note (Finding 4A): `gestureCount` currently
  increments even when the page didn't move — base the streak on *successful* actions, and avoid
  over-celebrating fires that may have been no-ops.

- [ ] **D3 — Recipe/long-read quick-on** `todo`
  *Retention: med · Effort: M.* Build on B1's persisted state: an optional "auto-enable on known recipe
  domains" toggle (off by default) so the tool is armed exactly at the indispensable moment. Alt+W
  already exists.

---

## Sequencing & dependencies

1. **B1 first** — without persisted/auto-resumed state, every other gain leaks out at the next restart
   (Finding 1A). Foundation.
2. **A1 + A2** (idle pause + active-tab-only frame *and widget*) — kills the battery/heat uninstall reason
   and makes "always on" affordable, which B1 makes the default.
3. **A4 + A9** together — false-positive suppression is the make-or-break, and A9 ensures a stray fire
   can't scroll/close an invisible tab while A4 is being hardened. **Gate: validate A4 on real hardware
   during active eating/cooking before proceeding** (this is the Section 6 decision point).
4. **A7 + A8** — scroll-target robustness + PDF handling so the wedge's actual reading surfaces move
   instead of silently no-op'ing (Findings 4C/4D).
5. **B2 + B5 + B3** — instant-on, wizard-enables, scroll-first/non-destructive defaults: shorten
   time-to-first-success and stop onboarding from leaving Wavr off.
6. **C/D last** — trust affordances, two-camera fix, cutting novelty, and the streak only matter once the
   loop is reliable and persistent. (C3 can move earlier if hardware shows enable-time camera failures.)

**Pitfall guardrails (CLAUDE.md — do not reintroduce):** keep `drawState`/`drawCursorZone` mode-segregated
(#1); verify message payloads carry the fields a draw fn needs (#2); self-heal from one-time messages in
per-frame handlers (#3 — B4 relies on this); `VIDEO_FRAME` must keep painting the canvas base layer while a
hand *is* present — A1/A2 must not freeze it (#4); keep the two-layer cursor transform (#5); keep relay
≥288×216 at JPEG ≥0.8 (#6).

---

## Decision line

**Double down on the hands-busy reading wedge** (Section 6 gate). Commit the next cycle to
B1 → A1/A2 → A4/A9 → A7/A8 → B2/B5/B3. The proof metric: **gesture fired with action ≠ NONE on ≥3
distinct days within 7 days of install.**

- **Pivot** if, after A4, false positives during active eating/cooking remain high on real hardware →
  next candidate: deliberate low-frequency long-form desk reading (hand intentionally idle between
  scrolls), accepting that C1 weakens.
- **Shelve** if false positives can't be controlled in *any* low-frequency context **and** idle cost
  can't be brought near zero (A1/A2 fail to land) — the tool can be neither trusted nor left armed.
