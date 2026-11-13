import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeImagePose, analyzeWorldPose } from './analyzePose.ts'
import { calculateAngleABC2D, calculateAngleABC3D } from './angles.ts'
import { filterLandmarkConfidence, LandmarkSmoother, MEDIAPIPE_LANDMARK_NAMES } from './landmarks.ts'
import type { PoseLandmark } from './types.ts'

test('calculates a right angle in 2D and 3D', () => {
  assert.equal(calculateAngleABC2D({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }), 90)
  assert.equal(calculateAngleABC3D({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }), 90)
})

test('returns null for a zero-length segment', () => {
  assert.equal(calculateAngleABC2D({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }), null)
})

test('marks missing and low-confidence landmarks unreliable', () => {
  const result = filterLandmarkConfidence([
    { name: 'visible', x: 0, y: 0, z: 0, visibility: 0.9 },
    { name: 'faint', x: 0, y: 0, z: 0, visibility: 0.1 },
    undefined,
  ])
  assert.equal(result[0]?.reliable, true)
  assert.equal(result[1]?.reason, 'low-visibility')
  assert.equal(result[2]?.reason, 'missing')
})

test('does not emit a joint angle if a required landmark is missing or faint', () => {
  const pose = makePose()
  pose[15] = undefined as unknown as PoseLandmark
  const missing = analyzeImagePose(pose.slice(0, 15), pose.slice(0, 15), { width: 640, height: 480 })
  const missingElbow = missing.jointAngles.find((angle) => angle.joint === 'leftElbow')
  assert.equal(missingElbow?.degrees, null)
  assert.equal(missingElbow?.reliable, false)

  const lowConfidence = makePose()
  lowConfidence[15] = { ...lowConfidence[15]!, visibility: 0.1 }
  const faint = analyzeImagePose(lowConfidence, lowConfidence, { width: 640, height: 480 })
  const faintElbow = faint.jointAngles.find((angle) => angle.joint === 'leftElbow')
  assert.equal(faintElbow?.degrees, null)
  assert.equal(faintElbow?.confidence.some((item) => item.reason === 'low-visibility'), true)
})

test('aspect-corrects normalized image coordinates before angle analysis', () => {
  const pose = makePose()
  pose[11] = point(0.5, 0.25)
  pose[13] = point(0.5, 0.5)
  pose[15] = point(0.75, 0.5)
  const analysis = analyzeImagePose(pose, pose, { width: 800, height: 400 })
  assert.equal(analysis.coordinateSpace, 'image-2d')
  assert.equal(analysis.jointAngles.find((angle) => angle.joint === 'leftElbow')?.degrees, 90)
})

test('smoothing keeps raw inputs unchanged and obeys the configured alpha', () => {
  const smoother = new LandmarkSmoother({ alpha: 0.5 })
  const first = point(0, 0)
  const second = point(1, 0)
  smoother.smooth([first], 0)
  const smoothed = smoother.smooth([second], 16)
  assert.equal(second.x, 1)
  assert.equal(smoothed[0]?.x, 0.5)
})

test('world-space analysis is 3D and refuses normalized image coordinates', () => {
  const imagePose = makePose()
  assert.throws(() => analyzeWorldPose(imagePose, imagePose), /cannot be mixed/)
  const worldPose = imagePose.map((landmark) => ({ ...landmark, coordinateSpace: 'world-meters' as const }))
  const analysis = analyzeWorldPose(worldPose, worldPose, { orientation: 'side' })
  assert.equal(analysis.coordinateSpace, 'world-3d')
  assert.equal(analysis.orientation, 'side')
})

function makePose(): PoseLandmark[] {
  return MEDIAPIPE_LANDMARK_NAMES.map((name) => ({ name, x: 0.5, y: 0.5, z: 0, visibility: 0.99, presence: 0.99, coordinateSpace: 'image-normalized' }))
}

function point(x: number, y: number): PoseLandmark {
  return { name: 'test', x, y, z: 0, visibility: 0.99, presence: 0.99, coordinateSpace: 'image-normalized' }
}
