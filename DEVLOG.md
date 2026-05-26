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
