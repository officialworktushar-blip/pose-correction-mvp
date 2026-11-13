import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

// MediaPipe Tasks Vision is a browser library. These minimal globals let the
// CPU-only initialization smoke test run in Node without opening a camera.
globalThis.self = globalThis
globalThis.WebGLRenderingContext ??= class WebGLRenderingContext {}
globalThis.WebGL2RenderingContext ??= class WebGL2RenderingContext extends WebGLRenderingContext {}

globalThis.document = {
  createElement(tag) {
    if (tag === 'script') {
      const handlers = new Map()
      return {
        addEventListener: (name, handler) => handlers.set(name, handler),
        dispatch: (name) => handlers.get(name)?.(),
        set src(value) { this.source = value },
        get src() { return this.source },
      }
    }
    return { getContext: () => null }
  },
  body: {
    appendChild(script) {
      import(script.src)
        .then((module) => {
          globalThis.ModuleFactory = module.default
          script.dispatch('load')
        })
        .catch(() => script.dispatch('error'))
    },
  },
}

const assets = [
  {
    name: 'Heavy',
    path: 'public/models/pose_landmarker_heavy.task',
    sha256: '64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b',
  },
  {
    name: 'Lite',
    path: 'public/models/pose_landmarker_lite.task',
    sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
  },
]

const wasmDirectory = pathToFileURL(`${resolve('node_modules/@mediapipe/tasks-vision/wasm')}${sep}`).href
const vision = await FilesetResolver.forVisionTasks(wasmDirectory, true)

for (const asset of assets) {
  const modelBuffer = new Uint8Array(readFileSync(asset.path))
  const digest = createHash('sha256').update(modelBuffer).digest('hex')
  if (digest !== asset.sha256) throw new Error(`${asset.name} model SHA-256 mismatch: ${digest}`)

  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetBuffer: modelBuffer, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
    outputSegmentationMasks: false,
  })
  landmarker.close()
  process.stdout.write(`${asset.name}: SHA-256 verified; MediaPipe initialized VIDEO mode with CPU delegate and closed cleanly.\n`)
}
