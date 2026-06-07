# Wavr

**Wave to scroll, click, and navigate Chrome with hand gestures.** No mouse, no touch — just your webcam and your hand. Works on any website, and all processing stays on your device.

Wavr is a Chrome (Manifest V3) extension that detects hand gestures from your webcam and maps them to browser actions. Gesture recognition runs entirely on-device via [MediaPipe Tasks Vision](https://developers.google.com/mediapipe), so **no video or data ever leaves your computer**.

> [Install Wavr from the Chrome Web Store →](https://chromewebstore.google.com/detail/Wavr/mekfjddabogijjildgiiikkibdmekhpo)

---

## Features

- **Gesture-controlled scrolling & navigation** — scroll, go back/forward, jump to top/bottom, open/close tabs.
- **16 configurable mappings** — 4 hand poses × 4 swipe directions, each bound to the action you want.
- **Cursor mode** — hold a Thumb Up to enter cursor mode, move the pointer with an open palm, and dwell-click with a closed fist.
- **Picture-in-picture overlay** — a draggable widget shows your live camera feed and real-time gesture feedback on every page.
- **On-device & private** — MediaPipe runs in an offscreen document; nothing is uploaded or stored remotely.
- **Built-in presets** — Scroll Focus, Power User, and Navigation Pro for one-tap setup.
- **First-run wizard, live preview, and achievements** to help you get calibrated quickly.
- **Export / import** your gesture map as readable JSON.

## Gesture system

**4 hand poses × 4 swipe directions = 16 gesture keys:**

```
open_swipe_{up|down|left|right}
closed_swipe_{up|down|left|right}
pointing_swipe_{up|down|left|right}
victory_swipe_{up|down|left|right}
```

**Available actions:** `SCROLL_UP`, `SCROLL_DOWN`, `GO_BACK`, `GO_FORWARD`, `SCROLL_TOP`, `SCROLL_BOTTOM`, `NEW_TAB`, `CLOSE_TAB`, `NONE`

**Thumb Up** (held briefly) toggles **cursor mode** on/off. In cursor mode, an open palm moves the pointer and a closed fist dwell-clicks. Pointing/Victory swipes still fire their mapped actions.

There's also an optional **pose-change scroll** mode: an open↔fist transition fires scroll up/down without a swipe (off by default).

## Installation (from source)

```bash
git clone https://github.com/xu826Jamin/Wavr.git
cd Wavr
npm install
npm run build      # outputs to dist/
```

Then load it into Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select the `dist/` folder
4. Click the Wavr toolbar icon (or press `Alt+W`) to start, and grant camera access when prompted

## Development

```bash
npm run dev     # vite build --watch (rebuilds on change)
npm run build   # production build to dist/
npm test        # node --test
```

Built with [Vite](https://vitejs.dev/) and [`vite-plugin-web-extension`](https://github.com/aklinker1/vite-plugin-web-extension).

## Architecture

| File | Role |
|---|---|
| `src/background/background.js` | Service worker. Manages the offscreen document lifecycle, routes messages, broadcasts to tabs, and executes scroll/navigation actions. |
| `src/offscreen/offscreen.js` | Runs MediaPipe on the webcam feed, detects gestures, and relays gesture/overlay/cursor state plus video frames to the background. |
| `src/content/overlay.js` | Injected into every page. Builds the draggable PiP widget (camera + gesture bar) and the cursor dot. Shadow-DOM isolated. |
| `src/popup/` | Full-page options UI (Scroll Mode / Cursor Mode tabs), live preview, settings, presets, first-run wizard, and achievements. |
| `manifest.json` | Chrome MV3 manifest. |

For a deeper dive into the message flow, storage keys, and known pitfalls, see [`CLAUDE.md`](CLAUDE.md).

## Privacy

Wavr collects **no data**. All webcam processing happens on-device inside an offscreen document. The camera is only active while Wavr is enabled, and the feed is never transmitted or stored. See the permission justifications in [`CLAUDE.md`](CLAUDE.md) for details on each requested permission.

## License

See repository for license details.

---

Made with ♥ by Wavr.
