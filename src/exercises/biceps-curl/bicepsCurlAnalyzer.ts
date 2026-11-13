import { normalizedImagePoint } from '../../biomechanics/landmarks.ts'
import type { JointAngle, PoseAnalysis } from '../../biomechanics/types.ts'

export type CurlArm = 'left' | 'right'
export type CurlPhase = 'starting' | 'curling-up' | 'fully-flexed' | 'lowering-down' | 'completed'
export type CurlDirection = 'up' | 'down' | 'stable'
export type CurlFeedbackCode = 'visibility' | 'elbow-stability' | 'shoulder-elevation' | 'torso-swing' | 'incomplete' | 'controlled-lowering'

export interface CurlFeedback {
  code: CurlFeedbackCode
  arm?: CurlArm
  message: string
  severity: 'info' | 'coaching'
}

export interface BicepsCurlConfig {
  arms: 'left' | 'right' | 'both'
  minLandmarkConfidence: number
  maxStartingFlexionDegrees: number
  curlStartFlexionDeltaDegrees: number
  minimumCurlFlexionDeltaDegrees: number
  fullCurlFlexionDeltaDegrees: number
  returnToStartFlexionDeltaDegrees: number
  movementDeadbandDegrees: number
  confirmationFrames: number
  maxElbowDriftTorsoRatio: number
  maxShoulderElevationTorsoRatio: number
  maxTorsoSwingDegrees: number
  maxLoweringSpeedDegreesPerSecond: number
}

export const DEFAULT_BICEPS_CURL_CONFIG: Readonly<BicepsCurlConfig> = {
  arms: 'both', minLandmarkConfidence: 0.55, maxStartingFlexionDegrees: 35,
  curlStartFlexionDeltaDegrees: 25, minimumCurlFlexionDeltaDegrees: 40, fullCurlFlexionDeltaDegrees: 95,
  returnToStartFlexionDeltaDegrees: 18, movementDeadbandDegrees: 2.5, confirmationFrames: 3,
  maxElbowDriftTorsoRatio: 0.22, maxShoulderElevationTorsoRatio: 0.14,
  maxTorsoSwingDegrees: 12, maxLoweringSpeedDegreesPerSecond: 360,
}

export interface CurlArmMetrics {
  elbowFlexionDegrees: number | null
  elbowAngleDegrees: number | null
  upperArmDeviationDegrees: number | null
  elbowDriftTorsoRatio: number | null
  shoulderElevationTorsoRatio: number | null
  torsoSwingDegrees: number | null
  loweringSpeedDegreesPerSecond: number | null
}

export interface CurlArmResult {
  arm: CurlArm
  phase: CurlPhase
  direction: CurlDirection
  repetitions: number
  repetitionCompleted: boolean
  visibilitySufficient: boolean
  metrics: CurlArmMetrics
  feedback: CurlFeedback[]
}

export interface BicepsCurlResult {
  orientation: 'front' | 'side'
  arms: Partial<Record<CurlArm, CurlArmResult>>
  totalRepetitions: number
  feedback: CurlFeedback[]
}

const INDEX = {
  leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftHip: 23, rightHip: 24,
  leftWrist: 15, rightWrist: 16,
} as const

interface ArmState {
  phase: CurlPhase
  repetitions: number
  baselineFlexion: number | null
  maxCurlDelta: number
  previousFlexion: number | null
  previousTimestamp: number | null
  upFrames: number
  downFrames: number
  topFrames: number
  feedbackFrames: Map<CurlFeedbackCode, number>
  neutral: { elbowAlong: number; elbowAcross: number; shoulderGap: number; torsoAngle: number; torsoLength: number } | null
  incompleteFrames: number
}

const newArmState = (): ArmState => ({ phase: 'starting', repetitions: 0, baselineFlexion: null,
  maxCurlDelta: 0, previousFlexion: null, previousTimestamp: null, upFrames: 0, downFrames: 0,
  topFrames: 0, feedbackFrames: new Map(), neutral: null, incompleteFrames: 0 })

function getAngle(angles: readonly JointAngle[], joint: string) {
  const angle = angles.find((item) => item.joint === joint)
  return angle?.reliable ? angle.degrees : null
}

function getImageGeometry(image: PoseAnalysis, arm: CurlArm) {
  if (!image.imageSize) return null
  const shoulderIndex = INDEX[`${arm}Shoulder`]
  const elbowIndex = INDEX[`${arm}Elbow`]
  const hipIndex = INDEX[`${arm}Hip`]
  const shoulderLandmark = image.smoothedLandmarks[shoulderIndex]
  const elbowLandmark = image.smoothedLandmarks[elbowIndex]
  const hipLandmark = image.smoothedLandmarks[hipIndex]
  if (!shoulderLandmark || !elbowLandmark || !hipLandmark) return null
  const shoulder = normalizedImagePoint(shoulderLandmark, image.imageSize)
  const elbow = normalizedImagePoint(elbowLandmark, image.imageSize)
  const hip = normalizedImagePoint(hipLandmark, image.imageSize)
  const torsoX = hip.x - shoulder.x
  const torsoY = hip.y - shoulder.y
  const torsoLength = Math.hypot(torsoX, torsoY)
  if (torsoLength <= 0) return null
  const ux = torsoX / torsoLength
  const uy = torsoY / torsoLength
  const ex = elbow.x - shoulder.x
  const ey = elbow.y - shoulder.y
  const elbowAlong = (ex * ux + ey * uy) / torsoLength
  const elbowAcross = (ex * -uy + ey * ux) / torsoLength
  const upperArmDeviationDegrees = Math.atan2(Math.abs(ex * uy - ey * ux), ex * ux + ey * uy) * 180 / Math.PI
  const torsoAngle = Math.atan2(torsoX, torsoY) * 180 / Math.PI
  return { shoulder, hip, elbow, torsoLength, elbowAlong, elbowAcross, upperArmDeviationDegrees, torsoAngle,
    shoulderGap: hip.y - shoulder.y }
}

function isReliable(image: PoseAnalysis, arm: CurlArm, minScore: number) {
  const indices = [INDEX[`${arm}Shoulder`], INDEX[`${arm}Elbow`], INDEX[`${arm}Wrist`], INDEX[`${arm}Hip`]]
  return indices.every((index) => {
    const point = image.rawLandmarks[index]
    return point && (point.visibility ?? 1) >= minScore && (point.presence ?? 1) >= minScore
  })
}

function blankMetrics(): CurlArmMetrics {
  return { elbowFlexionDegrees: null, elbowAngleDegrees: null, upperArmDeviationDegrees: null,
    elbowDriftTorsoRatio: null, shoulderElevationTorsoRatio: null, torsoSwingDegrees: null,
    loweringSpeedDegreesPerSecond: null }
}

export class BicepsCurlAnalyzer {
  private readonly config: BicepsCurlConfig
  private states: Record<CurlArm, ArmState> = { left: newArmState(), right: newArmState() }

  constructor(config: BicepsCurlConfig = { ...DEFAULT_BICEPS_CURL_CONFIG }) {
    this.config = config
    if (config.confirmationFrames < 1) throw new RangeError('confirmationFrames must be at least 1.')
    if (config.minLandmarkConfidence < 0 || config.minLandmarkConfidence > 1) throw new RangeError('minLandmarkConfidence must be between 0 and 1.')
  }

  reset() { this.states = { left: newArmState(), right: newArmState() } }

  update(image: PoseAnalysis, world?: PoseAnalysis, timestampMs = performance.now()): BicepsCurlResult {
    const selectedArms: CurlArm[] = this.config.arms === 'both' ? ['left', 'right'] : [this.config.arms]
    const arms: Partial<Record<CurlArm, CurlArmResult>> = {}
    const feedback: CurlFeedback[] = []
    for (const arm of selectedArms) {
      const result = this.updateArm(arm, image, world, timestampMs)
      arms[arm] = result
      feedback.push(...result.feedback)
    }
    return { orientation: image.orientation, arms,
      totalRepetitions: selectedArms.reduce((sum, arm) => sum + this.states[arm].repetitions, 0), feedback }
  }

  private updateArm(arm: CurlArm, image: PoseAnalysis, world: PoseAnalysis | undefined, timestampMs: number): CurlArmResult {
    const state = this.states[arm]
    const required = isReliable(image, arm, this.config.minLandmarkConfidence)
    const geometry = getImageGeometry(image, arm)
    const worldAngles = world?.orientation === image.orientation && world.coordinateSpace === 'world-3d' ? world.jointAngles : []
    const angleSource = image.orientation === 'side' && getAngle(worldAngles, `${arm}Elbow`) !== null ? worldAngles : image.jointAngles
    const elbowAngle = getAngle(angleSource, `${arm}Elbow`)
    const flexion = elbowAngle === null ? null : 180 - elbowAngle
    const metrics = blankMetrics()

    if (!required || !geometry || flexion === null) {
      state.previousFlexion = null
      state.previousTimestamp = null
      state.upFrames = 0
      state.downFrames = 0
      return { arm, phase: state.phase, direction: 'stable', repetitions: state.repetitions,
        repetitionCompleted: false, visibilitySufficient: false, metrics,
        feedback: [{ code: 'visibility', arm, message: `Insufficient visibility for the ${arm} arm. Keep shoulder, elbow, wrist and hip in frame.`, severity: 'info' }] }
    }

    if (state.phase === 'starting' && flexion <= this.config.maxStartingFlexionDegrees) {
      state.baselineFlexion = state.baselineFlexion === null ? flexion : state.baselineFlexion * 0.9 + flexion * 0.1
      if (!state.neutral) state.neutral = { elbowAlong: geometry.elbowAlong, elbowAcross: geometry.elbowAcross,
        shoulderGap: geometry.shoulderGap, torsoAngle: geometry.torsoAngle, torsoLength: geometry.torsoLength }
      else {
        state.neutral.elbowAlong = state.neutral.elbowAlong * 0.95 + geometry.elbowAlong * 0.05
        state.neutral.elbowAcross = state.neutral.elbowAcross * 0.95 + geometry.elbowAcross * 0.05
        state.neutral.shoulderGap = state.neutral.shoulderGap * 0.95 + geometry.shoulderGap * 0.05
        state.neutral.torsoAngle = state.neutral.torsoAngle * 0.95 + geometry.torsoAngle * 0.05
      }
    }
    const baseline = state.baselineFlexion
    const curlDelta = baseline === null ? 0 : flexion - baseline
    const flexionDelta = state.previousFlexion === null ? 0 : flexion - state.previousFlexion
    const direction: CurlDirection = flexionDelta > this.config.movementDeadbandDegrees ? 'up'
      : flexionDelta < -this.config.movementDeadbandDegrees ? 'down' : 'stable'
    state.upFrames = direction === 'up' ? state.upFrames + 1 : 0
    state.downFrames = direction === 'down' ? state.downFrames + 1 : 0
    const dtSeconds = state.previousTimestamp === null ? null : Math.max(0.001, (timestampMs - state.previousTimestamp) / 1000)
    const loweringSpeed = direction === 'down' && dtSeconds ? -flexionDelta / dtSeconds : 0
    state.previousFlexion = flexion
    state.previousTimestamp = timestampMs

    let repetitionCompleted = false
    if (state.phase === 'starting') {
      if (baseline !== null && curlDelta >= this.config.curlStartFlexionDeltaDegrees && state.upFrames >= this.config.confirmationFrames) {
        state.phase = 'curling-up'
        state.maxCurlDelta = curlDelta
      }
    } else if (state.phase === 'curling-up') {
      state.maxCurlDelta = Math.max(state.maxCurlDelta, curlDelta)
      const reversed = flexionDelta < -this.config.movementDeadbandDegrees && state.downFrames >= this.config.confirmationFrames
      if (curlDelta >= this.config.fullCurlFlexionDeltaDegrees) {
        state.phase = 'fully-flexed'
      } else if (reversed) {
        state.phase = state.maxCurlDelta >= this.config.minimumCurlFlexionDeltaDegrees ? 'fully-flexed' : 'lowering-down'
      }
    } else if (state.phase === 'fully-flexed') {
      state.maxCurlDelta = Math.max(state.maxCurlDelta, curlDelta)
      if (state.downFrames >= this.config.confirmationFrames) state.phase = 'lowering-down'
    } else if (state.phase === 'lowering-down') {
      state.maxCurlDelta = Math.max(state.maxCurlDelta, curlDelta)
      if (baseline !== null && curlDelta <= this.config.returnToStartFlexionDeltaDegrees) state.topFrames += 1
      else state.topFrames = 0
      if (state.topFrames >= this.config.confirmationFrames) {
        if (state.maxCurlDelta >= this.config.fullCurlFlexionDeltaDegrees) {
          state.repetitions += 1
          state.phase = 'completed'
          repetitionCompleted = true
        } else {
          state.phase = 'starting'
          state.incompleteFrames = this.config.confirmationFrames * 8
        }
        state.maxCurlDelta = 0
        state.topFrames = 0
      }
    } else if (state.phase === 'completed') {
      state.phase = 'starting'
      state.maxCurlDelta = 0
    }

    const neutral = state.neutral
    const elbowDrift = neutral ? Math.hypot(geometry.elbowAlong - neutral.elbowAlong, geometry.elbowAcross - neutral.elbowAcross) : 0
    const shoulderElevation = neutral && neutral.torsoLength > 0 ? (geometry.shoulderGap - neutral.shoulderGap) / neutral.torsoLength : 0
    const torsoDelta = neutral ? ((geometry.torsoAngle - neutral.torsoAngle + 540) % 360) - 180 : 0
    const torsoSwing = neutral ? Math.abs(torsoDelta) : 0
    metrics.elbowAngleDegrees = elbowAngle
    metrics.elbowFlexionDegrees = flexion
    metrics.upperArmDeviationDegrees = geometry.upperArmDeviationDegrees
    metrics.elbowDriftTorsoRatio = elbowDrift
    metrics.shoulderElevationTorsoRatio = shoulderElevation
    metrics.torsoSwingDegrees = torsoSwing
    metrics.loweringSpeedDegreesPerSecond = loweringSpeed

    const feedback: CurlFeedback[] = []
    const active = ['curling-up', 'fully-flexed', 'lowering-down', 'completed'].includes(state.phase)
    if (active) {
      this.confirm(state, 'elbow-stability', elbowDrift > this.config.maxElbowDriftTorsoRatio, feedback, arm, 'Keep your elbows stable alongside your torso.')
      this.confirm(state, 'shoulder-elevation', shoulderElevation > this.config.maxShoulderElevationTorsoRatio, feedback, arm, 'Avoid shrugging your shoulders.')
      this.confirm(state, 'torso-swing', torsoSwing > this.config.maxTorsoSwingDegrees, feedback, arm, 'Reduce body swinging.')
      this.confirm(state, 'controlled-lowering', state.phase === 'lowering-down' && loweringSpeed > this.config.maxLoweringSpeedDegreesPerSecond,
        feedback, arm, 'Maintain controlled movement while lowering.')
    }
    if (repetitionCompleted) {
      state.incompleteFrames = 0
    } else if (state.incompleteFrames > 0) {
      feedback.push({ code: 'incomplete', arm, message: 'Complete your curl movement before returning to the starting position.', severity: 'coaching' })
      state.incompleteFrames -= 1
    }
    return { arm, phase: state.phase, direction, repetitions: state.repetitions, repetitionCompleted,
      visibilitySufficient: true, metrics, feedback }
  }

  private confirm(state: ArmState, code: CurlFeedbackCode, condition: boolean, feedback: CurlFeedback[], arm: CurlArm, message: string) {
    const count = condition ? (state.feedbackFrames.get(code) ?? 0) + 1 : 0
    state.feedbackFrames.set(code, count)
    if (count >= this.config.confirmationFrames) feedback.push({ code, arm, message, severity: 'coaching' })
  }
}
