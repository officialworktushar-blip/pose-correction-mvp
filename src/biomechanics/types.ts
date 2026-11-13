/** Landmark coordinates retain their source space so image points cannot be confused with world points. */
export interface PoseLandmark {
  name: string
  x: number
  y: number
  z: number
  visibility?: number
  presence?: number
  coordinateSpace: 'image-normalized' | 'world-meters'
}

export interface LandmarkConfidence {
  name: string
  visibility?: number
  presence?: number
  reliable: boolean
  reason?: 'missing' | 'low-visibility' | 'low-presence' | 'invalid-coordinate'
}

export type JointName =
  | 'leftElbow' | 'rightElbow' | 'leftShoulder' | 'rightShoulder'
  | 'leftHip' | 'rightHip' | 'leftKnee' | 'rightKnee' | 'leftAnkle' | 'rightAnkle'

export interface JointAngle {
  joint: JointName
  degrees: number | null
  reliable: boolean
  coordinateSpace: 'image-2d' | 'world-3d'
  unit: 'degrees'
  confidence: LandmarkConfidence[]
  reason?: string
}

export interface PoseAnalysis {
  orientation: 'front' | 'side'
  coordinateSpace: 'image-2d' | 'world-3d'
  imageSize?: { width: number; height: number }
  /** Original model output, before filtering or smoothing. */
  rawLandmarks: readonly PoseLandmark[]
  /** Filtered/smoothed points. Unreliable points are retained but never used for angles. */
  smoothedLandmarks: readonly PoseLandmark[]
  confidence: readonly LandmarkConfidence[]
  jointAngles: readonly JointAngle[]
}

export interface Point2D { x: number; y: number }
export interface Point3D { x: number; y: number; z: number }
export interface ImageSize { width: number; height: number }
export type PoseOrientation = 'front' | 'side'
