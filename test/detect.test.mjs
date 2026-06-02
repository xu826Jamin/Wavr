// A4 algorithmic validation — runs the real detection core (src/offscreen/detect.js)
// against synthetic 8-sample motion buffers that stand in for the situations the
// hands-busy-reading wedge must get right. This does NOT replace the live
// eating/cooking webcam test (Section 6 gate); it validates the suppression logic
// and tuning so we don't ship something obviously wrong.
//
//   run:  node --test
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSwipe, dominantPose, GESTURES } from '../src/offscreen/detect.js';

// Mirror of the offscreen.js settings A4 cares about.
const S = { bufferSize: 8, velocityThreshold: 0.12, directness: 0.7, axisPurity: 0.7, poseAgree: 0.6 };

// Build an 8-frame buffer from arrays of x, y and a pose (string or array of strings).
function buf(xs, ys, pose) {
  return xs.map((x, i) => ({ x, y: ys[i], pose: Array.isArray(pose) ? pose[i] : pose }));
}
// A monotonic ramp from a→b over n points.
function ramp(a, b, n = 8) {
  return Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)));
}
const flat = (v, n = 8) => Array.from({ length: n }, () => v);

// ── Intentional gestures SHOULD fire ────────────────────────────────────────────

test('clean downward swipe, confident Open_Palm → SWIPE_DOWN / open_', () => {
  const b = buf(flat(0.5), ramp(0.30, 0.62), 'Open_Palm');
  assert.equal(detectSwipe(b, S), GESTURES.SWIPE_DOWN);
  assert.equal(dominantPose(b, S), 'Open_Palm');
});

test('clean upward swipe → SWIPE_UP', () => {
  const b = buf(flat(0.5), ramp(0.62, 0.30), 'Open_Palm');
  assert.equal(detectSwipe(b, S), GESTURES.SWIPE_UP);
});

test('clean left swipe → SWIPE_LEFT', () => {
  const b = buf(ramp(0.70, 0.35), flat(0.5), 'Closed_Fist');
  assert.equal(detectSwipe(b, S), GESTURES.SWIPE_LEFT);
  assert.equal(dominantPose(b, S), 'Closed_Fist');
});

test('clean right swipe → SWIPE_RIGHT', () => {
  const b = buf(ramp(0.35, 0.70), flat(0.5), 'Open_Palm');
  assert.equal(detectSwipe(b, S), GESTURES.SWIPE_RIGHT);
});

test('swipe with mild off-axis drift still fires (drift < axisPurity)', () => {
  // y travels 0.32, x drifts only ~0.10 (well under 0.7 * dominant)
  const b = buf(ramp(0.50, 0.60), ramp(0.30, 0.62), 'Open_Palm');
  assert.equal(detectSwipe(b, S), GESTURES.SWIPE_DOWN);
});

// ── False positives SHOULD be suppressed ─────────────────────────────────────────

test('eating jitter (back-and-forth, net present but low directness) → NONE', () => {
  const ys = [0.30, 0.50, 0.32, 0.52, 0.34, 0.54, 0.36, 0.45];
  const b = buf(flat(0.5), ys, 'Open_Palm');
  assert.equal(detectSwipe(b, S), GESTURES.NONE);
});

test('tiny incidental motion below threshold → NONE', () => {
  const b = buf(flat(0.5), ramp(0.50, 0.55), 'Open_Palm'); // dy 0.05 < 0.12
  assert.equal(detectSwipe(b, S), GESTURES.NONE);
});

test('45° diagonal flail → NONE (axis purity)', () => {
  // equal physical travel on both axes after aspect scaling-ish; off ≈ dominant
  const b = buf(ramp(0.30, 0.62), ramp(0.30, 0.62), 'Open_Palm');
  assert.equal(detectSwipe(b, S), GESTURES.NONE);
});

test('clean motion but pose flickers to None half the time → no fire (dominantPose null)', () => {
  const poses = ['Open_Palm', 'None', 'Open_Palm', 'None', 'Open_Palm', 'None', 'Open_Palm', 'None'];
  const b = buf(flat(0.5), ramp(0.30, 0.62), poses);
  assert.equal(detectSwipe(b, S), GESTURES.SWIPE_DOWN); // motion is clean…
  assert.equal(dominantPose(b, S), null);               // …but pose never agrees → suppressed
});

test('clean motion, all low-confidence (None) → dominantPose null', () => {
  const b = buf(flat(0.5), ramp(0.30, 0.62), 'None');
  assert.equal(dominantPose(b, S), null);
});

test('exactly 60% pose agreement is enough to fire (ceil(8*0.6)=5)', () => {
  const poses = ['Open_Palm', 'Open_Palm', 'Open_Palm', 'Open_Palm', 'Open_Palm', 'None', 'None', 'None'];
  const b = buf(flat(0.5), ramp(0.30, 0.62), poses);
  assert.equal(dominantPose(b, S), 'Open_Palm');
});

test('4/8 pose agreement is NOT enough (below the 5-frame floor)', () => {
  const poses = ['Open_Palm', 'Open_Palm', 'Open_Palm', 'Open_Palm', 'None', 'None', 'None', 'None'];
  const b = buf(flat(0.5), ramp(0.30, 0.62), poses);
  assert.equal(dominantPose(b, S), null);
});

test('partial buffer (still filling) → NONE', () => {
  const b = buf(ramp(0.3, 0.6, 4), ramp(0.3, 0.6, 4), 'Open_Palm');
  assert.equal(detectSwipe(b, S), GESTURES.NONE);
});

// ── A3 tension probe: how small a deliberate flick still registers ───────────────
// Not an assertion of desired behaviour — a documented measurement to co-tune A3.
test('A3 probe: a short clean flick just over threshold fires', () => {
  const b = buf(flat(0.5), ramp(0.40, 0.53), 'Open_Palm'); // dy 0.13, just over 0.12
  assert.equal(detectSwipe(b, S), GESTURES.SWIPE_DOWN);
});
