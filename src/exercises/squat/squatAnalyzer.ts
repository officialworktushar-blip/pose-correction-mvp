import { normalizedImagePoint } from '../../biomechanics/landmarks.ts'
import type { JointAngle, PoseAnalysis, PoseLandmark } from '../../biomechanics/types.ts'

export type SquatPhase = 'standing' | 'descending' | 'bottom' | 'ascending' | 'completed'
export type SquatDirection = 'down' | 'up' | 'stable'
export type SquatFeedbackCode = 'visibility' | 'depth' | 'torso-lean' | 'knee-alignment' | 'asymmetry' | 'incomplete'

export interface SquatFeedback {
  code: SquatFeedbackCode
  message: string
  severity: 'info' | 'coaching'
}

export interface SquatConfig {
  /** Minimum visibility and presence score for each required point. */
  minLandmarkConfidence: number
  /** Knee flexion from standing needed to arm a rep. */
  movementStartFlexionDegrees: number
  /** Minimum knee flexion required for a rep to count; personalized/configurable. */
  minimumRepFlexionDegrees: number
  /** Optional flexion landmark for identifying a bottom position. */
  bottomFlexionDegrees: number
  /** Top position tolerance around the user's calibrated standing flexion. */
  returnToStandingFlexionDegrees: number
  /** Deadband used to ignore small angle fluctuations. */
  movementDeadbandDegrees: number
  /** Minimum normalized hip-height change paired with knee movement to confirm direction. */
  hipMovementDeadbandRatio: number
  /** Change from the tracked deepest position that confirms reversal. */
  reversalHysteresisDegrees: number
  /** Consecutive frames required before state/feedback changes. */
  confirmationFrames: number
  /** Hips should reach approximately knee height; image-space ratio normalized by leg length. */
  minimumHipToKneeRatio: number
  /** Approximate torso inclination from vertical in the side view. */
  maximumTorsoLeanDegrees: number
  /** Knee distance from center / ankle distance from center; lower suggests visible inward collapse. */
  kneeInwardRatioThreshold: number
  /** Minimum lateral knee displacement from center as a fraction of image width. */
  minKneeInwardOffsetRatio: number
  /** Maximum left/right knee-angle difference before asymmetry feedback. */
  asymmetryThresholdDegrees: number
}

export const DEFAULT_SQUAT_CONFIG: Readonly<SquatConfig> = {
  minLandmarkConfidence: 0.55,
  movementStartFlexionDegrees: 18,
  minimumRepFlexionDegrees: 35,
  bottomFlexionDegrees: 55,
  returnToStandingFlexionDegrees: 12,
  movementDeadbandDegrees: 2.5,
  hipMovementDeadbandRatio: 0.012,
  reversalHysteresisDegrees: 8,
  confirmationFrames: 3,
  minimumHipToKneeRatio: -0.08,
  maximumTorsoLeanDegrees: 45,
  kneeInwardRatioThreshold: 0.72,
  minKneeInwardOffsetRatio: 0.035,
  asymmetryThresholdDegrees: 18,
}

export interface SquatMetrics {
  averageKneeFlexionDegrees: number | null
  leftKneeAngleDegrees: number | null
  rightKneeAngleDegrees: number | null
  leftHipAngleDegrees: number | null
  rightHipAngleDegrees: number | null
  hipToKneeRatio: number | null
  hipHeightRatio: number | null
  torsoLeanDegrees: number | null
  leftKneeInward: boolean | null
  rightKneeInward: boolean | null
}

export interface SquatResult {
  phase: SquatPhase
  direction: SquatDirection
  repetitions: number
  repetitionCompleted: boolean
  visibilitySufficient: boolean
  orientation: 'front' | 'side'
  metrics: SquatMetrics
  feedback: SquatFeedback[]
}

const IDX = { leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28, leftHeel: 29, rightHeel: 30, leftFoot: 31, rightFoot: 32 } as const
type LandmarkKey = keyof typeof IDX

const sideChains: Record<'left' | 'right', LandmarkKey[]> = {
  left: ['leftShoulder', 'leftHip', 'leftKnee', 'leftAnkle', 'leftHeel', 'leftFoot'],
  right: ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle', 'rightHeel', 'rightFoot'],
}
const frontRequired: LandmarkKey[] = [...sideChains.left, ...sideChains.right]

function landmarkIsReliable(analysis: PoseAnalysis, index: number, minScore: number) {
  const landmark = analysis.rawLandmarks[index]
  return !!landmark && (landmark.visibility ?? 1) >= minScore && (landmark.presence ?? 1) >= minScore
}

function getAngle(angles: readonly JointAngle[], joint: string) {
  const measurement = angles.find((angle) => angle.joint === joint)
  return measurement?.reliable ? measurement.degrees : null
}

function angleAverage(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function metricConfidence(image: PoseAnalysis, config: SquatConfig) {
  const required = image.orientation === 'side' ? sideChains[chooseVisibleSide(image)] : frontRequired
  return required.every((key) => landmarkIsReliable(image, IDX[key], config.minLandmarkConfidence))
}

function chooseVisibleSide(image: PoseAnalysis): 'left' | 'right' {
  const score = (side: 'left' | 'right') => sideChains[side].reduce((sum, key) => {
    const landmark = image.rawLandmarks[IDX[key]]
    return sum + Math.min(landmark?.visibility ?? 0, landmark?.presence ?? 1)
  }, 0)
  return score('left') >= score('right') ? 'left' : 'right'
}

function sideMetrics(image: PoseAnalysis) {
  if (!image.imageSize) return { hipToKneeRatio: null, hipHeightRatio: null, torsoLeanDegrees: null }
  const side = chooseVisibleSide(image)
  const keys: Record<'left' | 'right', { shoulder: LandmarkKey; hip: LandmarkKey; knee: LandmarkKey; ankle: LandmarkKey }> = {
    left: { shoulder: 'leftShoulder', hip: 'leftHip', knee: 'leftKnee', ankle: 'leftAnkle' },
    right: { shoulder: 'rightShoulder', hip: 'rightHip', knee: 'rightKnee', ankle: 'rightAnkle' },
  }
  const landmarks = image.smoothedLandmarks
  const selected = keys[side]
  const getPoint = (key: LandmarkKey) => {
    const point = landmarks[IDX[key]]
    return point ? normalizedImagePoint(point, image.imageSize!) : null
  }
  const hip = getPoint(selected.hip)
  const knee = getPoint(selected.knee)
  const ankle = getPoint(selected.ankle)
  const shoulder = getPoint(selected.shoulder)
  const heel = getPoint(side === 'left' ? 'leftHeel' : 'rightHeel')
  const foot = getPoint(side === 'left' ? 'leftFoot' : 'rightFoot')
  if (!hip || !knee || !ankle || !shoulder || !heel || !foot) return { hipToKneeRatio: null, hipHeightRatio: null, torsoLeanDegrees: null }
  const legLength = Math.hypot(knee.x - ankle.x, knee.y - ankle.y)
  const hipToKneeRatio = legLength > 0 ? (hip.y - knee.y) / legLength : null
  const hipHeightRatio = legLength > 0 ? (ankle.y - hip.y) / legLength : null
  const footDirection = foot.x - heel.x
  const torsoForwardDisplacement = (shoulder.x - hip.x) * Math.sign(footDirection)
  const torsoLeanDegrees = Math.abs(footDirection) > image.imageSize.width * 0.01
    ? Math.atan2(Math.max(0, torsoForwardDisplacement), Math.abs(shoulder.y - hip.y)) * 180 / Math.PI
    : null
  return { hipToKneeRatio, hipHeightRatio, torsoLeanDegrees }
}

function kneeInward(image: PoseAnalysis, side: 'left' | 'right', config: SquatConfig) {
  if (!image.imageSize) return null
  const hipMidX = (image.smoothedLandmarks[IDX.leftHip]!.x + image.smoothedLandmarks[IDX.rightHip]!.x) / 2
  const knee = image.smoothedLandmarks[IDX[`${side}Knee`]]
  const heel = image.smoothedLandmarks[IDX[`${side}Heel`]]
  const foot = image.smoothedLandmarks[IDX[`${side}Foot`]]
  if (!knee || !heel || !foot) return null
  const kneeOffset = Math.abs(knee.x - hipMidX)
  const footCenterOffset = Math.abs((heel.x + foot.x) / 2 - hipMidX)
  return footCenterOffset > config.minKneeInwardOffsetRatio && kneeOffset < footCenterOffset * config.kneeInwardRatioThreshold
}

export function extractSquatMetrics(image: PoseAnalysis, world?: PoseAnalysis, config: SquatConfig = DEFAULT_SQUAT_CONFIG): SquatMetrics {
  const source = image.orientation === 'side' && world?.orientation === 'side' && world.coordinateSpace === 'world-3d' ? world.jointAngles : image.jointAngles
  const selectedSide = image.orientation === 'side' ? chooseVisibleSide(image) : null
  const leftKnee = getAngle(source, 'leftKnee')
  const rightKnee = getAngle(source, 'rightKnee')
  const kneeAngles = [leftKnee, rightKnee]
  const averageKnee = selectedSide ? getAngle(source, `${selectedSide}Knee`) : angleAverage(kneeAngles)
  const selectedHipMetrics = sideMetrics(image)
  return {
    averageKneeFlexionDegrees: averageKnee === null ? null : 180 - averageKnee,
    leftKneeAngleDegrees: leftKnee,
    rightKneeAngleDegrees: rightKnee,
    leftHipAngleDegrees: getAngle(source, 'leftHip'),
    rightHipAngleDegrees: getAngle(source, 'rightHip'),
    hipToKneeRatio: selectedHipMetrics.hipToKneeRatio,
    hipHeightRatio: selectedHipMetrics.hipHeightRatio,
    torsoLeanDegrees: selectedHipMetrics.torsoLeanDegrees,
    leftKneeInward: image.orientation === 'front' ? kneeInward(image, 'left', config) : null,
    rightKneeInward: image.orientation === 'front' ? kneeInward(image, 'right', config) : null,
  }
}

export class SquatAnalyzer {
  private readonly config: SquatConfig
  private phase: SquatPhase = 'standing'
  private repetitions = 0
  private previousFlexion: number | null = null
  private previousHipHeightRatio: number | null = null
  private deepestFlexion = 0
  private deepestHipToKneeRatio: number | null = null
  private downFrames = 0
  private upFrames = 0
  private topFrames = 0
  private feedbackFrames = new Map<SquatFeedbackCode, number>()
  private incompleteFeedbackFrames = 0
  private standingFlexionBaseline: number | null = null

  constructor(config: SquatConfig = { ...DEFAULT_SQUAT_CONFIG }) {
    this.config = config
    if (config.confirmationFrames < 1) throw new RangeError('confirmationFrames must be at least 1.')
  }

  reset() {
    this.phase = 'standing'
    this.repetitions = 0
    this.previousFlexion = null
    this.previousHipHeightRatio = null
    this.deepestFlexion = 0
    this.deepestHipToKneeRatio = null
    this.downFrames = 0
    this.upFrames = 0
    this.topFrames = 0
    this.feedbackFrames.clear()
    this.incompleteFeedbackFrames = 0
    this.standingFlexionBaseline = null
  }

  update(image: PoseAnalysis, world?: PoseAnalysis): SquatResult {
    const metrics = extractSquatMetrics(image, world, this.config)
    const sufficient = metricConfidence(image, this.config)
    if (!sufficient || metrics.averageKneeFlexionDegrees === null || metrics.hipHeightRatio === null) {
      this.previousFlexion = null
      this.previousHipHeightRatio = null
      this.downFrames = 0
      this.upFrames = 0
      return this.result(image.orientation, metrics, false, [{ code: 'visibility', message: 'Insufficient landmark visibility. Move fully into frame and keep your shoulders, hips, knees, ankles and feet visible.', severity: 'info' }], false, 'stable')
    }

    const flexion = metrics.averageKneeFlexionDegrees
    if (this.phase === 'standing' && flexion <= this.config.returnToStandingFlexionDegrees) {
      this.standingFlexionBaseline = this.standingFlexionBaseline === null ? flexion : this.standingFlexionBaseline * 0.9 + flexion * 0.1
    }
    const baseline = this.standingFlexionBaseline ?? 0
    const delta = this.previousFlexion === null ? 0 : flexion - this.previousFlexion
    const hipDelta = this.previousHipHeightRatio === null ? 0 : metrics.hipHeightRatio - this.previousHipHeightRatio
    const movingDown = delta > this.config.movementDeadbandDegrees && hipDelta < -this.config.hipMovementDeadbandRatio
    const movingUp = delta < -this.config.movementDeadbandDegrees && hipDelta > this.config.hipMovementDeadbandRatio
    const direction: SquatDirection = movingDown ? 'down' : movingUp ? 'up' : 'stable'
    this.downFrames = direction === 'down' ? this.downFrames + 1 : 0
    this.upFrames = direction === 'up' ? this.upFrames + 1 : 0
    this.previousFlexion = flexion
    this.previousHipHeightRatio = metrics.hipHeightRatio

    if (this.phase === 'standing') {
      if (flexion - baseline >= this.config.movementStartFlexionDegrees && this.downFrames >= this.config.confirmationFrames) {
        this.phase = 'descending'
        this.deepestFlexion = flexion
        this.deepestHipToKneeRatio = metrics.hipToKneeRatio
      }
    } else if (this.phase === 'descending') {
      this.recordDeepest(metrics)
      const atBottom = flexion >= this.config.bottomFlexionDegrees
      const reversed = this.deepestFlexion - flexion >= this.config.reversalHysteresisDegrees && this.upFrames >= this.config.confirmationFrames
      if (atBottom || reversed) this.phase = 'bottom'
    } else if (this.phase === 'bottom') {
      this.recordDeepest(metrics)
      if (this.upFrames >= this.config.confirmationFrames) this.phase = 'ascending'
    } else if (this.phase === 'ascending') {
      this.recordDeepest(metrics)
      if (flexion - baseline <= this.config.returnToStandingFlexionDegrees) this.topFrames += 1
      else this.topFrames = 0
      if (this.topFrames >= this.config.confirmationFrames) {
        if (this.deepestFlexion >= this.config.minimumRepFlexionDegrees) {
          this.repetitions += 1
          this.phase = 'completed'
        } else {
          this.phase = 'standing'
          this.incompleteFeedbackFrames = this.config.confirmationFrames * 8
        }
        this.topFrames = 0
      }
    } else if (this.phase === 'completed') {
      this.phase = 'standing'
      this.deepestFlexion = 0
      this.deepestHipToKneeRatio = null
    }

    const repetitionCompleted = this.phase === 'completed'
    const feedback = this.getFeedback(image, metrics, repetitionCompleted)
    if (this.incompleteFeedbackFrames > 0) {
      feedback.push({ code: 'incomplete', message: 'Complete your repetition by reaching a consistent, controlled depth.', severity: 'coaching' })
      this.incompleteFeedbackFrames -= 1
    }
    return this.result(image.orientation, metrics, true, feedback, repetitionCompleted, direction)
  }

  private recordDeepest(metrics: SquatMetrics) {
    this.deepestFlexion = Math.max(this.deepestFlexion, metrics.averageKneeFlexionDegrees ?? 0)
    if (metrics.hipToKneeRatio !== null) this.deepestHipToKneeRatio = this.deepestHipToKneeRatio === null
      ? metrics.hipToKneeRatio : Math.max(this.deepestHipToKneeRatio, metrics.hipToKneeRatio)
  }

  private getFeedback(image: PoseAnalysis, metrics: SquatMetrics, completed: boolean): SquatFeedback[] {
    const feedback: SquatFeedback[] = []
    const active = this.phase === 'descending' || this.phase === 'bottom' || this.phase === 'ascending' || completed
    if (active && image.orientation === 'side') {
      this.confirmFeedback('depth', this.deepestHipToKneeRatio !== null && this.deepestHipToKneeRatio < this.config.minimumHipToKneeRatio, feedback,
        'Lower your hips slightly further to reach your configured depth target.')
      this.confirmFeedback('torso-lean', metrics.torsoLeanDegrees !== null && metrics.torsoLeanDegrees > this.config.maximumTorsoLeanDegrees, feedback,
        'Reduce excessive forward torso lean.')
    }
    if (active && image.orientation === 'front') {
      const inward = metrics.leftKneeInward === true || metrics.rightKneeInward === true
      this.confirmFeedback('knee-alignment', inward, feedback, 'Keep your knees aligned with your feet.')
      const difference = metrics.leftKneeAngleDegrees !== null && metrics.rightKneeAngleDegrees !== null
        ? Math.abs(metrics.leftKneeAngleDegrees - metrics.rightKneeAngleDegrees) : 0
      this.confirmFeedback('asymmetry', difference > this.config.asymmetryThresholdDegrees, feedback,
        'Distribute the movement more evenly between both sides.')
    }
    if (completed && image.orientation === 'side' && this.deepestHipToKneeRatio !== null && this.deepestHipToKneeRatio < this.config.minimumHipToKneeRatio) {
      if (!feedback.some((item) => item.code === 'depth')) feedback.push({ code: 'depth', message: 'Lower your hips slightly further to reach your configured depth target.', severity: 'coaching' })
    }
    return feedback
  }

  private confirmFeedback(code: SquatFeedbackCode, condition: boolean, feedback: SquatFeedback[], message: string) {
    const count = condition ? (this.feedbackFrames.get(code) ?? 0) + 1 : 0
    this.feedbackFrames.set(code, count)
    if (count >= this.config.confirmationFrames) feedback.push({ code, message, severity: 'coaching' })
  }

  private result(orientation: 'front' | 'side', metrics: SquatMetrics, visibilitySufficient: boolean,
    feedback: SquatFeedback[], repetitionCompleted: boolean, direction: SquatDirection): SquatResult {
    return { phase: this.phase, direction, repetitions: this.repetitions, repetitionCompleted, visibilitySufficient, orientation, metrics, feedback }
  }
}

/** Make the exact point confidence gate inspectable in tests and configurable per user/session. */
export function hasSquatLandmarkVisibility(image: PoseAnalysis, minScore = DEFAULT_SQUAT_CONFIG.minLandmarkConfidence) {
  return metricConfidence(image, { ...DEFAULT_SQUAT_CONFIG, minLandmarkConfidence: minScore })
}

export type { PoseLandmark }
