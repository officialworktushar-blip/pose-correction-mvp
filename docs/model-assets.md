# Bundled MediaPipe model assets

The app loads model files from the Vite public directory via `import.meta.env.BASE_URL`; deployed files are emitted under `dist/models/` and served by the same origin.

| Asset | Purpose | Size | SHA-256 | Source |
|---|---|---:|---|---|
| `public/models/pose_landmarker_heavy.task` | Initial accuracy-oriented model | 30,664,242 bytes | `64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b` | Pinned [Hugging Face mirror commit](https://huggingface.co/spaces/SelimGilon/BikeFit/resolve/6d944ebb6d84de2e9c6f6b35bc3b65bc6ce30598/pose_landmarker_heavy.task). The digest matches the mirror's published file digest. The upstream official Google Storage URL returned a location-based 403 from the acquisition environment. |
| `public/models/pose_landmarker_lite.task` | Existing low-FPS fallback | 5,777,746 bytes | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` | Official Google MediaPipe model bucket, version `1`. |

Heavy is still the initial model. Lite is used only by the app's existing low-FPS fallback. No model is substituted for Heavy. `npm run verify:models` validates both SHA-256 digests and initializes each bundle through MediaPipe Tasks Vision using VIDEO mode and CPU, then closes each task. This is a CPU initialization smoke test; camera capture and GPU behavior remain browser/device checks.

The WASM runtime remains loaded from the package-version-pinned jsDelivr URL. Its JavaScript and WebAssembly endpoints returned HTTP 200 with `Access-Control-Allow-Origin: *` during this audit. This remains an external runtime dependency; the model files themselves no longer depend on Google Storage at runtime.

The production preview returned HTTP 200 for both local model paths: Heavy at `/models/pose_landmarker_heavy.task` (30,664,242 bytes) and Lite at `/models/pose_landmarker_lite.task` (5,777,746 bytes). The emitted `dist/models/` files have the same SHA-256 digests listed above.

To re-check local file digests in PowerShell:

```powershell
Get-FileHash public/models/pose_landmarker_heavy.task -Algorithm SHA256
Get-FileHash public/models/pose_landmarker_lite.task -Algorithm SHA256
```
