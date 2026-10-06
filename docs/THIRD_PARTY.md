# Dependency and model provenance

Framework: Next.js 16.3.8 and React 19.3.0. Authentication: Better Auth 1.7.7. ORM: Prisma 6.19.3. Video: LiveKit browser/server SDKs. Icons: Lucide. Billing: Stripe SDK. Full resolved dependency versions are in package-lock.json.

MediaPipe Tasks Vision is pinned to 0.10.32 (Apache-2.0 package). The model is Google's Pose Landmarker Lite, float16, model version 1, downloaded from:

`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`

SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`.

The setup/build script copies the installed pinned CJS vision bundle as a classic worker script and copies both SIMD/non-SIMD WASM assets. Classic workers are required by this version's WASM script-loading path; no main-thread inference fallback is used. Assets are generated locally and ignored in source control. Production builds reproduce them and verify the model checksum. SVG illustrations are original source-authored artwork, not exercise instruction videos.

The npm audit initially identified a deepmerge-ts build-tool advisory inherited through Prisma config. An explicit deepmerge-ts 8 override resolves it; database generation and production builds were checked with that override. Re-evaluate/remove the override when a supported Prisma release incorporates the fix. `.npmrc` records legacy peer resolution because the workstation's npm 10.9.2 resolver crashed while exploring optional Vitest peers; the committed lockfile fixes the resolved graph. Avoid blind force-upgrades.
