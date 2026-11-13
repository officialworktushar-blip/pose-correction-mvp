import { DEFAULT_SQUAT_CONFIG, type SquatResult } from '../exercises/squat/squatAnalyzer.ts'
import { DEFAULT_BICEPS_CURL_CONFIG, type BicepsCurlResult } from '../exercises/biceps-curl/bicepsCurlAnalyzer.ts'

export type DashboardExercise = 'squat' | 'curl'
export type QualityStatus = 'waiting' | 'good' | 'warning' | 'incorrect'
export interface QualityCriterion { key: string; label: string; measured: string; target: string; passed: boolean; weight: number }
export interface FormQuality { score: number | null; status: QualityStatus; criteria: QualityCriterion[]; confidenceWarning: boolean; summary: string }

export interface FormQualityConfig {
  goodAt: number
  warningAt: number
  weights: Partial<Record<'depth' | 'torso' | 'alignment' | 'symmetry' | 'elbow' | 'shoulder' | 'swing' | 'tempo', number>>
  squat: { minDepthRatio: number; maxTorsoLeanDegrees: number; maxAsymmetryDegrees: number }
  curl: { maxElbowDriftTorsoRatio: number; maxShoulderElevationTorsoRatio: number; maxTorsoSwingDegrees: number; maxLoweringSpeedDegreesPerSecond: number }
}

export const DEFAULT_FORM_QUALITY_CONFIG: Readonly<FormQualityConfig> = {
  goodAt: 85, warningAt: 60, weights: {},
  squat: { minDepthRatio: DEFAULT_SQUAT_CONFIG.minimumHipToKneeRatio, maxTorsoLeanDegrees: DEFAULT_SQUAT_CONFIG.maximumTorsoLeanDegrees,
    maxAsymmetryDegrees: DEFAULT_SQUAT_CONFIG.asymmetryThresholdDegrees },
  curl: { maxElbowDriftTorsoRatio: DEFAULT_BICEPS_CURL_CONFIG.maxElbowDriftTorsoRatio,
    maxShoulderElevationTorsoRatio: DEFAULT_BICEPS_CURL_CONFIG.maxShoulderElevationTorsoRatio,
    maxTorsoSwingDegrees: DEFAULT_BICEPS_CURL_CONFIG.maxTorsoSwingDegrees,
    maxLoweringSpeedDegreesPerSecond: DEFAULT_BICEPS_CURL_CONFIG.maxLoweringSpeedDegreesPerSecond },
}

function resultFor(criteria: QualityCriterion[], confidenceWarning: boolean, config: FormQualityConfig): FormQuality {
  if (!criteria.length) return { score: null, status: 'waiting', criteria, confidenceWarning, summary: confidenceWarning ? 'Insufficient landmark confidence' : 'Waiting for measurable movement' }
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0)
  const earned = criteria.reduce((sum, criterion) => sum + (criterion.passed ? criterion.weight : 0), 0)
  const score = totalWeight > 0 ? Math.round(earned / totalWeight * 100) : null
  const status: QualityStatus = score === null ? 'waiting' : score >= config.goodAt ? 'good' : score >= config.warningAt ? 'warning' : 'incorrect'
  return { score, status, criteria, confidenceWarning,
    summary: status === 'good' ? 'Measured criteria are within your current targets' : status === 'warning' ? 'One or more form cues need attention' : 'Adjust the highlighted movement cues' }
}

function criterion(config: FormQualityConfig, key: keyof FormQualityConfig['weights'], label: string, target: string,
  passed: boolean, measured: string): QualityCriterion {
  return { key, label, measured, target, passed, weight: config.weights[key] ?? 1 }
}

export function scoreSquatForm(result: SquatResult | null, config: FormQualityConfig = { ...DEFAULT_FORM_QUALITY_CONFIG }): FormQuality {
  if (!result || result.phase === 'standing') return resultFor([], false, config)
  if (!result.visibilitySufficient) return resultFor([], true, config)
  const criteria: QualityCriterion[] = []
  if (result.orientation === 'side') {
    const depth = result.metrics.hipToKneeRatio
    const lean = result.metrics.torsoLeanDegrees
    if (depth !== null) criteria.push(criterion(config, 'depth', 'Squat depth', `≥ ${config.squat.minDepthRatio.toFixed(2)} leg ratios`, depth >= config.squat.minDepthRatio, depth.toFixed(2)))
    if (lean !== null) criteria.push(criterion(config, 'torso', 'Torso lean', `≤ ${config.squat.maxTorsoLeanDegrees}°`, lean <= config.squat.maxTorsoLeanDegrees, `${lean.toFixed(0)}°`))
  } else {
    const left = result.metrics.leftKneeInward
    const right = result.metrics.rightKneeInward
    const leftAngle = result.metrics.leftKneeAngleDegrees
    const rightAngle = result.metrics.rightKneeAngleDegrees
    if (left !== null && right !== null) criteria.push(criterion(config, 'alignment', 'Knee alignment', 'No inward collapse', !left && !right, left || right ? 'Inward movement seen' : 'Aligned'))
    if (leftAngle !== null && rightAngle !== null) {
      const difference = Math.abs(leftAngle - rightAngle)
      criteria.push(criterion(config, 'symmetry', 'Left/right balance', `≤ ${config.squat.maxAsymmetryDegrees}°`, difference <= config.squat.maxAsymmetryDegrees, `${difference.toFixed(0)}° difference`))
    }
  }
  return resultFor(criteria, false, config)
}

export function scoreCurlForm(result: BicepsCurlResult | null, config: FormQualityConfig = { ...DEFAULT_FORM_QUALITY_CONFIG }): FormQuality {
  if (!result) return resultFor([], false, config)
  const criteria: QualityCriterion[] = []
  let confidenceWarning = false
  for (const arm of Object.values(result.arms)) {
    if (!arm) continue
    if (!arm.visibilitySufficient) { confidenceWarning = true; continue }
    if (arm.phase === 'starting') continue
    const { metrics } = arm
    if (metrics.elbowDriftTorsoRatio !== null) criteria.push(criterion(config, 'elbow', 'Elbow stability',
      `≤ ${config.curl.maxElbowDriftTorsoRatio.toFixed(2)} torso ratios`, metrics.elbowDriftTorsoRatio <= config.curl.maxElbowDriftTorsoRatio, metrics.elbowDriftTorsoRatio.toFixed(2)))
    if (metrics.shoulderElevationTorsoRatio !== null) criteria.push(criterion(config, 'shoulder', 'Shoulder elevation',
      `≤ ${config.curl.maxShoulderElevationTorsoRatio.toFixed(2)} torso ratios`, metrics.shoulderElevationTorsoRatio <= config.curl.maxShoulderElevationTorsoRatio, metrics.shoulderElevationTorsoRatio.toFixed(2)))
    if (metrics.torsoSwingDegrees !== null) criteria.push(criterion(config, 'swing', 'Torso swing',
      `≤ ${config.curl.maxTorsoSwingDegrees}°`, metrics.torsoSwingDegrees <= config.curl.maxTorsoSwingDegrees, `${metrics.torsoSwingDegrees.toFixed(0)}°`))
    if (arm.phase === 'lowering-down' && metrics.loweringSpeedDegreesPerSecond !== null) {
      const speed = metrics.loweringSpeedDegreesPerSecond
      criteria.push(criterion(config, 'tempo', 'Lowering tempo', `≤ ${config.curl.maxLoweringSpeedDegreesPerSecond}°/s`, speed <= config.curl.maxLoweringSpeedDegreesPerSecond, `${speed.toFixed(0)}°/s`))
    }
  }
  return resultFor(criteria, confidenceWarning, config)
}

