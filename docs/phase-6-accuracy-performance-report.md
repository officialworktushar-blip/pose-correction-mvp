# Phase 6 — Pose Detection Accuracy and Performance QA

**Assessment date:** 2026-11-14  
**Scope:** repository audit, deterministic biomechanics/exercise tests, production build, and runtime instrumentation review.

## Summary

The automated suite validates angle geometry and side mapping, confidence suppression, view-specific squat metrics, squat and curl phases, and repetition counting using synthetic landmark sequences. It is not a substitute for testing the model on real camera footage. No physical camera session, labeled pose dataset, or target device benchmark was available in this run; therefore no model accuracy percentages or device performance figures are reported.

The curl repetition suite exposed baseline drift between repeated reps. Starting-flexion calibration now updates only while the arm is stable in its starting range. The camera also now records model/WASM initialization duration and average synchronous inference duration when used, and surfaces an inference failure instead of silently stopping the render loop.

## Automated test cases and results

`npm test` passed **24/24 tests** after fixes.

| Test case | Result | Evidence / scope |
|---|---|---|
| Joint angle vector math, 2D and 3D | PASS | Right-angle, zero-length, coordinate-space and aspect-correction tests. |
| Left/right landmark mapping | PASS | Asymmetric left/right elbow and knee geometry asserts independent expected angles. |
| Front-view squat | PASS (synthetic) | Knee alignment, left/right asymmetry, phase transitions, shallow reps and poor-visibility suppression. |
| Side-view squat | PASS (synthetic) | Depth and torso feedback use side-view measurements and configurable thresholds. |
| Front-view biceps curl | PASS (synthetic) | All phases, both-arm visibility independence, technique cues, partial reps and repeated reps. |
| Side-view biceps curl | PASS (synthetic) | Analyzer uses the matching 3D world elbow angle when side orientation is selected. |
| Repeated movement / duplicate count stability | PASS (synthetic) | Squat test verifies one count per cycle; curl test verifies two complete cycles. |
| Missing/low-confidence landmarks | PASS (synthetic) | Joint angles become unreliable; squat feedback is limited to visibility warning; hidden curl arm is excluded. |
| Fast/slow movement | PARTIAL (synthetic) | Curl lowering speed is calculated from timestamps and tested against a configured speed limit. Variable cadence, dropped frames and squat cadence were not replayed from video. |
| Different camera distances | NOT RUN | Requires real or recorded camera input at multiple subject sizes. |
| Lighting variation | NOT RUN | Requires camera footage under controlled lighting. |
| Pixel-level occlusion | NOT RUN | Confidence gating is tested with synthetic low-confidence landmarks, not image occlusion through the model. |
| False-positive/false-negative correction rate | NOT MEASURED | Requires a labeled representative movement set and independent review criteria. |
| All real-time state transitions | PARTIAL | Deterministic state machine transitions are covered; no live-model transition validation was performed. |

## Performance observations

- `npm run build` completed successfully. The build output reported 31 transformed modules; the main production JS bundle was 425.38 kB (128.39 kB gzip), and CSS was 34.37 kB (7.99 kB gzip).
- `npm run lint` completed with no reported findings.
- The app has no recorded Heavy or Full inference benchmark from a physical device. The camera overlay displays approximate processed FPS. It now also displays combined WASM + model initialization time and a rolling average of `detectForVideo` call duration after a camera session starts.
- These are synchronous main-thread call durations, not end-to-end camera latency. They do not include frame queue delay, browser scheduling, or time to paint the overlay.
- No reliable cross-browser memory measurement was collected. `performance.memory` is non-standard and may be unavailable; GPU/WASM allocation is not fully visible to the page.
- MediaPipe inference and canvas rendering remain on the main thread. React analysis state is rate-limited to roughly four updates per second, while canvas drawing follows new video frames. Heavy may still make the UI unresponsive on slower hardware until the current low-FPS fallback activates.

## Heavy vs Full comparison

**Not benchmarked in this report.** No camera/device test session was available, and there is no labeled dataset for a defensible accuracy comparison. Inference speed or landmark confidence alone would not establish accuracy. Compare the models on the same recorded, consented clips and device, with identical resolution, browser, delegate, warm-up, repetitions, and lighting; include human-reviewed landmark/feedback labels and per-model initialization, average/p95 inference duration, FPS, and memory where measurable.

Heavy remains the initial model. This audit makes no automatic switch to Full and does not add an automatic Full fallback. Existing low-FPS behavior may switch Heavy to Lite, as implemented in the prior phase. No replacement recommendation is made without benchmark results and approval.

## Bugs fixed

1. **Curl baseline drift across repetitions:** the neutral flexion baseline could update while the user was already moving into a curl. Calibration now updates only when the arm is stable and within its starting range; a repeated-cycle regression test covers it.
2. **Inference loop failure visibility:** an exception from `detectForVideo` could terminate the frame loop without updating the camera status. Inference errors now release the stream, close the landmarker, and expose an error state so the user can restart.
3. **Missing performance observability:** initialization duration and mean inference call time are now collected in bounded one-second windows and displayed during a session.

## Known limitations and remaining work

- Synthetic landmark fixtures validate engine math and state behavior, not MediaPipe detector accuracy under camera distance, lighting, occlusion, clothing, body variation, or movement speed.
- Front/side selection is a user-selected analysis orientation; the app does not automatically verify that the person is actually facing front or side.
- 2D image angles can be distorted by camera perspective. Side-view joint angles use world landmarks when reliable, but the depth/torso heuristics remain image-space measures.
- No independent video-frame benchmark harness or ground-truth annotation workflow exists yet. A Heavy-vs-Full accuracy/performance comparison remains outstanding.
- Validate model initialization, permission/error recovery, stopping/unmount cleanup, GPU/CPU fallback, responsive UI and memory on representative browsers and hardware before making accuracy or production readiness claims.
