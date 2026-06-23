# Wavr Avatar — Art & Technical Spec (Phase 0)

Single source of truth for generation prompts and integration. Scope: **DEMO frame only**
(the `#gesture-explorer` `.mascot-frame`). Medium is **2D flat-vector** (3D banned — rule R1).

> **GATE (R2):** This bible must be approved by the user before ANY image is generated.

---

## 0.1 — Character bible

### Concept
A friendly **chibi-ninja** who lives inside the demo "webcam" frame and performs the
selected gesture. Reads as a cute, approachable mascot — *not* a menacing/weaponed ninja.
Weaponless. Always palm-to-camera. Think: the cheerful face of a hand-gesture product.

### Proportions (chibi)
- **Head ≈ 42% of total character height** (big-head chibi; pin 40–45%).
- Framing is a **seated upper-body / webcam selfie crop**: head + shoulders + one raised
  gesturing hand. No legs. Bottom of torso fills the lower frame edge.
- One **gesturing right hand** raised beside/above the head; the off (left) hand rests at the
  shoulder or out of frame.

### Silhouette & features (must read as a human face — north-star criterion)
- Round, soft head. Large expressive **eyes with a white highlight**, soft **eyebrows**,
  small nose, **warm friendly smile** visible. Optional cheek blush.
- **Ninja headband** across the forehead is the primary ninja signifier, with **two knot tails
  trailing to one side** (the side opposite the raised hand, so they don't collide).
- **Scarf worn loose around the neck / lower jaw — pulled DOWN, mouth visible.** A full
  face-covering mask is rejected because it kills the "human friendly face" requirement; the
  scarf gives the ninja read while the smile stays visible. *(Decision point — see below.)*
- Simple ninja gi/tunic for the torso. Clean, few details (flat-vector friendly).

### Wavr green woven in (brand tie)
- Brand mark is a **white→green sine wave on near-black** (`icon128`). Echo it:
  - Headband + scarf in the **Wavr green gradient** (`#4ade80` → lighter mint `#86efac`).
  - A subtle **wave/sine motif** embroidered on the headband or scarf hem (small, optional).
  - Keep green as the accent, not the whole costume — gi can be a neutral dark slate so the
    green pops (matches the dark-mode product aesthetic).

### Style (flat, outlined, appealing — the make-or-break look)
- **Flat-color cel/vector shading.** Clean uniform **dark outline** (`#0b0b0b`), consistent
  line weight. Max 1 soft shadow tone per color. **No** photoreal skin, no cinematic
  lighting, no gradients-as-rendering (gradients only for the brand green accent).
- Appealing, modern sticker/sprite quality — the reference bar is polished game/sticker art.

### Color tokens (pin these for cross-pose consistency — rule R4)
| Part | Color |
|---|---|
| Outline | `#0b0b0b` |
| Skin | `#f1c6a0` (shade `#e0a87f`) |
| Hair | `#5a3a22` (warm brown) |
| Gi / tunic | `#1f2937` slate (shade `#111827`) |
| Headband / scarf | Wavr green gradient `#4ade80` → `#86efac` |
| Eyes (iris) | `#6b4327` warm brown |
| Mouth | `#b45c50` |

### Personality
Upbeat, eager, "I got this" energy. Slight forward lean toward the camera. The gesture is
performed with confidence and a smile — it should feel like a friendly demo, not a threat.

### Off-brand / failure guardrails
- ❌ Menacing eyes, weapons (sword/shuriken/kunai), full face mask, dark/edgy mood.
- ❌ Realistic or 3D-rendered look; painterly shading; busy costume detail.
- ❌ Two hands gesturing (only the mapped hand performs; the other rests).

---

## 0.2 — The 16 canonical stills (4 poses × 4 directions)

**Universal rules:** the **right hand** performs; **palm faces the camera in every pose**;
fingers point generally upward; wrist visible; hand never clips the frame edge.

### 4 hand poses (the swapped art — rule R3)
| Pose | Hand drawing |
|---|---|
| **Open Palm** | All five fingers extended and **spread**, palm flat to camera. |
| **Closed Fist** | Fingers curled into a fist, **finger-curl/palm side to camera**, thumb wrapped across the front. |
| **Pointing** | **Index extended up**, middle/ring/pinky curled, thumb tucked; front to camera. |
| **Victory** | **Index + middle in a "V"**, ring + pinky curled, thumb tucked; palm to camera. |

### 4 swipe directions (motion of the raised hand; palm stays to camera throughout)
A swipe = a short **wind-up → follow-through** translation of the hand along one axis.
For **Path P** (favoured) each direction is the *same pose still* translated parametrically;
optionally a 2-frame pair (wind-up pose + follow-through pose) if a single still reads flat.

| Dir | Start (wind-up) | End (follow-through) | Body english |
|---|---|---|---|
| **Up** | hand at shoulder height | sweeps up above the head line | slight chin-up, eyes follow up |
| **Down** | hand raised high near head | sweeps down to chest height | slight nod down |
| **Left** | hand at the right side | sweeps across to viewer-left | lean/lean-glance left |
| **Right** | hand near center | sweeps out to viewer-right | lean/lean-glance right |

**Spike needs only:** ① Open-Palm front, neutral raise. ② Closed-Fist front (identity test).
Do **not** generate all 16 until Phase 2 sign-off (rules R2/R4).

---

## 0.3 — Frame & technical spec

| Property | Value | Source |
|---|---|---|
| Container | `.mascot-frame` (`#mascotFrame`) in right column of `.explorer-layout` | `popup.html` |
| Aspect ratio | **4:3** | `aspect-ratio: 4/3` |
| CSS render size | ~**390 × 293 px** (820px grid, 2 cols, 40px gap), min-height 200px | layout math |
| Device pixel ratio | up to **2×** → backing up to ~**780 × 586 px** | — |
| **Asset native size** | **1024 × 768 px** (4:3) so it's crisp at 2× with headroom | derived |
| Background | **Transparent** (PNG/WebP alpha) — composited over the `#050505` frame | — |
| **Safe margins** | Character art within the **central ~76%**; ≥12% padding every side so the hand never clips at swipe extremes | — |
| Vertical anchor | Head upper-third; torso base meets the bottom edge (webcam-selfie crop) | — |
| Export (Path P) | Per-pose transparent PNG/WebP, trimmed + normalized to identical canvas, hand on a **separable layer** so it can translate for the swipe | Phase 3 |
| Idle | Subtle bob/breathe when no gesture selected | Phase 4 |

---

## 0.4 — Licensing (Q-E) — **RESOLVED: PASS**

From Higgsfield's [Terms of Use](https://higgsfield.ai/terms-of-use-agreement) (primary source):

- ✅ **Ownership:** "Company does not claim ownership of any of your Inputs or Outputs."
- ✅ **Commercial use:** "nor does it restrict the use of Outputs for commercial use." No
  stated restriction blocks a published CWS product. Same terms on free and paid plans.
- ⚠️ **Caveat (not a blocker):** Higgsfield retains a non-exclusive, perpetual license to use
  inputs/outputs to **train their models** and for promotion. This concerns the *asset-creation*
  step only — a one-time, offline authoring workflow with **no end-user data** involved. It does
  **not** touch Wavr's "no data leaves the device" promise, which is about the shipped extension's
  webcam processing. Studio plans can opt out of training if we later want to.

**Verdict:** Higgsfield output is legally usable in the published extension. Proceed.

---

## Open questions still owned by the Phase-1 spike
- Q-A style hit · Q-B identity hold across poses · Q-C clean transparent bg · Q-D motion warp.
  All answered empirically on ONE asset before committing (rules R4/R6).

## Decisions — LOCKED (2026-06-22, user-approved)
1. **Face:** ✅ **Scarf UP / mask-up** — *revised at the spike* after seeing the generated art
   (`A_openpalm_z.png`). Green scarf covers the mouth like a classic ninja mask; **expression
   comes from the eyes/eyebrows only.** (Supersedes the original scarf-down lock.)
2. **Gi color:** ✅ **Dark slate** (`#1f2937`) so the Wavr-green headband/scarf pops.
3. **Path:** ✅ **Path P — puppet of stills** (final fork still confirmed empirically at Phase-1 gate).
4. **Art engine:** ✅ **`z_image`** (Higgsfield free tier, ~0.15 cr/img, 4:3 2048×1536).
   Recraft 4.1 was the ideal flat-vector model but is paid-only. `z_image` hit the style on the
   first try → **Q-A PASS.** Limitation: text-only (no reference image) → identity hold (Q-B) is
   the open risk.
5. **Art direction:** ✅ **Sleek minimal ninja** — *revised at R2* after the user rejected the
   first take as "too cartoonish, doesn't match the UI." See v2 bible below. (Supersedes §0.1's
   chibi direction; the chibi assets in `avatar-assets/spike/` are reference-only.)

---

## v2 character bible — SLEEK MINIMAL NINJA (LOCKED, supersedes §0.1)

The avatar must read **premium / designed**, matching the dark Vercel/Linear/Raycast UI — not cute.
Validated probe: `avatar-assets/v2/probe1_open_sleek.png` (+ `probe1_on_frame.png`).

- **Proportions:** natural, **small head** relative to body. NO chibi, NO big head, NO blush.
- **Framing:** upper-body webcam crop. **ONE gesturing right hand** raised, palm to camera; the
  **left arm hangs relaxed at the side** (consistent across all 4 poses & swipes).
- **Face:** **fully masked hood — only sharp, narrow, determined eyes visible. No mouth.**
  Expression lives entirely in the eyes/brow.
- **Palette (strict 2-tone + skin slit):** dark slate body `#1f2937`; single green accent
  `#4ade80` on a **thin headband** + a small **green sine-wave chest emblem** (the Wavr mark);
  thin crisp dark outline; flat fills; minimal geometric shading. Eyes = small warm skin slit.
- **Vibe:** restrained, elegant, brand-mark quality. Reads cleanly on `#050505` **with no white
  sticker border** (the border was a chibi-era artifact — dropped). Optional subtle green outer
  glow can be added in CSS at integration for extra pop.
- **Off-brand guardrails:** ❌ cuteness, blush, big head, visible mouth/smile, two raised hands,
  weapons, busy detail, sticker border.

---

## Phase-1 spike — generation prompts (rule R5: user generates, Claude specs)

Generate on Higgsfield (image). Square or 4:3 framing, **transparent / removable background**.
Generate **only these two** for the spike — do not make all 16.

### Prompt A — hero still (open palm)
> Flat 2D vector sticker illustration, cel-shaded, bold clean dark outline, friendly **chibi
> ninja** mascot, **big head (about 42% of body height)**, webcam-selfie crop showing head,
> shoulders and one raised hand. **Right hand raised beside the head, open palm facing the
> camera, all five fingers spread.** Large expressive eyes with a white highlight, soft
> eyebrows, small nose, **warm friendly smile (mouth visible)**, light cheek blush. Warm light
> skin (#f1c6a0), warm brown hair (#5a3a22). **Green ninja headband (#4ade80 to #86efac
> gradient) with two knot tails trailing to the left**, a loose green scarf worn **down around
> the neck (not covering the mouth)**, dark slate (#1f2937) ninja gi. Subtle sine-wave motif
> on the headband. Upbeat confident expression, slight lean toward camera. **Flat colors, max
> one soft shadow tone, no realistic shading, no 3D, no weapons.** Centered, transparent
> background, even margins so the hand does not touch the edges.

### Prompt B — identity test (closed fist), SAME character
> *(Use Higgsfield Soul ID / character-consistency from Prompt A's result, then:)* same chibi
> ninja mascot, identical face, hair, headband, scarf and gi, same flat outlined cel style —
> **now the raised right hand is a closed fist, finger-curl side facing the camera, thumb
> wrapped across the front.** Same pose framing, transparent background.

**Evaluate the spike against:** Q-A style hit (flat-chibi, not realistic) · Q-B identity held
between A and B · Q-C clean background removal · Q-D (later) motion warp. "Close" is not a pass
(R4) — we only proceed to Phase 2 on a clear yes.

### Spike results (2026-06-22) — ALL PASS, Path P confirmed
- **Q-A PASS** — `z_image` nailed the flat outlined cel sticker look first try (`A_openpalm_z.png`).
- **Q-B PASS (strong)** — `B_fist_z.png` is unmistakably the same character (headband + left tails,
  eyes, brows, mask, strapped slate tunic, proportions) despite z_image being text-only/no-ref.
  Identity holds because the prompt is highly prescriptive.
- **Q-C PASS** — cutout done in-repo with **zero credits** via `avatar-assets/removebg.cjs`
  (edge flood-fill, RGB-distance < 45 from the sampled corner grey). **Keep the white sticker
  border** — it separates the near-black character outline (`#0b0b0b`) from the `#050505` frame.
- **Q-D N/A** — Path P animates stills with CSS/JS transforms; no AI motion → nothing to warp.

### Cutout pipeline (repeatable, free)
`node avatar-assets/removebg.cjs` → reads `spike/*_z.png`, writes `*_cutout.png` (transparent,
white border kept). `preview.cjs` composites over `#050505` to sanity-check. THRESH=45 tuned to
keep skin (dist ~60) and white border (dist ~78) while lifting grey (197–221).

### Production approach (Path P) — credit-efficient
Generate **4 pose stills only** (open ✓, fist ✓, pointing, victory) — **NOT 16.** The 4 swipe
directions are produced **in code**: directional translate + slight tilt + motion-line/streak
overlay + a quick squash, on the whole-character sprite. Per-pose still cost ≈ 0.15 cr → the full
production set is ≈ 0.3 cr more (pointing + victory). The off/idle state = subtle bob (Phase 4).
