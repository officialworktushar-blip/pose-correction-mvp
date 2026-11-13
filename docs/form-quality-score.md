# Form quality score

The dashboard score is a configurable checklist implemented in `src/dashboard/formQuality.ts`. It is descriptive UI feedback, not a medical measure, diagnosis, safety guarantee, or scientifically validated score.

The default score is the equally weighted percentage of *measurable criteria that pass*. Criteria without the required landmarks or angle data are excluded; a low-confidence state returns no numerical score and shows a warning. When only some body parts are visible, the visible criteria can produce a score, accompanied by a confidence warning for omitted arm measurements.

| Exercise and view | Measured criteria |
| --- | --- |
| Squat, side view | Hip-to-knee depth ratio and torso inclination, compared with the corresponding `SquatConfig` thresholds. |
| Squat, front view | Visible inward knee movement and left/right knee-angle difference. |
| Biceps curl | Elbow drift relative to the user's torso, shoulder elevation relative to that arm's neutral posture, torso swing relative to neutral, and lowering speed while lowering. Each arm contributes criteria only when its required landmarks are sufficiently visible. |

`DEFAULT_FORM_QUALITY_CONFIG` contains the score bands, measurable thresholds, and optional per-criterion weights. Use `scoreSquatForm(result, config)` / `scoreCurlForm(result, config)` with a customized config to change thresholds or weights. The default status bands are good at 85+, warning at 60–84, and incorrect below 60. If no criteria are measurable, the score is `null` and the status is waiting.
