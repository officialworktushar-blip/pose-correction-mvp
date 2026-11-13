import { calculateAngleABC2D, calculateAngleABC3D } from './angles.ts'
import { filterLandmarkConfidence, MEDIAPIPE_LANDMARK_NAMES, normalizedImagePoint, type VisibilityOptions } from './landmarks.ts'
import type { ImageSize, JointAngle, JointName, LandmarkConfidence, PoseAnalysis, PoseLandmark, PoseOrientation } from './types.ts'

const JOINTS: ReadonlyArray<{ joint: JointName; a: number; b: number; c: number }> = [
  { joint: 'leftElbow', a: 11, b: 13, c: 15 }, { joint: 'rightElbow', a: 12, b: 14, c: 16 },
  { joint: 'leftShoulder', a: 13, b: 11, c: 23 }, { joint: 'rightShoulder', a: 14, b: 12, c: 24 },
  { joint: 'leftHip', a: 11, b: 23, c: 25 }, { joint: 'rightHip', a: 12, b: 24, c: 26 },
  { joint: 'leftKnee', a: 23, b: 25, c: 27 }, { joint: 'rightKnee', a: 24, b: 26, c: 28 },
  { joint: 'leftAnkle', a: 25, b: 27, c: 31 }, { joint: 'rightAnkle', a: 26, b: 28, c: 32 },
]

export interface AnalyzePoseOptions extends VisibilityOptions {
  orientation?: PoseOrientation
}

function angleForTriplet(
  joint: JointName,
  landmarks: readonly PoseLandmark[],
  confidence: readonly LandmarkConfidence[],
  indices: [number, number, number],
  space: 'image-2d' | 'world-3d',
  imageSize?: ImageSize,
): JointAngle {
  const [aIndex, bIndex, cIndex] = indices
  const confidenceForTriplet = indices.map((index) => confidence[index] ?? {
    name: MEDIAPIPE_LANDMARK_NAMES[index] ?? `landmark-${index}`, reliable: false, reason: 'missing' as const,
  })
  const unreliable = confidenceForTriplet.find((item) => !item.reliable)
  if (unreliable) return { joint, degrees: null, reliable: false, coordinateSpace: space, unit: 'degrees', confidence: confidenceForTriplet, reason: `${unreliable.name} is ${unreliable.reason ?? 'unreliable'}` }

  const a = landmarks[aIndex]
  const b = landmarks[bIndex]
  const c = landmarks[cIndex]
  if (!a || !b || !c) return { joint, degrees: null, reliable: false, coordinateSpace: space, unit: 'degrees', confidence: confidenceForTriplet, reason: 'A required landmark is missing.' }

  const degrees = space === 'image-2d'
    ? calculateAngleABC2D(normalizedImagePoint(a, imageSize!), normalizedImagePoint(b, imageSize!), normalizedImagePoint(c, imageSize!))
    : calculateAngleABC3D(a, b, c)
  return { joint, degrees, reliable: degrees !== null, coordinateSpace: space, unit: 'degrees', confidence: confidenceForTriplet, reason: degrees === null ? 'The angle is undefined because a segment has zero length.' : undefined }
}

function buildAngles(
  landmarks: readonly PoseLandmark[],
  confidence: readonly LandmarkConfidence[],
  space: 'image-2d' | 'world-3d',
  imageSize?: ImageSize,
) {
  return JOINTS.map(({ joint, a, b, c }) => ({
    ...angleForTriplet(joint, landmarks, confidence, [a, b, c], space, imageSize),
    joint,
  }))
}

/** Analyze normalized image landmarks. x and y are scaled by separate image dimensions before angle calculation. */
export function analyzeImagePose(
  rawLandmarks: readonly PoseLandmark[],
  smoothedLandmarks: readonly PoseLandmark[],
  imageSize: ImageSize,
  options: AnalyzePoseOptions = {},
): PoseAnalysis {
  assertSpace(rawLandmarks, 'image-normalized')
  assertSpace(smoothedLandmarks, 'image-normalized')
  const confidence = filterLandmarkConfidence(rawLandmarks, options)
  return {
    orientation: options.orientation ?? 'front',
    coordinateSpace: 'image-2d',
    imageSize,
    rawLandmarks: [...rawLandmarks],
    smoothedLandmarks: [...smoothedLandmarks],
    confidence,
    jointAngles: buildAngles(smoothedLandmarks, confidence, 'image-2d', imageSize),
  }
}

/** Analyze MediaPipe world landmarks in 3D meters; no image normalization or pixel scaling is applied. */
export function analyzeWorldPose(
  rawLandmarks: readonly PoseLandmark[],
  smoothedLandmarks: readonly PoseLandmark[],
  options: AnalyzePoseOptions = {},
): PoseAnalysis {
  assertSpace(rawLandmarks, 'world-meters')
  assertSpace(smoothedLandmarks, 'world-meters')
  const confidence = filterLandmarkConfidence(rawLandmarks, options)
  return {
    orientation: options.orientation ?? 'front',
    coordinateSpace: 'world-3d',
    rawLandmarks: [...rawLandmarks],
    smoothedLandmarks: [...smoothedLandmarks],
    confidence,
    jointAngles: buildAngles(smoothedLandmarks, confidence, 'world-3d'),
  }
}

function assertSpace(landmarks: readonly PoseLandmark[], expected: PoseLandmark['coordinateSpace']) {
  if (landmarks.some((landmark) => landmark.coordinateSpace !== expected)) {
    throw new TypeError(`Expected ${expected} landmarks; image and world coordinates cannot be mixed.`)
  }
}
