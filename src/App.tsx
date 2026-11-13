import { useState } from 'react'
import PoseCamera, { type CameraView } from './PoseCamera'
import { SquatPanel, type SquatResult } from './exercises/squat/index.ts'
import { BicepsCurlPanel, type BicepsCurlResult, type CurlEquipment } from './exercises/biceps-curl/index.ts'
import './App.css'

function App() {
  const [view, setView] = useState<CameraView>('front')
  const [squatResult, setSquatResult] = useState<SquatResult | null>(null)
  const [curlResult, setCurlResult] = useState<BicepsCurlResult | null>(null)
  const [curlEquipment, setCurlEquipment] = useState<CurlEquipment>('bodyweight')

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Formframe home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>formframe<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right"><span className="privacy-dot" /> <span>PROCESSING ON DEVICE</span><span className="version-tag">PHASE 04</span></div>
      </header>

      <section className="intro" id="top">
        <div className="eyebrow"><span className="eyebrow-line" /> COMPUTER VISION STUDIO</div>
        <h1>See your movement<br /><em>more clearly.</em></h1>
        <p className="intro-copy">Real-time pose tracking, running locally in your browser.<br className="desktop-break" /> No uploads. Just you and the movement.</p>
      </section>

      <section className="workspace" aria-label="Live pose detection workspace">
        <div className="camera-column">
          <div className="workspace-heading"><div><span className="section-index">01</span><h2>Live capture</h2></div><span className="local-badge"><span /> LOCAL INFERENCE</span></div>
          <div className="view-picker" role="group" aria-label="Body orientation">
            <button className={view === 'front' ? 'view-option active' : 'view-option'} onClick={() => setView('front')} aria-pressed={view === 'front'}><span className="view-icon front-icon">◎</span><span>Front view</span></button>
            <button className={view === 'side' ? 'view-option active' : 'view-option'} onClick={() => setView('side')} aria-pressed={view === 'side'}><span className="view-icon side-icon">◉</span><span>Side view</span></button>
            <span className="view-note">ONE CAMERA · CHANGE POSITION</span>
          </div>
          <PoseCamera view={view} onSquatUpdate={setSquatResult} onCurlUpdate={setCurlResult} />
          <div className="position-tip"><span className="tip-icon">✳</span><p><strong>{view === 'front' ? 'Face the camera' : 'Turn 90° to the camera'}</strong>{view === 'front' ? 'Stand back far enough to keep your full body in frame.' : 'Keep your profile visible, with your full body inside the frame.'}</p></div>
        </div>

        <aside className="data-column" aria-label="Detection details">
          <div className="data-card model-card"><div className="card-topline"><span>ACTIVE MODEL</span><span className="model-dot" /></div><div className="model-name">Pose Landmarker<span>Heavy</span></div><p>High-accuracy · 33 landmarks</p><div className="model-foot"><span>MEDIAPIPE TASKS VISION</span><span>GPU / CPU</span></div></div>
          <div className="data-card orientation-card"><div className="card-topline"><span>POSITIONING</span><span className="orientation-index">0{view === 'front' ? '1' : '2'} / 02</span></div><div className="orientation-title">{view === 'front' ? 'Front view' : 'Side view'}</div><p>{view === 'front' ? 'Face forward, shoulders level, arms relaxed by your sides.' : 'Stand in profile, facing left or right. Keep hips and shoulders stacked.'}</p><div className="orientation-graphic" aria-hidden="true"><span className="graphic-axis" /><span className={view === 'front' ? 'graphic-person front-person' : 'graphic-person side-person'}><i /><b /><i /><b /><i /><b /></span><span className="graphic-camera">⌾</span><span className="graphic-dash dash-one" /><span className="graphic-dash dash-two" /></div></div>
          <div className="data-card landmarks-card"><div className="card-topline"><span>LANDMARK SIGNAL</span><span className="landmark-count">33 POINTS</span></div><div className="landmark-preview"><div className="signal-figure" aria-hidden="true"><i className="signal-head"/><i className="signal-body"/><i className="signal-arm left"/><i className="signal-arm right"/><i className="signal-leg left"/><i className="signal-leg right"/><b/><b/><b/><b/><b/><b/></div><div className="signal-copy"><strong>Whole body</strong><span>Keypoints detected</span><div className="signal-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div></div><div className="landmark-legend"><span><i className="legend-visible"/> VISIBLE</span><span><i className="legend-faint"/> LOW CONFIDENCE</span></div></div>
          <SquatPanel result={squatResult} />
          <BicepsCurlPanel result={curlResult} equipment={curlEquipment} onEquipmentChange={setCurlEquipment} />
        </aside>
      </section>

      <footer className="page-footer"><span>FORMFRAME <i>©</i> 2026</span><span>POSE DETECTION · BROWSER BASED</span><span>YOUR CAMERA STAYS YOURS <b>↗</b></span></footer>
    </main>
  )
}

export default App
