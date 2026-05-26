# Wavr — Changelog

## Unreleased

- **Reliability:** Fixed a bug where gesture controls could silently stop working after 30+ seconds of reading. The extension now stays active as long as it is enabled.
- **Accuracy:** Ambiguous hand poses (confidence < 75%) no longer fire unintended actions.
- **Accuracy:** Horizontal and vertical swipes now require equal physical effort to trigger, correcting a calibration imbalance in the 4:3 video aspect ratio.
- **UX:** Holding a Closed Fist in cursor mode now shows a green arc that fills over 200ms, making the dwell-click interaction visible before it fires.
- **UX:** Gesture labels in the PiP overlay now include the MediaPipe confidence score, e.g. "🖐 Swipe up → Scroll up (0.91)".
- **Settings:** The exported gesture map is now a human-readable JSON object instead of an opaque base64 string. Old base64 codes can still be imported.
- **Code hygiene:** Removed dead code (`content.js`, `shared/gestures.js`, `startCamera()` function) and eliminated all lint errors.

---

## v1.0.0 — Initial release

- Hand gesture control for Chrome: scroll, navigate, and click using webcam
- 4 poses × 4 directions = 16 configurable gesture mappings
- Cursor mode via Thumb Up hold
- PiP overlay with live camera feed and gesture feedback
- First-run wizard, presets panel, achievement system
- Export/import gesture map as base64 code
