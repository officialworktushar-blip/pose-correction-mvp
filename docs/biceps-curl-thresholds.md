# Biceps curl analysis thresholds

The independent biceps curl state machine is in `src/exercises/biceps-curl/bicepsCurlAnalyzer.ts`. Defaults are adjustable starting points, not universal movement targets. Customize by spreading `DEFAULT_BICEPS_CURL_CONFIG` and passing the full config to `new BicepsCurlAnalyzer(config)`. The analysis uses the user's starting elbow extension as a per-arm flexion baseline, and normalizes arm movement against that person's torso length.

| Setting | Default | Meaning |
| --- | ---: | --- |
| `arms` | `both` | Track the left arm, right arm, or both independently. Each arm maintains a separate phase and rep count. |
| `minLandmarkConfidence` | 0.55 | Minimum visibility and presence for shoulder, elbow, wrist, and hip. Poor visibility suppresses technique corrections for that arm. |
| `maxStartingFlexionDegrees` | 35° | Maximum elbow flexion at which an arm can establish its starting baseline. |
| `curlStartFlexionDeltaDegrees` | 25° | Flexion increase from the user's own baseline that starts a curl. |
| `minimumCurlFlexionDeltaDegrees` | 40° | Minimum curl excursion needed for reversal to be recognized as the top of an attempt. |
| `fullCurlFlexionDeltaDegrees` | 95° | Flexion increase from baseline for a repetition to count. Adjust this for each user's range. |
| `returnToStartFlexionDeltaDegrees` | 18° | How close flexion must return to baseline before the lowering phase can finish. |
| `movementDeadbandDegrees` | 2.5° | Per-frame flexion change ignored as small movement noise. |
| `confirmationFrames` | 3 frames | Consecutive directional/correction observations used to reduce phase or feedback flicker. |
| `maxElbowDriftTorsoRatio` | 0.22 torso lengths | Maximum elbow displacement in the shoulder/torso coordinate frame from the user's starting arm position. |
| `maxShoulderElevationTorsoRatio` | 0.14 torso lengths | Maximum upward shoulder movement relative to the hip, scaled by the starting torso length. |
| `maxTorsoSwingDegrees` | 12° | Maximum torso angle change from the user's starting posture. |
| `maxLoweringSpeedDegreesPerSecond` | 360°/s | Elbow extension speed above which the controlled-lowering cue appears. |

Elbow angles use 3D world landmarks when the selected view is side-on and the world angle is reliable; otherwise the analyzer uses the separate 2D image-space angle. Position and torso checks use aspect-correct image coordinates. The `Dumbbell` / `No dumbbell` control is user-selected context only. No object tracking or weight measurement is performed. Feedback is limited to movement cues and does not diagnose injury.
