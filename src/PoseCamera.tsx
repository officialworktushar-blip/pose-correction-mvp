import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { analyzeImagePose, analyzeWorldPose, LandmarkSmoother, type JointAngle, type PoseLandmark } from './biomechanics/index.ts'
import { SquatAnalyzer, type SquatResult } from './exercises/squat/index.ts'
import { BicepsCurlAnalyzer, type BicepsCurlResult } from './exercises/biceps-curl/index.ts'

export type CameraView = 'front' | 'side'
export type CameraPhase = 'idle' | 'loading' | 'starting' | 'running' | 'error'
export type PoseModelVariant = 'Heavy' | 'Lite'
export type InferenceBackend = 'GPU' | 'CPU'

type Props = { view: CameraView; activeExercise: 'squat' | 'curl'; onSquatUpdate: (result: SquatResult | null) => void; onCurlUpdate: (result: BicepsCurlResult | null) => void; onStatusChange: (phase: CameraPhase) => void; onModelInfo: (variant: PoseModelVariant, backend: InferenceBackend | null, note: string) => void }

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const publicAssetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
const HEAVY_MODEL = publicAssetUrl('models/pose_landmarker_heavy.task')
const LITE_MODEL = publicAssetUrl('models/pose_landmarker_lite.task')
const MIN_EFFICIENT_FPS = 8
const SLOW_WINDOWS_BEFORE_FALLBACK = 3
type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

async function createLandmarker(vision: VisionFileset, modelAssetPath: string, preferred: InferenceBackend): Promise<{ landmarker: PoseLandmarker; backend: InferenceBackend }> {
  try {
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: preferred },
      runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
    })
    return { landmarker, backend: preferred }
  } catch (error) {
    if (preferred !== 'GPU') throw error
    console.info('MediaPipe GPU initialization failed; retrying with CPU.', error)
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: 'CPU' },
      runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
    })
    return { landmarker, backend: 'CPU' }
  }
}
const LANDMARK_NAMES = [
  'Nose', 'Left eye (inner)', 'Left eye', 'Left eye (outer)', 'Right eye (inner)', 'Right eye', 'Right eye (outer)',
  'Left ear', 'Right ear', 'Mouth (left)', 'Mouth (right)', 'Left shoulder', 'Right shoulder', 'Left elbow', 'Right elbow',
  'Left wrist', 'Right wrist', 'Left pinky', 'Right pinky', 'Left index', 'Right index', 'Left thumb', 'Right thumb',
  'Left hip', 'Right hip', 'Left knee', 'Right knee', 'Left ankle', 'Right ankle', 'Left heel', 'Right heel', 'Left foot index', 'Right foot index',
]

function PoseCamera({ view, activeExercise, onSquatUpdate, onCurlUpdate, onStatusChange, onModelInfo }: Props) {
  const viewRef = useRef(view)
  const exerciseRef = useRef(activeExercise)
  useLayoutEffect(() => { viewRef.current = view; exerciseRef.current = activeExercise }, [view, activeExercise])
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastVideoTimeRef = useRef(-1)
  const lastUiUpdateRef = useRef(0)
  const fpsWindowRef = useRef({ start: 0, frames: 0 })
  const inferenceWindowRef = useRef({ totalMs: 0, frames: 0 })
  const operationRef = useRef(0)
  const visionRef = useRef<VisionFileset | null>(null)
  const backendRef = useRef<InferenceBackend | null>(null)
  const modelVariantRef = useRef<PoseModelVariant>('Heavy')
  const lowFpsWindowsRef = useRef(0)
  const switchingModelRef = useRef(false)
  const liteFallbackAttemptedRef = useRef(false)
  const imageSmootherRef = useRef(new LandmarkSmoother({ alpha: 0.72, minVisibility: 0.25 }))
  const worldSmootherRef = useRef(new LandmarkSmoother({ alpha: 0.72, minVisibility: 0.25 }))
  const squatAnalyzerRef = useRef(new SquatAnalyzer())
  const curlAnalyzerRef = useRef(new BicepsCurlAnalyzer())
  const [phase, setPhase] = useState<CameraPhase>('idle')
  const [message, setMessage] = useState('Camera is off. Start when you’re ready.')
  const [fps, setFps] = useState(0)
  const [averageInferenceMs, setAverageInferenceMs] = useState<number | null>(null)
  const [modelInitializationMs, setModelInitializationMs] = useState<number | null>(null)
  const [videoResolution, setVideoResolution] = useState('')
  const [backend, setBackend] = useState<'GPU' | 'CPU' | null>(null)
  const [modelVariant, setModelVariant] = useState<PoseModelVariant>('Heavy')
  const [performanceNote, setPerformanceNote] = useState('')
  const [landmarks, setLandmarks] = useState<Array<{ name: string; visibility?: number; presence?: number }> | null>(null)
  const [jointAngles, setJointAngles] = useState<Array<JointAngle & { worldDegrees?: number }> | null>(null)

  const releaseCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    lastVideoTimeRef.current = -1
  }, [])

  const stop = useCallback(() => {
    operationRef.current += 1
    releaseCamera()
    landmarkerRef.current?.close()
    landmarkerRef.current = null
    setPhase('idle')
    onStatusChange('idle')
    setMessage('Camera is off. Start when you’re ready.')
    setFps(0)
    setAverageInferenceMs(null)
    setModelInitializationMs(null)
    setVideoResolution('')
    setBackend(null)
    setModelVariant('Heavy')
    setPerformanceNote('')
    modelVariantRef.current = 'Heavy'
    backendRef.current = null
    lowFpsWindowsRef.current = 0
    switchingModelRef.current = false
    liteFallbackAttemptedRef.current = false
    onModelInfo('Heavy', null, '')
    setLandmarks(null)
    setJointAngles(null)
    onSquatUpdate(null)
    squatAnalyzerRef.current.reset()
    onCurlUpdate(null)
    curlAnalyzerRef.current.reset()
    imageSmootherRef.current.reset()
    worldSmootherRef.current.reset()
  }, [releaseCamera, onSquatUpdate, onCurlUpdate, onStatusChange, onModelInfo])

  const start = useCallback(async () => {
    if (phase === 'loading' || phase === 'starting' || phase === 'running') return
    const operation = ++operationRef.current
    setPhase('loading')
    onStatusChange('loading')
    setMessage('Loading the Heavy pose model…')
    setModelVariant('Heavy')
    setPerformanceNote('')
    modelVariantRef.current = 'Heavy'
    backendRef.current = null
    lowFpsWindowsRef.current = 0
    switchingModelRef.current = false
    liteFallbackAttemptedRef.current = false
    onModelInfo('Heavy', null, '')
    setLandmarks(null)
    setJointAngles(null)
    onSquatUpdate(null)
    squatAnalyzerRef.current.reset()
    onCurlUpdate(null)
    curlAnalyzerRef.current.reset()
    imageSmootherRef.current.reset()
    worldSmootherRef.current.reset()
    setFps(0)
    setAverageInferenceMs(null)
    setModelInitializationMs(null)
    setVideoResolution('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Open this page on localhost or use a secure (HTTPS) connection.')

      const initializationStartedAt = performance.now()
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
      visionRef.current = vision
      if (operation !== operationRef.current) return
      const initialized = await createLandmarker(vision, HEAVY_MODEL, 'GPU')
      const { landmarker, backend: selectedBackend } = initialized
      if (operation !== operationRef.current) {
        landmarker.close()
        return
      }
      landmarkerRef.current = landmarker
      setModelInitializationMs(performance.now() - initializationStartedAt)
      backendRef.current = selectedBackend
      setBackend(selectedBackend)
      onModelInfo('Heavy', selectedBackend, '')

      setPhase('starting')
      onStatusChange('starting')
      setMessage('Requesting camera access…')
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      } catch (cameraError) {
        landmarker.close()
        landmarkerRef.current = null
        throw cameraError
      }
      if (operation !== operationRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        landmarker.close()
        landmarkerRef.current = null
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('The video preview could not be initialized.')
      video.srcObject = stream
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('The camera preview could not be started.'))
      })
      setVideoResolution(`${video.videoWidth} × ${video.videoHeight}`)
      await video.play()
      if (operation !== operationRef.current) return
      setPhase('running')
      onStatusChange('running')
      setMessage('Looking for a person…')
      fpsWindowRef.current = { start: performance.now(), frames: 0 }
      inferenceWindowRef.current = { totalMs: 0, frames: 0 }

      const renderFrame = () => {
        const currentVideo = videoRef.current
        const canvas = canvasRef.current
        const model = landmarkerRef.current
        if (!currentVideo || !canvas || !model || currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          rafRef.current = requestAnimationFrame(renderFrame)
          return
        }

        const context = canvas.getContext('2d')
        if (!context) return
        if (canvas.width !== currentVideo.videoWidth || canvas.height !== currentVideo.videoHeight) {
          canvas.width = currentVideo.videoWidth
          canvas.height = currentVideo.videoHeight
        }
        if (currentVideo.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = currentVideo.currentTime
          const inferenceStartedAt = performance.now()
          let result: ReturnType<PoseLandmarker['detectForVideo']>
          try {
            result = model.detectForVideo(currentVideo, inferenceStartedAt)
          } catch (error) {
            console.error('Pose inference failed.', error)
            releaseCamera()
            landmarkerRef.current?.close()
            landmarkerRef.current = null
            setPhase('error')
            onStatusChange('error')
            setBackend(null)
            setMessage('Pose inference stopped unexpectedly. Restart the camera to try again.')
            return
          }
          inferenceWindowRef.current.totalMs += performance.now() - inferenceStartedAt
          inferenceWindowRef.current.frames += 1
          context.clearRect(0, 0, canvas.width, canvas.height)
          const pose = result.landmarks[0]
          if (pose) {
            const rawImageLandmarks: PoseLandmark[] = pose.map((point, index) => ({
              name: LANDMARK_NAMES[index] ?? `Point ${index + 1}`,
              x: point.x, y: point.y, z: point.z, visibility: point.visibility, presence: point.presence,
              coordinateSpace: 'image-normalized',
            }))
            const timestamp = performance.now()
            const smoothedImageLandmarks = imageSmootherRef.current.smooth(rawImageLandmarks, timestamp)
            const imageAnalysis = analyzeImagePose(rawImageLandmarks, smoothedImageLandmarks,
              { width: currentVideo.videoWidth, height: currentVideo.videoHeight },
              { orientation: viewRef.current, minVisibility: 0.5, minPresence: 0.5 })
            const rawWorldLandmarks: PoseLandmark[] = (result.worldLandmarks[0] ?? []).map((point, index) => ({
              name: LANDMARK_NAMES[index] ?? `Point ${index + 1}`,
              x: point.x, y: point.y, z: point.z, visibility: point.visibility, presence: point.presence,
              coordinateSpace: 'world-meters',
            }))
            const smoothedWorldLandmarks = worldSmootherRef.current.smooth(rawWorldLandmarks, timestamp)
            const worldAnalysis = rawWorldLandmarks.length
              ? analyzeWorldPose(rawWorldLandmarks, smoothedWorldLandmarks, { orientation: viewRef.current, minVisibility: 0.5, minPresence: 0.5 })
              : null
            const squatResult = exerciseRef.current === 'squat' ? squatAnalyzerRef.current.update(imageAnalysis, worldAnalysis ?? undefined) : null
            const curlResult = exerciseRef.current === 'curl' ? curlAnalyzerRef.current.update(imageAnalysis, worldAnalysis ?? undefined, timestamp) : null
            const drawPose = imageAnalysis.smoothedLandmarks
            const { incorrect: incorrectJoints, warning: warningJoints } = getHighlightedJoints(exerciseRef.current, squatResult, curlResult, imageAnalysis.confidence)
            context.lineWidth = Math.max(2, canvas.width / 360)
            context.lineCap = 'round'
            for (const { start: from, end: to } of PoseLandmarker.POSE_CONNECTIONS) {
              const a = drawPose[from]
              const b = drawPose[to]
              if (!a || !b || (a.visibility ?? 1) < 0.25 || (b.visibility ?? 1) < 0.25) continue
              context.beginPath()
              context.moveTo(a.x * canvas.width, a.y * canvas.height)
              context.lineTo(b.x * canvas.width, b.y * canvas.height)
              context.strokeStyle = incorrectJoints.has(from) || incorrectJoints.has(to) ? 'rgba(242, 106, 132, 0.95)' : warningJoints.has(from) || warningJoints.has(to) ? 'rgba(221, 179, 92, 0.9)' : 'rgba(183, 143, 255, 0.88)'
              context.stroke()
            }
            for (const [index, point] of drawPose.entries()) {
              if ((point.visibility ?? 1) < 0.25) continue
              context.beginPath()
              context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 190), 0, Math.PI * 2)
              context.fillStyle = incorrectJoints.has(index) ? '#ff8298' : warningJoints.has(index) ? '#e6c173' : '#f0dcff'
              context.fill()
              context.strokeStyle = incorrectJoints.has(index) ? '#ff8298' : warningJoints.has(index) ? '#e6c173' : '#9a68ff'
              context.lineWidth = Math.max(1, canvas.width / 720)
              context.stroke()
            }
            if (performance.now() - lastUiUpdateRef.current > 250 || squatResult?.repetitionCompleted || Object.values(curlResult?.arms ?? {}).some((arm) => arm?.repetitionCompleted)) {
              lastUiUpdateRef.current = performance.now()
              setMessage('Full body detected')
              setLandmarks(imageAnalysis.confidence.map((point, index) => ({ name: LANDMARK_NAMES[index] ?? point.name, visibility: point.visibility, presence: point.presence })))
              setJointAngles(imageAnalysis.jointAngles.map((angle, index) => ({
                ...angle,
                worldDegrees: worldAnalysis?.jointAngles[index]?.reliable ? worldAnalysis.jointAngles[index]?.degrees ?? undefined : undefined,
              })))
              if (exerciseRef.current === 'squat') onSquatUpdate(squatResult)
              else onCurlUpdate(curlResult)
            }
          }

          fpsWindowRef.current.frames += 1
          const now = performance.now()
          if (now - fpsWindowRef.current.start >= 1000) {
            const measuredFps = Math.round(fpsWindowRef.current.frames * 1000 / (now - fpsWindowRef.current.start))
            setFps(measuredFps)
            const inferenceWindow = inferenceWindowRef.current
            if (inferenceWindow.frames > 0) setAverageInferenceMs(inferenceWindow.totalMs / inferenceWindow.frames)
            inferenceWindowRef.current = { totalMs: 0, frames: 0 }
            fpsWindowRef.current = { start: now, frames: 0 }
            if (measuredFps < MIN_EFFICIENT_FPS) lowFpsWindowsRef.current += 1
            else lowFpsWindowsRef.current = 0
            if (modelVariantRef.current === 'Heavy' && lowFpsWindowsRef.current >= SLOW_WINDOWS_BEFORE_FALLBACK && !switchingModelRef.current && !liteFallbackAttemptedRef.current) {
              switchingModelRef.current = true
              liteFallbackAttemptedRef.current = true
              const note = `Heavy model stayed below ${MIN_EFFICIENT_FPS} FPS. Switching to the lighter model.`
              setPerformanceNote(note)
              onModelInfo('Heavy', backendRef.current, note)
              const activeVision = visionRef.current
              if (activeVision) {
                void createLandmarker(activeVision, LITE_MODEL, backendRef.current ?? 'GPU').then(({ landmarker: lite, backend: liteBackend }) => {
                  if (operation !== operationRef.current) { lite.close(); return }
                  const heavy = landmarkerRef.current
                  landmarkerRef.current = lite
                  heavy?.close()
                  modelVariantRef.current = 'Lite'
                  backendRef.current = liteBackend
                  setModelVariant('Lite')
                  setBackend(liteBackend)
                  const liteNote = 'Lite model active to maintain responsive live tracking.'
                  setPerformanceNote(liteNote)
                  setMessage('Lite model active · tracking on device')
                  imageSmootherRef.current.reset()
                  worldSmootherRef.current.reset()
                  squatAnalyzerRef.current.reset()
                  curlAnalyzerRef.current.reset()
                  onSquatUpdate(null)
                  onCurlUpdate(null)
                  onModelInfo('Lite', liteBackend, liteNote)
                }).catch((error: unknown) => {
                  if (operation !== operationRef.current) return
                  const noteAfterFailure = 'The device is running below the preferred frame rate. Heavy model remains active.'
                  setPerformanceNote(noteAfterFailure)
                  onModelInfo('Heavy', backendRef.current, noteAfterFailure)
                  console.warn('Could not switch to the Lite pose model.', error)
                }).finally(() => { switchingModelRef.current = false })
              } else switchingModelRef.current = false
            }
          }
          if (!pose) {
            imageSmootherRef.current.reset()
            worldSmootherRef.current.reset()
            squatAnalyzerRef.current.reset()
            curlAnalyzerRef.current.reset()
            if (now - lastUiUpdateRef.current > 250) {
              lastUiUpdateRef.current = now
              setMessage('Looking for a person…')
              setLandmarks(null)
              setJointAngles(null)
              onSquatUpdate(null)
              onCurlUpdate(null)
            }
          }
        }
        rafRef.current = requestAnimationFrame(renderFrame)
      }
      rafRef.current = requestAnimationFrame(renderFrame)
    } catch (error) {
      if (operation !== operationRef.current) return
      releaseCamera()
      landmarkerRef.current?.close()
      landmarkerRef.current = null
      setPhase('error')
      onStatusChange('error')
      setBackend(null)
      setMessage(getErrorMessage(error))
    }
  }, [phase, releaseCamera, onSquatUpdate, onCurlUpdate, onStatusChange, onModelInfo])

  useEffect(() => {
    squatAnalyzerRef.current.reset()
    curlAnalyzerRef.current.reset()
    onSquatUpdate(null)
    onCurlUpdate(null)
  }, [view, activeExercise, onSquatUpdate, onCurlUpdate])

  useEffect(() => () => {
    operationRef.current += 1
    releaseCamera()
    landmarkerRef.current?.close()
    landmarkerRef.current = null
  }, [releaseCamera])

  return (
    <div className="capture-card" data-view={view}>
      <div className="video-stage">
        <video ref={videoRef} className="camera-video" playsInline muted aria-label="Live camera preview" />
        <canvas ref={canvasRef} className="pose-canvas" aria-label="Detected pose skeleton" />
        {phase !== 'running' && <div className="video-placeholder"><div className="camera-glyph"><span /><span /></div><strong>{phase === 'loading' ? 'Preparing your session' : phase === 'starting' ? 'Connecting to camera' : phase === 'error' ? 'Camera unavailable' : 'Ready when you are'}</strong><span>{phase === 'error' ? 'Check the message below and try again.' : 'Your movement preview will appear here.'}</span></div>}
        <div className="video-overlay-top"><span className={phase === 'running' ? 'live-indicator is-live' : 'live-indicator'}><i /> {phase === 'running' ? 'LIVE' : 'STANDBY'}</span><span className="resolution-tag">{phase === 'running' && videoResolution ? videoResolution : 'HD CAMERA'}</span></div>
        <div className="video-overlay-bottom"><span className="tracking-state"><i className={landmarks ? 'tracking-icon detected' : 'tracking-icon'} /> {phase === 'running' ? message : 'POSE TRACKER'}</span><span className="fps-readout"><strong>{fps}</strong> FPS</span></div>
        <div className="frame-corner corner-tl"/><div className="frame-corner corner-tr"/><div className="frame-corner corner-bl"/><div className="frame-corner corner-br"/>
      </div>
      <div className="capture-controls"><div className="capture-status"><span className={phase === 'running' ? 'status-light on' : phase === 'error' ? 'status-light error' : 'status-light'} />{phase === 'running' ? `Tracking active · ${modelVariant} · ${backend ?? 'GPU'} · ${fps} FPS` : phase === 'loading' ? 'Loading model…' : phase === 'starting' ? 'Starting camera…' : phase === 'error' ? message : 'Camera stopped'}</div><div className="control-actions"><button className="text-control" onClick={stop} disabled={phase === 'idle'}>Stop</button><button className="start-button" onClick={start} disabled={phase === 'loading' || phase === 'starting' || phase === 'running'}><span>{phase === 'running' ? '●' : '▶'}</span>{phase === 'error' ? 'Try again' : phase === 'running' ? 'Camera running' : phase === 'loading' ? 'Loading model…' : phase === 'starting' ? 'Starting…' : 'Start camera'}</button></div></div>
      {phase === 'error' && <p className="camera-error" role="alert">{message}</p>}
      {performanceNote && <p className="performance-note" role="status">{performanceNote}</p>}
      {modelInitializationMs !== null && <p className="performance-note" role="status">Model + WASM init {(modelInitializationMs / 1000).toFixed(2)} s · average inference {averageInferenceMs === null ? 'measuring…' : `${averageInferenceMs.toFixed(1)} ms`}</p>}
      <div className="landmark-readout"><div className="readout-header"><span>LANDMARK INSPECTOR</span><span>{landmarks ? `${landmarks.length} / 33` : 'AWAITING DETECTION'}</span></div>{landmarks ? <div className="landmark-list" role="list" aria-label="Detected landmark confidence values">{landmarks.map((point, index) => <div className="landmark-row" role="listitem" key={`${point.name}-${index}`}><span className="point-index">{String(index + 1).padStart(2, '0')}</span><span className="point-name">{point.name}</span><span className="point-metrics">{point.visibility !== undefined ? `V ${point.visibility.toFixed(2)}` : 'V —'}<br />{point.presence !== undefined ? `P ${point.presence.toFixed(2)}` : 'P —'}</span><span className={point.visibility !== undefined && point.visibility < 0.25 ? 'point-state faint' : 'point-state'} /></div>)}</div> : <p className="readout-empty">Start the camera to inspect live landmark visibility and presence scores.</p>}
        <div className="angle-section"><div className="angle-heading"><span>JOINT ANGLES</span><span>2D IMAGE / 3D WORLD</span></div>{jointAngles ? <div className="angle-grid">{jointAngles.map((angle) => <div className="angle-row" key={angle.joint}><span>{angle.joint.replace(/([A-Z])/g, ' $1')}</span><strong className={angle.reliable ? '' : 'unreliable'}>{angle.degrees === null ? '—' : `${angle.degrees.toFixed(0)}°`}</strong><strong className={angle.worldDegrees === undefined ? 'unreliable' : ''}>{angle.worldDegrees === undefined ? '—' : `${angle.worldDegrees.toFixed(0)}°`}</strong></div>)}</div> : <p className="angle-empty">Angles appear when the relevant landmarks are visible.</p>}</div>
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') return 'Camera permission was denied. Allow camera access in your browser settings, then try again.'
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') return 'No camera was found. Connect a camera and try again.'
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') return 'The camera is unavailable or already in use by another application.'
    return `Could not start pose detection: ${error.message}`
  }
  return 'Could not load the pose model. Check your connection and try again.'
}

function getHighlightedJoints(exercise: 'squat' | 'curl', squat: SquatResult | null, curl: BicepsCurlResult | null, confidence: readonly { reliable: boolean }[]) {
  const incorrect = new Set<number>()
  const warning = new Set<number>()
  if (exercise === 'squat' && squat) {
    if (!squat.visibilitySufficient) confidence.forEach((item, index) => { if (!item.reliable && [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(index)) warning.add(index) })
    for (const item of squat.feedback) {
      if (item.code === 'depth') [23, 24, 25, 26].forEach((index) => incorrect.add(index))
      if (item.code === 'torso-lean') [11, 12, 23, 24].forEach((index) => incorrect.add(index))
      if (item.code === 'knee-alignment' || item.code === 'asymmetry') [25, 26, 27, 28, 31, 32].forEach((index) => incorrect.add(index))
    }
  }
  if (exercise === 'curl' && curl) {
    for (const item of curl.feedback) {
      const arm = item.arm
      if (!arm) continue
      const shoulder = arm === 'left' ? 11 : 12
      const elbow = arm === 'left' ? 13 : 14
      const wrist = arm === 'left' ? 15 : 16
      const hip = arm === 'left' ? 23 : 24
      if (item.code === 'visibility') [shoulder, elbow, wrist, hip].forEach((index) => warning.add(index))
      else if (item.code === 'shoulder-elevation') [shoulder, hip].forEach((index) => incorrect.add(index))
      else if (item.code === 'torso-swing') [11, 12, 23, 24].forEach((index) => incorrect.add(index))
      else [shoulder, elbow, wrist].forEach((index) => incorrect.add(index))
    }
  }
  warning.forEach((index) => { if (incorrect.has(index)) warning.delete(index) })
  return { incorrect, warning }
}

export default memo(PoseCamera)
