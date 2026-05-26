# PiP Overlay Revamp Plan

Match the PiP widget in `src/content/overlay.js` to the extension's design system (Vercel/Linear aesthetic: deep blacks, green accent, glow shadows, monospace data labels, sharp geometry).

## Status legend: todo / in-progress / done

---

## Phase 1 — Color & shadow foundation `done`
- Widget bg `#0f0f0f`, header `#141414`, camera/gesture bar `#080808`
- Border tokens: `#252525` sides, `rgba(255,255,255,0.05)` top edge highlight
- `--shadow-card` via `box-shadow` (removed `filter: drop-shadow`)
- All transitions → `cubic-bezier(0.4, 0, 0.2, 1)`

## Phase 2 — Header & entrance animation `done`
- Gradient-masked "wavr" title (`#fff 40% → #555 100%`)
- 6px pulsing `live-dot` (green, `livePulse` keyframe)
- Square `icon-btn` buttons (`border-radius: 8px`, `1px solid #252525`) with SVG minus/plus/close icons
- `@keyframes widgetSlideUp` entrance (opacity + translateY 8px→0)

## Phase 3 — Gesture bar upgrade `done`
- Monospace font (`'SF Mono', ui-monospace, 'Cascadia Code', monospace`) on gesture text
- Idle state shows `<span class="gesture-idle-label">● waiting</span>` (9px, uppercase, `#333`)
- On gesture: widget gets `.gesture-glow` class → green border + ambient glow, auto-removed after 700ms

## Phase 4 — Camera area & placeholder polish `done`
- Placeholder: SVG camera icon (opacity 0.15) + monospace `ph-text`, no emoji
- `● LIVE` badge injected on first `VIDEO_FRAME` (top-right corner, green monospace pill)
- `.camera-area:hover` → inner glow `inset 0 0 0 1px rgba(74,222,128,0.1)`
- Flash keyframe upgraded to use `--glow-lg` style values

## Phase 5 — Settings button & polish `done`
- Settings btn: SVG gear icon, hover turns `#4ade80` + accent border-top
- Share btn: monospace, `border-radius: 6px`, lowercase "↗ share"
- `glowTimer` / `liveBadgeAdded` cleanup in `hideWidget()`

---

**Build:** `npm run build` ✓ — all steps completed, no errors.
