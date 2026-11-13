# Formframe — Exercise Pose Detection

Formframe is a browser-based exercise movement coaching MVP. It uses MediaPipe Pose Landmarker for on-device pose inference and supports front/side orientation guidance for squats and biceps curls. It is movement guidance, not a medical assessment.

## Requirements

- Node.js 20.19+ or 22.12+ and npm (Vite 8 runtime requirement).
- A modern browser with WebAssembly and webcam support.
- For webcam access outside `localhost`, serve the site over HTTPS.

## Run locally

```sh
npm ci
npm run dev
```

Open the local Vite URL printed in the terminal and select **Start camera**. Allow camera access when prompted. The first session downloads the MediaPipe WASM runtime and Heavy model, so it needs network access. The browser runs inference locally after those assets are loaded; no Python or inference server is used.

Run checks:

```sh
npm test
npm run lint
npm run build
npm run preview
```

## MediaPipe asset hosting

`@mediapipe/tasks-vision` is declared in `package.json` and locked in `package-lock.json`. The WASM fileset is loaded from the jsDelivr URL pinned to the installed package version (`@mediapipe/tasks-vision@1.2.3/wasm`). Pose model files are loaded from Google Cloud Storage's public MediaPipe model bucket: Heavy is the initial model, and Lite is used only by the existing low-FPS fallback. These are static HTTPS asset URLs, not a development server, Colab runtime, or API requiring a secret. The model paths match Google's documented/sample model paths ([Pose Landmarker docs](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)).

Keeping the large model files external avoids adding multi-megabyte model binaries to the Git repository and Vercel output. Production therefore depends on browser access to jsDelivr and Google Cloud Storage. In this deployment-preparation check, the pinned jsDelivr JavaScript and WASM endpoints returned HTTP 200 with CORS enabled, and the Lite model endpoint returned HTTP 200. A ranged GET for Heavy returned HTTP 403 with a Google response saying the service is unavailable in the validation host's location. The Heavy URL is the official documented path, but its reachability from each intended user's region still needs to be confirmed after deployment. If the Vercel audience's network also blocks it, self-host the versioned model under `public/models/` and change the model constants to `/models/...` URLs. Vercel's root `base` and the `/favicon.svg` path are configured for domain-root deployment; Vite copies `public/` contents to the root of `dist/`.

If an asset host is blocked on a deployment network, the model/WASM requests will fail and the dashboard displays an initialization error with a retry control. For environments that require self-hosting, copy the exact versioned WASM files and model files into `public/` and change `WASM_ROOT`, `HEAVY_MODEL`, and `LITE_MODEL` in `src/PoseCamera.tsx` to root-relative `/...` paths. Rebuild and verify the files in `dist/` before deploying. Do not commit downloaded binaries unless repository size and redistribution requirements have been reviewed.

## Camera permissions

Webcam access uses `navigator.mediaDevices.getUserMedia()` and is requested only after the user presses **Start camera**. Browsers require a secure context: HTTPS in production, or `localhost` for local development. The Vercel configuration sends `Permissions-Policy: camera=(self)` to permit the app's own origin. Users must still grant permission in their browser. The app surfaces permission denial, missing cameras, and model/inference errors; it does not bypass browser permission controls.

Front and Side are body orientations for the same webcam, not separate or simultaneous camera feeds.

## Deploy to Vercel

The repository includes `vercel.json` with:

- Build command: `npm run build`
- Output directory: `dist`
- Vite framework selection and SPA fallback rewrite to `index.html`
- Same-origin camera permission policy

### Connect GitHub to Vercel

1. Push this project to a GitHub repository. Include the source tree, `package.json`, `package-lock.json`, `README.md`, and `vercel.json`; do not commit `node_modules/` or `dist/`.
2. Sign in to Vercel and choose **Add New… → Project**.
3. Connect GitHub if prompted, then select **Import** beside this repository. Grant Vercel access to the repository if requested.
4. In **Configure Project**, confirm the Root Directory is the repository root. Confirm **Framework Preset: Vite**, **Build Command: `npm run build`**, and **Output Directory: `dist`**. The checked-in `vercel.json` also supplies these build settings.
5. No environment variables are required for the current app. Choose **Deploy**.
6. Open the generated HTTPS URL. Test the page and static assets, select **Start camera**, grant permission, and verify tracking. Test once on a mobile viewport and check the browser console/network panel for blocked WASM/model requests or runtime errors.
7. For subsequent releases, push commits to the connected GitHub branch. Vercel creates preview deployments for other branches/PRs and production deployments from the configured production branch.

This repository is prepared for Vercel but this README update does not deploy it. Confirm the generated production URL and camera/model behavior after Vercel completes deployment.

## Project checks and QA notes

See [the Phase 6 accuracy and performance report](docs/phase-6-accuracy-performance-report.md) and the exercise threshold notes under `docs/`. Automated tests use synthetic landmarks; real-camera accuracy and device/model benchmarks must be validated on representative hardware before making accuracy claims.
