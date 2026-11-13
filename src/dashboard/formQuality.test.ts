import assert from 'node:assert/strict'
import test from 'node:test'
import type { SquatResult } from '../exercises/squat/squatAnalyzer.ts'
import type { BicepsCurlResult } from '../exercises/biceps-curl/bicepsCurlAnalyzer.ts'
import { DEFAULT_FORM_QUALITY_CONFIG, scoreCurlForm, scoreSquatForm } from './formQuality.ts'

test('squat quality scores only side-view measurements available for the active view', () => {
  const result = squatResult({ orientation: 'side', phase: 'bottom', metrics: { hipToKneeRatio: 0, torsoLeanDegrees: 30,
    averageKneeFlexionDegrees: 55, leftKneeAngleDegrees: 120, rightKneeAngleDegrees: 124, leftHipAngleDegrees: 80,
    rightHipAngleDegrees: 82, leftKneeInward: null, rightKneeInward: null } })
  const quality = scoreSquatForm(result)
  assert.equal(quality.score, 100)
  assert.deepEqual(quality.criteria.map((item) => item.key), ['depth', 'torso'])
})

test('configurable score thresholds and weights affect the result transparently', () => {
  const result = squatResult({ orientation: 'front', phase: 'descending', metrics: { leftKneeInward: true, rightKneeInward: false,
    leftKneeAngleDegrees: 100, rightKneeAngleDegrees: 135 } })
  const config = { ...DEFAULT_FORM_QUALITY_CONFIG, weights: { alignment: 3, symmetry: 1 } }
  const quality = scoreSquatForm(result, config)
  assert.equal(quality.score, 0)
  assert.equal(quality.criteria[0]?.passed, false)
  assert.equal(quality.criteria[0]?.weight, 3)
})

test('insufficient visibility produces no numerical score', () => {
  const result = squatResult({ visibilitySufficient: false })
  const quality = scoreSquatForm(result)
  assert.equal(quality.score, null)
  assert.equal(quality.confidenceWarning, true)
})

test('curl score uses only confident arms and measurable criteria', () => {
  const curl = {
    orientation: 'front', totalRepetitions: 0, feedback: [], arms: {
      left: { arm: 'left', phase: 'curling-up', direction: 'up', repetitions: 0, repetitionCompleted: false,
        visibilitySufficient: true, feedback: [], metrics: { elbowFlexionDegrees: 60, elbowAngleDegrees: 120, upperArmDeviationDegrees: 5,
          elbowDriftTorsoRatio: 0.1, shoulderElevationTorsoRatio: 0.05, torsoSwingDegrees: 3, loweringSpeedDegreesPerSecond: 0 } },
      right: { arm: 'right', phase: 'curling-up', direction: 'up', repetitions: 0, repetitionCompleted: false,
        visibilitySufficient: false, feedback: [], metrics: { elbowFlexionDegrees: null, elbowAngleDegrees: null, upperArmDeviationDegrees: null,
          elbowDriftTorsoRatio: null, shoulderElevationTorsoRatio: null, torsoSwingDegrees: null, loweringSpeedDegreesPerSecond: null } },
    },
  } as BicepsCurlResult
  const quality = scoreCurlForm(curl)
  assert.equal(quality.score, 100)
  assert.equal(quality.confidenceWarning, true)
  assert.equal(quality.criteria.length, 3)
})

function squatResult(overrides: Partial<SquatResult>): SquatResult {
  return { orientation: 'front', phase: 'descending', direction: 'down', repetitions: 0, repetitionCompleted: false,
    visibilitySufficient: true, feedback: [], ...overrides,
    metrics: { averageKneeFlexionDegrees: 40, leftKneeAngleDegrees: 130, rightKneeAngleDegrees: 130,
      leftHipAngleDegrees: 140, rightHipAngleDegrees: 140, hipToKneeRatio: null, hipHeightRatio: 1,
      torsoLeanDegrees: null, leftKneeInward: false, rightKneeInward: false, ...overrides.metrics } }
}
