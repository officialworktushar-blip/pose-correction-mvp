import type { FormQuality } from './formQuality.ts'
import type { SquatResult } from '../exercises/squat/squatAnalyzer.ts'
import type { BicepsCurlResult } from '../exercises/biceps-curl/bicepsCurlAnalyzer.ts'

type Props = { exercise: 'squat' | 'curl'; result: SquatResult | BicepsCurlResult | null; quality: FormQuality }

export function ExerciseInsightPanel({ exercise, result, quality }: Props) {
  const feedback = result ? result.feedback : []
  const phase = exercise === 'squat' && result && 'phase' in result
    ? result.phase.replace('-', ' ')
    : exercise === 'curl' && result && 'arms' in result
      ? Object.entries(result.arms).map(([arm, data]) => data ? `${arm}: ${data.phase.replaceAll('-', ' ')}` : '').filter(Boolean).join(' · ')
      : null
  const reps = exercise === 'squat' && result && 'repetitions' in result
    ? result.repetitions
    : exercise === 'curl' && result && 'totalRepetitions' in result ? result.totalRepetitions : 0
  return (
    <section className="insight-panel">
      <header className="insight-heading"><div><span className="panel-kicker">LIVE ANALYSIS</span><h2>{exercise === 'squat' ? 'Squat form' : 'Biceps curl form'}</h2></div><span className={`quality-status ${quality.status}`}>{quality.status === 'good' ? 'ON TRACK' : quality.status === 'warning' ? 'NEEDS ATTENTION' : quality.status === 'incorrect' ? 'ADJUST FORM' : 'WAITING'}</span></header>
      <div className="quality-summary"><div className={`quality-score ${quality.status}`}><strong>{quality.score === null ? '—' : quality.score}</strong><span>{quality.score === null ? 'SCORE' : '/ 100'}</span></div><div className="quality-copy"><strong>{quality.summary}</strong><p>Configurable checklist · based on measurable visible criteria</p><div className="quality-meter"><span className={quality.status} style={{ width: `${quality.score ?? 0}%` }} /></div></div></div>
      {quality.confidenceWarning && <div className="confidence-warning"><i />Some points are not reliable enough to score. Reposition so the required body parts are clearly visible.</div>}
      <div className="insight-stats"><div><span>REPETITIONS</span><strong>{reps}</strong></div><div><span>CURRENT PHASE</span><strong>{phase ?? (result ? 'In progress' : 'Waiting')}</strong></div></div>
      <div className="feedback-block"><div className="block-title"><span>COACHING CUES</span><span>{feedback.length ? `${feedback.length} ACTIVE` : 'CLEAR'}</span></div>{feedback.length ? <ul className="dashboard-cues">{feedback.map((item, index) => <li key={`${item.code}-${index}`} className={item.severity}><i />{item.message}</li>)}</ul> : <p className="clear-cues">{result ? 'No confirmed corrections right now. Keep the movement controlled.' : 'Start the camera to receive live posture feedback.'}</p>}</div>
      <div className="criteria-block"><div className="block-title"><span>SCORE BREAKDOWN</span><span>{quality.criteria.length} MEASURED</span></div>{quality.criteria.length ? <div className="criteria-list">{quality.criteria.map((item) => <div className="criteria-row" key={item.key}><span className={item.passed ? 'criterion-mark pass' : 'criterion-mark fail'}>{item.passed ? '✓' : '!'}</span><span className="criterion-name">{item.label}<small>{item.measured}</small></span><span className="criterion-target">{item.target}</span></div>)}</div> : <p className="clear-cues">No exercise-specific criteria are being scored yet.</p>}</div>
      <p className="quality-disclaimer">This configurable form checklist is not a medical or scientifically validated score.</p>
    </section>
  )
}
