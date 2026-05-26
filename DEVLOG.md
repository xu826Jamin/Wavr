# Wavr Autonomous Agent — Development Log

## Session start: 2026-05-25

---

## Phase 0 — Environment Setup

### 0.1 — Source structure
- `src/` exists with all editable source files (background, content, offscreen, popup, shared, assets)
- `dist/` is the compiled build output (never edit directly)
- All edits go in `src/`

### 0.2 — Permissions
- Created `.claude/settings.json` with `Bash(*)` allow rule
- Verified valid JSON before proceeding

### 0.3 — Git baseline
- `git init` + `git add -A` + first commit
- Baseline commit: **a115812** — "chore: baseline snapshot before autonomous iteration"
- Remote: `https://github.com/xu826Jamin/Wavr.git`
- Branch: `main`
- Push: succeeded (new branch)
- Recovery point: `git reset --hard a115812`

### 0.4 — Tooling
- Node: v24.14.0 (✓ ≥18)
- npm: 11.9.0
- Installed eslint + prettier + globals as dev dependencies

### 0.5 — ESLint configuration
- Created `eslint.config.js` (flat config format required by ESLint 10)
- Excludes `src/assets/wasm/**` (emscripten-generated files — ~200 lint errors, not hand-written code)
- Ran baseline lint: **3 errors**
  ```
  src/content/overlay.js:488  'startCamera' is defined but never used
  src/popup/preview-detect.js:22  'gestureOrigin' is assigned but never used
  src/popup/preview-detect.js:26  'cursorZone' is assigned but never used
  ```
- Saved to `lint_baseline.txt`. FLOOR = 3 errors. No iteration may exceed this.

### 0.6 — Security baseline audit

**Network calls:**
- WASM files: `fetch`/`XMLHttpRequest` calls present — these load the wasm binary from extension-local `assets/wasm/` path (emscripten-generated bootstrap). No external calls.
- Hand-written source: ZERO network calls.

**Storage + video frames:**
- ZERO hits. No frame data, no video, no jpeg written to storage. PASS.

**Shadow DOM:**
- `overlay.js:306` — `attachShadow({ mode: 'closed' })` — cursor host. PASS.
- `overlay.js:385` — `attachShadow({ mode: 'closed' })` — PiP widget host. PASS.

**innerHTML analysis:**
- `content.js:22` — literal template string, no user-controlled content. PASS.
- `overlay.js:418,423,429` — `SVG_MINUS`, `SVG_PLUS`, `SVG_CLOSE` are string literal constants. PASS.
- `overlay.js:447,467,472,694` — literal strings. PASS.
- `popup.js:697-703` — `preset.icon` and `preset.name` come from `PRESETS` constant array (hardcoded in popup.js line 607). Not user-controlled. PASS.

**Remote URLs:**
- `WAVR_CWS_URL` — Chrome Web Store placeholder (not loaded remotely, used in twitter intent link)
- Twitter intent URLs — user-initiated sharing action, `encodeURIComponent` used correctly
- SVG namespace (`http://www.w3.org/2000/svg`) — not a network call

**host_permissions:**
- `<all_urls>` — justified by content script injection via manifest and `injectIntoExistingTabs()` in background.js

**Security verdict: NO P0 security violations found.**

### 0.7 — Source file read + dependency map

#### Files surveyed:

| File | Status | Notes |
|------|--------|-------|
| `src/background/background.js` | Active | Service worker. Full functionality. |
| `src/offscreen/offscreen.js` | Active | MediaPipe runner. Camera relay. |
| `src/content/overlay.js` | Active | PiP widget + cursor dot. Injected by manifest + background. |
| `src/content/content.js` | **DEAD CODE** | Old prototype — own camera + gesture loop, never referenced in manifest or background. NOT injected anywhere. |
| `src/popup/popup.js` | Active | Settings UI, first-run, presets, achievements |
| `src/popup/preview-detect.js` | Active | Live preview card in popup |
| `src/popup/options.js` | Active | Advanced settings page (closed/pointing/victory mappings) |
| `src/popup/nav.js` | Not read yet | Tab switching |
| `src/popup/heroCanvas.js` | Not read yet | Canvas particle background |
| `src/popup/scrollReveal.js` | Not read yet | IntersectionObserver scroll reveal |
| `src/shared/gestures.js` | Active | Exported constants — GESTURES, ACTIONS, MESSAGES, DEFAULT_GESTURE_MAP. **NOTE: not imported by any active file.** Dead exports. |
| `src/offscreen/offscreen.html` | Not read yet | |

#### Dependency map (verified against actual source):

```
offscreen.js  → sends:    [CURSOR_MODE_CHANGE, GESTURE_DISPLAY, GESTURE_DETECTED,
                           CURSOR_STATE, CURSOR_CLICK, OVERLAY_STATE, VIDEO_FRAME]
              ← receives: [SET_GESTURE_MAP, SET_DEAD_ZONE_ANCHOR, SET_DEAD_ZONE_RADIUS,
                           SET_MIRROR_X, SET_CURSOR_ZONE, SET_CURSOR_TIMINGS]
              ← (initial) sends: [GET_GESTURE_MAP] → receives response

background.js → sends (to offscreen):
                           [SET_GESTURE_MAP, SET_DEAD_ZONE_ANCHOR, SET_DEAD_ZONE_RADIUS,
                           SET_MIRROR_X, SET_CURSOR_ZONE, SET_CURSOR_TIMINGS]
              → sends (broadcast to tabs):
                           [HIDE_OVERLAY, START_OVERLAY, GESTURE_DISPLAY, VIDEO_FRAME,
                           OVERLAY_STATE, CURSOR_MODE_CHANGE, CURSOR_STATE, CURSOR_CLICK,
                           SET_MIRROR_X]
              ← receives: [TOGGLE, STOP, GET_STATUS, GET_GESTURE_MAP, OPEN_OPTIONS,
                           OPEN_URL, VIDEO_FRAME, GESTURE_DISPLAY, OVERLAY_STATE,
                           CURSOR_MODE_CHANGE, CURSOR_STATE, CURSOR_CLICK, GESTURE_DETECTED]
              → executes: [scripting.executeScript] for scroll/nav actions
              → creates/closes: offscreen document

overlay.js    ← receives: [VIDEO_FRAME, START_OVERLAY, HIDE_OVERLAY, GESTURE_DISPLAY,
                           OVERLAY_STATE, SET_MIRROR_X, CURSOR_MODE_CHANGE,
                           CURSOR_STATE, CURSOR_CLICK]
              → sends:    [GET_STATUS, STOP, OPEN_OPTIONS, OPEN_URL]

popup.js      → sends:    [GET_STATUS, TOGGLE, STOP (via STOP not used?), OPEN_OPTIONS]
              ← receives: [STATUS_CHANGED]
              ↔ storage:  [gestureMap, cursorZone, cursorMirrorX, cursorTimings,
                           achievements, onboardingComplete]

preview-detect.js → reads: storage only (no message bus)
options.js    → reads/writes: storage only (gestureMap)
```

#### Bugs and issues observed (added to backlog below):

1. **`content.js` is dead code** — old prototype, unreferenced. Contains its own camera access and gesture recognizer — if it were somehow injected, it would be a major privacy/performance issue.
2. **No `chrome.alarms` anywhere** — service worker keep-alive not implemented. Chrome can terminate the SW during a gesture session.
3. **Bare `console.log` in offscreen.js** — lines 87 and 313. Violates coding standards.
4. **No gesture confidence threshold** — `offscreen.js:163` reads `categoryName` without checking score. Low-confidence gestures fire actions.
5. **`startCamera()` in overlay.js** — dead function, never called (confirmed by CLAUDE.md Rule 6).
6. **`gestureOrigin` in preview-detect.js** — assigned but never read. Dead variable.
7. **`cursorZone` in preview-detect.js** — stored but never used in drawing.
8. **`shared/gestures.js` exports** — not imported by any active file. The codebase uses inline constants instead.
9. **`OVERLAY_STATE` sends `cursorZone` + `cursorMirrorX`** — these cursor-mode fields are included in scroll-mode messages. `drawState()` ignores them (safe, per CLAUDE.md Rule 1), but adds unnecessary bandwidth.
10. **`sendMessage` in offscreen.js:88** — `GET_GESTURE_MAP` response callback has no error check for `chrome.runtime.lastError`.

### 0.8 — REGRESSION_CHECKLIST.md
Created — see file.

### 0.9 — Baseline build
See Phase 0.9 section below.

---

## Phase 0.9 — Baseline Build Fix
(to be updated after build run)

---

## Dependency Map Update Protocol
Update this section whenever a message type, file, or storage key changes.

**Storage keys in use:**
- `gestureMap` — written by popup.js, options.js; read by background.js, offscreen.js, popup.js, preview-detect.js
- `deadZoneAnchor` — written by preview-detect.js; read by background.js, offscreen.js, preview-detect.js
- `deadZoneRadius` — written by preview-detect.js; read by background.js, offscreen.js, preview-detect.js
- `cursorMirrorX` — written by popup.js; read by background.js, offscreen.js, overlay.js, popup.js, preview-detect.js
- `cursorZone` — written by popup.js; read by background.js, offscreen.js, popup.js, preview-detect.js
- `cursorTimings` — written by popup.js; read by background.js, offscreen.js, popup.js
- `achievements` — written by background.js, popup.js; read by popup.js
- `onboardingComplete` — written by popup.js; read by popup.js
- `firstRunDone` — written by background.js; read by background.js

---

## Phase 1 — Research (Session 2, 2026-05-25)

Web searches dispatched to background research agent. Findings will be incorporated when agent completes.

Preliminary findings from code audit (verified against source):

### Finding: Document event listeners never removed
**Source:** Code audit — overlay.js:754,764
**Insight:** `setupDrag()` attaches `mousemove` and `mouseup` listeners to `document` using anonymous functions. These cannot be removed. Every call to `buildWidget()` → `showWidget()` → `setupDrag()` creates new persistent listeners. Users who toggle the extension on/off accumulate listeners.
**Applies to Wavr because:** overlay.js, setupDrag() function
**Action:** Add named references for drag listeners; remove them in hideWidget()

### Finding: Onboarding step 3 auto-completes immediately
**Source:** Code audit — popup.js:495-511, preview-detect.js:430
**Insight:** `frWatchGesture()` sets a MutationObserver on `#gestureIndicator`. The first mutation fires when processFrame sets indicator to "No gesture detected" (33ms after camera starts). Since "No gesture detected" is truthy, `if (text && !done)` triggers → frFinish() after 1s. Users never actually perform a gesture during onboarding step 3.
**Applies to Wavr because:** popup.js frWatchGesture(), preview-detect.js processFrame()
**Action:** Only call frFinish if text is not "No gesture detected" and not empty

### Finding: Camera error not surfaced to user
**Source:** Code audit — offscreen.js:121-123
**Insight:** `init()` catch block only calls `console.error()`. If getUserMedia fails (permission denied, no camera hardware), the PiP overlay shows "Starting camera…" forever. No CAMERA_ERROR message is sent. Users have no idea why the camera isn't working.
**Applies to Wavr because:** offscreen.js init(), overlay.js buildWidget()
**Action:** Send CAMERA_ERROR message from offscreen catch; handle in overlay.js to show actionable message

### Finding: Offscreen crash = silent permanent failure
**Source:** Code audit — background.js:306-310
**Insight:** The keepAlive alarm handler clears the alarm when offscreen doesn't exist (`chrome.alarms.clear('keepAlive')`), but does NOT restart it. If offscreen crashes mid-session (memory pressure, Chrome policy), gestures permanently stop working. The user sees no error and has no recovery path short of clicking the extension icon to toggle.
**Applies to Wavr because:** background.js onAlarm handler
**Action:** If offscreen is gone but Wavr should be active (track enabled state), broadcast HIDE_OVERLAY and set enabled=false, or optionally restart offscreen

### Finding: No cooldown visual indicator
**Source:** Code audit — offscreen.js settings.cooldownMs=600
**Insight:** After a gesture fires, a 600ms cooldown blocks the next gesture. During this period, users who attempt another gesture see nothing happen. The PiP shows "↩ Return here" (dead zone) but no timer. Users think the extension broke.
**Applies to Wavr because:** overlay.js gesture bar, offscreen.js
**Action:** Show a brief cooldown indicator in the gesture bar or as an overlay timer

### Finding: getScrollTarget() is O(all DOM elements)
**Source:** Code audit — background.js:254-270 (executeScript)
**Insight:** `document.querySelectorAll('*')` selects every element on the page, then iterates all of them looking for the deepest scrollable. On pages with 5000+ elements (YouTube, GMail, Amazon), this is slow. It runs on every gesture.
**Applies to Wavr because:** background.js GESTURE_DETECTED handler
**Action:** Limit querySelectorAll scope; use smarter heuristics (e.g., check only direct body children + common scrollable containers)

### Finding: Scroll amount hardcoded at 400px
**Source:** Code audit — background.js:279 `args: [action, 400]`
**Insight:** The scroll amount is always 400px regardless of device or user preference. This is too much on small laptops, not enough on large monitors. No way to configure it.
**Applies to Wavr because:** background.js executeScript, popup.js settings
**Action:** Add scrollAmount to storage settings with slider in popup; default 400px; range 100-800px

### Finding: No aria-label on overlay buttons
**Source:** Code audit — overlay.js:459,469
**Insight:** The minimize (minBtn) and close (closeBtn) buttons in the PiP overlay have `title` attribute but no `aria-label`. Screen readers announce the icon SVG content, not a human-readable label. WCAG 2.1 SC 4.1.2 requires accessible name.
**Applies to Wavr because:** overlay.js buildWidget()
**Action:** Add aria-label to both buttons

### Finding: No aria-live for gesture display
**Source:** Code audit — overlay.js:699-742 showGesture()
**Insight:** When a gesture fires, `gestureBar` innerHTML is updated. Screen reader users don't know what gesture was detected. No `aria-live` region.
**Applies to Wavr because:** overlay.js gestureBar
**Action:** Add role="status" or aria-live="polite" to gestureBar

---

## Phase 2 — Product Design Audit (Session 2, 2026-05-25)

### Onboarding (first 60 seconds) — Score: 4/10

**Observations:**
1. Step 3 auto-completes in ~1 second due to frWatchGesture bug — users never try a real gesture during setup (confirmed bug in source).
2. Camera denied recovery shows text only "Camera blocked — allow access in your browser settings" — no clickable link, no screenshot, no chrome://settings path.
3. The `firstRunDone` and `onboardingComplete` storage keys serve different purposes and are never explained to developers.
4. No gesture reference card shown during onboarding — users leave setup not knowing what poses trigger what.

### Gesture feedback loop — Score: 6/10

**Observations:**
1. Gesture label appears with emoji + action + confidence score (0.xx) ✓
2. Dead zone circle shows green/amber state with "↩ Return" label ✓
3. 600ms cooldown period has ZERO visual indication — users experience mystery non-responsiveness
4. Buffer bar fills as the wrist moves — good visual signal ✓
5. No indication when the extension is detecting vs. not detecting a hand

### Error states — Score: 3/10

**Enumerated errors and current handling:**
| Error | Current handling | Score |
|-------|-----------------|-------|
| Camera denied | Silent failure — PiP shows "Starting camera…" forever | 1/10 |
| Camera hardware unavailable | Same as above | 1/10 |
| MediaPipe model fails to load | Silent — console.error only | 1/10 |
| Tab is chrome:// / PDF | Silently skipped — no indicator | 4/10 |
| Offscreen crashes mid-session | Alarm stops, no recovery | 2/10 |
| SW terminates | keepAlive partially handles; recovery if idle | 6/10 |

### Settings discoverability — Score: 6/10

**Observations:**
1. Gesture accordion organized by pose — intuitive for users who know poses ✓
2. Gesture explorer shows what each combo does live ✓
3. "Dead zone" concept not explained anywhere in the UI — no tooltip, no description
4. Scroll amount not configurable (hardcoded 400px) — power users blocked
5. Preset descriptions are one-liners but adequate

### Visual consistency — Score: 7/10

**Observations:**
1. Color system is well-defined and consistently applied across overlay, popup ✓
2. Monospace font used for data values ✓  
3. Overlay buttons lack aria-label — not just accessibility, shows incomplete polish
4. Gesture bar uses fixed `min-height: 40px` — label can be clipped at narrow widths (confidence score makes labels longer now)

### Accessibility — Score: 2/10

**Observations:**
1. Icon buttons (minimize, close in overlay) have title but no aria-label — WCAG fail
2. Gesture display has no aria-live — screen readers miss all gesture events
3. First-run overlay has no aria-modal or focus trap — tabbing leaves the wizard
4. Status pill keyboard interaction not tested but no visible focus ring
5. The live camera feed (video element) has no aria-description
6. All canvas elements (overlay, gesture bar) have no ARIA semantics

### Top 10 problems by user impact (ranked):

1. **Camera error shows no message** — users who can't get the camera working have no path forward
2. **Onboarding step 3 never fires** — the tutorial is silently broken
3. **Offscreen crash = permanent failure** — no recovery; session dies silently
4. **Document drag listeners accumulate** — memory grows each toggle cycle
5. **Cooldown invisible to user** — random-feeling pauses destroy trust
6. **Dead zone concept unexplained** — users think the extension randomly stops
7. **No scroll amount config** — wrong default for ~50% of screens
8. **Accessibility failures** — extension completely unusable with screen reader
9. **getScrollTarget O(n)** — slow on large pages
10. **No "won't work here" indicator** — users on chrome:// tabs confused
