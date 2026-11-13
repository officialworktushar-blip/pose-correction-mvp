import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import PoseCamera, { type CameraPhase, type CameraView, type InferenceBackend, type PoseModelVariant } from './PoseCamera'
import { ExerciseInsightPanel } from './dashboard/ExerciseInsightPanel'
import { scoreCurlForm, scoreSquatForm } from './dashboard/formQuality.ts'
import type { SquatResult } from './exercises/squat/squatAnalyzer.ts'
import type { BicepsCurlResult } from './exercises/biceps-curl/bicepsCurlAnalyzer.ts'
import type { CurlEquipment } from './exercises/biceps-curl/BicepsCurlPanel.tsx'
import './App.css'

export type ExerciseMode = 'squat' | 'curl'

function App() {
  const [exercise, setExercise] = useState<ExerciseMode>('squat')
  const [view, setView] = useState<CameraView>('front')
  const [cameraPhase, setCameraPhase] = useState<CameraPhase>('idle')
  const [sessionKey, setSessionKey] = useState(0)
  const [modelInfo, setModelInfo] = useState<{ variant: PoseModelVariant; backend: InferenceBackend | null; note: string }>({ variant: 'Heavy', backend: null, note: '' })
  const [equipment, setEquipment] = useState<CurlEquipment>('bodyweight')
  const handleModelInfo = useCallback((variant: PoseModelVariant, backend: InferenceBackend | null, note: string) => setModelInfo({ variant, backend, note }), [])
  const handleCameraPhase = useCallback((phase: CameraPhase) => {
    setCameraPhase(phase)
    if (phase === 'loading') setSessionKey((key) => key + 1)
  }, [])
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <a className="brand dashboard-brand" href="#overview" aria-label="Formframe dashboard">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>formframe<span className="brand-period">.</span></span>
        </a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-item selected" href="#overview"><span className="nav-icon">◫</span>Overview</a>
          <a className="nav-item" href="#live-session"><span className="nav-icon">⌁</span>Live coaching<span className="nav-live" /></a>
          <a className="nav-item" href="#movement-library"><span className="nav-icon">▧</span>Movement library</a>
        </nav>
        <div className="sidebar-section-label exercise-label">EXERCISES</div>
        <button className={exercise === 'squat' ? 'side-exercise active' : 'side-exercise'} onClick={() => setExercise('squat')}><span className="exercise-glyph squat-glyph">↕</span>Squat</button>
        <button className={exercise === 'curl' ? 'side-exercise active' : 'side-exercise'} onClick={() => setExercise('curl')}><span className="exercise-glyph curl-glyph">⌒</span>Biceps curl</button>
        <div className="sidebar-bottom"><span className="sidebar-status-dot" /><div><strong>Private by design</strong><small>Pose data stays on device</small></div><button className="help-button" aria-label="Privacy information" title="All pose inference runs in your browser">?</button></div>
      </aside>

      <main className="dashboard-main" id="overview">
        <header className="dashboard-topbar"><div className="breadcrumbs"><span>WORKSPACE</span><b>/</b><strong>Dashboard</strong></div><div className="topbar-right"><span className="privacy-dot" /> <span>ON-DEVICE SESSION</span><span className="version-tag">PHASE 05</span></div></header>
        <div className="dashboard-content">
          <section className="dashboard-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> MOVEMENT STUDIO</div><h1>Training dashboard</h1><p>Real-time form cues, measured on your device.</p></div><div className={`session-live-chip ${cameraPhase === 'running' ? 'is-live' : ''}`}><i />{cameraPhase === 'running' ? 'SESSION LIVE' : cameraPhase === 'loading' || cameraPhase === 'starting' ? 'PREPARING' : 'READY'}</div></section>
          <DashboardOverview exercise={exercise} view={view} onExerciseChange={setExercise} onViewChange={setView}
            onEquipmentChange={setEquipment} equipment={equipment} cameraPhase={cameraPhase} sessionKey={sessionKey} onCameraPhaseChange={handleCameraPhase} modelInfo={modelInfo} onModelInfo={handleModelInfo} />
          <footer className="dashboard-footer"><span>FORMFRAME · BROWSER-BASED COMPUTER VISION</span><span>Movement guidance only · not a medical assessment</span></footer>
        </div>
      </main>
    </div>
  )
}

type OverviewProps = {
  exercise: ExerciseMode; view: CameraView; onExerciseChange: (exercise: ExerciseMode) => void
  onViewChange: (view: CameraView) => void; equipment: CurlEquipment; onEquipmentChange: (equipment: CurlEquipment) => void
  cameraPhase: CameraPhase; sessionKey: number; onCameraPhaseChange: (phase: CameraPhase) => void
  modelInfo: { variant: PoseModelVariant; backend: InferenceBackend | null; note: string }
  onModelInfo: (variant: PoseModelVariant, backend: InferenceBackend | null, note: string) => void
}

function DashboardOverview({ exercise, view, onExerciseChange, onViewChange, equipment, onEquipmentChange, cameraPhase, sessionKey, onCameraPhaseChange, modelInfo, onModelInfo }: OverviewProps) {
  const [analysis, setAnalysis] = useState<{ exercise: ExerciseMode; squat: SquatResult | null; curl: BicepsCurlResult | null }>({ exercise: 'squat', squat: null, curl: null })
  const handleSquat = useCallback((result: SquatResult | null) => {
    if (exercise === 'squat') setAnalysis((previous) => previous.exercise === exercise
      ? { ...previous, squat: result } : { exercise, squat: result, curl: null })
  }, [exercise])
  const handleCurl = useCallback((result: BicepsCurlResult | null) => {
    if (exercise === 'curl') setAnalysis((previous) => previous.exercise === exercise
      ? { ...previous, curl: result } : { exercise, squat: null, curl: result })
  }, [exercise])
  const squatResult = analysis.exercise === exercise ? analysis.squat : null
  const curlResult = analysis.exercise === exercise ? analysis.curl : null
  const selectedResult = exercise === 'squat' ? squatResult : curlResult
  const quality = useMemo(() => exercise === 'squat' ? scoreSquatForm(squatResult) : scoreCurlForm(curlResult), [exercise, squatResult, curlResult])
  const repetitions = exercise === 'squat' ? squatResult?.repetitions ?? 0 : curlResult?.totalRepetitions ?? 0

  return (
    <>
      <div className="overview-stat-grid">
        <div className="overview-stat"><div className="stat-label"><span className="stat-icon timer-icon">◷</span> SESSION TIME</div><WorkoutTimer key={sessionKey} phase={cameraPhase} /></div>
        <div className="overview-stat"><div className="stat-label"><span className="stat-icon reps-icon">↻</span> COMPLETED REPS</div><strong className="overview-stat-value">{repetitions.toString().padStart(2, '0')}</strong><small>{exercise === 'squat' ? 'Squat repetitions' : 'Selected arm total'}</small></div>
        <div className={`overview-stat score-stat ${quality.status}`}><div className="stat-label"><span className="stat-icon quality-icon">◌</span> FORM QUALITY</div><strong className="overview-stat-value">{quality.score === null ? '—' : `${quality.score}`}<small>{quality.score === null ? '' : ' / 100'}</small></strong><small>{quality.status === 'waiting' ? 'Awaiting measurable movement' : 'Configurable movement checklist'}</small></div>
      </div>

      <section className="live-session" id="live-session">
        <div className="session-toolbar"><div className="exercise-switch" role="group" aria-label="Select exercise"><button className={exercise === 'squat' ? 'exercise-tab active' : 'exercise-tab'} onClick={() => onExerciseChange('squat')} aria-pressed={exercise === 'squat'}><span>⌁</span>Squat</button><button className={exercise === 'curl' ? 'exercise-tab active' : 'exercise-tab'} onClick={() => onExerciseChange('curl')} aria-pressed={exercise === 'curl'}><span>⌒</span>Biceps curl</button></div>
          <div className="camera-view-switch" role="group" aria-label="Camera body orientation"><span>CAMERA VIEW</span><button className={view === 'front' ? 'active' : ''} onClick={() => onViewChange('front')} aria-pressed={view === 'front'}>Front</button><button className={view === 'side' ? 'active' : ''} onClick={() => onViewChange('side')} aria-pressed={view === 'side'}>Side</button></div>
        </div>
        <div className="live-layout">
          <section className="camera-section"><div className="camera-section-heading"><div><span className="section-index">01</span><h2>Live camera</h2></div><span className="local-badge"><span /> LOCAL INFERENCE</span></div>
            <PoseCamera view={view} activeExercise={exercise} onSquatUpdate={handleSquat} onCurlUpdate={handleCurl} onStatusChange={onCameraPhaseChange}
              onModelInfo={onModelInfo} />
            <div className="camera-guidance"><span>POSITIONING</span><strong>{exercise === 'squat' && view === 'front' ? 'Face the camera' : exercise === 'squat' ? 'Turn to a side profile' : view === 'front' ? 'Face the camera with both arms visible' : 'Turn side-on and keep the working arm visible'}</strong><p>{exercise === 'squat' && view === 'front' ? 'Use this view for knee alignment and left/right balance.' : exercise === 'squat' ? 'Use this view for depth, hip travel and torso lean.' : 'Stand far enough back to keep your shoulder, elbow, wrist and hip in frame.'}</p></div>
          </section>
          <aside className="analysis-section" aria-label="Exercise analysis">
            <ExerciseInsightPanel exercise={exercise} result={selectedResult} quality={quality} />
            {exercise === 'curl' && <div className="equipment-context"><span>EQUIPMENT CONTEXT</span><div className="equipment-buttons"><button className={equipment === 'bodyweight' ? 'selected' : ''} onClick={() => onEquipmentChange('bodyweight')}>No dumbbell</button><button className={equipment === 'dumbbell' ? 'selected' : ''} onClick={() => onEquipmentChange('dumbbell')}>Dumbbell</button></div><small>User-selected only · no object or weight detection</small></div>}
            <ModelStatus phase={cameraPhase} modelInfo={modelInfo} />
          </aside>
        </div>
      </section>
      <section className="library-teaser" id="movement-library"><div><span className="panel-kicker">MOVEMENT LIBRARY</span><h2>Two movements, one camera</h2><p>Switch between squat and curl analysis without changing your setup.</p></div><span className="library-count">02 <small>EXERCISES</small></span></section>
    </>
  )
}

const WorkoutTimer = memo(function WorkoutTimer({ phase }: { phase: CameraPhase }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (phase !== 'running') return
    const startedAt = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [phase])
  return <><strong className="overview-stat-value timer-value">{formatTime(seconds)}</strong><small>{phase === 'running' ? 'Session running' : phase === 'loading' || phase === 'starting' ? 'Starting session…' : 'Starts with camera'}</small></>
})

function formatTime(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`
}

const ModelStatus = memo(function ModelStatus({ phase, modelInfo }: { phase: CameraPhase; modelInfo: OverviewProps['modelInfo'] }) {
  return <div className="model-status-card"><div className="model-status-top"><span className="panel-kicker">POSE PIPELINE</span><span className={`pipeline-dot ${phase === 'running' ? 'live' : ''}`} /></div><strong>MediaPipe Pose Landmarker · {modelInfo.variant}</strong><span>{modelInfo.backend ?? 'GPU / CPU'} delegate · 33 landmarks · browser inference</span><div className="pipeline-steps"><i className={phase !== 'idle' && phase !== 'error' ? 'active' : ''} /><i className={phase === 'starting' || phase === 'running' ? 'active' : ''} /><i className={phase === 'running' ? 'active' : ''} /><small>{phase === 'loading' ? 'Loading model' : phase === 'starting' ? 'Requesting camera' : phase === 'running' ? 'Inference active' : phase === 'error' ? 'Initialization error' : 'Ready to initialize'}</small></div>{modelInfo.note && <p className="model-performance-note">{modelInfo.note}</p>}</div>
})

export default App
