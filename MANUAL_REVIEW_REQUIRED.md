# Manual Review Required — P1 Milestone Gate

All P1 autonomous (Tier A) checks have passed. The following checks require
a human with a running Chrome instance and webcam.

## How to load the extension for testing

1. Run `npm run build` (already done — dist/ is up to date)
2. Open `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → select the `dist/` folder
5. Enable Wavr by clicking its icon in the toolbar

---

## Tier B checklist — P1 gate

Mark each item ✓ or ✗. All must pass before P2 work begins.

### Extension load
- [ ] Extension loads in Chrome without errors in `chrome://extensions`
- [ ] Service worker shows as "active" in the background inspector (Inspect views: service worker)

### Keep-alive (P1-001)
- [ ] Enable Wavr, leave a tab open for 2+ minutes without moving the mouse
- [ ] After 2 minutes, perform a hand gesture — it must still trigger an action
- [ ] (Previous behaviour: gestures stopped working after ~30s of inactivity)

### Gesture confidence threshold (P1-003)
- [ ] Hold an ambiguous hand pose (halfway between Open Palm and Closed Fist)
- [ ] Verify the gesture does NOT fire unintended actions
- [ ] Clear Open Palm swipe still triggers scroll correctly

### Core gesture flow
- [ ] Webcam feed appears in PiP overlay within 3 seconds of enabling
- [ ] Open palm swipe up → scroll up
- [ ] Open palm swipe down → scroll down
- [ ] Dead zone resets correctly after a gesture fires
- [ ] 600ms cooldown prevents gesture double-firing
- [ ] PiP canvas stays live (not frozen) when hand leaves the frame

### Overlay
- [ ] Overlay injects into https:// pages without JS errors in DevTools console
- [ ] Shadow DOM isolation: no style bleed into host page elements
- [ ] Overlay is draggable and stays within viewport
- [ ] Overlay does NOT appear on chrome:// pages
- [ ] Minimize/expand button works correctly
- [ ] Close button (✕) stops Wavr

### Popup
- [ ] Popup opens without JS errors in DevTools console
- [ ] Gesture map saves and persists across popup closes
- [ ] Export/import round-trip: export code, import it back, verify all 16 mappings match

### Cursor mode
- [ ] Thumb Up held ≥400ms toggles cursor mode on
- [ ] Green cursor dot appears on the page
- [ ] Open Palm moves the cursor dot
- [ ] Closed Fist clicks at the cursor position
- [ ] Thumb Up held again toggles cursor mode off, dot disappears
- [ ] Open a new tab while cursor mode is active → cursor dot appears immediately

### Error states
- [ ] Camera denied (revoke permission in chrome://settings) → appropriate message in PiP overlay

---

## Pass criteria

All items above must be ✓. If any item fails, note the specific failure and
return to the agent with details so it can be added to the backlog as P0.

Once all items pass, reply **"manual review passed"** to continue to P2 iteration.
