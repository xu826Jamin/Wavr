# Wavr — Backlog (Session 2, rebuilt from Phase 1+2 findings)

Generated from Phase 2 product design audit (code-verified). Every item has an identified
source observation and verified broken/missing behaviour.

---

### P0 — Critical (crashes, data loss, core gesture broken, security issue)

- [x] [P0-001] **Camera error not surfaced in PiP overlay** — DONE [pending] — When getUserMedia fails (permission denied or no hardware), `offscreen.js` catches the error and calls `console.error` only. The PiP overlay shows "Starting camera…" indefinitely. User has zero indication of what went wrong and no recovery path. Fix: send CAMERA_ERROR message from offscreen; overlay.js shows actionable error text with link guidance. Source: Phase 2 audit — Error states §Camera denied.

- [ ] [P0-002] **Document drag listeners accumulate on every toggle cycle** — `setupDrag()` in overlay.js attaches anonymous `mousemove` and `mouseup` listeners to `document`. These cannot be removed. Each enable→disable→enable cycle adds new persistent listeners. After 10 toggles: 10 mousemove listeners firing on every mouse movement. Verified: no removeEventListener call anywhere for these. Source: Phase 2 audit — Memory management.

---

### P1 — High impact (noticed in 10 min; known silent-failure risk)

- [ ] [P1-001] **Onboarding step 3 auto-completes without a real gesture** — `frWatchGesture()` sets a MutationObserver on `#gestureIndicator`. The first mutation fires when `processFrame()` writes "No gesture detected" (within 33ms of camera start). Since that string is truthy, `if (text && !done)` is true → `frFinish()` after 1000ms. Users never perform an actual gesture during step 3. The tutorial is silently broken. Source: Phase 2 audit — code trace popup.js:495-511.

- [ ] [P1-002] **Offscreen crash = permanent silent failure** — `chrome.alarms.onAlarm` handler (background.js:306-310) clears the alarm when offscreen is gone, but does NOT recover or broadcast `HIDE_OVERLAY`. If offscreen crashes (memory pressure, Chrome policy kill), gestures stop working forever in the current session. The user sees no message and the PiP stays visible (frozen feed, no detection). Source: Phase 2 audit — Error states §Offscreen crashes.

- [ ] [P1-003] **No gesture cooldown visual indicator** — After a gesture fires, a 600ms cooldown blocks the next gesture. During this period, hand movements are silently ignored. The "↩ Return here" dead zone message is about position, not timing. Users think the extension froze. Should show a brief timer or progress indicator during cooldown. Source: Phase 2 audit — Gesture feedback loop.

- [ ] [P1-004] **`getScrollTarget()` scans all DOM elements on every gesture** — `background.js:254` calls `document.querySelectorAll('*')` inside `scripting.executeScript`. On pages with 3000–10000 elements (GMail, YouTube, Amazon), this iterates a huge NodeList synchronously. Runs on every gesture. Should use smarter heuristics: check `document.scrollingElement`, then body children, before falling back. Source: Phase 2 audit — getScrollTarget O(n) finding.

- [ ] [P1-005] **Overlay anonymous chrome.runtime.onMessage listener cannot be removed** — `overlay.js:787` registers the message handler as an anonymous arrow function. When `hideWidget()` is called, the widget DOM is removed but the message listener persists. On the next `showWidget()`, a second anonymous listener is added. Gesture events reach both listeners. After N toggles: N listeners. Source: Phase 2 audit — Memory management.

- [ ] [P1-006] **No "extension can't work here" indicator for chrome:// and PDF tabs** — When the user is on a `chrome://` tab, `about:` page, or PDF, gestures execute `scripting.executeScript` which silently fails. The PiP overlay stays visible and the gesture label fires normally, making the user think the gesture worked. Should detect and show a message like "Gestures inactive on this page." Source: Phase 2 audit — Error states §Tab is chrome://.

---

### P2 — Polish (noticed in 30 min; UX friction)

- [ ] [P2-001] **Scroll amount hardcoded at 400px** — `background.js:279` always passes `400` as the scroll amount. Too little on large monitors, too much on laptops. No way to configure. Add `scrollAmount` storage key (default 400, range 100–1200px), slider in popup settings, read in executeScript. Source: Phase 2 audit — Settings discoverability.

- [ ] [P2-002] **Camera denied recovery in onboarding has no actionable guidance** — When camera permission is denied, step 2 shows "Camera blocked — allow access in your browser settings" as plain text. No link, no screenshot, no indication of whether to use chrome://settings or the browser's address bar lock icon. Source: Phase 2 audit — Onboarding §Camera denied recovery.

- [ ] [P2-003] **No aria-label on overlay icon buttons** — `minBtn` (minimize) and `closeBtn` (stop) in the PiP overlay have `title` attributes but no `aria-label`. Screen readers announce the SVG content, not a human-readable name. Fails WCAG 2.1 SC 4.1.2. Source: Phase 2 audit — Accessibility.

- [ ] [P2-004] **Gesture display has no aria-live region** — When a gesture fires, `gestureBar.innerHTML` updates but no ARIA attribute announces the change to screen readers. Add `role="status"` (implicit aria-live="polite") to the gestureBar element. Source: Phase 2 audit — Accessibility.

- [ ] [P2-005] **Dead zone concept is unexplained in-UI** — The dead zone circle appears in the PiP with "↩ Return here" / "✓ Ready" labels, but there is no tooltip, info button, or description explaining what it is. First-time users wonder why they have to return to a specific spot after each gesture. Source: Phase 2 audit — Settings discoverability.

- [ ] [P2-006] **`firstRunDone` vs `onboardingComplete` storage keys are inconsistent** — background.js sets `firstRunDone` to gate the first-click behavior. popup.js reads `onboardingComplete` to show the wizard. These keys serve different but related purposes with different names. `onboardingComplete` is never set by the normal flow when firstRunDone gates first click. This means if user clicks icon directly, `firstRunDone=true` but `onboardingComplete` is unset → wizard shows on every popup open until wizard is completed. Source: Phase 2 audit — Onboarding.

- [ ] [P2-007] **Video element in PiP has no accessible description** — The `<video>` element and canvas overlays have no `aria-label` or `aria-describedby`. Screen readers have no way to understand what the camera feed shows. Should add a brief description. Source: Phase 2 audit — Accessibility.

- [ ] [P2-008] **Gesture bar `min-height: 40px` clips long gesture labels** — Gesture display labels now include confidence scores: "🖐 SWIPE UP → Scroll up (0.93)". On narrow screens or when the widget is resized, this can wrap or be clipped. The bar has fixed height. Should allow wrap or increase min-height. Source: Phase 2 audit — Visual consistency.

- [ ] [P2-009] **No hand-detection indicator in PiP** — When there's no hand in frame, the PiP just shows the camera feed with "● waiting". When a hand is detected but no gesture fires (e.g., during dead zone return), there's no positive feedback that the hand is being tracked. The buffer bar fills but only in the popup preview, not the overlay. Source: Phase 2 audit — Gesture feedback loop.

- [ ] [P2-010] **First-run wizard has no focus trap or aria-modal** — The wizard overlay covers the full popup page but has no `aria-modal="true"`, no focus trap, and no `role="dialog"`. Tab key takes focus to hidden elements behind the overlay. Source: Phase 2 audit — Accessibility.

- [ ] [P2-011] **`background.js` TOGGLE/STOP handling doesn't update `firstRunDone`** — After the first run, toggling via action.onClicked works. But `TOGGLE` from the popup doesn't update `firstRunDone`. This is fine since firstRunDone is only checked on icon click — but the two code paths (icon click vs popup toggle) are inconsistent about what triggers the offscreen lifecycle. Source: Phase 2 audit — code review.

- [ ] [P2-012] **Scroll action not dispatched to the correct tab when multiple windows are open** — `background.js:229-237` sorts tabs by `lastAccessed` and picks the most recent. But `lastAccessed` is the time the tab was last activated, not the time of the gesture. If the user is on a different window than the active tab, the wrong tab scrolls. Should use `chrome.tabs.query({ active: true, currentWindow: true })` with fallback. Source: Phase 2 audit — background.js GESTURE_DETECTED handler.

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
