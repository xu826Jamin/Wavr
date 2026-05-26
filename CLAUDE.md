# Wavr — Project Context

## Working protocol

**For any plan that spans multiple prompts:**
1. Create `PLAN.md` in the project root at the start. Track each item with status (todo / in-progress / done) and a brief note of what changed.
2. Update `PLAN.md` after every item — mark done, note the key file/change.
3. Do NOT store plan progress in memory or CLAUDE.md during the plan.
4. When the plan is fully done: summarize lasting changes into CLAUDE.md, delete `PLAN.md`, tell the user they can wipe the chat.

**Build:** Always run `npm run build` after any code change.

## What this is
Wavr is a Chrome MV3 extension that lets users control Chrome (scroll, navigate, click) using hand gestures detected by their webcam. Gesture detection runs via MediaPipe Tasks Vision (`GestureRecognizer`) in an offscreen document. No data leaves the device.

## Build
```
npm run build   # outputs to dist/
```
Zip `dist/*` for Chrome Web Store upload. Built with `vite-plugin-web-extension`.

## Architecture

| File | Role |
|---|---|
| `src/background/background.js` | Service worker. Manages offscreen doc lifecycle, broadcasts to tabs, handles all message routing, executes scroll/nav actions via `scripting.executeScript` |
| `src/offscreen/offscreen.js` | Runs MediaPipe on webcam feed, detects gestures, sends `GESTURE_DETECTED` / `GESTURE_DISPLAY` / `OVERLAY_STATE` / `CURSOR_STATE` to background |
| `src/content/overlay.js` | Injected into every page. Builds the draggable PiP widget (camera feed + gesture bar) and the cursor dot. Shadow DOM isolated. |
| `src/popup/popup.html` | Full-page options UI (set as `options_page` in manifest). Single-page with two tabs: Scroll Mode and Cursor Mode. |
| `src/popup/popup.js` | Handles all settings logic, first-run wizard, mockup panel, preset panel, accordion, share/export/import, achievements |
| `src/popup/preview-detect.js` | Runs a second MediaPipe instance in the popup for the live preview card. Draws wrist trail + dead zone on canvas. Flashes `previewArea` on gesture. |
| `src/popup/nav.js` | Tab switching with sliding indicator animation |
| `src/popup/options.html/.js` | Advanced settings page (closed_swipe_* mappings). Opened via `chrome.tabs.create` not `openOptionsPage`. |
| `src/popup/heroCanvas.js` | Canvas particle background for the hero section. 55 particles, radial vignette, mouse repulsion. Called from popup.js. |
| `src/popup/scrollReveal.js` | IntersectionObserver scroll-reveal. Queries `.reveal` elements, adds `.revealed` class on intersection, applies stagger via `data-reveal-i`. Called from popup.js. |

## Gesture system

**4 hand poses × 4 swipe directions = 16 gesture keys:**
```
open_swipe_up/down/left/right
closed_swipe_up/down/left/right
pointing_swipe_up/down/left/right
victory_swipe_up/down/left/right
```

**Available actions:** `SCROLL_UP`, `SCROLL_DOWN`, `GO_BACK`, `GO_FORWARD`, `SCROLL_TOP`, `SCROLL_BOTTOM`, `NEW_TAB`, `CLOSE_TAB`, `NONE`

**Thumb Up** (held for `THUMB_UP_HOLD_MS`) toggles cursor mode on/off.

## Storage keys (`chrome.storage.local`)

| Key | Type | Description |
|---|---|---|
| `gestureMap` | object | All 16 gesture→action mappings |
| `deadZoneAnchor` | `{x,y}` | Fixed dead zone center (null = use gesture origin) |
| `deadZoneRadius` | number | Dead zone radius in normalised coords (default 0.10) |
| `cursorMirrorX` | boolean | Flip cursor X axis |
| `cursorZone` | `{cx,cy,w,h}` | Active region for cursor mode |
| `cursorTimings` | `{thumbHoldMs,clickDwellMs}` | Cursor mode timing config |
| `onboardingComplete` | boolean | First-run wizard completed |
| `achievements` | `{gestureCount,cursorUsed,presetApplied}` | Achievement tracking |

## Key constants to update before shipping

In `src/popup/popup.js` and `src/content/overlay.js`:
```js
const WAVR_CWS_URL = 'https://chromewebstore.google.com/detail/wavr/placeholder';
```
Replace `placeholder` with the real extension ID once published.

Also update `v1.0.0` in the popup.html footer when bumping versions.

## UI structure (popup.html)

```
firstRunOverlay (3-step wizard, shown once)
topbar (logo | share btn | status pill)
tab-bar (Scroll Mode | Cursor Mode)
  panel[scroll]
    live-card (preview camera + canvas)
    #intro (hero, mockup panel, achievement shelf)
    #setup (3-step install guide)
    #gestures (gesture reference cards)
    #settings (4-group accordion: Open Palm, Closed Fist, Pointing, Victory)
  panel[cursor]
    cursor intro
    cursor-steps
    #cursor-settings (timings + mirror X)
preset-panel (slide-up sheet)
site-footer (fixed, "Made with ♥ by Wavr · v1.0.0")
```

## Cursor mode
- Toggled by holding Thumb Up for `THUMB_UP_HOLD_MS` (default 400ms)
- Open palm moves cursor, closed fist clicks
- Pointing/Victory swipes still fire their mapped actions while in cursor mode
- Cursor dot rendered in a separate shadow DOM host (`wavr-cursor-host`)

## Achievements (tracked in background.js)
- **First Wave**: `gestureCount >= 1`
- **Ten Waves**: `gestureCount >= 10`
- **Cursor Mode**: `cursorUsed === true` (set on first cursor mode activation)
- **Preset Pro**: `presetApplied === true` (set when preset panel applied)

## Presets
3 built-in presets defined in `popup.js` (`PRESETS` array): Scroll Focus, Power User, Navigation Pro. Each defines all 16 gesture keys. Applied via slide-up bottom sheet.

## Share features
- **Topbar ↗ button**: opens pre-filled tweet with CWS URL
- **Export/Import**: base64-encoded JSON of gestureMap, copy/paste via settings save row
- **Overlay tweet button**: appears in gesture bar after each gesture fires, opens tweet via `OPEN_URL` message to background

## Manifest permissions
- `offscreen` — webcam access in offscreen doc
- `activeTab` — identify target tab for gesture actions
- `scripting` — inject overlay.js and execute scroll actions
- `storage` — persist settings
- `tabs` — query tabs for broadcasting and action targeting
- `camera` (optional) — requested at runtime via `getUserMedia`
- `host_permissions: <all_urls>` — inject overlay on any page

## Chrome Web Store
- **Category**: Productivity
- **Single purpose**: "Wavr allows users to control Chrome scrolling, navigation, and clicking using hand gestures detected by their webcam."
- **Privacy**: No data collected. All processing on-device. Camera only active while enabled.
- **Remote code**: No.
- Screenshot size: 1280×800 px. Use Chrome DevTools device toolbar → set 1280×800 → Capture screenshot.

## Updating the extension
1. Make changes + `npm run build`
2. Bump `version` in `manifest.json` (and footer in popup.html)
3. Rezip `dist/*`
4. Upload on CWS developer console → Submit for review

---

## UI revamp — implemented features

The popup UI was fully redesigned across 5 phases:

- **Hero section** (`#hero`): Canvas particle background (`heroCanvas.js`), animated gradient headline (purple→white), 3D mouse-tilt showcase card with glare overlay, CTA row with spring-hover button, hero tagline.
- **Scroll-reveal**: `scrollReveal.js` uses IntersectionObserver on `.reveal` elements with stagger via `data-reveal-i`. Additional `.scroll-reveal` class used for eyebrows/sub-text/video cards.
- **Progress bar**: Fixed 2px gradient strip at top (`#scrollProgress`) using `linear-gradient(90deg, #7c3aed, var(--accent))`.
- **Section nav sidebar**: `#sectionNav` with dot + line structure; `.snav-scroll-only` vs `.snav-cursor-only` shown per active tab.
- **Bento grid** (`#intro`): 4-column asymmetric grid — hero tile (cols 1-2), count tile (col 1, row 2) with SVG arc ring, features tile (cols 2-3, row 2), camera tile (cols 3-4, spans 3 rows), achievements tile (cols 1-3, row 3).
- **Gesture explorer** (`#gesture-explorer`): Interactive pose-chip + D-pad picker; animated browser mockup reacts to each combo (scroll, navigation, tab operations); reads live from `chrome.storage`.
- **Accordion spring physics**: JS height animation with `scrollHeight` transitions; open accordion initializes to `height: auto`; header flashes `--accent-dim` on open.
- **Gesture row cards**: `.gesture-row-card` replaces old `.gesture-row` — SVG directional chevron icons, monospace gesture key labels (e.g. "Open Palm ↑"), directional nudge on hover.
- **Save button animation**: `.saving` (disabled state), `.saved` (green border + springPop animation) states on the settings save button.
- **Accordion summary flash**: `.accord-sum.flash` animation fires when any select in the group changes.
- **First-run overlay**: `backdrop-filter: blur(20px)` background; step transitions use `frSlideOut`/`frSlideIn` keyframes (translateX ±20px).
- **Footer glow**: `::before` radial-gradient ambient blush; version number uses monospace font.
- **Topbar shadow**: `.topbar.scrolled` class added via `window.scroll` event when `scrollY > 80`.
- **Custom toggle**: `.wavr-toggle` with ripple animation on change, used for Mirror X toggles.
- **Ambient cursor glow**: `#ambientGlow` (720px radial, GPU-composited) follows cursor with lerp.

### CSS classes added by popup.js (not to remove)
`.accord-open` (on `.accord-header` and `.accord-body`), `.revealed` (scroll reveal), `.in-view` (scroll-reveal secondary), `.scrolled` (topbar), `.saving`/`.saved` (save button), `.flash` (accord-sum), `.fr-exiting`/`.fr-entering` (first-run steps), `.just-unlocked` (achieve-card), `.unlocked` (achieve-card), `.fire` (wavr-toggle-ripple).

---

## Design system (target aesthetic)

### Aesthetic goal
Ultra-premium tech product landing page. Think Vercel, Linear, or Raycast — high-contrast dark mode, deep blacks, subtle glowing borders, sharp geometric layouts. Every surface should feel like it belongs in a hardware reveal or a GPU launch page.

### Color tokens
```css
--bg-base:      #080808;   /* deepest black — body background */
--bg-surface:   #0f0f0f;   /* card/panel surfaces */
--bg-raised:    #141414;   /* nested elements, inputs */
--bg-hover:     #1a1a1a;   /* hover states */
--border-sub:   #1e1e1e;   /* subtle dividers */
--border-mid:   #252525;   /* card borders */
--border-hi:    #333333;   /* prominent borders, focused inputs */
--accent:       #4ade80;   /* primary green (status, CTAs, highlights) */
--accent-glow:  rgba(74,222,128,0.18); /* glow halos */
--accent-dim:   rgba(74,222,128,0.06); /* tinted fills */
--text-primary: #ffffff;
--text-secondary: #888888;
--text-muted:   #555555;
--text-disabled: #333333;
--red:          #f87171;   /* error/bad states */
```

### Typography
- **Display headers** (`section-heading`, `fr-heading`, `page-heading`): 800 weight, tight letter-spacing (`-0.8px` to `-1.2px`), large scale (32–48px). Apply gradient mask for hero-level headings:
  ```css
  background: linear-gradient(135deg, #fff 40%, #555 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  ```
- **Eyebrows / labels**: 11px, uppercase, `letter-spacing: 1px`, `font-weight: 600`, accent green.
- **Subtext / technical labels**: Use `font-family: 'SF Mono', ui-monospace, 'Cascadia Code', monospace` for anything that reads as data, code, or a technical value (dead zone coords, timing values, version strings, status labels, gesture key names, export codes).
- **Body copy**: 14–15px, `color: #888`, `line-height: 1.65`.
- **UI labels / card titles**: 13–14px, `color: #888`, system font.

### Glow & shadow system
```css
/* Subtle ambient glow on interactive cards */
--glow-sm:  0 0 0 1px rgba(74,222,128,0.12), 0 0 12px rgba(74,222,128,0.08);
/* Active / focused states */
--glow-md:  0 0 0 2px rgba(74,222,128,0.25), 0 0 24px rgba(74,222,128,0.12);
/* Pulse highlight (gesture fired, achievement unlocked) */
--glow-lg:  0 0 0 3px rgba(74,222,128,0.5),  0 0 40px rgba(74,222,128,0.2);
/* Card depth shadow (no color) */
--shadow-card: 0 1px 3px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4);
```
Apply `--glow-sm` on card hover, `--glow-md` on focus/active, `--glow-lg` for flash animations.

### Borders
- Cards use `1px solid var(--border-mid)` by default; on hover transition to `var(--border-hi)`.
- Use `border-radius: 16px` for large cards, `12px` for medium, `8px` for inline chips/inputs.
- Topbar / tab bar use `border-bottom: 1px solid var(--border-sub)`.
- Active/selected state: `1px solid rgba(74,222,128,0.35)` + `--glow-sm`.

### Bento-box layout
Planned redesign of the intro and settings sections into an asymmetric bento grid. Key rules:
- Grid gap: `12px`
- Tiles span 1, 2, or 3 columns depending on content weight
- Each tile is a `border-radius: 16px` card with `padding: 24px`
- No tile should feel the same size as its neighbor — vary height via `grid-row: span N`
- Background: `var(--bg-raised)` with a very subtle top-edge highlight: `border-top: 1px solid rgba(255,255,255,0.04)`

### Animation & interactivity
All transitions use `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard ease) or a spring-like overshoot for entrance animations.

```css
/* Standard interactive transition */
transition: border-color 0.2s cubic-bezier(0.4,0,0.2,1),
            box-shadow   0.2s cubic-bezier(0.4,0,0.2,1),
            color        0.2s cubic-bezier(0.4,0,0.2,1);

/* Panel/section entrance */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Spring pop for achievement unlock / glow flash */
@keyframes springPop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.06); }
  70%  { transform: scale(0.97); }
  100% { transform: scale(1); }
}
```

Physics-based feel is achieved through staggered delays on grid children (`animation-delay: calc(var(--i) * 50ms)`) and the spring keyframe above.

### Current aesthetic gap (what to change)
The existing UI already has:
- Deep dark background ✓
- Green accent ✓
- Thin borders ✓
- Backdrop-blur topbar ✓

What it's missing vs. the target:
- Gradient-masked hero text (headers are flat white)
- Monospace font on data/technical values (currently inherits system font)
- Glowing box-shadows on hover/active states (currently only border-color changes)
- Bento-grid asymmetric layout (currently linear vertical sections)
- Staggered entrance animations (currently one flat `panelFadeIn`)
- Deep `#080808` base vs current `#0f0f0f` (minor, but push deeper)
- Card `box-shadow` depth (currently zero shadow)

---

## Overlay / Cursor — known pitfalls and rules

These were discovered through bugs introduced during development. Read before touching `overlay.js` or `offscreen.js`.

### 1. Mode-segregated drawing — never cross-draw
`drawState()` is scroll-mode only (called on `OVERLAY_STATE`). `drawCursorZone()` is cursor-mode only (called on `CURSOR_STATE`). They must not render each other's overlays.

**What went wrong:** `drawState()` was drawing the cursor zone rectangle because `OVERLAY_STATE` always included the `cursorZone` field and the function unconditionally drew it. The cursor zone rectangle appeared on screen even when cursor mode was off.

**Rule:** If a field exists in a message, the drawing function must guard with an explicit mode/state check before drawing it. Better: don't include cursor-mode fields in `OVERLAY_STATE` at all — and don't include scroll-mode fields in `CURSOR_STATE`.

### 2. Message fields must match what the drawing function needs
When adding a new visual to a drawing function, check that the corresponding message actually sends the required fields.

**What went wrong:** `drawCursorZone()` needed to draw the wrist dot in cursor mode, but `CURSOR_STATE` only carried `x`/`y` (mapped screen position) — not `wristX`/`wristY` (raw camera position needed to draw on the PiP canvas). The wrist dot was invisible in cursor mode.

**Rule:** Before writing the drawing code, verify the message payload. If a field is missing, add it to the `sendMessage` call in `offscreen.js` first.

### 3. State-change messages are not replayed for new tabs
`CURSOR_MODE_CHANGE` is only sent when cursor mode toggles. A tab that loads while cursor mode is already active never receives it, so `buildCursor()` is never called, `cursorDot` stays null, and `updateCursor()` silently returns early — no cursor dot ever appears.

**What went wrong:** User enabled cursor mode, navigated to a new tab, no cursor dot appeared.

**Rule:** Any component that initialises from a one-time message must self-heal in its per-frame update handler. In `updateCursor()`: `if (!cursorDot) buildCursor();`. Do not assume the setup message was received.

### 4. Canvas only repaints when gesture messages arrive — VIDEO_FRAME does not repaint it
`OVERLAY_STATE` and `CURSOR_STATE` are only sent when a hand is detected. Without a hand in frame, neither message fires and the PiP canvas freezes on the last frame (or stays black if no hand was ever detected).

**What went wrong:** Camera feed appeared to stop working whenever the user's hand left the frame, because the canvas stopped updating even though `VIDEO_FRAME` messages (with the live camera image) were still arriving every 100 ms.

**Rule:** `VIDEO_FRAME` must paint directly to the canvas as the base layer (via the `drawFrame()` helper). Gesture overlay functions (`drawState`, `drawCursorZone`) call `drawFrame()` first and then draw their overlays on top. This ensures the camera feed is always live at ~10 fps regardless of hand detection.

### 5. CSS `@keyframes` `transform` conflicts with JS inline `transform`
`@keyframes` animations win over inline `style` attribute values for the same property. If you set `element.style.transform = 'translate(...)'` and then apply a `@keyframes` animation that also sets `transform: scale(...)`, the animation overrides the translate — the element jumps to the origin during the animation.

**What went wrong:** The old click animation (`gs-click`) set `transform: scale(...)` on the same element whose position was set via `element.style.transform = 'translate(...)'`. During the animation the cursor would snap to (0, 0).

**Rule:** Use a two-layer element structure. The **outer wrapper** gets the JS position transform (`translate`). The **inner SVG / child element** gets the CSS animation (`scale`). Each element only owns one axis of transform, so there is no conflict. Set `transform-origin: 0 0` on the inner element if the animation should scale from the cursor tip.

### 6. Frame relay resolution must match the display size
The offscreen doc relays camera frames to the PiP overlay as JPEG. If the relay resolution is smaller than the PiP canvas, the image is scaled up and looks blurry.

**What went wrong:** Relay was 160×120 at JPEG quality 0.5. PiP canvas renders at 288×216. The feed looked noticeably worse than the popup (which uses a direct `<video>` element with no compression).

**Rule:** Set relay canvas to at least the PiP display size (288×216) — currently 320×240. JPEG quality should be ≥ 0.8. `startCamera()` in `overlay.js` is dead code — the overlay never opens its own camera stream; all video comes via the `VIDEO_FRAME` relay from the offscreen doc.
