import assert from 'node:assert/strict'
import test from 'node:test'
import type { JointAngle, PoseAnalysis, PoseLandmark } from '../../biomechanics/types.ts'
import { DEFAULT_SQUAT_CONFIG, SquatAnalyzer, type SquatConfig } from './squatAnalyzer.ts'

const quickConfig = (): SquatConfig => ({ ...DEFAULT_SQUAT_CONFIG, confirmationFrames: 2,
  movementStartFlexionDegrees: 10, minimumRepFlexionDegrees: 25, bottomFlexionDegrees: 35,
  returnToStandingFlexionDegrees: 10, movementDeadbandDegrees: 1, reversalHysteresisDegrees: 4 })

test('follows standing, descending, bottom, ascending and completed phases, counting once', () => {
  const analyzer = new SquatAnalyzer(quickConfig())
  let result = analyzer.update(frame(0, 'side'), worldFrame(0))
  assert.equal(result.phase, 'standing')
  analyzer.update(frame(15, 'side'), worldFrame(15))
  result = analyzer.update(frame(25, 'side'), worldFrame(25))
  assert.equal(result.phase, 'descending')
  result = analyzer.update(frame(40, 'side'), worldFrame(40))
  assert.equal(result.phase, 'bottom')
  analyzer.update(frame(30, 'side'), worldFrame(30))
  result = analyzer.update(frame(20, 'side'), worldFrame(20))
  assert.equal(result.phase, 'ascending')
  analyzer.update(frame(5, 'side'), worldFrame(5))
  result = analyzer.update(frame(4, 'side'), worldFrame(4))
  assert.equal(result.phase, 'completed')
  assert.equal(result.repetitionCompleted, true)
  assert.equal(result.repetitions, 1)
  result = analyzer.update(frame(2, 'side'), worldFrame(2))
  assert.equal(result.repetitions, 1)
  assert.equal(result.phase, 'standing')
})

test('does not count an incomplete shallow repetition and prompts completion', () => {
  const analyzer = new SquatAnalyzer(quickConfig())
  analyzer.update(frame(0, 'side'), worldFrame(0))
  analyzer.update(frame(15, 'side'), worldFrame(15))
  analyzer.update(frame(22, 'side'), worldFrame(22))
  analyzer.update(frame(16, 'side'), worldFrame(16))
  analyzer.update(frame(9, 'side'), worldFrame(9))
  analyzer.update(frame(5, 'side'), worldFrame(5))
  analyzer.update(frame(4, 'side'), worldFrame(4))
  const result = analyzer.update(frame(3, 'side'), worldFrame(3))
  assert.equal(result.repetitions, 0)
  assert.equal(result.feedback.some((item) => item.code === 'incomplete'), true)
})

test('front-view knee alignment feedback requires confirmation frames', () => {
  const analyzer = new SquatAnalyzer(quickConfig())
  analyzer.update(frame(0, 'front', true))
  analyzer.update(frame(15, 'front', true))
  analyzer.update(frame(25, 'front', true))
  const result = analyzer.update(frame(30, 'front', true))
  assert.equal(result.orientation, 'front')
  assert.equal(result.feedback.some((item) => item.code === 'knee-alignment'), true)
})

test('front-view left/right angle difference raises uneven-movement feedback', () => {
  const analyzer = new SquatAnalyzer({ ...quickConfig(), asymmetryThresholdDegrees: 8 })
  analyzer.update(frame(0, 'front'))
  analyzer.update(frame(15, 'front'))
  analyzer.update(frame(25, 'front'))
  const uneven = frame(30, 'front')
  uneven.jointAngles = uneven.jointAngles.map((angle) => angle.joint === 'rightKnee' ? { ...angle, degrees: 125 } : angle)
  analyzer.update(uneven)
  const result = analyzer.update(uneven)
  assert.equal(result.feedback.some((item) => item.code === 'asymmetry'), true)
})

test('side-view depth and torso feedback use configurable thresholds', () => {
  const config = { ...quickConfig(), minimumHipToKneeRatio: 0.1, maximumTorsoLeanDegrees: 20 }
  const analyzer = new SquatAnalyzer(config)
  analyzer.update(frame(0, 'side'))
  analyzer.update(frame(15, 'side'))
  analyzer.update(frame(25, 'side'))
  analyzer.update(frame(40, 'side'))
  const result = analyzer.update(frame(45, 'side'))
  assert.equal(result.feedback.some((item) => item.code === 'depth'), true)
  assert.equal(result.feedback.some((item) => item.code === 'torso-lean'), true)
})

test('poor landmark visibility suppresses correction feedback', () => {
  const analyzer = new SquatAnalyzer(quickConfig())
  const poor = frame(35, 'front', true)
  poor.rawLandmarks[25] = { ...poor.rawLandmarks[25]!, visibility: 0.1 }
  const result = analyzer.update(poor)
  assert.equal(result.visibilitySufficient, false)
  assert.deepEqual(result.feedback.map((item) => item.code), ['visibility'])
  assert.equal(result.repetitions, 0)
})

function frame(flexion: number, orientation: 'front' | 'side', kneesInward = false): PoseAnalysis {
  const points: PoseLandmark[] = Array.from({ length: 33 }, (_, index) => ({ name: `p${index}`, x: 0.5, y: 0.5, z: 0,
    visibility: 0.99, presence: 0.99, coordinateSpace: 'image-normalized' }))
  points[11] = point(0.5, 0.18); points[12] = point(0.5, 0.18)
  const hipY = 0.39 + Math.min(flexion, 60) * 0.0035
  points[23] = point(0.42, hipY)
  points[24] = point(0.58, hipY)
  points[25] = point(kneesInward ? 0.47 : 0.35, 0.6); points[26] = point(kneesInward ? 0.53 : 0.65, 0.6)
  points[27] = point(0.28, 0.82); points[28] = point(0.72, 0.82)
  points[29] = point(0.26, 0.84); points[30] = point(0.74, 0.84)
  points[31] = point(0.24, 0.85); points[32] = point(0.76, 0.85)
  if (orientation === 'side') {
    points[11] = point(0.14, 0.18)
    points[23] = point(0.42, hipY)
  }
  const angles: JointAngle[] = [
    ['leftKnee', 180 - flexion], ['rightKnee', 180 - flexion], ['leftHip', 170], ['rightHip', 170],
  ].map(([joint, degrees]) => ({ joint: joint as JointAngle['joint'], degrees: degrees as number, reliable: true,
    coordinateSpace: 'image-2d', unit: 'degrees', confidence: [] }))
  return { orientation, coordinateSpace: 'image-2d', imageSize: { width: 640, height: 480 }, rawLandmarks: points,
    smoothedLandmarks: points, confidence: points.map((p) => ({ name: p.name, visibility: p.visibility, presence: p.presence, reliable: true })), jointAngles: angles }
}

function point(x: number, y: number): PoseLandmark {
  return { name: 'sample', x, y, z: 0, visibility: 0.99, presence: 0.99, coordinateSpace: 'image-normalized' }
}

function worldFrame(flexion: number) {
  const angles = frame(flexion, 'side').jointAngles.map((angle) => ({ ...angle, coordinateSpace: 'world-3d' as const }))
  const points = frame(flexion, 'side').rawLandmarks.map((p) => ({ ...p, coordinateSpace: 'world-meters' as const }))
  return { orientation: 'side' as const, coordinateSpace: 'world-3d' as const, rawLandmarks: points, smoothedLandmarks: points,
    confidence: frame(flexion, 'side').confidence, jointAngles: angles }
}
