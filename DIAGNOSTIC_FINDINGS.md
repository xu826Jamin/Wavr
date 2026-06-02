# Wavr — Diagnostic Findings

Findings log for the investigation defined in `DIAGNOSTIC_PLAN.md`. One section per phase. Evidence-only; fixes are not proposed here.

---

## Phase 1 — Persistence & survival (H8 + Section 1 #6)

**Question:** Can Wavr be present at the next session and on a fresh tab?

### Finding 1A — Restart survival: **CONFIRMED FAIL.** Wavr is OFF after every browser restart, and there is no way for it to come back on its own.

Evidence:
- `createOffscreen()` (the only thing that starts the camera/inference) is called from exactly three places, all user-initiated: `chrome.action.onClicked` ([background.js:156](src/background/background.js#L156)), `chrome.commands.onCommand` ([background.js:172](src/background/background.js#L172)), and the `TOGGLE` message ([background.js:186](src/background/background.js#L186)).
- `chrome.runtime.onStartup` and `onInstalled` ([background.js:375-383](src/background/background.js#L375-L383)) call only `injectIntoExistingTabs()` + `registerKeepAliveAlarm()`. **Neither calls `createOffscreen()`.**
- **No enabled flag is ever persisted.** Grep across `src/` for persisted state returns only `firstRunDone` and `onboardingComplete` — never a `wavrEnabled`-style key. The "enabled" state is *derived live* from `chrome.offscreen.hasDocument()` (`GET_STATUS`, [background.js:206-211](src/background/background.js#L206-L211)).
- The offscreen document does not survive a browser restart. On next launch `hasDocument()` is false ⇒ every surface (popup pill [popup.js:363](src/popup/popup.js#L363), bento toggle [popup.js:830](src/popup/popup.js#L830), nav [nav.js:20](src/popup/nav.js#L20)) reads OFF ⇒ camera stays off until the user manually re-arms.
- The keep-alive alarm reinforces this: `registerKeepAliveAlarm()` recreates the `keepAlive` alarm on startup even with no offscreen doc; the handler ([background.js:365-373](src/background/background.js#L365-L373)) then sees no document, **clears the alarm, and broadcasts `HIDE_OVERLAY` + `STATUS_CHANGED:false`** — i.e. the only startup logic that touches Wavr state actively tears it down rather than restoring it.

Implication: **structural day-2 churn.** A habit loop is impossible if the user must re-enable Wavr (Alt+W / toolbar / pill) at the start of every browser session. This is the highest-severity item and the gate for the whole diagnostic (Section 5, step 1): no retention metric is meaningful until this is addressed.

### Finding 1B — Mid-session new-tab survival: **PASS.** A page opened while Wavr is already ON does show the widget, without a fresh toggle.

Evidence:
- `manifest.json` declares a static content script: `matches: ["<all_urls>"]`, `run_at: document_idle` ([manifest.json:33-40](manifest.json#L33-L40)). Chrome auto-injects `overlay.js` on every newly loaded page during a session — this does **not** depend on `injectIntoExistingTabs()` (which exists only to cover tabs already open at install/startup, since static content scripts don't retro-inject).
- On load, `overlay.js` re-injection-guards via `window.__wavrLoaded` ([overlay.js:3](src/content/overlay.js#L3)) and probes `GET_STATUS` ([overlay.js:899-902](src/content/overlay.js#L899-L902)); if enabled, it calls `showWidget()`. So a recipe/article opened mid-session correctly self-heals. This matches the intent of CLAUDE.md pitfall #3.
- Cursor-mode caveat (minor, not a failure): `CURSOR_MODE_CHANGE` is a one-time broadcast a new tab misses, but `updateCursor()` calls `buildCursor()` lazily ([overlay.js:408](src/content/overlay.js#L408)) and `CURSOR_STATE` streams ~30fps while a hand is in frame, so the cursor dot appears on the next frame. No dot appears until a hand is present — acceptable.

### Phase 1 verdict
The "fresh tab" half of survival is sound. The "next session" half is broken at the architecture level: **Wavr cannot persist its enabled state across a browser restart, and nothing re-arms it.** Per the Section 6 gate framing, this is the single most important thing to fix before any wedge-retention work can be measured — but per protocol, no fix is proposed until the diagnostic completes.

---

## Phase 2 — Idle cost & permission funnel (H7 + H1, Section 1 #3/#4/#5)

**Question:** What does Wavr cost the machine when idle, and does the first toolbar click ever reach a working gesture-control feed?

### Finding 2A — Permission funnel: **the first toolbar click does NOT start gesture control**, and the camera prompt is triggered by the *settings preview*, not by an explicit "enable" intent.

Evidence (the brand-new-user sequence):
1. First toolbar click → `firstRunDone` is false → `chrome.runtime.openOptionsPage()` and `return` ([background.js:142-148](src/background/background.js#L142-L148)). No offscreen doc is created; no gesture control starts.
2. The options page calls `startCamera()` unconditionally on load ([popup.js:401](src/popup/popup.js#L401)), which fires `getUserMedia({video:true})` ([popup.js:380](src/popup/popup.js#L380)) — so the **camera permission prompt appears because the settings page wants a preview**, not because the user asked to turn Wavr on.
3. To actually start gesture control the user must take a *separate* action — the status pill ([popup.js:367](src/popup/popup.js#L367)), the bento toggle ([popup.js:834](src/popup/popup.js#L834)), or finishing the wizard — which sends `TOGGLE` → `createOffscreen()` → the offscreen doc's own `getUserMedia` ([offscreen.js:87](src/offscreen/offscreen.js#L87)).
- `optional_permissions: ["camera"]` is declared ([manifest.json:14](manifest.json#L14)) but **never requested** via `chrome.permissions.request` anywhere in `src/`. Camera is obtained purely through `getUserMedia` prompts. (The grant is per extension origin, so allowing it for the popup preview also covers the offscreen doc — no second prompt — but the *first* prompt is still bound to the preview, not to the enable action.)

Implication: time-to-first-success has an extra, non-obvious step at the moment of highest intent. The user's first click yields a settings page + a camera prompt with no working controller; "it works" requires discovering and clicking a separate enable control. Confirms H1 and Section 1 #5.

### Finding 2B — Two independent camera consumers can collide.

Evidence: the options page holds its own live stream for the preview ([popup.js:380](src/popup/popup.js#L380), `video:true`) and runs a *second* MediaPipe recognizer at 33ms ([preview-detect.js:139-147](src/popup/preview-detect.js#L139-L147)). The offscreen doc opens its own 640×480 stream ([offscreen.js:87](src/offscreen/offscreen.js#L87)). If a user enables Wavr while the options page preview is live, the offscreen `getUserMedia` may fail on cameras that don't allow concurrent streams — surfacing as `CAMERA_ERROR` ("Camera unavailable. Check that no other app is using it.", [offscreen.js:124-127](src/offscreen/offscreen.js#L124-L127)) at the exact moment the user tries to turn it on. (Severity to be confirmed on real hardware — flagged.)

### Finding 2C — Idle cost: **always-on CPU inference at ~30fps and a 10fps JPEG fan-out to *every* open tab, with no throttle for hand-absence or backgrounded tabs.**

Evidence:
- **Inference is unconditional.** `processFrame` runs every 33ms ([offscreen.js:106](src/offscreen/offscreen.js#L106)) and calls the expensive `gestureRecognizer.recognizeForVideo(...)` ([offscreen.js:169](src/offscreen/offscreen.js#L169)) *before* the no-hand early-return ([offscreen.js:171-177](src/offscreen/offscreen.js#L171-L177)). So full CPU MediaPipe inference runs ~30×/sec whether or not a hand is present.
- **Frame relay is unconditional.** A 320×240 JPEG (quality 0.8) is encoded every 100ms ([offscreen.js:113-120](src/offscreen/offscreen.js#L113-L120)), gated only on `video.readyState` — not on hand presence.
- **The relay fans out to all tabs.** `VIDEO_FRAME` → `broadcastToTabs` ([background.js:237-240](src/background/background.js#L237-L240), [:88-101](src/background/background.js#L88-L101)) pushes each JPEG to every eligible tab 10×/sec. Each tab's `overlay.js` decodes the base64 JPEG via `new Image()` and draws to canvas ([overlay.js:858-877](src/content/overlay.js#L858-L877)).
- **The widget is built in every tab, not just the active one.** Enabling broadcasts `START_OVERLAY` to all tabs ([background.js:157](src/background/background.js#L157)) → `showWidget()` in each → the PiP camera panel appears in *every* open tab simultaneously, each running the 10fps decode/draw.
- **Backgrounded ≠ throttled.** The offscreen doc is kept alive by the `keepAlive` alarm + `USER_MEDIA`, so the 30fps inference and 10fps relay continue at full rate even when no Chrome window is focused.
- **Options page doubles it.** While the options page is open, a *second* ~30fps MediaPipe loop ([preview-detect.js:147](src/popup/preview-detect.js#L147)) and a second camera stream run concurrently with the offscreen doc.

Implication: confirms H7 (and H4's enabling condition for "leave it on"). Idle cost scales with open-tab count and never drops when the hand leaves frame — exactly the "laptop runs hot / camera light always on" profile that drives quiet uninstalls. There is currently no idle-detection or active-tab gating anywhere in the relay path.

### Phase 2 verdict
The activation funnel front-loads a camera prompt for the wrong reason (preview, not enable) and hides the real "on" switch behind a second action, and a second concurrent camera stream can make the enable action fail outright. The always-on resource posture is heavy and unthrottled — 30fps CPU inference plus a per-tab 10fps frame fan-out — and gets worse with more tabs and with the options page open. Both H1 and H7 are **confirmed**; H7's severity (actual idle CPU %) and 2B's collision rate are the parts that still need a live-hardware measurement.

---

## Phase 3 — False positives & latency (H4 + H3, Section 1 #2/#9)

**Question:** Is the core scroll action trustworthy — does it fire only when intended, and is it fast enough to prefer over a trackpad?

### Finding 3A — False positives: **CONFIRMED, structural.** An unrecognized hand pose is treated as Open Palm and armed for scrolling, and a swipe fires on endpoint displacement alone.

Three compounding causes in `processFrame`/`detectSwipe`:

1. **"None" pose counts as Open Palm.** `pose` is set to the recognizer's category only when its score is `>= 0.75`, otherwise `'None'` ([offscreen.js:183](src/offscreen/offscreen.js#L183)). Then `isOpen = pose === 'Open_Palm' || pose === 'None'` ([offscreen.js:185](src/offscreen/offscreen.js#L185)). So when the recognizer is *not confident about any pose*, the hand is still treated as Open Palm. Because the fire condition is `if (isOpen || isClosed || isPointing || isVictory)` ([offscreen.js:314](src/offscreen/offscreen.js#L314)), **the 0.75 confidence gate does not decide whether a swipe fires — it only decides which prefix is used.** Any detected hand that isn't a confident Closed/Pointing/Victory/Thumb pose falls through to `open_*` → the default scroll mappings. A hand that is merely present and moving (reaching for coffee, lifting a fork, gesturing while talking) can scroll the page.

2. **Detection is endpoint-only, over a short window.** `detectSwipe` compares only `buffer[0]` vs `buffer[last]` ([offscreen.js:135-151](src/offscreen/offscreen.js#L135-L151)) over an 8-sample (~264ms at the 33ms tick) trailing window, with `velocityThreshold = 0.12` ([offscreen.js:19](src/offscreen/offscreen.js#L19)). There is **no check for sustained or monotonic motion** and no per-frame velocity consistency — a slow drift and a deliberate flick are indistinguishable, and only the two endpoints matter. 0.12 normalized ≈ 12% of frame (~77px of wrist travel horizontally / ~58px vertically) — a small, easily incidental movement, well below the wrist travel of e.g. raising food to your mouth.

3. **The buffer accumulates across pose changes.** `positionBuffer.push(...)` is unconditional once past the dead-zone gate ([offscreen.js:311](src/offscreen/offscreen.js#L311)) — it runs every frame a hand is present, regardless of pose. So motion made while transitioning between poses lands in the window that `detectSwipe` later evaluates.

**Mitigations that exist** (and what they don't cover): `cooldownMs = 600` ([offscreen.js:316](src/offscreen/offscreen.js#L316)) and the `waitingForReset` dead-zone return ([offscreen.js:300-309](src/offscreen/offscreen.js#L300-L309)) prevent *repeat* machine-gun fires, and a perfectly still hand (dx≈dy≈0) won't fire. But **nothing guards the first unintended fire** — there is no sustained-direction requirement, no pose-stability-over-window requirement, and no "ignore ambiguous hand" state. This directly disqualifies the hands-busy and sterile/no-touch segments, where an unintended scroll is unacceptable (bears on Section 4 C5 and the wedge pick).

### Finding 3B — Latency: single-shot is acceptable; **throughput for continuous reading is poor by design.**

- **Single-shot input→scroll-start:** roughly the swipe-motion duration + up to one 33ms frame quantization + IPC. The path is `GESTURE_DETECTED` → background does `chrome.tabs.query` (active) → `chrome.tabs.query` (all) → `chrome.storage.local.get('scrollAmount')` → `chrome.scripting.executeScript` ([background.js:281-338](src/background/background.js#L281-L338)) — several async hops plus a script injection (tens of ms). Modest, not the main problem.
- **Visible completion** is further delayed by `behavior: 'smooth'` ([background.js:327-334](src/background/background.js#L327-L334)), which animates each scroll over several hundred ms.
- **The real cost is cadence.** To scroll twice you must: complete the swipe → wait out the 600ms cooldown → return the hand inside `deadZoneRadius` (0.10) of the origin to clear `waitingForReset` → and then refill an 8-sample buffer (reset to 0 on every fire, [offscreen.js:320](src/offscreen/offscreen.js#L320)) before the next swipe can even be evaluated. Realistic repeat rate is ~1 scroll per 1–1.5s, each a deliberate multi-step motion. A trackpad flings continuously with one finger. For *continuous reading* (the hands-busy/RSI wedge moments) this is markedly slower and more effortful — feeds H2 (fatigue) in Phase 5.

### Finding 3C — Cursor mode dilutes, and adds its own false-trigger surface (Section 1 #9).

- Cursor mode is toggled by a 400ms Thumb-Up hold ([offscreen.js:192-207](src/offscreen/offscreen.js#L192-L207)); an incidental sustained thumb-up flips the user into a different mode unexpectedly.
- In cursor mode, the same `'None'`→open assumption drives `mapCursorPosition` every frame ([offscreen.js:216](src/offscreen/offscreen.js#L216)), and an open→fist pose flicker fires a click ([offscreen.js:219-229](src/offscreen/offscreen.js#L219-L229)) — a parallel false-positive surface.
- For the scroll wedge, cursor mode is primarily **surface-area dilution**: it doesn't strengthen the core loop and adds modes/poses that can be triggered by mistake. Reinforces H10.

### Phase 3 verdict
H4 is **confirmed at the design level**, with the standout being that the pose-confidence gate doesn't gate firing at all — an ambiguous hand defaults to Open-Palm-armed scrolling, on endpoint-only motion. H3 single-shot latency is fine, but the cooldown + dead-zone-return + buffer-refill cycle makes *continuous* scrolling slow and deliberate. The trust problem (false fires) and the effort problem (poor cadence) together undercut exactly the high-frequency reading use the wedge would need — quantifying the real false-positive *rate* still requires a live-hardware session (per `MANUAL_REVIEW_REQUIRED.md`).

---

## Phase 4 — Action-to-page mismatch (H9, Section 1 #7)

**Question:** When a gesture fires, does the page the user is looking at actually move — or does it fire silently with no visible effect?

### Finding 4A — A fired gesture gives "success" feedback even when nothing scrolls.

On every fire, the offscreen doc broadcasts `GESTURE_DISPLAY` to all tabs and the overlay flashes the gesture bar + glow ([offscreen.js:329-332](src/offscreen/offscreen.js#L329-L332); [overlay.js:761-808](src/content/overlay.js#L761-L808)), and `achievements.gestureCount` is incremented for any action ≠ NONE ([background.js:273-279](src/background/background.js#L273-L279)) — **all of this happens independently of whether the page actually moved.** So every silent no-op below looks identical to success in the PiP. This is the precise H9 failure mode: positive confirmation with no result reads to the user as "it's broken/flaky."

### Finding 4B — Wrong-tab / wrong-window targeting.

Target selection ([background.js:281-291](src/background/background.js#L281-L291)): `chrome.tabs.query({active:true, currentWindow:true})`; if that active tab is restricted, it falls back to the most-recently-accessed eligible tab across **all windows** (`eligible.sort(... lastAccessed ...)`).
- From a service-worker/offscreen-driven event there is no real "current window" focus; `currentWindow` is unreliable here (`lastFocusedWindow` would be the robust choice). 
- The fallback can resolve to a background tab in another window — so a gesture can scroll, or with `CLOSE_TAB`, **close** a page the user isn't even looking at.

### Finding 4C — PDFs and other restricted URLs fail, and silently scroll something else.

`isRestrictedUrl` returns true for `chrome://`, `chrome-extension://`, `about:`, `edge://`, and **`.pdf`** ([background.js:57-64](src/background/background.js#L57-L64)). Consequences when the user is viewing a PDF:
- The overlay/content script is never injected there, so there's no widget on the PDF.
- A gesture still fires from the offscreen doc; the background skips the PDF tab and picks a *different* eligible tab as target → the swipe scrolls some other page the user can't see. PDFs (recipes, papers) are a prime "reading" surface, so this is a direct hit on any reading wedge.

### Finding 4D — The scroll-target heuristic misses common modern layouts.

Injected `getScrollTarget()` ([background.js:308-325](src/background/background.js#L308-L325)):
1. Returns `document.scrollingElement` if the page itself overflows — works for classic article/blog/recipe pages (the good, common case).
2. Else walks up ≤5 parents from `document.activeElement`.
3. Else scans **only direct `document.body.children`** for the biggest scrollable element, falling back to `document.documentElement`.

Failure cases:
- **SPA / app layouts where the scroll container is a nested `<div>`** (many feeds, docs apps, chat UIs): `document.scrollingElement` doesn't overflow, `activeElement` is usually non-scrollable, and the real container is nested deeper than a direct body child → heuristic returns `documentElement`, which doesn't scroll → **gesture fires, page doesn't move.**
- **Iframed content:** `executeScript` targets only the top frame (no `allFrames`, [background.js:305-307](src/background/background.js#L305-L307)). Content inside an iframe (embedded readers/docs) won't scroll — the top document scrolls instead (usually a no-op).

### Finding 4E — False positives here are destructive, not just annoying.

Because target selection and the `CLOSE_TAB`/`NEW_TAB` actions execute before any scroll ([background.js:294-301](src/background/background.js#L294-L301)), a false-positive *closed-fist* swipe (default `closed_swipe_left = CLOSE_TAB`) can close a tab — potentially a non-active fallback tab (4B). Combined with Phase 3's unguarded false-positive design, the cost of a misfire is not always a stray scroll; it can be a closed tab. This raises the stakes of H4 considerably (bears on wedge criterion C5).

### Phase 4 verdict
H9 is **confirmed**. On classic scrollable pages (typical recipes/blogs) the core scroll works. But the "fired but nothing moved" surface is real and broad — PDFs, nested-container SPAs, and iframes — and is made worse by (a) "success" feedback that fires regardless of result (4A), (b) cross-window fallback targeting (4B), and (c) destructive actions reachable by the unguarded false positives from Phase 3 (4E). To a user, all of these read as "Wavr is flaky." The exact prevalence across a real browsing mix needs a live-hardware/site-survey session.

---

## Phase 5 — Fatigue & switching cost (H2 + H5)

**Question:** Does sustained use tire the arm, and when a hand is free, is gesturing ever worth more than the device already under it? (Built on Phase 3 motion facts and the Phase 4 action set.)

### Finding 5A — Fatigue (H2): **frequency-gated, not constant.** It does not disqualify low-frequency reading, but it rules out any "primary input / power scrolling" framing.

Grounded mechanics: one scroll requires a directional wrist sweep of ≥0.12 normalized (~58–77px of travel), then a return into the dead zone (within 0.10 of the origin) to clear `waitingForReset`, plus the 600ms cooldown and an 8-sample buffer refill before the next (Phase 3; [offscreen.js:19](src/offscreen/offscreen.js#L19), [:300-320](src/offscreen/offscreen.js#L300-L320)). The hand must also be **in frame and detected** during the motion — if no landmarks are seen the buffer is cleared ([offscreen.js:171-177](src/offscreen/offscreen.js#L171-L177)).

- The fatigue driver is **how long the hand is held in the camera's view**, not sweep amplitude. Lowering `velocityThreshold`/`bufferSize` (PLAN.md A3) shrinks the sweep but not the need to present the hand.
- Natural usage is *intermittent*: keep hands out of frame, raise one, swipe, lower. So:
  - **Low-frequency reading** (recipe over a 20-min cook; long article at reading pace — a scroll every 20–60s): the arm is raised only briefly and rarely → gorilla-arm is **negligible**. Wedge-favorable.
  - **Continuous/rapid scrolling** (feeds, fast skimming): the arm is up repeatedly and the poor cadence (Phase 3B) compounds → fatigue becomes real. Wedge-hostile.

So H2 is a **moderate, frequency-dependent** concern: it does not by itself kill a low-frequency reading wedge, but it does disqualify positioning Wavr as a general or primary scroll input.

### Finding 5B — Switching cost (H5): **CONFIRMED.** With a free hand on the device, the incumbent beats Wavr on *every* supported action.

Every action Wavr can perform ([background.js:294-334](src/background/background.js#L294-L334); `ACTION_LABELS` [offscreen.js:11-18](src/offscreen/offscreen.js#L11-L18)) has a faster incumbent when a hand is already on the mouse/trackpad/keyboard:
- Scroll up/down/page/top/bottom → trackpad two-finger / wheel: instant, continuous, no cooldown, no dead-zone return.
- Back/forward → mouse side buttons / Alt+←→ / edge swipe.
- New/close tab → Ctrl+T / Ctrl+W.
- Click (cursor mode) → the mouse itself.

Raising a hand into frame and performing a gated sweep is **strictly more effort** than the device under the palm. There is no action in the set where hand-in-air wins for a seated user with a free hand.

Implication (drives Section 4 C1): the only defensible wedge is one where touching the device is *physically costly or impossible* — not mere convenience. "Faster/cooler for desk users" is disqualified.

### Finding 5C — The H2×H5 intersection defines the real wedge surface (and exposes a tension in the thesis).

Combining 5A and 5B: the surviving surface is **low-frequency scrolling where reaching the device has a genuine cost, yet a hand can be briefly lifted into view.** Note the tension this resolves: "hands-busy" can't mean *both* hands are unavailable — gesturing requires freeing and raising one. The defensible moment is precisely: *touching the trackpad/mouse is costly (dirty/greasy hands, device out of reach, sterile surface) but a hand can be raised to wave for a moment.*
- Fits: cooking with doughy/greasy hands (wave instead of cleaning up to touch the trackpad); eating at a desk (wave with the non-fork hand); treadmill/exercise-bike reading (hands on grips, brief wave); some sterile/no-touch contexts — *if* false positives (Phase 3) and PDF/SPA reliability (Phase 4) were fixed.
- Does not fit: any seated, clean-handed, device-in-reach scenario (5B), or high-frequency scrolling (5A + Phase 3B).

### Phase 5 verdict
H5 is **confirmed** and is the decisive constraint: Wavr only wins where the device is costly to touch. H2 is **real but frequency-gated** and does not block the low-frequency reading wedge. Together they sharpen the wedge to a narrow but genuine surface — *device-costly, hand-can-be-briefly-raised, low-frequency scrolling* — whose viability now hinges on whether the Phase 3 (false positives) and Phase 4 (silent no-ops on PDFs/SPAs) reliability problems are fixable for that narrow action set. This sets up Phase 6's segment mapping and wedge pick.

---

## Phase 6 — Segment mapping & wedge pick (Section 2, H6, H10, Section 4 criteria)

### Finding 6A — Privacy/trust (H6): **largely mitigated by copy; residual is the always-on visual, not missing messaging.**
Clear reassurance exists: the wizard states "No video is recorded or sent anywhere — all processing happens locally on your device" ([popup.html:2336](src/popup/popup.html#L2336)), echoed by hero/bento/feature-chip copy ([popup.html:2395](src/popup/popup.html#L2395), [:2502](src/popup/popup.html#L2502), [:2512](src/popup/popup.html#L2512)). The residual unease driver is behavioral, not verbal: the camera light stays on whenever enabled, and the PiP feed appears in **every** tab (Phase 2C) — a persistent "always watching" signal — and there is no in-overlay "camera only while on / nothing leaves device" line. H6 is a **minor** factor relative to H7/H8.

### Finding 6B — Surface-area dilution (H10): **confirmed**, and the onboarding doesn't convert to a working state.
The product carries a large surface: 16-key gesture map, cursor mode, presets, achievements, share/tweet buttons, plus a full marketing landing UI (hero canvas, bento grid, section nav, gesture explorer). More damaging than breadth: **completing onboarding leaves Wavr OFF.** `frAllowCamera` only starts the popup *preview* stream ([popup.js:521-527](src/popup/popup.js#L521-L527)); step 3 watches the popup's own recognizer; `frFinish` sets only `onboardingComplete` ([popup.js:497-501](src/popup/popup.js#L497-L501)). No wizard path sends `TOGGLE` or creates the offscreen doc. So the "try your first gesture → success" moment is a **simulation in the settings page** that does not arm the real controller — the user must still discover the pill/bento/Alt+W to actually use it. This compounds Finding 2A into a complete activation-funnel break.

### Finding 6C — Segment map (Section 2 synthesis)

| Segment | Recurring pain | Incumbent | "Winning" = | Code-grounded verdict |
|---|---|---|---|---|
| **Desk eating** | Hand on food; greasy/occupied; don't want to smudge mouse | Set food down → mouse; or smudge it | Scroll article/feed while eating, zero device contact | **Best fit.** Daily frequency; needs only core scroll (4D good case). Blocked by false positives (3A — eating moves the wrist >0.12) and 4E (misfire can close a tab). |
| **Cooking** | Doughy/greasy hands; touching trackpad means stopping to clean | Wipe hands + reach; voice assistant | Scroll recipe without cleaning up | Strong fit (5C), med frequency. Same 3A blocker; PDF recipes fail outright (4C). |
| **Gym/treadmill reading** | Hands on grips; device out of reach | Dismount/reach | Advance reading without dismounting | Fits 5C (device out of reach) but moving body + variable light likely worsens 3A; unvalidated. |
| **RSI / accessibility** | Mouse/trackpad use hurts | Dragon, switch, eye-tracker, dwell-click, or enduring pain | Viable *primary* low-strain input | **Fails** C2/C5: poor cadence (3B) + gorilla-arm (5A) is its own strain; not credible as primary a11y input today. Possible pivot, not lead. |
| **Presentations** | Advance slides from across room | $20 clicker / keyboard | Beat the clicker | **Disqualified** (C4): no slide-control action exists ([offscreen.js:11-18](src/offscreen/offscreen.js#L11-L18)); clicker is cheap and false-fire-free. |
| **Sterile / no-touch (lab/medical)** | Can't touch shared device | Voice, foot pedal, assistant | Reliable no-touch control | **Disqualified** (C5): false positives (3A) are unacceptable where a stray scroll/close is a safety/data issue. |

### Finding 6D — Section 4 criteria applied to the lead candidate (Hands-busy reading: desk-eating primary, cooking secondary)

- **C1 (hands genuinely unavailable / device costly):** PASS — greasy/occupied hands make touching the device costly (5B/5C).
- **C2 (need is in the reliable core):** PASS — requires only scroll up/down/page, the actions least dependent on the fragile `getScrollTarget` paths (4D good case), provided PDF reading (4C) is handled or out of scope.
- **C3 (high frequency):** PASS for desk-eating (daily); MEDIUM for cooking.
- **C4 (beats incumbent on a measurable axis):** PASS — zero device contact vs. stopping to clean hands / smudging the device.
- **C5 (survives the current reliability profile):** **FAIL as-is** — false positives (3A) are *likely during the very activity* (eating/cooking move the wrist well past 0.12 → `'None'`→open→scroll), misfires can be destructive (4E), the tool doesn't persist across restart (Phase 1), and idle cost + camera-in-every-tab (2C) make "leave it armed" expensive.

**The C5 failures are entirely in the reliable core** (H8 persistence, H7 idle cost, H4 false-positive suppression, H9 PDF/target) — not in product surface area. That is the textbook "double down" shape: the use case qualifies; only fixable infrastructure stands in the way.

---

## Section 6 — Decision gate

**Decision: DOUBLE DOWN on the hands-busy reading wedge (desk-eating primary, cooking secondary).**

- This matches the pre-existing PLAN.md thesis, but is now *derived* from explicit pass/fail criteria with named code blockers rather than asserted.
- Justification per the gate: one candidate passes C1–C4, and every C5 blocker is in the reliable core and fixable without expanding surface area.

**The single most important thing to determine before building (the make-or-break for THIS wedge specifically):**
> Can the false-positive rate (Finding 3A) be driven low *during active eating/cooking* — i.e., while the user's free hand is making large incidental movements? This requires the H4 fix (real pose-confidence gating so `'None'` ≠ Open Palm; sustained/monotonic-motion requirement instead of endpoint-only) **and a live-hardware measurement.** Eating/cooking is the worst case for incidental wrist motion, so if false positives can't be controlled here, the convenience is erased by accidental scrolls/tab-closes.

**Gate branches:**
- **Double down (chosen):** commit the next cycle to the reliable-core fixes in dependency order — persistence (Phase 1 / H8) first, then idle-cost gating + false-positive suppression (H7 + H4), then PDF/target correctness (H9), then close the activation-funnel break (2A/6B: a first click and a finished wizard must leave Wavr actually ON). No new surface area.
- **Pivot** if: after the H4 fix, false positives during active eating/cooking remain high on real hardware. Next candidate: deliberate low-frequency long-form reading at a desk (hand intentionally idle between scrolls — fewer incidental motions), accepting that C1 weakens.
- **Shelve** if: false positives cannot be controlled in *any* low-frequency context **and** idle cost cannot be brought near zero — i.e., the tool can be neither trusted nor left armed.

**The one metric that proves the wedge is working:** a gesture fired with `action !== 'NONE'` (already counted at [background.js:273-279](src/background/background.js#L273-L279)) on **≥3 distinct calendar days within the 7 days after install**, measured locally only. First-session activation is necessary but not sufficient; multi-day return is the proof.

---

## Diagnostic complete
All six phases of `DIAGNOSTIC_PLAN.md` are executed. Confirmed root causes of post-first-use drop-off, in rough severity order: **(1) no persistence across restart (Phase 1 / H8)**, **(2) unguarded false positives where `'None'`=Open Palm fires scrolls, with destructive misfires possible (Phase 3 / Phase 4E)**, **(3) heavy unthrottled idle cost + camera in every tab (Phase 2C / H7)**, **(4) a broken activation funnel where neither the first click nor the finished wizard turns Wavr on (Findings 2A / 6B)**, and **(5) silent no-ops on PDFs/SPAs/iframes that read as flakiness (Phase 4 / H9)**. The wedge is decided. Per protocol, no production code or build plan is written here — the next step (if approved) is to author the build plan for the double-down branch.
