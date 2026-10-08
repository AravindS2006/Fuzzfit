# Browser pose analysis research

Reviewed 8 October 2026. Sources below are official library documentation, implementation code, and the filter authors' research. The implementation recommendations are engineering judgments; landmark benchmark scores do not establish repetition accuracy for this application.

## Model choice

Use MediaPipe Tasks Pose Landmarker **Full** as the default. Keep inference on the trainee's device in a worker. It preserves the existing 33-landmark API and offers normalized and world coordinates. Lite remains a performance fallback; Heavy should be an explicit high-quality option only after device performance is measured. The [official model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) reports average PDJ of 87.0, 91.8, and 94.2 for Lite, Full, and Heavy. Its older Pixel 3 CPU measurements were approximately 44, 18, and 4 FPS respectively. These are neither current browser benchmarks nor rep-count guarantees.

[MoveNet Thunder](https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/src/movenet/README.md) is a credible alternative for 2D tracking, with 17 keypoints and WebGL/WASM backends. Changing APIs and joint coverage would add migration cost without evidence that it solves this application's temporal counter failures. [OpenPose](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/installation/0_index.md) documents a native Caffe/OpenCV/CUDA or OpenCL stack. It is unsuitable as a direct drop-in browser library for this Vercel application.

## Important existing configuration problems

The current worker uses Lite, CPU, and `numPoses: 2`. The [official PoseLandmarker graph](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/pose_landmarker/pose_landmarker_graph.cc) enables native landmark smoothing only for one pose in stream mode. It also invokes the body detector when fewer poses are tracked than the configured maximum. Consequently, requesting two poses for a normally single-person camera can remove smoothing and increase work per frame. Use `numPoses: 1` for each trainee's analytics stream. This setting does not prove there is only one person in the image; do not advertise automatic extra-person rejection from that output alone.

The existing curl counter resets the entire movement state on a single unreliable frame and requires an 80 ms dwell at both endpoints. Its default bent endpoint is 65 degrees. A user who reverses naturally at the endpoint can miss that dwell, especially around 10 FPS; this is a plausible cause of missed reps, not a diagnosis of the user's unrecorded video.

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

World coordinates are model estimates, not depth-sensor measurements. Use consistent coordinates within a cycle and do not switch between 2D and 3D angles halfway through. Validate 3D bone lengths and confidence before using them; retain a gated 2D fallback for suitable camera views.

## Validation boundary

Test continuous ten-curl sequences without endpoint holds, shallow reps, jitter, brief and long occlusion, variable FPS, left/right stability, impossible jumps, form violations, and all new exercise profiles. Deterministic landmark tests prove counter behavior. Real recorded motion with manual rep annotations across phones, lighting, body shapes, and viewing angles is needed to quantify physical accuracy. No monocular library can promise exact pose or perfect counts in every environment.
