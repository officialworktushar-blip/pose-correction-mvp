import { useCallback, useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { analyzeImagePose, analyzeWorldPose, LandmarkSmoother, type JointAngle, type PoseLandmark } from './biomechanics/index.ts'
import { SquatAnalyzer, type SquatResult } from './exercises/squat/index.ts'
import { BicepsCurlAnalyzer, type BicepsCurlResult } from './exercises/biceps-curl/index.ts'

export type CameraView = 'front' | 'side'

type Props = { view: CameraView; onSquatUpdate: (result: SquatResult | null) => void; onCurlUpdate: (result: BicepsCurlResult | null) => void }
type Phase = 'idle' | 'loading' | 'starting' | 'running' | 'error'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const HEAVY_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task'
const LANDMARK_NAMES = [
  'Nose', 'Left eye (inner)', 'Left eye', 'Left eye (outer)', 'Right eye (inner)', 'Right eye', 'Right eye (outer)',
  'Left ear', 'Right ear', 'Mouth (left)', 'Mouth (right)', 'Left shoulder', 'Right shoulder', 'Left elbow', 'Right elbow',
  'Left wrist', 'Right wrist', 'Left pinky', 'Right pinky', 'Left index', 'Right index', 'Left thumb', 'Right thumb',
  'Left hip', 'Right hip', 'Left knee', 'Right knee', 'Left ankle', 'Right ankle', 'Left heel', 'Right heel', 'Left foot index', 'Right foot index',
]

function PoseCamera({ view, onSquatUpdate, onCurlUpdate }: Props) {
  const viewRef = useRef(view)
  viewRef.current = view
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastVideoTimeRef = useRef(-1)
  const lastUiUpdateRef = useRef(0)
  const fpsWindowRef = useRef({ start: 0, frames: 0 })
  const operationRef = useRef(0)
  const imageSmootherRef = useRef(new LandmarkSmoother({ alpha: 0.72, minVisibility: 0.25 }))
  const worldSmootherRef = useRef(new LandmarkSmoother({ alpha: 0.72, minVisibility: 0.25 }))
  const squatAnalyzerRef = useRef(new SquatAnalyzer())
  const curlAnalyzerRef = useRef(new BicepsCurlAnalyzer())
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('Camera is off. Start when you’re ready.')
  const [fps, setFps] = useState(0)
  const [backend, setBackend] = useState<'GPU' | 'CPU' | null>(null)
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
    setMessage('Camera is off. Start when you’re ready.')
    setFps(0)
    setBackend(null)
    setLandmarks(null)
    setJointAngles(null)
    onSquatUpdate(null)
    squatAnalyzerRef.current.reset()
    onCurlUpdate(null)
    curlAnalyzerRef.current.reset()
    imageSmootherRef.current.reset()
    worldSmootherRef.current.reset()
  }, [releaseCamera, onSquatUpdate, onCurlUpdate])

  const start = useCallback(async () => {
    if (phase === 'loading' || phase === 'starting' || phase === 'running') return
    const operation = ++operationRef.current
    setPhase('loading')
    setMessage('Loading the Heavy pose model…')
    setLandmarks(null)
    setJointAngles(null)
    onSquatUpdate(null)
    squatAnalyzerRef.current.reset()
    onCurlUpdate(null)
    curlAnalyzerRef.current.reset()
    imageSmootherRef.current.reset()
    worldSmootherRef.current.reset()
    setFps(0)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Open this page on localhost or use a secure (HTTPS) connection.')

      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
      if (operation !== operationRef.current) return
      let landmarker: PoseLandmarker
      let selectedBackend: 'GPU' | 'CPU' = 'GPU'
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HEAVY_MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
        })
      } catch (gpuError) {
        console.info('MediaPipe GPU initialization failed; retrying with CPU.', gpuError)
        selectedBackend = 'CPU'
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HEAVY_MODEL, delegate: 'CPU' },
          runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
        })
      }
      if (operation !== operationRef.current) {
        landmarker.close()
        return
      }
      landmarkerRef.current = landmarker
      setBackend(selectedBackend)

      setPhase('starting')
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
      await video.play()
      if (operation !== operationRef.current) return
      setPhase('running')
      setMessage('Looking for a person…')
      fpsWindowRef.current = { start: performance.now(), frames: 0 }

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
          const result = model.detectForVideo(currentVideo, performance.now())
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
            const squatResult = squatAnalyzerRef.current.update(imageAnalysis, worldAnalysis ?? undefined)
            const curlResult = curlAnalyzerRef.current.update(imageAnalysis, worldAnalysis ?? undefined, timestamp)
            const drawPose = imageAnalysis.smoothedLandmarks
            context.lineWidth = Math.max(2, canvas.width / 360)
            context.lineCap = 'round'
            context.strokeStyle = 'rgba(183, 143, 255, 0.88)'
            for (const { start: from, end: to } of PoseLandmarker.POSE_CONNECTIONS) {
              const a = drawPose[from]
              const b = drawPose[to]
              if (!a || !b || (a.visibility ?? 1) < 0.25 || (b.visibility ?? 1) < 0.25) continue
              context.beginPath()
              context.moveTo(a.x * canvas.width, a.y * canvas.height)
              context.lineTo(b.x * canvas.width, b.y * canvas.height)
              context.stroke()
            }
            for (const point of drawPose) {
              if ((point.visibility ?? 1) < 0.25) continue
              context.beginPath()
              context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 190), 0, Math.PI * 2)
              context.fillStyle = '#f0dcff'
              context.fill()
              context.strokeStyle = '#9a68ff'
              context.lineWidth = Math.max(1, canvas.width / 720)
              context.stroke()
            }
            if (performance.now() - lastUiUpdateRef.current > 250 || squatResult.repetitionCompleted || Object.values(curlResult.arms).some((arm) => arm?.repetitionCompleted)) {
              lastUiUpdateRef.current = performance.now()
              setMessage('Full body detected')
              setLandmarks(imageAnalysis.confidence.map((point, index) => ({ name: LANDMARK_NAMES[index] ?? point.name, visibility: point.visibility, presence: point.presence })))
              setJointAngles(imageAnalysis.jointAngles.map((angle, index) => ({
                ...angle,
                worldDegrees: worldAnalysis?.jointAngles[index]?.reliable ? worldAnalysis.jointAngles[index]?.degrees ?? undefined : undefined,
              })))
              onSquatUpdate(squatResult)
              onCurlUpdate(curlResult)
            }
          }

          fpsWindowRef.current.frames += 1
          const now = performance.now()
          if (now - fpsWindowRef.current.start >= 1000) {
            setFps(Math.round(fpsWindowRef.current.frames * 1000 / (now - fpsWindowRef.current.start)))
            fpsWindowRef.current = { start: now, frames: 0 }
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
      setBackend(null)
      setMessage(getErrorMessage(error))
    }
  }, [phase, releaseCamera, onSquatUpdate, onCurlUpdate])

  useEffect(() => {
    squatAnalyzerRef.current.reset()
    curlAnalyzerRef.current.reset()
    onSquatUpdate(null)
    onCurlUpdate(null)
  }, [view, onSquatUpdate, onCurlUpdate])

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
        <div className="video-overlay-top"><span className={phase === 'running' ? 'live-indicator is-live' : 'live-indicator'}><i /> {phase === 'running' ? 'LIVE' : 'STANDBY'}</span><span className="resolution-tag">{phase === 'running' && videoRef.current?.videoWidth ? `${videoRef.current.videoWidth} × ${videoRef.current.videoHeight}` : 'HD CAMERA'}</span></div>
        <div className="video-overlay-bottom"><span className="tracking-state"><i className={landmarks ? 'tracking-icon detected' : 'tracking-icon'} /> {phase === 'running' ? message : 'POSE TRACKER'}</span><span className="fps-readout"><strong>{fps}</strong> FPS</span></div>
        <div className="frame-corner corner-tl"/><div className="frame-corner corner-tr"/><div className="frame-corner corner-bl"/><div className="frame-corner corner-br"/>
      </div>
      <div className="capture-controls"><div className="capture-status"><span className={phase === 'running' ? 'status-light on' : phase === 'error' ? 'status-light error' : 'status-light'} />{phase === 'running' ? `Tracking active · ${backend ?? 'GPU'}` : phase === 'loading' ? 'Loading model…' : phase === 'starting' ? 'Starting camera…' : phase === 'error' ? message : 'Camera stopped'}</div><div className="control-actions"><button className="text-control" onClick={stop} disabled={phase === 'idle'}>Stop</button><button className="start-button" onClick={start} disabled={phase === 'loading' || phase === 'starting' || phase === 'running'}><span>{phase === 'running' ? '●' : '▶'}</span>{phase === 'error' ? 'Try again' : phase === 'running' ? 'Camera running' : phase === 'loading' ? 'Loading model…' : phase === 'starting' ? 'Starting…' : 'Start camera'}</button></div></div>
      {phase === 'error' && <p className="camera-error" role="alert">{message}</p>}
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

export default PoseCamera
