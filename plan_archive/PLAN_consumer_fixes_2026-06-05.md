# PLAN — Consumer Usability Fixes (2026-06-04)

Status legend: todo / in-progress / done

> Root cause document: [CONSUMER_DIAGNOSIS_2026-06-04.md](CONSUMER_DIAGNOSIS_2026-06-04.md)
> Biggest trust killers: cursor click silent failure, unclear feedback when hand drifts out, dead-zone confusion.
> Order of phases reflects CWS rating impact — Phase A and B are the highest-leverage fixes.

---

## Phase 0 — Diagnose (done)
Captured in [CONSUMER_DIAGNOSIS_2026-06-04.md](CONSUMER_DIAGNOSIS_2026-06-04.md). All items below are drawn from that diagnosis.

---

## Phase A — Quick trust wins (no architecture change)

### A1) Gate gesture feedback on real action success (done)
**Files:** `src/background/background.js`, `src/content/overlay.js`
- allFrames fallback now sends `SCROLL_NOOP` to overlay if no frame returned true.
- Overlay handles `SCROLL_NOOP`: shows "No scroll target here" for 1.5s, then resets.

### A2) Replace "waiting" overlay text with plain-language guidance (done)
**File:** `src/content/overlay.js`
- Idle text changed from "● waiting" → "Move hand into view" (pulsing animation).
- "● detecting" → "● ready" when hand is in frame.
- "↩ return to center" → "↩ return to circle".

### A3) Make camera preview opt-in in options page (done)
**Files:** `src/popup/popup.js`, `src/popup/popup.html`
- Removed `startCamera()` auto-call on page load.
- Renamed "Enable Camera" button → "Start Preview" (button already existed in permCard).
- Camera only starts on explicit click; first-run wizard flow unchanged.

---

## Phase B — Cursor click reliability (core bug fix)

### B1) Fix click sequence: show dwell ring during open-palm phase (done)
**Files:** `src/offscreen/offscreen.js`, `src/content/overlay.js`
- `CURSOR_STATE` now carries `dwellProgress` (0–1) computed from `handOpenSince`.
- Overlay drives `stroke-dashoffset` on `cursorDwellCircle` directly (JS replaces CSS animation).
- Ring fills during palm hold; snaps to full (0) when fist closes.

### B2) Restrict click targets to reliable elements by default (done)
**Files:** `src/content/overlay.js`, `src/popup/popup.html`, `src/popup/popup.js`
- `isReliableClickTarget()` allows `a, button, input, label, select, textarea` + ARIA roles.
- `fireCursorClick()` blocks click + shows feedback when target fails check (unless `advancedClickTargets` is on).
- "Advanced click targets" toggle added to cursor settings card; saved/loaded via storage.

### B3) Add "not clickable" overlay feedback (done)
**File:** `src/content/overlay.js`
- Blocked click: cursor dot turns red (`blocked-flash` animation), gesture bar shows "Not clickable here" for 1.5 s.

---

## Phase C — First-use guidance

### C1) Add hand-position coach to overlay (done)
**File:** `src/content/overlay.js`
- `.coach-hint` element added to camera area: "Keep hand at arm's length".
- `drawState()` tracks `coachHandSince`; fades hint after 3 s of continuous detection; won't re-show after dismissed within the same tab session.

### C2) One-time mirror camera suggestion (done)
**Files:** `src/content/overlay.js`, `src/background/background.js`
- Background tracks `lateralStreak`; after 4 consecutive same-direction lateral gestures, checks `mirrorSuggestionShown` in storage and routes `MIRROR_SUGGEST` to overlay (sets flag so it shows only once ever).
- Overlay shows a dismissable pill: "Gestures inverted? Try Mirror X in Settings." with Open / × buttons.

### C3) Rename "dead zone" → "Neutral zone" everywhere (done)
**Files:** `src/popup/popup.html`, `src/popup/preview-detect.js`, `src/content/overlay.js`
- All user-facing "dead zone" strings changed to "Neutral zone".
- Tooltip added to both labels: "The resting area where your hand pauses between gestures."
- Internal variable names (`deadZoneRadius`, etc.) and storage keys left unchanged.

---

## Phase D — Gesture engine reliability

### D1) Review dead-zone reset logic for slow/small-motion users (done)
**Files:** `src/offscreen/offscreen.js`
- Added 3-second time-based auto-release fallback in both cursor-mode and swipe-mode reset gates.
- `waitingForResetSince` timestamp recorded when gate is set; gate releases if elapsed > 3000ms.
- Dev-mode `debug()` logging on auto-release and on gate set events.
- Gate and `lastPose` both cleared on no-hand frame.

### D2) Pose-change scroll option (open ↔ closed) (done)
**Files:** `src/offscreen/offscreen.js`, `src/background/background.js`, `src/popup/popup.html`, `src/popup/popup.js`
- Open→Closed fires `SCROLL_DOWN`; Closed→Open fires `SCROLL_UP` when `poseChangeScroll` is enabled.
- Toggle added to Settings section (before gesture accordions); off by default.
- `SET_POSE_CHANGE_SCROLL` message handler in offscreen; `poseChangeScroll` forwarded from background on storage change and included in `GET_GESTURE_MAP` response.
- `lastPose` nulled on thumb-up frames and no-hand frames to prevent false transitions.

---

## Phase E — Settings simplification

### E1) Collapse advanced controls behind an accordion (done)
**Files:** `src/popup/popup.html`
- Neutral zone anchor + zone size collapsed behind `<details class="settings-details">` in bento-camera tile; Mirror X stays visible above.
- Cursor zone width/height/status/reset collapsed behind `<details>` in cursor live card; Mirror X moved to top of zone-controls.
- CSS `.settings-details` with animated `›` chevron added.

### E2) Reorder settings by user intent (done)
**Files:** no change needed
- Existing order already follows "Get it working → Improve tracking → Customize gestures". Mirror X is now at the top of both cards, followed by advanced details.

### E3) Plain-language labels (done)
**File:** `src/popup/popup.html`
- "Active area for cursor control" is now the `<summary>` text for the cursor zone details.
- "Neutral zone size" / "Neutral zone anchor" labels already in place (from C3).
- "Dead zone radius" (internal/storage key) intentionally unchanged.

---

## Phase F — Validation

### F1) Usability test: first scroll within 2 minutes (todo — human testing required)
- Test with a non-technical user. Pass criterion: successful scroll with zero coaching within 2 minutes of install.
- Cursor click: verify on links, buttons, inputs on a standard page and on a Google Docs iframe.
- Confirm "No scroll target here" fires on a page with no scrollable area.

### F2) Regression checklist (todo — human testing required)
- All 4 poses × 4 swipe directions fire correctly in scroll mode.
- Dwell ring appears during open-palm hold; click fires on button/link; "Not clickable" shows on plain div.
- New tab / close tab / go back / go forward still work.
- Preview does NOT auto-start; Start Preview button starts it correctly.
- No cursor zone rectangle visible in scroll mode (overlay pitfall #1 from CLAUDE.md).
- Mirror X toggle works in both modes.
- Pose-change scroll: enable toggle, open→close scrolls down, close→open scrolls up.
- Neutral zone details collapsed by default; Mirror X visible above it.
- Build passes (`npm run build`) with no errors or new warnings. ✓
