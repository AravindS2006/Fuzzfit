# Guided workouts and live coaching

Choose Camera coaching for private practice, or open an enrolled class and join live video. A coach starts the class, chooses its exercise, and can pause the class, focus an individual, send private corrections, respond to help requests, and mute trainee microphones. Trainees control their own camera and microphone. Coaches cannot turn someone’s microphone on remotely.

## Trainee flow

1. Read the three illustrated positions for the selected exercise.
2. Choose sets, reps (seconds for planks), and rest. An assigned workout plan supplies the starting targets. Exercise preferences are saved in this browser. Change the visible body side and joint endpoints with your coach when needed.
3. Position the camera side-on in good lighting. Keep the listed joints and space around your body visible. In a live class, the published camera is also the source for local analysis.
4. Enable the camera and follow positioning feedback. Turn on voice and rep sounds if desired. Rehearsal does not add workout reps or form-score samples.
5. Press **Start set**, begin in the extended starting position, and perform the movement. The app shows cumulative exercise reps, current-set progress, a posture estimate, the last rep’s estimated joint-angle range, and its duration. Planks accumulate observed aligned time.
6. Completing the target starts a rest timer. Start the next set when ready, skip rest, or finish a set early. Results show the amount completed and average observed posture score. Set details stay in the current page; joined-class cumulative rep/form summaries are saved in Insights. Private practice does not write to the server.

## Tracking rules

`geometry-v2` uses the pinned MediaPipe pose model in a worker. Each fresh video frame is analyzed once, with one inference in flight. Image coordinates are corrected for the video’s aspect ratio. The required joints must have at least 0.65 confidence and remain in frame. The engine locks the selected limb during a repetition and requires a side-on exercise position.

A rep requires an observed extended start, movement through the configured bent endpoint, and a return to the extended endpoint. Endpoint confirmation is 80ms; the minimum complete movement duration is 600ms by default. Smoothing depends on elapsed frame time. Incomplete or excessively fast cycles produce a correction and do not count. Invalid observations, pauses, changed limbs, and gaps above 750ms discard pending cycles. Push-up body position is checked before the counter can change. Plank time is accumulated only between consecutive eligible observations.

The posture score covers visible geometric checks: squat trunk lean, push-up/plank shoulder–hip–ankle alignment, and curl upper-arm stability. It is not a clinical safety assessment or a claim that every joint is correctly positioned. Depth, camera angle, clothing, occlusion, and device performance affect the estimates. Supported tracked exercises are squat, push-up, biceps curl, and forearm plank. Variations need coach review and appropriate endpoint configuration.

## Video lifecycle

Prejoin preview starts only after an explicit click, supports camera and microphone selection, and releases its tracks on exit or join. The microphone starts muted unless the participant chooses otherwise. Device selection, camera switching, fullscreen, a prominent coach feed, optional classmates, participant focus, active-speaker indicators, help requests, private cues, and class chat support group instruction.

Room events reuse the same local MediaStream while its underlying camera track is unchanged. Remote joins, mute changes, and speaker events therefore do not restart pose analysis. Only the conferencing controls own published tracks; stopping the local analyzer leaves published video running. Cloud regional HTTPS and WebSocket hosts are permitted by the browser connection policy, consistent with [LiveKit’s firewall guidance](https://docs.livekit.io/deploy/admin/firewall/). Reconnection and blocked audio are explained in the UI.

Pause/resume preserves the exercise revision and cumulative metrics. Exercise changes create a new revision. The API validates enrollment, sharing consent, class state, revision, monotonic counters, and plausible increments before saving metrics. Coach-only muting validates session ownership and enrolled identities on the server.

## Verification

Unit tests cover continuous motion, aspect ratios, partial and fast reps, limb-confidence changes, configured endpoints, invalid positions, tracking loss, and observed plank time. Browser tests cover mobile dismissal, persistent setup preferences, permission denial, the real MediaPipe model/worker, and two deterministic guided sets with cumulative counts. API tests cover authorization, consent, private messages, pause/resume, stale metrics, and export totals. Accessibility checks include mobile navigation and both account roles.

Deterministic landmark tests verify counting logic; a blank simulated camera verifies model loading, not real-exercise accuracy. Physical camera trials across different bodies, phones, lighting, and exercise variations remain necessary to measure detection accuracy.
