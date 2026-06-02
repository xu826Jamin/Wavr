# Wavr — Diagnostic Plan

**Purpose:** An ordered investigative protocol to surface *why Wavr gets dropped after first use* and *which single use case it can genuinely own.* This document does not contain conclusions. It is the checklist an engineer follows to reach them. Every item names a specific file, function, or measurable signal.

**Hard rule for whoever executes this:** do not propose fixes or write a build plan until Section 5's "most important thing to determine first" is answered and the Section 6 gate is reached. Reading the code to *form an opinion* is the job; reading it to *start patching* is not.

---

## Section 1 — What to read first

Read these in order. For each, the only goal is to answer the stated question — not to summarize the file.

1. **`src/offscreen/offscreen.js` → `init()` (lines 73–129).**
   - Q: How long from "Wavr enabled" to "first frame painted + recognizer ready"? Model load (`GestureRecognizer.createFromOptions`, CPU delegate, line 78–85) + `getUserMedia` (640×480) + `video.play()` all gate the first usable frame. **Why it matters:** time-to-first-success is the dominant first-use retention lever; if this is multi-second and silent, users conclude it's broken.

2. **`src/offscreen/offscreen.js` → module constants & `processFrame()` (line 19, 167–336).**
   - Q: What exactly must a user do for *one* scroll to fire? Trace `settings` (`cooldownMs:600`, `velocityThreshold:0.12`, `bufferSize:8`), the pose-confidence gate `>= 0.75` (line 183), `detectSwipe()` (135–151), and the `waitingForReset` dead-zone gate (300–309). **Why it matters:** the number and difficulty of preconditions for a single successful action is the friction that decides whether first use feels effortless or fiddly.

3. **`src/offscreen/offscreen.js` → the two `setInterval`s in `init()` (lines 106, 113–120).**
   - Q: What does Wavr cost the machine when *no hand is present*? `processFrame` runs every 33ms (≈30fps CPU inference) and a JPEG `VIDEO_FRAME` is produced every 100ms regardless of hand presence. **Why it matters:** sustained fan/CPU with the camera light on is a top silent-uninstall driver; quantify it before theorizing.

4. **`src/background/background.js` → `broadcastToTabs()` and the `VIDEO_FRAME` handler (lines 88–101, 237–240).**
   - Q: How many tabs receive each camera frame? The relay is broadcast to *every* eligible tab 10×/sec, not just the active one. **Why it matters:** multiplies the idle cost in #3 by tab count; bears directly on the "laptop gets hot" drop-off.

5. **`src/background/background.js` → `chrome.action.onClicked` (lines 142–160) and `chrome.commands.onCommand` (162–176).**
   - Q: What does the *first ever* toolbar click do? It sets `firstRunDone` and opens the options page — it does **not** enable the camera. **Why it matters:** if the first click doesn't produce a working camera feed, the activation funnel has an extra step exactly where intent is highest.

6. **`src/background/background.js` → `onStartup` / `onInstalled` (lines 375–383) and the keep-alive alarm (48, 361–373).**
   - Q: Does Wavr survive a browser restart? `onStartup` calls `injectIntoExistingTabs()` + `registerKeepAliveAlarm()` but never `createOffscreen()`, and no enabled-state flag is persisted. **Why it matters:** if the tool is OFF every morning and the user must re-arm it, no habit can form — this alone can explain day-2 drop-off.

7. **`src/background/background.js` → `GESTURE_DETECTED` handler + injected `getScrollTarget()` (lines 273–343).**
   - Q: On which pages does a scroll gesture actually move the page, and where does it silently fail? Trace target-tab selection (active vs. most-recently-accessed eligible), `isRestrictedUrl` (57–64), and the scroll-target heuristic (308–325). **Why it matters:** a gesture that fires but scrolls the wrong tab / nothing reads as "it doesn't work," indistinguishable from a detection failure.

8. **`src/content/overlay.js` → `GET_STATUS` probe (899–902), `handleMessage` (858–896), `buildCursor()` self-heal (359–398, 407–409).**
   - Q: Does a tab opened *mid-session* reliably show the widget/cursor? Check whether new tabs recover state without a fresh toggle. **Why it matters:** the wedge moment often happens on a freshly opened page (a recipe, an article); if the overlay is absent there, the tool fails precisely when needed.

9. **`src/offscreen/offscreen.js` → cursor-mode block (192–281) vs. swipe block (283–336).**
   - Q: How much of the surface area is cursor mode, and does its complexity (thumb-hold toggle, dwell-click, zone mapping) compete with or confuse the core scroll loop? **Why it matters:** feature breadth that dilutes the one reliable action raises perceived flakiness.

10. **`MANUAL_REVIEW_REQUIRED.md` (whole file).**
    - Q: Which retention-critical behaviors are *known to be unverified on real hardware*? (keep-alive survival, false-positive suppression, canvas-not-frozen, camera-denied messaging). **Why it matters:** tells you which hypotheses below can only be confirmed by a live-hardware session, not by reading code.

---

## Section 2 — Use case mapping

Answer these as questions first. For each, the evidence source is named — do not assert until you've looked.

**2.1 — What recurring pain does Wavr remove that mouse/trackpad/keyboard does not, and for whom?**
- Codebase evidence: the *complete* action set in `ACTION_LABELS` (`offscreen.js:11–18`) and the executed actions in `background.js:294–334`. The honest ceiling of value is bounded by what these actions actually do (scroll up/down/page/top/bottom, back/forward, new/close tab, click). Ask: which of these is a *frequent* need, and which is novelty?
- External signal that would confirm/deny: does a real user, mid-task, reach a moment where touching the device is *costly or impossible* (not merely "fun to avoid")? If the only honest answer is "it's neat," there is no recurring pain.

**2.2 — Which segments feel the most acute and frequent pain?** For each, name where the code already helps or fails:
- **RSI / accessibility:** Evidence — is *continuous* hands-free operation possible, or does `waitingForReset` (`offscreen.js:300`) and the 600ms cooldown make sustained use tiring? Confirming signal: would a user who *cannot* comfortably use a mouse find this sufficient as a primary input, or only a gimmick supplement?
- **Hands-busy (cooking / eating / gym):** Evidence — does scroll fire from a *small, low-effort* motion given `velocityThreshold:0.12` + `bufferSize:8` (`offscreen.js:19`)? Does it survive dim kitchen light against the `0.75` pose gate (`offscreen.js:183`)? Confirming signal: does the user hit this moment *repeatedly per week* (a daily desk-eater) vs. rarely (occasional cook)?
- **Presentations:** Evidence — are next/prev-slide-shaped actions present? (Only `GO_BACK/GO_FORWARD` and tab ops exist — no slide control.) Confirming signal: would a presenter pick this over a $20 clicker?
- **Sterile / no-touch environments (lab, medical, workshop):** Evidence — does it run reliably unattended and resist false positives (`detectSwipe()` oldest-vs-newest delta, 135–151)? Confirming signal: is a false scroll while the hand merely rests in frame acceptable here? (Almost certainly not.)

**2.3 — For each segment, what is the incumbent, and what does "winning" concretely mean?**
- For each segment above, name the tool Wavr must beat (trackpad reach + wipe hands; voice assistant; a physical clicker; an accessibility switch / eye-tracker / Dragon). Define "winning" as a measurable: e.g. "fewer seconds and zero device contact to scroll a recipe than wiping hands and reaching." Evidence to look at: whether the action latency (cooldown 600ms + smooth-scroll) is *below the cost of the incumbent action* for that segment.

**Output of Section 2:** a table of {segment → recurring pain → incumbent → what winning means → strongest code-grounded reason to believe/doubt}. No pick yet.

---

## Section 3 — Drop-off investigation (hypotheses)

Each hypothesis: stated precisely · how to verify/falsify in code (or flagged as live-hardware-only) · what a "confirmed" finding implies for priority.

**H1 — Camera-permission friction.**
- Verify: `getUserMedia` in `offscreen.js:87` and the `NotAllowedError` path (122–128) → `CAMERA_ERROR` shown in `overlay.js:880–887`. Also `action.onClicked` first-run (`background.js:142–148`) opens options *before* any permission prompt. Question: does the user ever see a clear "allow camera" moment tied to a working result, or a silent failure?
- Confirmed if: first-enable frequently ends with no feed and only the PiP error text. → High priority; it's a hard funnel wall.

**H2 — Gorilla-arm / fatigue.**
- Verify: required motion magnitude in `detectSwipe()` (`velocityThreshold:0.12` over `bufferSize:8` frames, `offscreen.js:135–151`) plus the forced `waitingForReset` return-to-center (300–309). Count the discrete arm motions to scroll a long article.
- Confirmed if: sustained reading requires repeated large arm sweeps + re-centering. → High priority for any "reading" wedge.

**H3 — Gesture latency / sluggishness.**
- Verify: end-to-end path: 33ms inference tick → `cooldownMs:600` (offscreen) → message to background → `executeScript` smooth-scroll (`background.js:305–337`). Estimate worst-case input-to-scroll delay.
- Confirmed if: perceived lag per scroll clearly exceeds a trackpad flick. → Medium/high; erodes trust fast.

**H4 — False positives (it scrolls when you didn't mean to).**
- Verify: `detectSwipe()` uses only oldest-vs-newest delta over the buffer (no sustained-direction or per-frame confidence check). A resting/repositioning hand can clear the threshold. Pose gate is single-frame `>=0.75` (line 183). **Live-hardware-only** to quantify rate.
- Confirmed if: hand resting/adjusting in frame triggers unwanted scrolls. → High priority; directly disqualifies hands-busy and sterile segments.

**H5 — Hand-already-on-mouse switching cost.**
- Verify: conceptual, but grounded — at a normal desk the user's hand is on the mouse; raising it to gesture is *strictly more* effort. Compare against the action set (`background.js:294–334`): is there any action faster by hand than by the device already under the palm?
- Confirmed if: every supported action is cheaper with the incumbent when a hand is free. → Forces the wedge toward "hands genuinely NOT free."

**H6 — Privacy unease (always-on camera).**
- Verify: trust affordances present — `● LIVE` badge (`overlay.js:865–873`), the always-on camera light (real hardware), and whether any copy states "nothing leaves the device." Camera runs whenever enabled (`offscreen.js:87`).
- Confirmed if: nothing in-product reassures, and the camera light stays on persistently. → Medium; segment-dependent (acute for some, irrelevant for others).

**H7 — CPU / battery cost.**
- Verify: idle cost from Section 1 #3/#4 — 30fps CPU inference + 10fps JPEG broadcast to *all* tabs, never throttled by hand-absence. Measure with `chrome://system` / Task Manager rows for the offscreen doc and tabs.
- Confirmed if: idle CPU is non-trivial and constant. → High; "laptop runs hot" is a quiet but decisive uninstall.

**H8 — Fails to survive tab navigation / browser restart.**
- Verify: restart path `onStartup` (`background.js:380–383`) never re-enables; no persisted enabled flag. Mid-session new-tab path via `GET_STATUS` (`overlay.js:899–902`). **Partially live-hardware.**
- Confirmed if: Wavr is OFF after restart, or a freshly opened page lacks the overlay. → Highest if true: no persistence ⇒ no habit ⇒ structural day-2 churn.

**H9 — Action-to-page mismatch (gesture fires but nothing visibly happens).**
- Verify: `getScrollTarget()` heuristic (`background.js:308–325`) on common targets (infinite-scroll feeds, iframed content, PDFs via `isRestrictedUrl` 57–64), and wrong-tab targeting when active tab is restricted (287–289).
- Confirmed if: on common sites the gesture fires (bar flashes) but the page doesn't move. → High; this *reads identically to detection failure* to a user.

**H10 — Surface-area dilution / confusion.**
- Verify: cursor mode (`offscreen.js:192–281`), 16-key map (`popup.js:6–22`), achievements/share (`overlay.js:771–779`, `popup.js:66–91`). Question: does onboarding push these *before* the core scroll loop is solid?
- Confirmed if: first-run leads with breadth, not one reliable action. → Medium; sharpens focus but isn't itself the churn cause.

Add any hypothesis the code suggests during investigation (e.g., overlay obscuring page content, drag/position not persisted).

---

## Section 4 — Wedge selection criteria

Pick exactly ONE wedge. A candidate qualifies only if it passes all of these, each tied to evidence:

- **C1 — Hands genuinely unavailable.** The incumbent (mouse/trackpad/keyboard) must be *physically blocked or costly*, not merely available. Evidence: the segment's moment makes touching the device incur a real cost (per H5 / Section 2.3).
- **C2 — The needed action is in the reliable core.** What the segment needs must be expressible in scroll up/down/page (the actions least dependent on `getScrollTarget` edge cases and target selection). If it needs cursor precision or slide control, it inherits H4/H9 fragility — disqualify.
- **C3 — Frequency is high.** The moment recurs ≥ several times/week for the same person (a daily desk-eater, a daily-pain RSI user), not once a month. Evidence: realistic frequency estimate per Section 2.2.
- **C4 — Wavr beats the incumbent on a measurable axis** (time, contact, or accessibility) per Section 2.3 — not on novelty.
- **C5 — Survives the reliability bar.** The wedge must tolerate Wavr's *current* false-positive and latency profile (H3/H4), or those must be cheaply fixable for *that* narrow action set.

**Disqualifiers (any one kills a candidate):** relies on cursor-mode precision; needs an action not in `ACTION_LABELS`; the incumbent is already under the user's hand (C1 fails); false positives are unacceptable in that context (sterile/medical); frequency is occasional.

**Confirming evidence for the pick:** a code-grounded path showing the segment's entire job is doable with the reliable core actions, plus a believable account of why that user hits the moment repeatedly and what they do today (the incumbent) that's worse.

---

## Section 5 — Diagnostic sequence (priority order)

Run in this order; later steps depend on earlier findings.

1. **FIRST — H8 (persistence/survival) + Section 1 #6.** Determine whether Wavr can even *be present* at the next session and on a fresh tab. If it cannot persist, no retention metric is meaningful and every other fix leaks out at restart. **This is the single most important thing to determine before any planning begins.**
2. **H7 + H1 (idle cost + permission funnel), Section 1 #3/#4/#5.** Establish the always-on cost and whether first-enable even reaches a working feed. These bound whether "leave it on" is viable and whether new users ever activate.
3. **H4 + H3 (false positives + latency), Section 1 #2/#9.** *Depends on understanding the confidence/buffer pipeline in `detectSwipe()`/`processFrame` first* — you cannot judge gorilla-arm mitigation (H2) or false-positive risk until you've traced `velocityThreshold`/`bufferSize`/`0.75` gate. These determine whether the core action is trustworthy.
4. **H9 (action-to-page mismatch), Section 1 #7.** Determines whether "it works" in the lab generalizes to real sites.
5. **H2 + H5 (fatigue + switching cost).** Now answerable, because they build on the motion magnitude and action-set facts from steps 3–4.
6. **Section 2 use-case mapping + H6 + H10.** With reliability and cost characterized, map segments and run Section 4 criteria to pick the wedge.

**Dependency callouts:** Step 5 depends on Step 3 (motion pipeline). Step 6 depends on Steps 1–5 (you can't pick a wedge before you know what's reliable and what it costs). H4 quantification and H8 restart behavior require a live-hardware session (see `MANUAL_REVIEW_REQUIRED.md`).

---

## Section 6 — Decision gate

After the sequence completes, classify the result:

- **Double down on a wedge** if: one candidate passes all of C1–C5, *and* the failures blocking it are in the reliable core (persistence H8, idle cost H7, false positives H4) — i.e. fixable without expanding surface area. Action: commit the next cycle to that wedge's reliability, write the build plan.
- **Pivot the wedge** if: the chosen segment fails C3 (too infrequent) or C4 (incumbent wins), but a *different* segment passes C1–C5. Action: re-run Section 4 for the next candidate before any build.
- **Shelve the project** if: *every* candidate fails C1 (hands are realistically available in all high-frequency moments) or C5 (the false-positive/latency profile is unacceptable for every qualifying context and not cheaply fixable). Action: stop; do not invest further.

**The one metric that proves the chosen wedge is working:** the action fired (a `GESTURE_DETECTED` with `action !== 'NONE'`, already counted in `background.js:273–279`) on **≥3 distinct calendar days within the 7 days after install**, measured locally only (nothing leaves the device). Activation alone (first-session success) is necessary but not sufficient — multi-day return is the retention proof.
