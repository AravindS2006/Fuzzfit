# Verification and release status

Prepared 6 October 2026. This report distinguishes locally tested behavior from externally dependent release gates. The application is deployed at `fuzzfit.vercel.app` for operator testing with Vercel/PostgreSQL and LiveKit Cloud integration code. Public login and database health respond successfully; full external service, real-device, and public-launch acceptance remain pending.

## Local checks

| Check | Result and scope |
| --- | --- |
| Optimized build | Next.js build, TypeScript compilation, route generation, pinned model/WASM preparation |
| Detector and input tests | 20 passing Vitest cases: squat, push-up, curl, plank, confidence/geometry gates, rep phase stability, aspect correction, tracking loss, pause, hold timing, invalid inputs |
| Production configuration and email policy tests | 29 passing cases: remote PostgreSQL URL requirements, secure/exact origins, missing services, independent strong secrets, template/write-only placeholders, sender validation, partial billing, secret-safe errors, explicit email deferral, testing signup, and restored production verification. Total: 49 unit tests |
| Deferred-email authentication | `npm run test:email-disabled` uses a unique disposable SQLite database and separate server: rejects signup/reset requests, creates no account/reset token, rejects unverified sign-in, permits an existing verified account/session, and checks the login page hides unavailable actions |
| Testing signup and both roles | 28 passing checks: `npm run test:signup` runs the built app with `VERCEL=1` and explicit testing mode on a disposable SQLite database: coach/trainee signup and valid sessions, retained unverified state, one-time role setup, secret invite acceptance, class scheduling/control, personal cue delivery, unavailable recovery, visible signup, and rejection of old testing sessions when verification is restored |
| API integration | 39 passing checks with actual database-backed auth sessions: onboarding, email-bound invites, plan/class ownership, enrollment, privacy scopes, lifecycle, monotonic metrics, stale revisions, origin rejection, export, health, protected cleanup |
| Browser journeys | 7 passing Edge/Playwright tests: sample navigation/edit/schedule/messages/control, mobile layout, permission denial, actual worker/model initialization with simulated camera, real coach signup/plan persistence, invited trainee signup/onboarding/enrollment/help/private-cue delivery/completion in separate contexts, and disabled interaction while client scripts are deliberately delayed |
| Accessibility | 17 scanned page/dialog/populated studio/mobile states plus authenticated trainee onboarding and private-cue views; zero automated WCAG-tagged axe violations after fixing contrast, dialog naming, and keyboard-safe setup. Public-state report: `accessibility-report.json` |
| Live Vercel/Neon account flow | 20 passing checks against the canonical deployed app: real signup for coach and trainee, unverified email state, valid sessions, role setup, secret invitation acceptance, client visibility, session scheduling, trainee visibility, and repeat password sign-in. Temporary accounts and related studio/session records were removed with cleanup scoped to their exact generated addresses |
| PostgreSQL schema | Equivalent generated schema validates; committed migration `20261006000000_init` applied to the new Neon Free production database. Basic connectivity and the account flow above pass. Full metrics/lifecycle/video/concurrency and load tests on PostgreSQL remain pending |
| Dependency audit | npm audit reports zero known vulnerabilities in the installed graph at verification time |
| Source consistency | Prettier check passes; generated third-party runtime files excluded |

The integration test identities use `example.test` and are deleted after execution. Browser account journeys simulate independent clients with reserved documentation IPs in the local proxy header; the application's signup rate limit remains enabled. SQLite is the tested local database. Edge is the tested browser. The workstation uses Node 22.14; use Node 22.22+ for release because a transitive package declares that minimum.

Camera initialization was tested with MediaPipe's real pinned Lite model and local WASM. The simulated feed has no body, so the correct outcome is “Position camera,” no score, and camera cleanup on stop. This verifies execution and lifecycle, **not** pose accuracy, body-part localization accuracy, cue quality, or rep-count performance on real exercises. Unit tests use synthetic landmark trajectories and cannot substitute for annotated exercise videos.

Screenshots of dashboard, practice, plans, and 390px mobile and the accessibility report are generated local artifacts, excluded from Git. Recreate them with `node scripts/capture-preview.mjs` and `npm run test:a11y` against the local server. The product's sample workspace is explicitly illustrative. Real camera practice is available there; no sample identity can access protected records.

## Implemented controls worth reviewing

- Authentication and every domain API enforce membership/ownership; roles are one-time, server-side choices.
- Streaming JSON reads have a 16KB cap; mutations check origin, content type, schema, and user request limits.
- LiveKit tokens are short-lived and room-scoped, with camera/microphone-only publishing and no administrative/data-publishing grants.
- Local inference rejects missing/low-confidence/ambiguous poses; stale estimates disappear, exercise revisions gate summaries, and invalidated rep phases cannot count.
- Workers and owned tracks close on stop/unmount. Shared video and local inference have separate labelled controls. Group sharing is explicit before join.
- Metrics/invite/onboarding transactions use serializable isolation; lifecycle controls use status/revision guards. Summary polling backs off on failures.
- Private cues and summaries are scoped; frames are never persisted. Signed Stripe webhooks use durable event IDs and current subscription reconciliation.

These controls and passing checks do not establish independent security or accessibility certification. CSP currently permits inline framework bootstrap scripts; nonce-based hardening remains an operator engineering decision.

## Required service checks before deployment approval

1. **PostgreSQL:** verify remaining domain flows on an isolated test database with pooled runtime/direct migration URLs, exercise concurrent invites/metrics/lifecycle controls, load-test eight trainees, measure pool saturation, handle serialization conflicts, rehearse backup restoration. Migration, basic connectivity, and the live signup/role/invite/scheduling flow passed on the new Neon database; these broader gates remain pending.
2. **LiveKit Cloud:** configure a project with automatic room creation disabled and connect coach/trainee physical devices on independent networks. Test explicit room creation/capacity, media/autoplay, microphone/camera toggles, mobile browsers, TURN, reconnect, degraded bandwidth, revocation and cached/refreshed-token rejoin after completion, terminal room cleanup/retry, and group-consent expectations. No actual multi-device room was connected here.
3. **Email:** configure verified Resend sender/domain; verify production signup confirmation, reset delivery, expired links, and resend/rate behavior. No live email was sent.
4. **Stripe (optional):** test Checkout, portal, duplicate/concurrent/out-of-order signed events, cancellation, failed renewal, customer mapping, and reconciliation before enabling charges. Define paid entitlements and cancellation/refund policies; class access is not currently paywalled.
5. **Vercel:** the Fuzzfit project is created and linked, with Node 22.x, Singapore functions, staged domain assignment, origin/provider settings, and private auth/cleanup secrets. Neon is connected only to Production. Finish video/mail configuration, run the production guard with actual secrets, deploy a preview to isolated test services, verify HTTPS/camera/worker/headers, configure logs, alert ownership, budget limits, retention cron, and rollback. No Fuzzfit application deployment was uploaded or promoted during this session.

## Required product and human validation before public launch

Evaluate real exercise videos rated by qualified coaches across representative body types, clothing, lighting, camera positions, mobility, and supported devices. Publish measured cue precision, rep-count errors, rejected tracking, subgroup performance, and supported exercise variations. Until that evidence exists, scores remain limited `geometry-v1` heuristic estimates; a high score cannot mean a workout is perfect or safe.

Complete keyboard/screen-reader/manual accessibility testing, independent threat modeling/pentesting, legal/privacy/terms review for launch markets, vendor agreements, deletion and retention policies, coach verification/abuse response, and restore/incident rehearsal. Automated account deletion, an operator console, paid entitlements, recurring booking, push reminders, reviewed exercise videos, and deeper personalized programming are documented future milestones, not shipped features.

## Repeat locally

Run `npm run setup`, `npm test`, `npm run format:check`, and `npm run build`. Start the app with `npm run start`, then run `npm run test:api`, `npm run test:e2e`, and `npm run test:a11y` against `http://localhost:3000`. Stop the server before Prisma generation/build on Windows to avoid the locked query-engine DLL. Use a dedicated local database, not customer data.
