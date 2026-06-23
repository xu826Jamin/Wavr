import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';
import { GESTURES, POSE_PREFIX, detectSwipe, dominantPose } from './detect.js';

const DEV_MODE = typeof chrome !== 'undefined' &&
  chrome.runtime?.getManifest?.()?.version?.includes('dev');

function debug(...args) {
  if (DEV_MODE) console.log('[wavr/offscreen]', ...args);
}

const ACTION_LABELS = {
  SCROLL_UP: 'Scroll up', SCROLL_DOWN: 'Scroll down',
  GO_BACK: 'Go back', GO_FORWARD: 'Go forward',
  SCROLL_TOP: 'Scroll to top', SCROLL_BOTTOM: 'Scroll to bottom',
  SCROLL_UP_PAGE: 'Page up', SCROLL_DOWN_PAGE: 'Page down',
  NEW_TAB: 'New tab', CLOSE_TAB: 'Close tab',
  NONE: 'Do nothing',
};
const settings = {
  cooldownMs: 600,
  velocityThreshold: 0.12,
  bufferSize: 8,
  directness: 0.7, // min |net displacement| / |path travelled| on the dominant axis (A4)
  axisPurity: 0.7, // max off-axis travel as a fraction of dominant-axis travel (A4)
  poseAgree: 0.6,  // fraction of the buffer that must share one confident pose to fire (A4)
};

// POSE_PREFIX is imported from detect.js. Emoji are display-only, used here.
const POSE_EMOJI = { Open_Palm: '🖐', Closed_Fist: '✊', Pointing_Up: '☝', Victory: '✌' };

let deadZoneRadius = 0.10;
let gestureMap = {
  open_swipe_up: 'SCROLL_UP', open_swipe_down: 'SCROLL_DOWN',
  open_swipe_left: 'GO_BACK', open_swipe_right: 'GO_FORWARD',
  closed_swipe_up: 'SCROLL_UP_PAGE', closed_swipe_down: 'SCROLL_DOWN_PAGE',
  closed_swipe_left: 'NONE', closed_swipe_right: 'NONE', // B3: demote destructive defaults until A4 is hardware-validated
  pointing_swipe_up: 'NONE', pointing_swipe_down: 'NONE',
  pointing_swipe_left: 'NONE', pointing_swipe_right: 'NONE',
  victory_swipe_up: 'NONE', victory_swipe_down: 'NONE',
  victory_swipe_left: 'NONE', victory_swipe_right: 'NONE',
};

let gestureRecognizer = null;
let lastGestureTime = 0;
let lastStateTime = 0;

// ── Idle auto-pause (A1) ───────────────────────────────────────────────────────
// recognizeForVideo is expensive; running it every 33ms with no hand present is
// pure battery/heat drain. After IDLE_AFTER_MS with no landmarks we throttle the
// inference loop to IDLE_FRAME_MS and stop relaying VIDEO_FRAME (the overlay just
// freezes on its last frame — harmless, no hand to track). Full rate resumes the
// instant a hand reappears.
const ACTIVE_FRAME_MS = 33;
const IDLE_FRAME_MS    = 300;
const IDLE_AFTER_MS    = 4000;
let lastHandSeen = 0;
let idle         = false;
let frameTimer   = null;

function setFrameRate(ms) {
  if (frameTimer) clearInterval(frameTimer);
  frameTimer = setInterval(processFrame, ms);
}
const positionBuffer = [];
let gestureOrigin        = null;
let waitingForReset      = false;
let waitingForResetSince = 0;
let deadZoneAnchor       = null;
let poseChangeScroll     = false;
let lastPose             = null;

// ── Cursor mode state ─────────────────────────────────────────────────────────
let cursorMode    = false;
let cursorMirrorX = false;
let cursorZone    = { cx: 0.5, cy: 0.5, w: 0.6, h: 0.6 };
let smoothX       = 0.5;
let smoothY       = 0.5;
const EMA         = 0.28;
let handWasOpen   = true;
let handOpenSince = 0;
let lastClickTime = 0;
let CLICK_DWELL_MS    = 200;
const CLICK_COOLDOWN_MS = 500;

// ── Thumb Up hold state ───────────────────────────────────────────────────────
let thumbUpStart   = 0;
let thumbUpToggled = false; // blocks re-trigger until thumb is lowered
let THUMB_UP_HOLD_MS = 400;

const video = document.getElementById('video');

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SET_GESTURE_MAP')   gestureMap     = message.gestureMap;
  if (message.type === 'SET_DEAD_ZONE_ANCHOR') deadZoneAnchor = message.anchor;
  if (message.type === 'SET_DEAD_ZONE_RADIUS') deadZoneRadius = message.radius;
  if (message.type === 'SET_MIRROR_X')      cursorMirrorX  = message.mirrorX;
  if (message.type === 'SET_CURSOR_ZONE')   cursorZone     = message.zone;
  if (message.type === 'SET_CURSOR_TIMINGS') {
    if (message.timings?.thumbHoldMs  != null) THUMB_UP_HOLD_MS = message.timings.thumbHoldMs;
    if (message.timings?.clickDwellMs != null) CLICK_DWELL_MS   = message.timings.clickDwellMs;
  }
  if (message.type === 'SET_POSE_CHANGE_SCROLL') poseChangeScroll = message.enabled;
});

async function init() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL('assets/wasm')
    );
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL('assets/gesture_recognizer.task'),
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });

    video.srcObject = stream;
    await new Promise(resolve => { video.onloadedmetadata = () => { video.play(); resolve(); }; });

    debug('ready');
    chrome.runtime.sendMessage({ type: 'GET_GESTURE_MAP' }, (response) => {
      if (chrome.runtime.lastError) { debug('GET_GESTURE_MAP failed:', chrome.runtime.lastError.message); return; }
      if (response?.gestureMap)                gestureMap     = response.gestureMap;
      deadZoneAnchor = response?.deadZoneAnchor ?? { x: 0.5, y: 0.5 };
      if (response?.deadZoneRadius != null)    deadZoneRadius = response.deadZoneRadius;
      if (response?.cursorMirrorX !== undefined) cursorMirrorX = response.cursorMirrorX;
      if (response?.cursorZone)                cursorZone     = response.cursorZone;
      if (response?.cursorTimings?.thumbHoldMs  != null) THUMB_UP_HOLD_MS = response.cursorTimings.thumbHoldMs;
      if (response?.cursorTimings?.clickDwellMs != null) CLICK_DWELL_MS   = response.cursorTimings.clickDwellMs;
      if (response?.poseChangeScroll !== undefined)      poseChangeScroll  = response.poseChangeScroll;
    });
    lastHandSeen = Date.now(); // grace period before first idle transition
    setFrameRate(ACTIVE_FRAME_MS);

    // Relay camera frames to PiP overlay (content scripts can't open a second stream on most cameras)
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width  = 320;
    frameCanvas.height = 240;
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
    setInterval(() => {
      if (idle || video.readyState < 2) return; // A1: stop relay while idle
      frameCtx.drawImage(video, 0, 0, 320, 240);
      chrome.runtime.sendMessage({
        type: 'VIDEO_FRAME',
        data: frameCanvas.toDataURL('image/jpeg', 0.8),
      }).catch(() => {});
    }, 100);

  } catch (err) {
    console.error('wavr offscreen error:', err.name, err.message);
    const msg = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
      ? 'Camera access denied. Click the camera icon in the address bar to allow.'
      : 'Camera unavailable. Check that no other app is using it.';
    chrome.runtime.sendMessage({ type: 'CAMERA_ERROR', message: msg }).catch(() => {});
  }
}

function mapCursorPosition(wrist) {
  const rawX   = cursorMirrorX ? 1 - wrist.x : wrist.x;
  const left   = cursorZone.cx - cursorZone.w / 2;
  const right  = cursorZone.cx + cursorZone.w / 2;
  const top    = cursorZone.cy - cursorZone.h / 2;
  const bottom = cursorZone.cy + cursorZone.h / 2;
  // Outside zone: cursor freezes at last position
  if (rawX < left || rawX > right || wrist.y < top || wrist.y > bottom) return;
  const zx = (rawX    - left) / (right - left);
  const zy = (wrist.y - top)  / (bottom - top);
  smoothX = EMA * zx + (1 - EMA) * smoothX;
  smoothY = EMA * zy + (1 - EMA) * smoothY;
}

function processFrame() {
  if (!gestureRecognizer || video.readyState < 2) return;
  const now     = Date.now();
  const results = gestureRecognizer.recognizeForVideo(video, now);

  if (!results.landmarks?.length) {
    positionBuffer.length = 0;
    waitingForReset = false;
    waitingForResetSince = 0;
    thumbUpStart   = 0;
    thumbUpToggled = false;
    lastPose       = null;
    // A1: throttle inference + relay once the hand has been gone long enough.
    if (!idle && now - lastHandSeen > IDLE_AFTER_MS) {
      idle = true;
      setFrameRate(IDLE_FRAME_MS);
    }
    return;
  }

  // Hand present — resume full rate immediately if we were idling.
  lastHandSeen = now;
  if (idle) {
    idle = false;
    setFrameRate(ACTIVE_FRAME_MS);
  }

  // Only the dominant (first) hand is processed; a second hand is intentionally ignored.
  const wrist     = results.landmarks[0][0];
  const topGesture = results.gestures?.[0]?.[0];
  const pose      = (topGesture?.score ?? 0) >= 0.75 ? topGesture.categoryName : 'None';

  const isOpen     = pose === 'Open_Palm'; // A4: ambiguous 'None' is no longer treated as open
  const isClosed   = pose === 'Closed_Fist';
  const isThumbUp  = pose === 'Thumb_Up';

  // ── Thumb Up hold → toggle cursor mode ───────────────────────────────────────
  if (isThumbUp) {
    if (!thumbUpStart) thumbUpStart = now;
    if (!thumbUpToggled && now - thumbUpStart > THUMB_UP_HOLD_MS && now - lastGestureTime > settings.cooldownMs) {
      lastGestureTime = now;
      thumbUpStart    = 0;
      thumbUpToggled  = true;
      cursorMode      = !cursorMode;
      if (cursorMode) {
        mapCursorPosition(wrist);
        handWasOpen   = isOpen;
        handOpenSince = now;
      }
      chrome.runtime.sendMessage({ type: 'CURSOR_MODE_CHANGE', active: cursorMode });
      chrome.runtime.sendMessage({ type: 'GESTURE_DISPLAY', label: cursorMode ? '👍 Cursor ON' : '👍 Cursor OFF' });
    }
    lastPose = null; // prevent false pose-change on thumb-up frames
    return;
  } else {
    thumbUpStart   = 0;
    thumbUpToggled = false;
  }

  const prevPose = lastPose;
  lastPose = pose;

  // ── Cursor mode ───────────────────────────────────────────────────────────────
  if (cursorMode) {
    // Cursor position — always tracks wrist (open palm is the "move" state)
    mapCursorPosition(wrist);

    // Click logic: open palm arms the click; only open-palm → fist fires a click
    if (isOpen) {
      if (!handWasOpen) handOpenSince = now;
      handWasOpen = true;
    } else if (isClosed) {
      if (handWasOpen && (now - handOpenSince > CLICK_DWELL_MS) && (now - lastClickTime > CLICK_COOLDOWN_MS)) {
        lastClickTime = now;
        handWasOpen   = false;
        chrome.runtime.sendMessage({ type: 'CURSOR_CLICK', x: smoothX, y: smoothY });
      } else {
        handWasOpen = false;
      }
    } else {
      // Pointing, victory, etc. — disarm click so fist after these doesn't click
      handWasOpen = false;
    }

    if (now - lastStateTime > 33) {
      lastStateTime = now;
      const dwellProgress = isOpen ? Math.min((now - handOpenSince) / CLICK_DWELL_MS, 1.0) : 0;
      chrome.runtime.sendMessage({ type: 'CURSOR_STATE', x: smoothX, y: smoothY, clicking: isClosed, dwellProgress, cursorZone, wristX: wrist.x, wristY: wrist.y }).catch(() => {});
    }

    // ── Gesture actions in cursor mode (pointing + victory swipes still work) ──
    const activeOrigin = deadZoneAnchor || gestureOrigin;
    if (waitingForReset && activeOrigin) {
      const dx = wrist.x - activeOrigin.x;
      const dy = wrist.y - activeOrigin.y;
      const timedOut = now - waitingForResetSince > 3000;
      if (Math.sqrt(dx * dx + dy * dy) < deadZoneRadius || timedOut) {
        if (timedOut) debug('reset gate auto-released (cursor mode)');
        waitingForReset = false;
        positionBuffer.length = 0;
      } else {
        return;
      }
    }

    positionBuffer.push({ x: wrist.x, y: wrist.y, pose });
    if (positionBuffer.length > settings.bufferSize) positionBuffer.shift();

    // Pointing and victory swipes dispatch their configured actions while in cursor mode
    const gesture = detectSwipe(positionBuffer, settings);
    if (gesture !== GESTURES.NONE && now - lastGestureTime > settings.cooldownMs) {
      const firePose = dominantPose(positionBuffer, settings);
      if (firePose === 'Pointing_Up' || firePose === 'Victory') {
        lastGestureTime = now;
        gestureOrigin        = deadZoneAnchor ?? { x: positionBuffer[0]?.x ?? wrist.x, y: positionBuffer[0]?.y ?? wrist.y };
        waitingForReset      = true;
        waitingForResetSince = now;
        positionBuffer.length = 0;
        debug('reset gate set (cursor mode)');

        const prefix    = POSE_PREFIX[firePose];
        const action    = gestureMap[prefix + gesture.toLowerCase()] || 'NONE';

        if (action !== 'NONE') {
          const score = topGesture?.score ?? 0;
          chrome.runtime.sendMessage({ type: 'GESTURE_DETECTED', gesture, action });
          chrome.runtime.sendMessage({
            type: 'GESTURE_DISPLAY',
            label: `${POSE_EMOJI[firePose]} ${gesture.replace('_', ' ')} → ${ACTION_LABELS[action] || action} (${score.toFixed(2)})`,
            pose: POSE_PREFIX[firePose].slice(0, -1),                 // avatar reaction-confirmation
            dir: gesture.toLowerCase().replace('swipe_', ''),
          });
        }
      }
    }

    return;
  }

  // ── Swipe mode ────────────────────────────────────────────────────────────────
  const activeOrigin = deadZoneAnchor || gestureOrigin;

  if (now - lastStateTime > 66) {
    lastStateTime = now;
    chrome.runtime.sendMessage({
      type: 'OVERLAY_STATE',
      wristX: wrist.x, wristY: wrist.y,
      bufferFill: positionBuffer.length,
      bufferMax: settings.bufferSize,
      waitingForReset,
      originX: activeOrigin?.x,
      originY: activeOrigin?.y,
      deadZoneRadius,
    }).catch(() => {});
  }

  if (waitingForReset && activeOrigin) {
    const dx = wrist.x - activeOrigin.x;
    const dy = wrist.y - activeOrigin.y;
    const timedOut = now - waitingForResetSince > 3000;
    if (Math.sqrt(dx * dx + dy * dy) < deadZoneRadius || timedOut) {
      if (timedOut) debug('reset gate auto-released (swipe mode)');
      waitingForReset = false;
      positionBuffer.length = 0;
    } else {
      return;
    }
  }

  // D2: Pose-change scroll — open↔closed transition fires a scroll without a swipe
  if (poseChangeScroll && prevPose && pose !== prevPose && now - lastGestureTime > settings.cooldownMs) {
    let poseAction = null;
    if (prevPose === 'Open_Palm'   && pose === 'Closed_Fist') poseAction = 'SCROLL_DOWN';
    if (prevPose === 'Closed_Fist' && pose === 'Open_Palm')   poseAction = 'SCROLL_UP';
    if (poseAction) {
      lastGestureTime = now;
      chrome.runtime.sendMessage({ type: 'GESTURE_DETECTED', gesture: 'POSE_CHANGE', action: poseAction });
      chrome.runtime.sendMessage({
        type: 'GESTURE_DISPLAY',
        label: `${pose === 'Closed_Fist' ? '✊' : '🖐'} Pose change → ${ACTION_LABELS[poseAction]}`,
      });
      debug('pose-change', prevPose, '->', pose, '=>', poseAction);
    }
  }

  positionBuffer.push({ x: wrist.x, y: wrist.y, pose });
  if (positionBuffer.length > settings.bufferSize) positionBuffer.shift();

  const gesture = detectSwipe(positionBuffer, settings);
  if (gesture !== GESTURES.NONE && now - lastGestureTime > settings.cooldownMs) {
    // A4: a swipe only fires under a confident, stable pose held across the window.
    const firePose = dominantPose(positionBuffer, settings);
    if (firePose) {
      lastGestureTime = now;
      gestureOrigin        = deadZoneAnchor ?? { x: positionBuffer[0].x, y: positionBuffer[0].y };
      waitingForReset      = true;
      waitingForResetSince = now;
      positionBuffer.length = 0;
      debug('reset gate set (swipe mode)');

      const mapKey = POSE_PREFIX[firePose] + gesture.toLowerCase();
      const action = gestureMap[mapKey] || 'NONE';

      const score = topGesture?.score ?? 0;
      chrome.runtime.sendMessage({ type: 'GESTURE_DETECTED', gesture, action });
      chrome.runtime.sendMessage({
        type: 'GESTURE_DISPLAY',
        label: `${POSE_EMOJI[firePose]} ${gesture.replace('_', ' ')} → ${ACTION_LABELS[action] || action} (${score.toFixed(2)})`,
        pose: POSE_PREFIX[firePose].slice(0, -1),                     // avatar reaction-confirmation
        dir: gesture.toLowerCase().replace('swipe_', ''),
      });
      debug('gesture', gesture, '->', action);
    }
  }
}

init();
