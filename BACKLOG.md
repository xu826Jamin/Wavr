# Wavr — Backlog (Session 2, rebuilt from Phase 1+2 findings)

Generated from Phase 2 product design audit (code-verified). Every item has an identified
source observation and verified broken/missing behaviour.

---

### P0 — Critical (crashes, data loss, core gesture broken, security issue)

- [x] [P0-001] **Camera error not surfaced in PiP overlay** — DONE 0afdb0a — When getUserMedia fails (permission denied or no hardware), `offscreen.js` catches the error and calls `console.error` only. The PiP overlay shows "Starting camera…" indefinitely. User has zero indication of what went wrong and no recovery path. Fix: send CAMERA_ERROR message from offscreen; overlay.js shows actionable error text with link guidance. Source: Phase 2 audit — Error states §Camera denied.

- [x] [P0-002] **Document drag listeners accumulate on every toggle cycle** — DONE 5e9ee24 — `setupDrag()` in overlay.js attaches anonymous `mousemove` and `mouseup` listeners to `document`. These cannot be removed. Each enable→disable→enable cycle adds new persistent listeners. After 10 toggles: 10 mousemove listeners firing on every mouse movement. Fix: named references, removed in hideWidget().

---

### P1 — High impact (noticed in 10 min; known silent-failure risk)

- [x] [P1-001] **Onboarding step 3 auto-completes without a real gesture** — DONE c6da8e9 — `frWatchGesture()` only calls `frFinish()` when text !== 'No gesture detected'. Source: Phase 2 audit — code trace popup.js:495-511.

- [x] [P1-002] **Offscreen crash = permanent silent failure** — DONE eb662eb — keepAlive alarm now broadcasts HIDE_OVERLAY + STATUS_CHANGED when offscreen is unexpectedly gone. Alarm period tightened to 0.25 min. Source: Phase 2 audit — Error states §Offscreen crashes.

- [x] [P1-003] **No gesture cooldown visual indicator** — DONE e9229bd — 2px drain bar animates from full to empty over 600ms after each gesture. Source: Phase 2 audit — Gesture feedback loop.

- [x] [P1-004] **`getScrollTarget()` scans all DOM elements on every gesture** — DONE ee0e81b — Replaced querySelectorAll('*') with: (1) document.scrollingElement, (2) activeElement ancestor walk, (3) direct body children only. Source: Phase 2 audit — getScrollTarget O(n) finding.

- [x] [P1-005] **Overlay anonymous chrome.runtime.onMessage listener cannot be removed** — DONE ed632ce — Handler named as `handleMessage`. Listener is added once due to window.__wavrLoaded guard. Source: Phase 2 audit — Memory management.

- [x] [P1-006] **No "extension can't work here" indicator for chrome:// and PDF tabs** — DONE 907cf57 — Extension icon badge shows 'OFF' on restricted tabs while Wavr is active. Source: Phase 2 audit — Error states §Tab is chrome://.

---

### P2 — Polish (noticed in 30 min; UX friction)

- [x] [P2-001] **Scroll amount hardcoded at 400px** — DONE c7ba9c8 — `scrollAmount` storage key; range slider 100–1200px in popup settings. background.js reads it on each gesture. Source: Phase 2 audit — Settings discoverability.

- [x] [P2-002] **Camera denied recovery in onboarding has no actionable guidance** — DONE 1bae618 — Shows lock-icon instructions + clickable link to chrome://settings/content/camera. Source: Phase 2 audit — Onboarding §Camera denied recovery.

- [x] [P2-003] **No aria-label on overlay icon buttons** — DONE 6243256 — minBtn and closeBtn now have aria-label with dynamic update on minimize toggle. Source: Phase 2 audit — Accessibility.

- [x] [P2-004] **Gesture display has no aria-live region** — DONE 6243256 — gestureBar has role=status + aria-live=polite. Source: Phase 2 audit — Accessibility.

- [x] [P2-005] **Dead zone concept is unexplained in-UI** — DONE b2d3262 — camera-area title attribute + first-time canvas hint text explaining the dead zone. Source: Phase 2 audit — Settings discoverability.

- [x] [P2-006] **`firstRunDone` vs `onboardingComplete` storage keys are inconsistent** — DONE 1b6a112 — If firstRunDone but not onboardingComplete, check if Wavr is enabled; if so, auto-complete onboarding. Source: Phase 2 audit — Onboarding.

- [x] [P2-007] **Video element in PiP has no accessible description** — DONE 6243256 — videoEl has aria-hidden=true + descriptive aria-label. Source: Phase 2 audit — Accessibility.

- [x] [P2-008] **Gesture bar `min-height: 40px` clips long gesture labels** — DONE fc21c16 — flex-wrap + gap added to .gesture-bar. Source: Phase 2 audit — Visual consistency.

- [x] [P2-009] **No hand-detection indicator in PiP** — DONE fc21c16 — drawState() updates idle label to '● detecting' (green) or '↩ return to center' (amber) when hand is in frame. Source: Phase 2 audit — Gesture feedback loop.

- [x] [P2-010] **First-run wizard has no focus trap or aria-modal** — DONE 1bae618 — role=dialog + aria-modal=true on overlay; Tab/Shift-Tab focus trap in popup.js. Source: Phase 2 audit — Accessibility.

- [ ] [P2-011] **`background.js` TOGGLE/STOP handling doesn't update `firstRunDone`** — After the first run, toggling via action.onClicked works. But `TOGGLE` from the popup doesn't update `firstRunDone`. This is fine since firstRunDone is only checked on icon click — but the two code paths (icon click vs popup toggle) are inconsistent about what triggers the offscreen lifecycle. Source: Phase 2 audit — code review.

- [x] [P2-012] **Scroll action not dispatched to the correct tab when multiple windows are open** — DONE f7cd7f7 — Uses active tab in current window first; falls back to lastAccessed eligible tab only if current tab is restricted. Source: Phase 2 audit — background.js GESTURE_DETECTED handler.

---

### P3 — Stretch (valuable but not blocking quality bar)

- [ ] [P3-001] **Keyboard shortcut to toggle Wavr** — Currently requires clicking the extension icon. Add a keyboard shortcut (configurable via chrome://extensions/shortcuts). Register via `commands` in manifest. Source: Phase 2 audit — UX friction.

- [ ] [P3-002] **Additional scroll actions: viewport-height jump** — SCROLL_UP and SCROLL_DOWN always move 400px. Add SCROLL_UP_PAGE / SCROLL_DOWN_PAGE that move by `window.innerHeight * 0.85` for per-page navigation (like Space/Page Down). Source: Phase 2 audit — settings discoverability.

- [ ] [P3-003] **Gesture history in PiP overlay** — Show the last 3 gestures as a brief history under the active label. Helps users understand what gesture was detected vs. what they intended. Source: competitive analysis finding.

- [ ] [P3-004] **Pose detection quality indicator** — Show a quality/confidence bar in the PiP during hand detection. If confidence is consistently near 0.75 threshold, the environment lighting is poor. Source: Phase 2 audit — Gesture feedback loop.

- [ ] [P3-005] **Tab-restricted gesture notification** — When gestures are attempted on a chrome:// tab, show a brief toast notification suggesting the user switch to a regular page. Source: Phase 2 audit — Error states §Tab is chrome://.

- [ ] [P3-006] **Scroll amount configurable per-gesture** — Different gestures could have different scroll amounts (e.g., closed fist swipe = large scroll, open palm = small scroll). Would enable more expressive gesture maps. Source: Phase 2 audit — Settings.

- [ ] [P3-007] **Mirror X applied to dead zone position** — When cursorMirrorX is enabled, the dead zone display in the preview correctly mirrors. But the anchor coordinate stored in storage is in un-mirrored MediaPipe space. This means clicking to place an anchor in the mirrored preview doesn't map correctly. Source: code review.

---

## Item status legend

- `[ ]` — todo
- `[~]` — in-progress
- `[x]` — done (followed by commit hash)
- `[SKIPPED]` — not applicable (with evidence)
- `[BLOCKED]` — attempted, failed (with error log reference)
- `[REVERTED]` — implemented but caused regression, rolled back
