# Squat analysis thresholds

Squat analysis is implemented in `src/exercises/squat/squatAnalyzer.ts`. Each threshold is a field in `DEFAULT_SQUAT_CONFIG`. To customize, create a full config with `{ ...DEFAULT_SQUAT_CONFIG, minimumRepFlexionDegrees: 42 }` and pass it to `new SquatAnalyzer(config)`. The defaults are starting references for this MVP, not universal technique targets. Tune them for the user, camera distance, and movement style. No threshold diagnoses injury or guarantees exercise safety.

| Setting | Default | Meaning |
| --- | ---: | --- |
| `minLandmarkConfidence` | 0.55 | Minimum MediaPipe visibility and presence for the landmarks required by the active view. Poor confidence suppresses coaching and displays an insufficient-visibility warning. |
| `movementStartFlexionDegrees` | 18° | Knee flexion change from the user's calibrated standing position that arms a rep. |
| `minimumRepFlexionDegrees` | 35° | Minimum flexion reached during a cycle before it can count as a repetition. This is configurable per user; it is not an ideal knee angle. |
| `bottomFlexionDegrees` | 55° | Optional phase marker for identifying a deep/bottom position. Reversal detection can also mark the bottom. |
| `returnToStandingFlexionDegrees` | 12° | Tolerance from the standing baseline for recognizing the top of a rep. |
| `movementDeadbandDegrees` | 2.5° | Small knee-flexion changes inside this deadband are treated as noise. |
| `hipMovementDeadbandRatio` | 0.012 leg lengths | Minimum vertical hip-height change, paired with knee movement, used to confirm direction. |
| `reversalHysteresisDegrees` | 8° | Flexion reversal from the tracked deepest point required to recognize direction change. |
| `confirmationFrames` | 3 frames | Consecutive observations used to confirm phase changes and correction cues. |
| `minimumHipToKneeRatio` | -0.08 leg lengths | Side-view hip height relative to knee height, normalized by knee-to-ankle length. Image y grows downward; a more negative value means hips remain farther above the knee line. |
| `maximumTorsoLeanDegrees` | 45° | Maximum estimated forward torso inclination from vertical in side view. Forward direction is estimated from heel-to-foot-index direction. |
| `kneeInwardRatioThreshold` | 0.72 | In front view, the knee's distance from hip midline divided by foot-center distance; smaller ratios indicate visible inward collapse. |
| `minKneeInwardOffsetRatio` | 0.035 image width | Minimum foot-center offset from center before inward-collapse comparison is used, to avoid tiny pixel jitter. |
| `asymmetryThresholdDegrees` | 18° | Left/right knee angle difference that triggers uneven-movement feedback in front view. |

Side view is used for depth, selected-side world-space hip/knee angles, and sagittal torso lean. Front view is used for bilateral knee alignment and left/right angle comparison. The analyzer does not apply side-view knee-valgus checks or front-view depth judgments. All position geometry uses aspect-correct pixel coordinates derived from normalized image landmarks; world angles use only MediaPipe world coordinates in meters.
