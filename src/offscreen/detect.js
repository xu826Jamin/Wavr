// Pure gesture-detection core (A4). Kept free of DOM / MediaPipe / chrome APIs so
// it can be unit-tested under Node against synthetic motion traces. offscreen.js
// owns the live state (positionBuffer, settings) and passes it in.

export const GESTURES = {
  SWIPE_UP: 'SWIPE_UP', SWIPE_DOWN: 'SWIPE_DOWN',
  SWIPE_LEFT: 'SWIPE_LEFT', SWIPE_RIGHT: 'SWIPE_RIGHT',
  NONE: 'NONE',
};

// Confident, actionable poses → gestureMap key prefix. 'None' (low-confidence) is
// deliberately absent: an ambiguous hand must map to NO action, never to open_*.
export const POSE_PREFIX = {
  Open_Palm:   'open_',
  Closed_Fist: 'closed_',
  Pointing_Up: 'pointing_',
  Victory:     'victory_',
};

// Video is 640×480 (4:3). MediaPipe normalised coords: x spans width, y spans height.
// Scale x by W/H so both axes measure equal physical distance per unit.
export const VIDEO_ASPECT = 640 / 480; // ≈ 1.333

// Returns a GESTURES.* direction, or NONE. `buffer` is [{x, y, pose}], `settings`
// supplies { bufferSize, velocityThreshold, directness }.
export function detectSwipe(buffer, settings) {
  const n = buffer.length;
  if (n < settings.bufferSize) return GESTURES.NONE;

  // Aspect-consistent coords so both axes measure equal physical distance per unit.
  const xs = buffer.map(p => p.x * VIDEO_ASPECT);
  const ys = buffer.map(p => p.y);
  const ax = xs[n - 1] - xs[0]; // net horizontal
  const ay = ys[n - 1] - ys[0]; // net vertical
  const t  = settings.velocityThreshold;

  const vertical = Math.abs(ay) >= Math.abs(ax);
  const net      = vertical ? ay : ax; // signed displacement on the dominant axis
  const offNet   = vertical ? ax : ay; // displacement on the other axis
  if (Math.abs(net) < t) return GESTURES.NONE;

  // A4 false-positive guard #1 — monotonicity: a deliberate swipe travels mostly
  // one way, so |net| is a large fraction of the total path. Incidental wrist
  // motion (reaching, eating) wanders back and forth → low ratio → rejected.
  const seq = vertical ? ys : xs;
  let path = 0;
  for (let i = 1; i < n; i++) path += Math.abs(seq[i] - seq[i - 1]);
  if (path === 0 || Math.abs(net) / path < settings.directness) return GESTURES.NONE;

  // A4 false-positive guard #2 — axis purity: reject diagonal flails. The off-axis
  // travel must be a minority of the dominant-axis travel; a ~45° diagonal has
  // off ≈ dominant and is rejected, an axis-aligned swipe has off ≈ 0 and passes.
  if (Math.abs(offNet) > Math.abs(net) * settings.axisPurity) return GESTURES.NONE;

  if (vertical) return net < 0 ? GESTURES.SWIPE_UP   : GESTURES.SWIPE_DOWN;
  return            net < 0 ? GESTURES.SWIPE_LEFT : GESTURES.SWIPE_RIGHT;
}

// The pose held across a strong majority of the buffered window, or null. Requiring
// agreement (not one confident frame) rejects single-frame pose flicker and is the
// core of the A4 fix: 'None'/low-confidence frames count toward nothing, so an
// ambiguous hand can never reach a fire. `settings` supplies { bufferSize, poseAgree }.
export function dominantPose(buffer, settings) {
  const counts = {};
  for (const p of buffer) {
    if (POSE_PREFIX[p.pose]) counts[p.pose] = (counts[p.pose] || 0) + 1;
  }
  let best = null, bestN = 0;
  for (const k in counts) if (counts[k] > bestN) { bestN = counts[k]; best = k; }
  return bestN >= Math.ceil(settings.bufferSize * settings.poseAgree) ? best : null;
}
