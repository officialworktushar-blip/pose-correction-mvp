import type { SquatResult } from './squatAnalyzer.ts'

type Props = { result: SquatResult | null }

const PHASE_LABELS = {
  standing: 'Standing', descending: 'Descending', bottom: 'Bottom position', ascending: 'Ascending', completed: 'Rep completed',
} as const

export function SquatPanel({ result }: Props) {
  return (
    <section className="squat-panel" aria-live="polite" aria-label="Squat analysis">
      <div className="squat-panel-head"><div><span className="squat-mark">S</span><div><h3>Squat analysis</h3><p>Live movement cues</p></div></div><span className="squat-view-tag">{result?.orientation === 'front' ? 'FRONT VIEW' : result?.orientation === 'side' ? 'SIDE VIEW' : 'WAITING'}</span></div>
      <div className="squat-stats"><div className="squat-reps"><strong>{result?.repetitions ?? 0}</strong><span>REPS</span></div><div className="squat-phase"><span>PHASE</span><strong>{result ? PHASE_LABELS[result.phase] : 'Start camera'}</strong><small>{result?.direction === 'down' ? '↓ Moving down' : result?.direction === 'up' ? '↑ Moving up' : '— Holding'}</small></div></div>
      {result?.visibilitySufficient === false ? <div className="squat-visibility"><i />Insufficient landmark visibility. Step back and keep the full movement visible.</div> : result?.feedback.length ? <ul className="squat-feedback">{result.feedback.map((item) => <li key={item.code}><span className={item.severity === 'info' ? 'feedback-icon info' : 'feedback-icon'}>{item.severity === 'info' ? 'i' : '↗'}</span><span>{item.message}</span></li>)}</ul> : <p className="squat-ready">{result ? 'Movement is tracking. Continue with a steady, controlled rep.' : 'Start your camera to begin squat tracking.'}</p>}
      <p className="squat-note">Movement cues only · no injury diagnosis</p>
    </section>
  )
}
