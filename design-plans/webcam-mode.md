# Design Plan: Webcam mode for the Sugarcane demo

> Audit + implementation plan for adding a webcam toggle to `DemoCanvas`, following the `improve-ui` skill protocol. The plan is written against the existing design system — no new tokens, no new primitives unless the system cannot express the decision.

---

## Design language

- **Audited surface:** The demo surface (`DemoCanvas` + `App.css` lines 343-665), which renders the model load state, the drop zone / result canvas, the result actions row (`Try another image` button), and the detections + classes legend footer. The webcam toggle will live in this surface and must reuse its primitives.
- **Design sources:** `frontend/src/App.css` (`:root` design tokens, lines 2-21; component styles lines 343-665); `frontend/src/components/DemoCanvas.tsx` (presentational structure). No `DESIGN.md` exists in the repo.
- **Documented decisions:** Tokens only — no prose design doc. Tokens define: palette (sugarcane greens `--bg #f4fdf8`, `--accent #22c55e`, `--text #064e3b`), 4-level shadow scale (`--shadow-sm/md/lg/hover`), 3-level radius scale (`--radius-sm 12px / md 20px / lg 24px`), font families (`--font-heading Inter`, `--font-mono SF Mono`), and 4px-padded transition timing `0.2s ease` on interactive primitives.
- **Governing owners and consumers:** `:root` tokens in `App.css` govern all surfaces. Within the demo surface, the reused primitive is `.btn-secondary` (lines 522-546): transparent background, `1.5px solid #4318ff`, `padding 10px 22px`, `border-radius 10px`, `transition 0.2s ease`, hover-inverts to filled `#4318ff` + white text. The drop-zone (lines 420-475) and detection-item (lines 588-605) share the same `var(--border)` + `border-radius 12px` card vocabulary.
- **Explicit exceptions:** None documented.

### Drift observed (not in scope for this plan, recorded for a future audit)

The `btn-secondary` uses `#4318ff` (purple) while every other accent in the surface uses `#22c55e` (sugarcane green) and its dark shade `#16a34a`. This is a palette inconsistency that a future `improve-ui` pass could flag (the `hero-cta` at line 231 uses green; the `btn-secondary` uses purple; the `latency` chip at line 573 uses `#ea580c` orange). Out of scope for the webcam feature — recorded here so a future audit doesn't re-derive it.

---

## Findings

| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | The demo surface has no webcam affordance — drag & drop is the only input mode. The existing result-actions row already proves a secondary-action button pattern (`.btn-secondary`) that a webcam toggle should reuse for visual consistency. | `App.css:516-546` defines `.btn-secondary` and `DemoCanvas.tsx:171-181` already renders it conditionally for `Try another image`. The primitive exists and is governed by the same `:root` tokens as the rest of the demo. | Add a `Webcam mode` toggle next to the existing `Try another image` button using the same `.btn-secondary` primitive. When active, invert to the filled variant (reuse `.btn-secondary:hover` styling) so the toggle has a clear pressed state. | `DemoCanvas.tsx` button rendering + `App.css` `.btn-secondary.active` variant | High |
| 2 | When the webcam is active, the drop-zone must show the live video feed in place of the static upload placeholder — but the current `.drop-zone` CSS uses `aspect-ratio: 16/9` and centers content, which already fits a `<video>` element if we mirror the `.result-canvas` object-fit rule. | `App.css:420-432` defines `.drop-zone` (16/9, flex center), `App.css:463-470` defines `.result-canvas` (`max-width/height 100%`, `object-fit: contain`). The video element should reuse `.result-canvas` sizing to stay inside the existing frame. | Render the `<video>` element with the same `result-canvas` class (or a new `.webcam-video` class that extends it). The inference overlay `<canvas>` should stack on top via absolute positioning matching `.drop-zone`'s `position: relative`. | `DemoCanvas.tsx` video element + CSS reuse | High |
| 3 | The webcam runtime loop must not break the drop-zone's drag & drop path when stopped. The existing `handleDrop` / `handleFileInput` / `resetToUpload` cycle relies on `imageUrl` state and revoking object URLs; adding webcam state must reset cleanly so the drop zone returns to upload mode without dangling refs. | `DemoCanvas.tsx:54-115` — `handleFile` creates an object URL, `resetToUpload` revokes it. Webcam uses `streamRef` + `videoRef` which are independent refs and won't interfere with `imageUrl` if cleansed properly. | On webcam stop: stop all `streamRef.current.getTracks()`, clear `webcamIntervalRef`, reset `results`/`latency` state, and leave `imageUrl` untouched so the upload path remains in its prior state. | `DemoCanvas.tsx` webcam teardown | High |

## Improve first

**Finding #1 — the webcam toggle.** Highest leverage because it's the entire visible affordance for the new feature. The primitive `.btn-secondary` already exists and has a documented active state (`:hover`); promoting that to a permanent `.btn-secondary.active` variant is a one-line CSS change that gives the toggle a clear "on" state without inventing new tokens. The other two findings are upstream/downstream of #1 — without the toggle, the video feed (#2) and teardown (#3) have no entry point.

---

## Implementation plan (executor context)

The executor has no other context. Implement these changes in order. Each step is self-contained.

### Step 1 — Add `btn-secondary.active` variant to `App.css`

**File:** `frontend/src/App.css`, after the existing `.btn-secondary:active` rule (line 546).

**Change:** Add a new rule that promotes the hover state to a permanent active state, so the webcam toggle has a clear "on" visual. Keep the exact same values as `.btn-secondary:hover` (lines 537-541).

```css
.btn-secondary.active {
  background: #4318ff;
  color: white;
  box-shadow: 0 6px 14px rgba(67, 24, 255, 0.25);
}
```

This reuses the existing primitive — no new tokens, the active state is the documented hover state made permanent.

### Step 2 — Add webcam state to `DemoCanvas.tsx`

**File:** `frontend/src/components/DemoCanvas.tsx`

**Change:** The state declarations have already been added (refs + state for `webcamActive`, `webcamError`, `webcamPredicting`). Confirm they're present after the existing `useFallback` state (around line 24 in the updated file).

### Step 3 — Add the `startWebcam` / `stopWebcam` handlers

**File:** `frontend/src/components/DemoCanvas.tsx`

Add two `useCallback` handlers:

- `startWebcam`: calls `navigator.mediaDevices.getUserMedia({ video: true })`, assigns to `videoRef.current.srcObject`, sets `webcamActive=true`, clears `webcamError`. On failure, sets `webcamError` to the error message (covers permission denied, no camera). Starts the 5fps interval (`WEBCAM_INTERVAL_MS = 200`) that calls `runInference(model, videoRef.current, CONF_THRESHOLD)`, renders with `annotate(canvas, videoRef.current, res)`, and reports latency via `reportLatency(...)` — reusing the exact same flow as `handleFile` lines 71-83.
- `stopWebcam`: stops `streamRef.current.getTracks().forEach(t => t.stop())`, clears the interval, sets `webcamActive=false`. Does NOT touch `imageUrl` so the upload path remains intact.

The handlers must depend on `model` and `useFallback` — same deps as `handleFile`.

### Step 4 — Render the toggle in the result-actions row

**File:** `frontend/src/components/DemoCanvas.tsx`, replace the conditional render block at lines 171-181 (`{imageUrl && !predicting && (...)}`).

**Change:** Replace it with a row that shows:
- When `!webcamActive`: a `Webcam mode` button (`.btn-secondary`) alongside the existing `Try another image` button (which only shows if `imageUrl` is set).
- When `webcamActive`: a `Stop webcam` button (`.btn-secondary.active`) instead.

The buttons share the same `result-actions` flex container — no new layout primitive.

### Step 5 — Render the `<video>` when webcam is active

**File:** `frontend/src/components/DemoCanvas.tsx`, inside the drop-zone conditional block (lines 148-160).

**Change:** When `webcamActive` is true, render a `<video>` element (autoPlay, muted, playsInline) with the `result-canvas` class (so it inherits the existing `max-width 100%` + `object-fit contain` sizing), plus the inference `<canvas>` positioned absolutely on top at the same size. Hide the `drop-placeholder` when video is active.

```tsx
{webcamActive ? (
  <>
    <video ref={videoRef} autoPlay muted playsInline className="result-canvas" />
    <canvas ref={canvasRef} className="result-canvas" style={{ position: 'absolute', inset: 0 }} />
  </>
) : imageUrl ? (
  <canvas ref={canvasRef} className="result-canvas" />
) : (
  <div className="drop-placeholder">...</div>
)}
```

### Step 6 — Update the detections panel label during webcam mode

**File:** `frontend/src/components/DemoCanvas.tsx`, in the detections panel (around line 184-195).

**Change:** When `webcamActive` is true, the `<h3>Detections {latency && <span className="latency">{latency.toFixed(0)}ms</span>}</h3>` should continue showing the live latency from the most recent webcam frame. No structural change needed — the existing state slice `latency` is updated by the webcam loop too.

Show `webcamError` in the existing `.error` element (line 195) — that primitive already exists for inference errors and is reused.

### Step 7 — Cleanup on unmount

**File:** `frontend/src/components/DemoCanvas.tsx`, add to the existing `useEffect` cleanup (or a new one).

**Change:** Stop the webcam stream + clear the interval when the component unmounts, so navigating to `#/dashboard` doesn't leak the camera.

### Step 8 — Build + typecheck + visual smoke test

**Commands:**

```bash
cd frontend && npx tsc -b --noEmit
cd frontend && npm run build
```

Then manually verify in the dev server:
- The `Webcam mode` button is visible in `result-actions`.
- Clicking it requests camera permission.
- Live video + inference overlay render at 5fps.
- The `Stop webcam` button (active variant) is visible.
- Clicking it stops the video, releases the camera (Browser DevTools → Permissions tab should show camera released), and the drop-zone returns to the upload placeholder.
- Drag & drop still works after a webcam session — `Try another image` appears, a new image overwrites the canvas.

### Step 9 — Commit + push

Commit message should reference this design plan and mention that the toggle reuses `.btn-secondary` deliberately to stay inside the design system.

---

## What this plan does NOT do (explicit exclusions)

- Does NOT unify the purple/green palette drift — recorded in the audit notes above but out of scope.
- Does NOT add new design tokens — every visual decision is expressed with existing tokens or existing primitives.
- Does NOT implement an `IndexedDB` cache for the model — out of scope (PLAN.md Fase D-equivalent deferred).
- Does NOT touch the dashboard surface (`MetricsTicker`) — different surface, different audit.
