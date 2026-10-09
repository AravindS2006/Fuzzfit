# Browser pose analysis research

Reviewed 8 October 2026. Sources below are official library documentation, implementation code, and the filter authors' research. The implementation recommendations are engineering judgments; landmark benchmark scores do not establish repetition accuracy for this application.

## Model choice

The original recommendation was MediaPipe Tasks Pose Landmarker **Full** as a balanced default. The current app starts with Heavy and measures inference speed, then switches to Full if Heavy cannot meet the live movement budget described below. Keep inference on the trainee's device in a worker. It preserves the existing 33-landmark API and offers normalized and world coordinates. Lite remains a selectable option for constrained devices. The [official model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) reports average PDJ of 87.0, 91.8, and 94.2 for Lite, Full, and Heavy. Its older Pixel 3 CPU measurements were approximately 44, 18, and 4 FPS respectively. These are neither current browser benchmarks nor rep-count guarantees.

[MoveNet Thunder](https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/src/movenet/README.md) is a credible alternative for 2D tracking, with 17 keypoints and WebGL/WASM backends. Changing APIs and joint coverage would add migration cost without evidence that it solves this application's temporal counter failures. [OpenPose](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/installation/0_index.md) documents a native Caffe/OpenCV/CUDA or OpenCL stack. It is unsuitable as a direct drop-in browser library for this Vercel application.

## Important existing configuration problems

The implementation audited on 8 October used Lite, CPU, and `numPoses: 2`. The [official PoseLandmarker graph](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/pose_landmarker/pose_landmarker_graph.cc) enables native landmark smoothing only for one pose in stream mode. It also invokes the body detector when fewer poses are tracked than the configured maximum. Consequently, requesting two poses for a normally single-person camera can remove smoothing and increase work per frame. The current worker uses `numPoses: 1` for each trainee's analytics stream. This setting does not prove there is only one person in the image; do not advertise automatic extra-person rejection from that output alone.

The original curl counter reset the entire movement state on a single unreliable frame and required an 80 ms dwell at both endpoints. Its default bent endpoint was 65 degrees. A user who reverses naturally at the endpoint could miss that dwell, especially around 10 FPS; this was a plausible cause of missed reps, not a diagnosis of the user's unrecorded video. The current profile engine preserves short gaps and observes movement extrema without requiring that endpoint dwell.

## Worker and asset configuration

The [web guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) recommends moving synchronous `detectForVideo` inference into a worker. Use `VIDEO`, monotonic frame timestamps, one frame in flight, and no segmentation masks. Copy the installed, pinned `@mediapipe/tasks-vision` runtime/WASM assets together; download versioned model URLs and verify SHA-256 during preparation and existing-file reuse. Avoid `latest` URLs in production.

Installed `@mediapipe/tasks-vision` 0.10.32 exposes `baseOptions.delegate: 'GPU' | 'CPU'` and `canvas?: HTMLCanvasElement | OffscreenCanvas`. Its type documentation says the task initializes WebGL and may throw. Try GPU with a fresh worker `OffscreenCanvas`, then recreate the task with CPU if initialization fails. Google's [current worker implementation](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/base-worker.ts) follows this CPU fallback pattern. Dispose the failed task, transferred bitmap, and superseded worker. Report the selected backend and measured inference time in diagnostics. A slow-device fallback should be visible rather than silently claiming identical quality.

## Temporal counter design

The [One Euro filter authors](https://gery.casiez.net/1euro/) describe a speed-adaptive low-pass filter: lower cutoff reduces slow-motion jitter; increased beta reduces lag during faster motion. Its coefficients depend on units and timestamps. Tune against actual recorded exercise motion. Since single-pose VIDEO mode already smooths landmarks, avoid adding a strong second filter that erases brief motion extrema.

The [MediaPipe repetition guide](https://chuoling.github.io/mediapipe/solutions/pose_classification.html) uses distinct pose entry and exit thresholds to suppress phantom counts. Apply that principle to continuous movement signals rather than demanding long endpoint holds.

| Layer | Application behavior |
| --- | --- |
| 1. Landmarks | Preserve normalized landmarks for overlay and reliable world landmarks when available. |
| 2. Visibility | Validate finite coordinates, relevant joints, visibility, and presence before advancing a cycle. |
| 3. Smoothing | Timestamp-aware adaptive smoothing; reset filters after sustained gaps or a new person/view. |
| 4. Movement signal | Joint angle or body-normalized distance appropriate to the exercise; correct image aspect ratio. |
| 5. Profile | Required joints, camera view, start/end ranges, timing, form rules, and coaching cues per exercise. |
| 6. State machine | Acquire the start, observe outbound motion and peak, then return; one completion per cycle. |
| 7. Hysteresis | Separate enter/exit ranges; do not toggle state around a single angle threshold. |
| 8. ROM | Retain observed extrema and require coach-approved range; reject shallow excursions with a useful reason. |
| 9. Duration | Reject impossible spikes and abandoned cycles, using actual timestamps rather than assumed FPS. |
| 10. Form | Evaluate trunk/limb alignment across the cycle; distinguish a completed rep from its quality. |
| 11. Cooldown | Require a new outbound movement after completion; suppress duplicate threshold crossings. |
| 12. Quality | Aggregate ROM, control, form, and confidence over the completed cycle; expose the latest rep score. |

Keep the same selected limb for the complete cycle. Brief occlusion should freeze the cycle without accumulating time, inventing positions, switching limbs, or resetting valid history immediately. Sustained loss should require reacquiring the starting pose; never bridge an unobserved entire rep. Detect gross center/scale discontinuities before accepting a new pose as the previous trainee.

## 9 October overlay and frame-rate regression

The previous release erased the complete skeleton whenever exercise scoring returned `tracked: false`. One cropped ankle, a camera-view instruction, or unreliable depth geometry therefore hid otherwise visible shoulders and hips. Visualization now validates each current image landmark independently. Separate visibility entry (0.65) and exit (0.45) thresholds keep small confidence fluctuations from blinking. Missing, nonfinite, off-screen, or truly occluded joints disappear immediately; no previous points are held or extrapolated. Calibration and the twelve-layer rep engine still receive original measurements and retain their stricter gates.

The display uses light timestamp-aware One Euro filtering, following the [MediaPipe filter implementation](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/util/filtering/one_euro_filter.cc). Its normalized coordinate units use the shorter image dimension. The minimum cutoff is 4 Hz, beta 30, and derivative cutoff 1 Hz. A radial cap keeps display displacement within 0.8% of that dimension (5.8 px at 720p). Gaps longer than 250 ms, changed dimensions, and nonmonotonic timestamps reacquire confidence instead of bridging history. Tests cover 10, 30, and 60 FPS, stationary jitter, rapid motion, confidence hysteresis, occlusion, relocation, and unchanged model input. These constants are bounded engineering choices, not a camera-accuracy guarantee.

An actual browser stream of the [official MediaPipe human pose image](https://storage.googleapis.com/mediapipe-assets/pose.jpg), rather than injected landmarks, kept all 22 body joints visible in 30 measured frames per configuration. On this Windows laptop's available CPU backend, Heavy's median inference was 144–149 ms and Full's was 44 ms. Raw stationary wrist jitter was about 0.19 px and 0.31 px respectively. This measures a stationary sample, not exercise recognition or real-world rep accuracy. It exposed an unsuitable previous 200 ms fallback threshold: Heavy could remain at roughly seven inferences per second. The app now selects Full when the last five Heavy frames average over 100 ms, retaining completed reps and requiring fresh start-position acquisition. Fast devices can keep Heavy; the model's name alone does not establish better live movement tracking.

Camera setup names the exercise's required joints and asks the trainee to step back until they fit. An armed countdown now retains specific missing-joint feedback. A fixed distance is unsuitable across phone and laptop fields of view.

World coordinates are model estimates, not depth-sensor measurements. Use consistent coordinates within a cycle and do not switch between 2D and 3D angles halfway through. Validate 3D bone lengths and confidence before using them; retain a gated 2D fallback for suitable camera views.

## Validation boundary

Test continuous ten-curl sequences without endpoint holds, shallow reps, jitter, brief and long occlusion, variable FPS, left/right stability, impossible jumps, form violations, and all new exercise profiles. Deterministic landmark tests prove counter behavior. Real recorded motion with manual rep annotations across phones, lighting, body shapes, and viewing angles is needed to quantify physical accuracy. No monocular library can promise exact pose or perfect counts in every environment.
