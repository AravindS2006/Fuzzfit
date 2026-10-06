# Fuzzfit

A live fitness coaching studio built with Next.js, Better Auth, Prisma, LiveKit, and MediaPipe. Includes coach and trainee workspaces, invitations, scheduling, workout plans, group video, local camera analysis, correction cues, session messages, history, settings, and data export.

**Status:** functional local implementation with production deployment configuration. External service integration, exercise accuracy validation, independent security review, and public launch remain pending. Do not describe this build as a clinically validated or fully production-certified coaching system.

## Run locally

Use Node **22.x, at least 22.22.0**. The current workstation has Node 22.14; local checks ran there successfully, but a dependency declares 22.22 as its minimum, so use the documented minimum for deployment/CI. The package engine range keeps Vercel and CI on the same major version.

```sh
npm ci
npm run setup
npm run dev
```

Open `http://localhost:3000`. Setup creates a private `.env` with a random auth secret, applies SQLite migrations, copies the pinned WASM library, and downloads/verifies the pose model. It preserves an existing `.env`. Keep `BETTER_AUTH_URL` equal to the browser origin; use `localhost:3000` consistently even though the server binds to `127.0.0.1`.

- `/demo` — isolated illustrative studio. All people/history are sample data; edits exist only in that page session. Refresh resets them. No demonstration identity can access protected APIs.
- `/demo?view=practice` — real local camera inference; frames stay on the device.
- `/login` — sign up or sign in to your actual workspace.
- `/app` — authenticated account, onboarding and studio. Local accounts can sign in without email verification. Vercel production requires verified email.
- `/studio/<id>` — membership-protected session room.

Create a coach account, then a trainee account in a second browser profile. The coach creates an invitation for the trainee's exact email and shares its link manually. The trainee accepts it; the coach can then enroll that trainee when scheduling a session. Camera practice needs no video service. Group video needs LiveKit credentials.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run start
# In a second terminal, against the local server:
npm run test:api
npm run test:e2e
npm run test:a11y
```

The browser test configuration uses an installed Microsoft Edge. Change the channel or install Playwright Chromium if Edge is unavailable. The worker test uses a simulated camera and never accesses a physical camera. API/browser integration accounts use `example.test` emails and are removed afterward. Use a dedicated local test database. The accessibility scan covers 17 page, dialog, populated studio, and mobile states and writes `docs/accessibility-report.json`; the real trainee journey also checks its private-cue studio view. Automated checks do not establish WCAG conformance. On Windows, stop the dev server before `npm run build` or Prisma generation so the query engine DLL is not locked.

## How camera analysis works

MediaPipe detects up to two bodies in a classic worker, using the pinned Pose Landmarker Lite model and local WASM files. More than one detected body, low confidence, partial framing, unclear geometry, or an unsupported camera view suppress scoring. A single frame is processed at a time at a capped cadence. Camera tracks and the worker are closed on stop/unmount. Supported exercises: squat, push-up, curl, plank.

Aspect-corrected joint geometry and exercise-specific state machines estimate phases, count controlled rep cycles, estimate plank hold duration, and produce limited form cues. Scores are transparent **heuristics**, not a learned fitness rating or proof of perfect/safe technique. See the research plan for validation targets and measurement limitations. A coach can send individual cues. No calories, injury predictions, body-fat estimates, or fake precision are inferred from the camera.

When connected to a class, the trainee analyzes the LiveKit local camera track rather than opening a second camera. Limited summaries are sent every 3 seconds, scoped to that trainee's enrollment and current exercise revision. Coach updates use polling with backoff. Trainee summaries remain private to the trainee and their coach. Video is a consented **group** stream visible to enrolled classmates; the application does not record it.

## Documentation

- [Research and implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Vercel and LiveKit deployment](docs/DEPLOYMENT.md)
- [Review of the proposed pose implementation](docs/PROPOSAL_REVIEW.md)
- [Release status and verification](docs/VERIFICATION.md)
- [Security, retention, and operations](docs/OPERATIONS.md)
- [Dependency and asset provenance](docs/THIRD_PARTY.md)

Secrets stay in ignored environment files or the hosting provider. Never put LiveKit, auth, Stripe, or database secrets in browser-exposed variables. Vercel uses PostgreSQL, not the local SQLite file; its build command validates required configuration and generates the PostgreSQL client. Database migration is a separate release step.
