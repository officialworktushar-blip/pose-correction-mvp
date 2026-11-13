import type { ImageSize, LandmarkConfidence, PoseLandmark } from './types'

export const MEDIAPIPE_LANDMARK_NAMES = [
  'nose', 'leftEyeInner', 'leftEye', 'leftEyeOuter', 'rightEyeInner', 'rightEye', 'rightEyeOuter',
  'leftEar', 'rightEar', 'mouthLeft', 'mouthRight', 'leftShoulder', 'rightShoulder', 'leftElbow',
  'rightElbow', 'leftWrist', 'rightWrist', 'leftPinky', 'rightPinky', 'leftIndex', 'rightIndex',
  'leftThumb', 'rightThumb', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle',
  'leftHeel', 'rightHeel', 'leftFootIndex', 'rightFootIndex',
] as const

export type MediaPipeLandmarkName = typeof MEDIAPIPE_LANDMARK_NAMES[number]
export type RawLandmark = Omit<PoseLandmark, 'name' | 'coordinateSpace'> & { name?: string }

export interface VisibilityOptions {
  minVisibility?: number
  minPresence?: number
}

/** Missing, non-finite, or low-confidence landmarks are explicitly marked unreliable. */
export function filterLandmarkConfidence(
  landmarks: readonly (RawLandmark | undefined)[],
  options: VisibilityOptions = {},
): LandmarkConfidence[] {
  const minVisibility = options.minVisibility ?? 0.5
  const minPresence = options.minPresence ?? 0.5
  return Array.from(landmarks, (landmark, index) => {
    const name = landmark?.name ?? MEDIAPIPE_LANDMARK_NAMES[index] ?? `landmark-${index}`
    if (!landmark) return { name, reliable: false, reason: 'missing' }
    if (![landmark.x, landmark.y, landmark.z].every(Number.isFinite)) return { name, visibility: landmark.visibility, presence: landmark.presence, reliable: false, reason: 'invalid-coordinate' }
    if ([landmark.visibility, landmark.presence].some((score) => score !== undefined && (!Number.isFinite(score) || score < 0 || score > 1))) return { name, visibility: landmark.visibility, presence: landmark.presence, reliable: false, reason: 'invalid-coordinate' }
    if (landmark.visibility !== undefined && landmark.visibility < minVisibility) return { name, visibility: landmark.visibility, presence: landmark.presence, reliable: false, reason: 'low-visibility' }
    if (landmark.presence !== undefined && landmark.presence < minPresence) return { name, visibility: landmark.visibility, presence: landmark.presence, reliable: false, reason: 'low-presence' }
    return { name, visibility: landmark.visibility, presence: landmark.presence, reliable: true }
  })
}

/** Convert MediaPipe normalized x/y into aspect-correct pixel-space coordinates for image-plane geometry. */
export function normalizedImagePoint(landmark: PoseLandmark, imageSize: ImageSize) {
  if (landmark.coordinateSpace !== 'image-normalized') throw new TypeError('Expected normalized image-space landmarks.')
  if (!(imageSize.width > 0 && imageSize.height > 0)) throw new RangeError('Image dimensions must be positive.')
  return { x: landmark.x * imageSize.width, y: landmark.y * imageSize.height }
}

/** Smooth coordinates with a low-latency EMA. Alpha 1 disables smoothing. */
export class LandmarkSmoother {
  private previous = new Map<number, PoseLandmark>()
  private lastTimestamp: number | undefined
  private readonly options: { alpha?: number; timeConstantMs?: number; minVisibility?: number }

  constructor(options: { alpha?: number; timeConstantMs?: number; minVisibility?: number } = {}) {
    this.options = options
    const alpha = options.alpha ?? 0.65
    if (alpha < 0 || alpha > 1) throw new RangeError('Smoothing alpha must be between 0 and 1.')
    if (options.timeConstantMs !== undefined && options.timeConstantMs <= 0) throw new RangeError('Smoothing time constant must be positive.')
  }

  smooth(landmarks: readonly PoseLandmark[], timestampMs: number): PoseLandmark[] {
    const baseAlpha = this.options.alpha ?? 0.65
    const timeConstantMs = this.options.timeConstantMs
    const dt = this.lastTimestamp === undefined ? undefined : Math.max(0, timestampMs - this.lastTimestamp)
    const alpha = timeConstantMs && dt !== undefined ? 1 - Math.exp(-dt / timeConstantMs) : baseAlpha
    this.lastTimestamp = timestampMs
    return landmarks.map((point, index) => {
      const trusted = (point.visibility ?? 1) >= (this.options.minVisibility ?? 0.5) && (point.presence ?? 1) >= 0.5
      if (!trusted) {
        this.previous.delete(index)
        return { ...point }
      }
      const previous = this.previous.get(index)
      const smoothed = previous && previous.coordinateSpace === point.coordinateSpace
        ? { ...point, x: previous.x + alpha * (point.x - previous.x), y: previous.y + alpha * (point.y - previous.y), z: previous.z + alpha * (point.z - previous.z) }
        : { ...point }
      this.previous.set(index, smoothed)
      return smoothed
    })
  }

  reset() {
    this.previous.clear()
    this.lastTimestamp = undefined
  }
}
