# Pose engine v3

`profile-v3` analyzes a selected exercise on the trainee's device. Full MediaPipe Pose Landmarker is the default, with optional Heavy/Lite modes. The worker uses VIDEO tracking with one pose, attempts GPU initialization, and falls back to CPU. The application processes normalized and world landmarks and keeps one inference in flight. It follows fresh browser video frames, with a 33 ms polling fallback on older browsers. Achieved analysis FPS depends on the device and is shown in Settings.

## Twelve layers

| Layer | Source and behavior |
| --- | --- |
| 1. Pose landmarks | `public/pose-worker.js`: `detectForVideo` returns normalized `poses` and `worldPoses`. `analyzePose` in `src/lib/pose-engine.ts` validates input shape and fresh timestamps. |
| 2. Visibility gate | `confidenceOf`, the profile's required joints, and the selected-side confidence check reject missing, non-finite, out-of-frame, or unreliable observations. |
| 3. Smoothing | `filterValue` implements timestamp-aware One Euro filtering. Native single-pose VIDEO smoothing is enabled; movement signals are filtered without cascading the application's landmark filter into the angle filter. |
| 4. Angle calculation | `jointAngle` and `limbSignal` compute exercise-specific joint angles. Image geometry uses actual width/height. `worldGeometry` checks finite depth, plausible/stable segments, and applicable projected-direction consistency. |
| 5. Exercise profile | `exerciseProfiles` in `src/lib/exercise-profiles.ts` declares joints, movement signal/direction, camera view, technique, endpoints, minimum range, duration, cooldown, occlusion grace, and cues for twelve exercises. `normalizeWorkoutConfig` bounds coach-adjustable settings. |
| 6. State machine | `analyzePose` tracks `seek → ready → working → ready`, observes the excursion and return, and prevents counting when observation starts at the endpoint. |
| 7. Hysteresis | `atStart`, `awayFromStart`, and `atEnd` use separated thresholds. An endpoint does not require an artificial prolonged pause. |
| 8. ROM validation | `cycleMin`, `cycleMax`, `bottomSeen`, and `requiredRange` preserve observed extrema and reject incomplete excursions with a correction. |
| 9. Duration validation | `observedMs`, profile maximum duration, and raw-signal plausibility checks reject impossible jumps, rushed cycles, and abandoned cycles. Missing intervals do not add observed movement time. |
| 10. Form validation | `formAnalysis` and view/posture gates check trunk position, arm stability, body alignment, front-facing setups, floor position, and exercise-specific evidence. Minor errors lower quality; invalid technique rejects the cycle. |
| 11. Cooldown | `lastRepAt`, profile cooldown, and the next outbound transition prevent duplicate counts while the trainee remains at the start. |
| 12. Rep quality | `lastRepQuality` combines cycle form (50%), range (25%), confidence (15%), and control/timing (10%). Workout settings shows the completed rep's score and tracking details during active sets. |

## Continuity and camera views

Front-facing and slight-angle curls can select the moving arm automatically from trustworthy per-limb signals. The selected limb remains locked through a cycle. Body-center and scale continuity checks reject gross person/camera changes. These checks preserve tracking continuity; they are not identity recognition.

Brief loss freezes the cycle; sustained loss requires reacquiring the start. A return completed entirely out of view is not credited. A cycle keeps the same geometry source; temporary unreliable 3D data suspends the cycle instead of silently converting it to a different 2D angle. Plank and side-plank time uses consecutive aligned observations, retaining milliseconds across sets.

The catalog covers bodyweight squat, push-up, biceps curl, plank, stationary lunge, shoulder press, lateral raise, jumping jack, glute bridge, controlled crunch, bent-over row, and side plank. Profiles analyze the exercise selected by the user or coach. They do not automatically recognize every fitness exercise or guarantee every variation uses correct technique.

## Assets and validation

`scripts/prepare-assets.mjs` pins float16/version-1 model bundles and checks these SHA-256 values on download and reuse:

| Variant | SHA-256 |
| --- | --- |
| Lite | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| Full | `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1` |
| Heavy | `64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b` |

Release verification passed 165 unit tests, including 75 focused pose-engine regressions, 20 browser scenarios, 74 API/persistence checks, and 20 accessibility checks. The browser curl regression observes all ten counts through the production engine and UI with front-facing depth-motion landmarks; real Full model loading and CPU fallback are separate browser checks. Unit coverage includes ten continuous curls at 10–30 FPS, 0.8-second repetitions, front/slight-angle phone views, selected/automatic limbs, depth motion, threshold jitter, partial/fast/stalled cycles, short/long occlusion, body/camera changes, geometry fallback, quality, and exercise-specific setups. Source tests are `tests/pose-engine.test.ts` and `tests/pose-engine-v3.test.ts`.

Deterministic landmarks verify the algorithm; model initialization and blank-camera browser tests verify runtime integration. Neither measures real physical rep accuracy. Quantifying accuracy requires recorded exercise sequences with manually annotated reps across phones, body shapes, lighting, camera views, and variations. Monocular depth is estimated, not a depth-sensor measurement, and geometric quality is not a clinical assessment. See [research notes](pose-research-notes.md), [guided coaching](guided-coaching.md), and [dependency provenance](THIRD_PARTY.md).
