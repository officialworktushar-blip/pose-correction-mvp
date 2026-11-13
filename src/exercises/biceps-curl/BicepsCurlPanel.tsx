import type { BicepsCurlResult, CurlArm, CurlFeedback, CurlPhase } from './bicepsCurlAnalyzer.ts'

export type CurlEquipment = 'bodyweight' | 'dumbbell'
type Props = { result: BicepsCurlResult | null; equipment: CurlEquipment; onEquipmentChange: (value: CurlEquipment) => void }

const PHASE_LABELS: Record<CurlPhase, string> = {
  starting: 'Starting position', 'curling-up': 'Curling up', 'fully-flexed': 'Fully flexed',
  'lowering-down': 'Lowering down', completed: 'Rep completed',
}

export function BicepsCurlPanel({ result, equipment, onEquipmentChange }: Props) {
  const arms = (['left', 'right'] as CurlArm[]).filter((arm) => result?.arms[arm])
  const feedback: CurlFeedback[] = result?.feedback ?? []
  return (
    <section className="curl-panel" aria-live="polite" aria-label="Biceps curl analysis">
      <div className="curl-panel-head"><div><span className="curl-mark">C</span><div><h3>Biceps curl</h3><p>Independent arm tracking</p></div></div><span className="curl-view-tag">{result?.orientation === 'side' ? 'SIDE VIEW' : result?.orientation === 'front' ? 'FRONT VIEW' : 'WAITING'}</span></div>
      <div className="curl-equipment" role="group" aria-label="Exercise equipment context"><span>EQUIPMENT</span><button className={equipment === 'bodyweight' ? 'selected' : ''} onClick={() => onEquipmentChange('bodyweight')} aria-pressed={equipment === 'bodyweight'}>No dumbbell</button><button className={equipment === 'dumbbell' ? 'selected' : ''} onClick={() => onEquipmentChange('dumbbell')} aria-pressed={equipment === 'dumbbell'}>Dumbbell</button></div>
      <div className="curl-arm-list">{arms.length ? arms.map((arm) => {
        const armResult = result?.arms[arm]
        if (!armResult) return null
        return <div className="curl-arm-row" key={arm}><div className="curl-arm-title"><strong>{arm} arm</strong><span>{armResult.visibilitySufficient ? PHASE_LABELS[armResult.phase] : 'Insufficient visibility'}</span></div><div className="curl-arm-stats"><b>{armResult.repetitions}<small> REPS</small></b><span>{armResult.metrics.elbowFlexionDegrees === null ? '—' : `${armResult.metrics.elbowFlexionDegrees.toFixed(0)}° flexion`}</span></div></div>
      }) : <p className="curl-empty">Start the camera and keep your shoulder, elbow, wrist and hip visible.</p>}</div>
      {feedback.length ? <ul className="curl-feedback">{feedback.map((item, index) => <li key={`${item.arm ?? 'general'}-${item.code}-${index}`}><i className={item.severity === 'info' ? 'curl-feedback-dot info' : 'curl-feedback-dot'} />{item.message}</li>)}</ul> : <p className="curl-ready">{result ? 'Keep your upper arm steady and lower with control.' : 'Live technique cues will appear here.'}</p>}
      <p className="curl-note">{equipment === 'dumbbell' ? 'Dumbbell selected by you · weight is not measured' : 'Bodyweight mode · no object tracking'} · movement cues only</p>
    </section>
  )
}
