# Consumer friction audit + cursor-mode diagnosis — 2026-07-04 (v2.2.2)

A full new-user runthrough of Wavr in a real browser, plus a root-cause diagnosis of the
"cursor mode doesn't work" complaint. Everything here was observed by loading the **built
`dist/` as a real extension** in Chromium (Playwright, fake camera) — not by code reading
alone. The rig lives in [`e2e/`](e2e/) (see "Repro tooling" at the bottom). Nothing in this
document is fixed yet unless marked otherwise.

---

## 1. Cursor mode — why it "doesn't work"

Four compounding causes. A user who beats cause C (gets into cursor mode at all) then hits A
(their fist never clicks), and if the click does fire they hit B (the target is "not
clickable"). Each stage silently eats the intent, so the whole feature reads as dead.

### A. The open→fist click almost never fires (code-traced, high confidence)
`src/offscreen/offscreen.js` (cursor-mode click logic, ~lines 247–261): a click requires the
pose to go **directly** from confident `Open_Palm` (score ≥ 0.75) to confident `Closed_Fist`
between consecutive 33 ms frames, because *any* other frame — including the low-confidence
`'None'` frames that a half-closed hand inevitably produces mid-transition — falls into the
`else { handWasOpen = false; }` branch and disarms the click state machine:

```js
if (isOpen) { ... handWasOpen = true; }
else if (isClosed) { if (handWasOpen && ...) { fire click } else { handWasOpen = false; } }
else { handWasOpen = false; }   // ← 'None' transition frames land here and disarm
```

Closing a hand takes ~100–300 ms (3–9 frames), most of them ambiguous, so `handWasOpen` is
false by the time the fist is recognized. Clicking only works when the classifier happens to
jump straight from ≥0.75 open to ≥0.75 fist — which is why it *occasionally* works and feels
random. The comment says the branch exists to stop pointing/victory→fist misfires; it should
disarm only on **confident** other poses (`Pointing_Up`/`Victory`) and tolerate `'None'`
frames within a short grace window (e.g. keep armed through ≤300 ms of ambiguity).

### B. Click targets: only the exact topmost element is checked — VERIFIED in real browser
`isReliableClickTarget()` in `src/content/overlay.js` checks the tag/role of the *exact*
element under the cursor with **no ancestor walk**. Real buttons and links almost always have
an inner element (span label, img thumbnail) on top. Measured with `e2e/cursor_click_test.cjs`
(real extension, real `CURSOR_CLICK` messages), default settings:

| Target under cursor                        | Result                       |
|--------------------------------------------|------------------------------|
| bare `<button>`                             | ✅ click fires                |
| `<img>` inside `<a href>` (YouTube thumbnail shape) | ❌ blocked, "Not clickable here" |
| `<span>` label inside a `<button>`          | ❌ blocked — **standard buttons fail** |
| styled `<div cursor:pointer>` + JS handler  | ❌ blocked (B2 by design, but adds to the impression) |

With `advancedClickTargets: true` the same clicks work (the `<a>` even navigates — synthetic
clicks do run anchor activation). Fix: walk up with
`el.closest('a,button,input,label,select,textarea,[role=button],…')` (bounded, e.g. 5 levels)
before declaring a target unreliable, and dispatch on the matched ancestor.

### C. Getting INTO cursor mode is flaky and gives no feedback (code-traced)
The Thumb_Up hold (`THUMB_UP_HOLD_MS` = 400 ms) requires score ≥ 0.75 on **every** 33 ms
frame; a single sub-threshold frame runs the `else { thumbUpStart = 0; ... }` branch and
restarts the hold from zero. Thumbs-up is a pose MediaPipe scores erratically at webcam
angles, so many users can never accumulate 400 clean ms. And during the hold the on-page
widget shows **nothing** (the options-page preview shows "👍 Hold for cursor mode…", the real
overlay doesn't), so users don't even learn that holding longer would work. Fix: allow short
dropouts (e.g. reset only after ~150 ms below threshold) and show a hold-progress indicator
in the gesture bar.

### D. Secondary limiters (once A–C are beaten)
- Synthetic clicks are untrusted, **mouse-events only** (`mousedown/mouseup/click`; no
  `pointerdown/pointerup`) — apps that listen for pointer events or check `isTrusted`
  (video players, some React UIs) ignore them.
- No persistent "cursor mode is ON" indicator — the "👍 Cursor ON" label lasts 1.5 s, then
  the bar returns to "Move hand into view"; nothing reminds you how to exit (hold 👍 again).
- Default cursor zone is 60%×60% centred; the screen corners require holding your hand at
  the very edge of the zone, and outside the zone the dot silently freezes.

---

## 2. Startup "freeze" — FIXED in v2.2.2 (commit 85dbcae)

For the record: "extension freezes on startup" was the PiP camera feed, not the page. The A1
idle throttle stopped the `VIDEO_FRAME` relay entirely 4 s after enable when no hand was
detected (i.e. every startup), freezing the canvas on its last frame under a "● LIVE" badge.
Fixed by keeping the relay at ~3 fps while idle (inference stays throttled). Verified: relay
9.0 fps active / 3.3 fps idle, never 0; page main thread unaffected (60 fps on youtube.com
throughout enable + steady state). Repro/verify: `e2e/freeze_repro.cjs`, `e2e/relay_check.cjs`.

---

## 3. New-user friction points (full runthrough, ranked)

Found by driving the real first-run flow: fresh profile → wizard → options tour → widget on a
content page (`e2e/walkthrough.cjs` captures every step as screenshots).

1. **Preview engine ≠ live engine.** `preview-detect.js` counts pose `'None'` as an open palm
   and uses a loose swipe check with **none** of the live engine's A4 gates (score ≥ 0.75,
   directness, axis purity, pose agreement). Gestures fire easily in the options preview and
   the wizard's "Try your first gesture", then fail on real pages — the user's first
   calibration of "how to gesture" is learned against the wrong physics. Fix: extract the
   detection params/gates into `src/shared/` and use them in both.

2. **Camera errors are invisible mid-session.** In the widget, the error placeholder sits
   *under* the canvas (DOM order), so once any frame has painted, `CAMERA_ERROR` text is
   hidden behind the last frozen frame — verified: sending `CAMERA_ERROR` changed nothing on
   screen. If Zoom steals the camera, Wavr just looks dead. Fix: z-index the placeholder above
   the canvas (or clear the canvas on error).

3. **Wizard dead-end without a camera.** "Skip for now" on the camera step still advances to
   "Try your first gesture" — a black box that can never pass, with only a dim "Skip →"
   escape. Should jump straight to finish. The same screen has zero troubleshooting hints for
   users whose hand isn't detected (lighting/distance tips exist only in Dos & Don'ts, far
   below the fold).

4. **Skip-camera users are stranded with Wavr OFF.** Nothing after the wizard says the
   toolbar icon is the on/off switch. The Setup section that explains it (below the fold)
   still reads like developer instructions — "Navigate to `chrome://extensions`… flip it on"
   — wrong for a Web-Store install.

5. **Toggling on a restricted page looks like nothing happened.** Enabling from
   `chrome://newtab` (very common) turns the camera on but shows no widget, no toast — only a
   tiny "OFF" badge. User: "I clicked it and nothing happened."

6. **Cursor mode has no persistent state indicator** (see §1D).

7. **Dev jargon + share nagging in the gesture bar.** Every gesture shows its raw confidence
   score — `🖐 SWIPE UP → Scroll up (0.93)` — and a `↗ share` button appears after *every*
   gesture.

8. **Polish:** the reaction mascot pops up on top of the "Keep hand at arm's length" coach
   hint (both bottom-right of the feed); the Alt+W toggle shortcut is never mentioned in any
   UI; CLAUDE.md still documents a `#gestures` reference section that no longer exists in
   popup.html.

Verified-solid during the same runthrough: widget self-heals across reloads/tab switches,
preset Apply is disabled until a selection, mirror-X suggestion pill, scroll-noop feedback,
accordion/settings interactions.

---

## Repro tooling (`e2e/`)

Playwright rig that loads the **built `dist/`** as a real extension (fake camera, headless;
`HEADED=1` for a visible browser). Build first (`npm run build`), then:

- `node e2e/freeze_repro.cjs [url]` — page main-thread health (rAF gaps/longtasks)
  before/during/after enable + widget feed screenshot diffing.
- `node e2e/relay_check.cjs` — counts `VIDEO_FRAME` messages inside the SW; expect ~9/s
  active, ~3.3/s idle, never 0.
- `node e2e/walkthrough.cjs` — full first-run walkthrough; screenshots every wizard step,
  options section, and widget state into `e2e/walk/`.
- `node e2e/cursor_click_test.cjs` — fires real `CURSOR_CLICK`s at a button / img-in-link /
  styled div / span-in-button, with and without `advancedClickTargets` (§1B table).

Gotchas baked into the scripts: content scripts don't inject into `data:` URLs (pages are
served over local http); the fake camera renders a static black frame in headless, so
MediaPipe never sees a hand (the idle path always triggers) and feed liveness must be
measured by counting relay messages, not by pixel-diffing.
