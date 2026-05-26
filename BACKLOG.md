# Wavr — Backlog

Generated from Phase 0 findings. Every item is verified against source before listing.

---

### P0 — Critical (crashes, data loss, core gesture broken, security issue)

*(None found — security baseline clean, no crashes or data loss issues identified)*

---

### P1 — High impact (noticed in 10 min; known silent-failure risk)

- [x] [P1-001] **Service worker keep-alive missing** — DONE 3dd710c — No `chrome.alarms` usage anywhere. Chrome can terminate the service worker after ~30s of inactivity (e.g., while the user reads a page). If terminated during an active gesture session, all `chrome.runtime.onMessage` handlers are dropped — `GESTURE_DETECTED` actions stop working silently until the next extension restart. Source: Phase 0.7 observation; MV3 known pitfall. Fix: register a `chrome.alarms` alarm on `onInstalled`/`onStartup` with a ≤25s interval; ping to keep the SW alive while offscreen is active.

- [x] [P1-002] **Bare `console.log` calls in offscreen.js** — DONE d9ce799 — Two violations of the no-bare-console rule. `offscreen.js:87` logs `'wavr: ready'` and `offscreen.js:313` logs `'Gesture:', gesture, '->', action`. Per coding standards all logging must go through `debug()`. These expose internal state in production. Source: Phase 0.5 code review / coding standards.

- [ ] [P1-003] **No gesture confidence threshold** — `offscreen.js:163` reads `results.gestures?.[0]?.[0]?.categoryName` without checking the accompanying `score` (confidence). MediaPipe can return low-confidence classifications (e.g. 0.45 for "Closed_Fist" when the hand is ambiguous). This causes false-positive gesture fires. Fix: add `score >= 0.75` guard before treating a pose as classified. Source: Phase 0.7 code inspection.

- [ ] [P1-004] **`content.js` is unreferenced dead code** — `src/content/content.js` is an old prototype that implements its own gesture recognizer + camera stream + overlay. It is NOT referenced in the manifest or injected by background.js. If ever accidentally reactivated it would open a second camera stream per tab. It must be deleted. Verify with: `grep -rn "content.js" src/ manifest.json dist/manifest.json`. Source: Phase 0.7 code read.

- [ ] [P1-005] **`offscreen.js` GET_GESTURE_MAP callback has no error guard** — `offscreen.js:88` calls `chrome.runtime.sendMessage({ type: 'GET_GESTURE_MAP' }, (response) => { ... })` without checking `chrome.runtime.lastError`. If the background SW is mid-restart when this fires, `response` is undefined and the callback silently skips loading settings — leaving offscreen with default gesture map instead of user's map. Fix: add `if (chrome.runtime.lastError) { ... retry or log }` at top of callback. Source: Phase 0.7; coding standards async rule.

---

### P2 — Polish (noticed in 30 min; UX friction; code hygiene)

- [ ] [P2-001] **Dead function `startCamera()` in overlay.js** — `overlay.js:488-499` defines `startCamera(placeholder)` which opens a second camera stream. It is never called — per CLAUDE.md Rule 6, all video comes from `VIDEO_FRAME` relay. The function confuses future developers and its presence caused a real bug historically. Fix: delete the function. Source: Phase 0.7; CLAUDE.md Rule 6.

- [ ] [P2-002] **Unused variables `gestureOrigin` and `cursorZone` in preview-detect.js** — These are the 2 of the 3 baseline lint errors. `gestureOrigin` (line 22) is assigned at gesture fire time but never read back. `cursorZone` (line 26) is stored from storage but never consumed in drawing. Both are dead state. Fix: remove both variables and their assignment/storage sites. Source: Phase 0.5 lint baseline.

- [ ] [P2-003] **`shared/gestures.js` exports not consumed** — The file exports `GESTURES`, `ACTIONS`, `MESSAGES`, `DEFAULT_GESTURE_MAP`. None of these are imported by any active file (background.js, offscreen.js, overlay.js, popup.js, preview-detect.js all define their own inline constants). The file is cargo-cult dead code. Verify: `grep -rn "from.*gestures\|require.*gestures" src/`. Fix: delete the file (or keep for documentation — document decision). Source: Phase 0.7.

- [ ] [P2-004] **Mockup panel uses `setInterval` without cleanup in popup.js** — `popup.js:598` calls `setInterval(runMockStep, 2500)` and never stores the return value for cleanup. When the popup tab is closed, the interval is garbage-collected by the browser, but if the popup HTML ever re-mounts without full page reload, this would leak. Minor but violates the "every interval has a cleanup" rule. Source: Phase 0.7.

- [ ] [P2-005] **`WAVR_CWS_URL` placeholder must be replaced** — Both `overlay.js:7` and `popup.js:4` contain `https://chromewebstore.google.com/detail/wavr/placeholder`. This is the URL used in the share tweet. Until replaced with the real extension ID it generates a broken CWS link. Source: Phase 0.7; CLAUDE.md "Key constants to update".

- [ ] [P2-006] **No dwell progress indicator in cursor mode** — When the user holds a Closed Fist to trigger a click, there is no visual feedback during the `CLICK_DWELL_MS` (200ms) window. The click just fires silently. A brief fill animation or ring on the cursor would make the dwell interaction discoverable. Source: Phase 0.7 audit.

- [ ] [P2-007] **`OVERLAY_STATE` sends cursor-mode fields unnecessarily** — `offscreen.js:267-278` always includes `cursorZone` and `cursorMirrorX` in `OVERLAY_STATE` even when in scroll mode. `drawState()` ignores them correctly (CLAUDE.md Rule 1 is followed), but sending 2 extra fields per frame at 15 fps wastes message bandwidth. Fix: strip cursor-mode fields from OVERLAY_STATE. Source: Phase 0.7.

---

### P3 — Stretch (valuable but not blocking quality bar)

- [ ] [P3-001] **Gesture confidence display in PiP overlay** — Show the raw confidence score next to the gesture label so power users can tune their environment. E.g. "🖐 Swipe up → Scroll up (0.91)".

- [ ] [P3-002] **Two-hand graceful handling** — Currently only `results.landmarks[0]` is ever used. If two hands are detected, the second is silently ignored. Document this as intended behavior, or add a "two hands detected" indicator.

- [ ] [P3-003] **Velocity normalisation by aspect ratio** — The velocity threshold (0.12) is in normalised MediaPipe coords. X and Y have equal weight despite the video being 4:3. A horizontal swipe covers less normalised distance than a vertical one of the same physical magnitude. Minor calibration improvement.

- [ ] [P3-004] **Export code human-readability** — The base64-encoded gestureMap export is not user-friendly ("SU1BTk9OT1RPRkFS..."). A short URL-safe token or a more readable JSON format would improve the share experience.

---

## Item status legend

- `[ ]` — todo
- `[~]` — in-progress
- `[x]` — done (followed by commit hash)
- `[SKIPPED]` — not applicable (with evidence)
- `[BLOCKED]` — attempted, failed (with error log reference)
- `[REVERTED]` — implemented but caused regression, rolled back
