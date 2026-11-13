import assert from 'node:assert/strict'
import test from 'node:test'
import type { JointAngle, PoseAnalysis, PoseLandmark } from '../../biomechanics/types.ts'
import { BicepsCurlAnalyzer, DEFAULT_BICEPS_CURL_CONFIG, type BicepsCurlConfig } from './bicepsCurlAnalyzer.ts'

function quickConfig(overrides: Partial<BicepsCurlConfig> = {}): BicepsCurlConfig {
  return { ...DEFAULT_BICEPS_CURL_CONFIG, arms: 'left', confirmationFrames: 2, movementDeadbandDegrees: 1,
    curlStartFlexionDeltaDegrees: 10, minimumCurlFlexionDeltaDegrees: 25,
    fullCurlFlexionDeltaDegrees: 75, returnToStartFlexionDeltaDegrees: 10,
    maxLoweringSpeedDegreesPerSecond: 500, ...overrides }
}

test('detects starting, curling, fully flexed, lowering and completed phases', () => {
  const analyzer = new BicepsCurlAnalyzer(quickConfig())
  assert.equal(arm(analyzer.update(frame(0), undefined, 0), 'left')?.phase, 'starting')
  analyzer.update(frame(15), undefined, 100)
  assert.equal(arm(analyzer.update(frame(30), undefined, 200), 'left')?.phase, 'curling-up')
  assert.equal(arm(analyzer.update(frame(80), undefined, 300), 'left')?.phase, 'fully-flexed')
  analyzer.update(frame(70), undefined, 400)
  assert.equal(arm(analyzer.update(frame(60), undefined, 500), 'left')?.phase, 'lowering-down')
  analyzer.update(frame(30), undefined, 600)
  analyzer.update(frame(5), undefined, 700)
  const completed = analyzer.update(frame(3), undefined, 800)
  assert.equal(arm(completed, 'left')?.phase, 'completed')
  assert.equal(arm(completed, 'left')?.repetitionCompleted, true)
  assert.equal(completed.totalRepetitions, 1)
  assert.equal(arm(analyzer.update(frame(2), undefined, 900), 'left')?.repetitions, 1)
})

test('does not count a partial curl and asks the user to complete it', () => {
  const analyzer = new BicepsCurlAnalyzer(quickConfig())
  analyzer.update(frame(0), undefined, 0)
  analyzer.update(frame(15), undefined, 100)
  analyzer.update(frame(30), undefined, 200)
  analyzer.update(frame(45), undefined, 300)
  analyzer.update(frame(35), undefined, 400)
  analyzer.update(frame(25), undefined, 500)
  analyzer.update(frame(15), undefined, 600)
  analyzer.update(frame(5), undefined, 700)
  const partial = analyzer.update(frame(3), undefined, 800)
  assert.equal(partial.totalRepetitions, 0)
  assert.equal(partial.feedback.some((item) => item.code === 'incomplete'), true)
})

test('tracks left and right arms independently', () => {
  const analyzer = new BicepsCurlAnalyzer(quickConfig({ arms: 'both' }))
  const result = analyzer.update(frame(0), undefined, 0)
  assert.equal(result.arms.left?.phase, 'starting')
  assert.equal(result.arms.right?.phase, 'starting')
  const oneArmHidden = frame(0)
  oneArmHidden.rawLandmarks[11] = { ...oneArmHidden.rawLandmarks[11]!, visibility: 0.1 }
  const next = analyzer.update(oneArmHidden, undefined, 100)
  assert.equal(next.arms.left?.visibilitySufficient, false)
  assert.equal(next.arms.right?.visibilitySufficient, true)
})

test('reports elbow stability, shoulder elevation, torso swing and controlled lowering cues', () => {
  const config = quickConfig({ maxElbowDriftTorsoRatio: 0.02, maxShoulderElevationTorsoRatio: 0.01,
    maxTorsoSwingDegrees: 2, maxLoweringSpeedDegreesPerSecond: 80 })
  const analyzer = new BicepsCurlAnalyzer(config)
  analyzer.update(frame(0), undefined, 0)
  analyzer.update(frame(15), undefined, 100)
  analyzer.update(frame(30), undefined, 200)
  const strained = frame(40, { elbowX: 0.7, shoulderY: 0.16, shoulderX: 0.7 })
  analyzer.update(strained, undefined, 300)
  const feedbackFrame = analyzer.update(strained, undefined, 400)
  const codes = arm(feedbackFrame, 'left')?.feedback.map((item) => item.code) ?? []
  assert.equal(codes.includes('elbow-stability'), true)
  assert.equal(codes.includes('shoulder-elevation'), true)
  assert.equal(codes.includes('torso-swing'), true)

  analyzer.update(frame(70), undefined, 500)
  analyzer.update(frame(80), undefined, 600)
  analyzer.update(frame(60), undefined, 650)
  analyzer.update(frame(40), undefined, 700)
  const lowering = analyzer.update(frame(20), undefined, 750)
  assert.equal(arm(lowering, 'left')?.feedback.some((item) => item.code === 'controlled-lowering'), true)
})

function arm(result: ReturnType<BicepsCurlAnalyzer['update']>, side: 'left' | 'right') { return result.arms[side] }

function frame(flexion: number, tweak: { elbowX?: number; shoulderY?: number; shoulderX?: number } = {}): PoseAnalysis {
  const points: PoseLandmark[] = Array.from({ length: 33 }, (_, index) => ({ name: `p${index}`, x: 0.5, y: 0.5, z: 0,
    visibility: 0.99, presence: 0.99, coordinateSpace: 'image-normalized' }))
  points[11] = point(tweak.shoulderX ?? 0.5, tweak.shoulderY ?? 0.2)
  points[13] = point(tweak.elbowX ?? 0.45, 0.38)
  points[15] = point(0.45, 0.55)
  points[23] = point(0.5, 0.56)
  points[12] = point(0.7, 0.2); points[14] = point(0.72, 0.38); points[16] = point(0.72, 0.55); points[24] = point(0.7, 0.56)
  const jointAngles: JointAngle[] = [
    ['leftElbow', 180 - flexion], ['rightElbow', 180 - flexion],
  ].map(([joint, degrees]) => ({ joint: joint as JointAngle['joint'], degrees: degrees as number, reliable: true,
    coordinateSpace: 'image-2d', unit: 'degrees', confidence: [] }))
  return { orientation: 'front', coordinateSpace: 'image-2d', imageSize: { width: 640, height: 480 }, rawLandmarks: points,
    smoothedLandmarks: points, confidence: points.map((p) => ({ name: p.name, visibility: p.visibility, presence: p.presence, reliable: true })),
    jointAngles }
}

function point(x: number, y: number): PoseLandmark {
  return { name: 'sample', x, y, z: 0, visibility: 0.99, presence: 0.99, coordinateSpace: 'image-normalized' }
}
