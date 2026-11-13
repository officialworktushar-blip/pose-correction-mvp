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

Open the local Vite URL printed in the terminal and select **Start camera**. Allow camera access when prompted. The WASM runtime is fetched on first use; both pose model files are served by the app from `public/models/`. The browser runs inference locally; no Python or inference server is used.

Run checks:

```sh
npm test
npm run lint
npm run verify:models
npm run build
npm run preview
```

## MediaPipe asset hosting

`@mediapipe/tasks-vision` is declared in `package.json` and locked in `package-lock.json`. Its WASM fileset is loaded from the jsDelivr URL pinned to the installed package version (`@mediapipe/tasks-vision@1.2.3/wasm`). The Heavy and Lite `.task` models are bundled in `public/models/`, so Vite copies them to `dist/models/` and Vercel serves them from the same origin. Heavy remains the initial model; Lite remains the existing low-FPS fallback. There are no runtime model requests to Google Storage, no Colab dependency, and no inference API or secret.

The original official Google Storage Heavy URL returned HTTP 403 in this environment with a location restriction. The Heavy asset was obtained from a pinned Hugging Face mirror commit and its SHA-256 was checked against that mirror's published digest: `64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b`. The Lite fallback was retrieved from Google's public model bucket (HTTP 200). Model file sizes and digests are documented in `docs/model-assets.md`. Vite's `base` is applied through `import.meta.env.BASE_URL`, and `/favicon.svg` is copied from `public/` to the root of `dist/`.

The WASM files still require browser access to jsDelivr; the model files are same-origin. If jsDelivr is blocked on a deployment network, copy the version-matched WASM files from `node_modules/@mediapipe/tasks-vision/wasm/` into `public/` and update `WASM_ROOT` in `src/PoseCamera.tsx` to `${import.meta.env.BASE_URL}...`. `npm run verify:models` checks the bundled SHA-256 values and initializes both model bundles through MediaPipe Tasks Vision in VIDEO mode on CPU. Vercel's root `base` and the favicon path are configured for domain-root deployment; Vite copies `public/` contents to the root of `dist/`.

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
