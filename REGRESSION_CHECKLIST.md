# Wavr — Regression Checklist

## Tier A — Autonomous checks (run after every commit)

### Build integrity
- [ ] Source compiles without errors: `npm run build` exits 0
- [ ] `dist/manifest.json` is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('dist/manifest.json','utf8'))"`
- [ ] No new lint errors vs baseline: `npx eslint src/ > lint_current.txt && diff lint_baseline.txt lint_current.txt`

### File structure
- [ ] All files referenced in `dist/manifest.json` exist in `dist/`
- [ ] No source file imports a path that doesn't exist
- [ ] No minified `dist/` file was edited directly (check `git diff --stat`)

### Code safety
- [ ] No new bare `console.log` introduced (count in `grep -rn "console\.log" src/ --exclude-dir=wasm` must not increase)
- [ ] No new `eval` or `new Function`: `grep -rn "eval\|new Function" src/ --exclude-dir=wasm`
- [ ] No new network calls: `grep -rn "fetch\|XMLHttpRequest" src/ --exclude-dir=wasm` count must not increase
- [ ] No new `innerHTML` with dynamic/external content
- [ ] Every new `addEventListener` has a corresponding named `removeEventListener` (anonymous listeners exempt only if element is immediately removed)
- [ ] Every new async function in content/offscreen context wrapped in try/catch

### Message bus integrity
- [ ] Every message type sent exists in the receiver's handler (cross-reference dependency map in DEVLOG.md)
- [ ] No new unguarded `chrome.runtime.sendMessage` — all calls handle "receiving end does not exist"
- [ ] `OVERLAY_STATE` messages: `drawState()` does not draw cursor overlays
- [ ] `CURSOR_STATE` messages: `drawCursorZone()` does not draw scroll overlays

### Storage integrity
- [ ] Every new `chrome.storage.local.set` key is read somewhere in the codebase
- [ ] No storage key was renamed without updating all readers

### Shadow DOM
- [ ] All new `attachShadow` calls use `mode: 'closed'`
- [ ] No new `:root`, `body`, or `*` selectors inside shadow styles

### Service worker safety (background.js only)
- [ ] No DOM APIs (`window`, `document`, `navigator`) used
- [ ] No `setInterval` or unbounded loops (use `chrome.alarms` for recurring work)
- [ ] All `chrome.alarms` listeners re-registered on both `onInstalled` and `onStartup`

---

## Tier B — Manual checks (milestone gates only)

These require a running Chrome instance with a webcam. The agent writes these to
`MANUAL_REVIEW_REQUIRED.md` at each milestone gate and pauses for human review.

### Extension load
- [ ] Extension loads in Chrome without errors in `chrome://extensions`
- [ ] Service worker registers without errors in background inspector

### Gesture engine
- [ ] Webcam feed appears in PiP overlay within 3 seconds of enabling
- [ ] Open palm swipe triggers scroll action
- [ ] Dead zone resets correctly after a gesture fires
- [ ] 600ms cooldown prevents gesture double-firing
- [ ] PiP overlay canvas stays live (doesn't freeze) when hand leaves frame

### Overlay
- [ ] Overlay injects into https:// page without JS errors
- [ ] Shadow DOM isolation: no style bleed into host page
- [ ] Overlay is draggable and stays within viewport
- [ ] Overlay does NOT inject into chrome:// pages
- [ ] Minimize/expand button works
- [ ] Close button stops Wavr

### Popup
- [ ] Popup opens without JS errors
- [ ] Gesture map persists across popup closes
- [ ] Export/import round-trip preserves the full gesture map
- [ ] First-run wizard shows on clean install, does not show again after completion
- [ ] Presets slide-up panel opens, applies correctly, achievement unlocks

### Cursor mode
- [ ] Thumb Up held ≥400ms toggles cursor mode on and off
- [ ] Open Palm moves cursor dot within zone boundaries
- [ ] Closed Fist dwell fires click at correct coordinates
- [ ] Cursor dot appears on newly opened tabs when cursor mode is already active
- [ ] Cursor mode disables cleanly (dot removed, no residual state)

### Error states
- [ ] Camera denied: appropriate error message shown in PiP overlay
- [ ] Service worker restart: gesture actions continue after SW reload
- [ ] Tab navigation: overlay persists correctly on same-domain navigation
