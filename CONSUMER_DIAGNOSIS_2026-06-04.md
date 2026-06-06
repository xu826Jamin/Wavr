# Consumer Usability Diagnosis (2026-06-04)

## Purpose
This document captures the user-reported failures plus a deeper code-grounded diagnosis. It focuses on why the experience is not intuitive for non-technical users, where the core interaction breaks, and what must be fixed to make the product usable without coaching.

## Direct pain points from user testing
- The system is not intuitive. Users do not know how to hold or move their hand.
- Users accidentally move out of frame without noticing, which looks like the system stopped working.
- Mirror camera is not discovered. Users do not know they can flip the view.
- Cursor mode click (closed fist) does nothing.
- Unintended swipes occur, especially when the hand does not return to the dead zone.
- The UI and settings are confusing. Terms like dead zone and cursor zone are not understood.
- Users do not understand the difference between Scroll Mode and Cursor Mode.
- A lower-effort gesture alternative is desired (pose change rather than a full swipe).

## Deep diagnosis (root causes and contributing factors)

### 1) Missing mental model for hand position and framing
- The system assumes users understand distance, framing, and lighting. There is no persistent on-screen coach or "in-frame" indicator.
- The overlay mostly shows status text ("waiting") but does not describe how to get back into a detectable state.
- Result: users think the system is broken when they simply drift out of frame.

### 2) Mirror camera is a hidden recovery lever
- Mirror is a settings toggle (cursor mirror X), not a first-use prompt.
- Non-technical users will not discover it unless explicitly told.
- Result: inverted lateral movement feels broken and reinforces confusion.

### 3) Cursor click depends on a specific sequence
- Current logic requires open palm, then a dwell time, then closed fist to fire a click.
- If the user closes a fist without the prior open-palm dwell, no click is sent.
- The UI does not clearly explain this sequence, so "closed fist does nothing" is expected.
- The click event is dispatched to elementFromPoint, which can fail for iframes or custom controls.

### 4) Dead zone behavior is not explained and feels like a failure
- The swipe pipeline has a reset requirement after a gesture. Users do not understand the need to return to a neutral area.
- The term "dead zone" sounds technical and does not convey intent.
- Result: users keep moving, get inconsistent behavior, and interpret it as flakiness.

### 5) Unintended swipes and low confidence handling
- Swipes are detected from a short motion window and can trigger on small or incidental motion when the hand is present.
- Even with better pose gating, the perception of false positives remains if the UI shows a gesture but the page does not move (no-op scrolling or wrong target).
- The system does not distinguish between "gesture detected" and "action succeeded" in user feedback.

### 6) Scroll vs cursor mode is too much surface area for first use
- Users need to learn two modes, two sets of gestures, and two sets of settings.
- For non-technical users, this is cognitive overload before they get a single reliable success.
- Result: they never reach the "aha" moment.

### 7) UI language does not match user intent
- The settings page is built for power users (gesture maps, cursor zone, dead zone radius), but first-time users need a guided, plain-language flow.
- The current structure assumes prior knowledge of gesture systems and tracking concepts.

### 8) Additional reliability gaps that appear as "broken"
- Some pages do not scroll even when the gesture fires (nested scroll containers or iframes).
- PDFs and restricted pages cannot be controlled, which can look like random failure if not explained.
- Camera preview and live controller can compete for the camera on some hardware.

## More issues to investigate (high value)
- Reproduce the "cursor click does nothing" case and log whether the open-palm dwell was satisfied.
- Test false positives in low light and with background movement.
- Validate mirror prompt logic against left-right movement and user expectation.
- Confirm whether clicks are blocked in iframes or special elements on common sites.
- Measure how often a gesture fires without a visible page change (silent no-op).

## Design-level requirements that emerge
- A user should get a successful scroll within 2 minutes, without reading documentation.
- The overlay must teach: "where to put your hand," "how to move it," and "when it is detected."
- The system must not show a gesture success UI unless the action actually happened.
- Provide a low-motion alternative gesture (pose change or dwell) for users who struggle with swipes.
- Settings must be re-labeled to user language and reorganized by intent.

## Risk summary
- The biggest retention killer is a lack of reliable first success and unclear feedback.
- Cursor click failures and misunderstood dead zone behavior are the fastest trust destroyers.
- UI complexity prevents non-technical users from discovering fixes like mirror X.

## Product engineering findings (accessibility + feasibility)
- Cursor click currently requires a hidden sequence: open palm dwell -> fist. The dwell indicator appears only when the fist is closed, so users never learn the required gesture. This reads as "closed fist does nothing" and is a direct usability/accessibility failure.
- Click delivery is fragile because it relies on elementFromPoint + synthetic mouse events only; iframes, shadow DOM, and custom controls often ignore these clicks, producing silent failure.
- The settings page auto-starts the preview camera on load, which can conflict with the live controller and undermines clear consent. This is both a feasibility risk (single-stream cameras) and a trust risk.
- The UI shows gesture success even when no action actually succeeds, which trains users to distrust the system.
- There is no explicit accessibility criteria (keyboard-only, reduced motion, screen reader cues). For a gesture-input tool this is acceptable short-term for rating recovery, but it must be tracked as a gap.

## Ratings-driven decisions (what to do and why)
- Prioritize non-technical usability fixes over full accessibility compliance for the next release. This reduces early 1-star reviews driven by confusion and failure to achieve a first success.
- Restrict cursor clicks to reliably clickable elements by default (links, buttons, inputs, labels). Provide an Advanced toggle to attempt broader click targets, with a warning.
- Make preview camera opt-in, not auto-start. The wizard should be the explicit entry point and should enable the live controller at the same time to avoid a "preview-only" trap.
- Gate gesture feedback on real action success: show "no scroll target here" instead of "gesture detected" when nothing moved.

## Research-backed priorities for CWS ratings
- Users forgive missing features but not non-functional core actions. Reliability and clarity must outrank breadth.
- Any "click" feature that fails on common pages will drive low ratings faster than a missing click feature.
- Transparent camera behavior (explicit start, clear on/off state) reduces trust-driven uninstall and review complaints.
