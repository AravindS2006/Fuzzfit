# Security and operating notes

Authentication uses Better Auth and Prisma-backed sessions. Password management is delegated to that library. Role setup is server-side and one-time. Every domain API binds the authenticated user to studio ownership or session enrollment. Public sample data is entirely separate from protected records. Mutation endpoints check Origin, JSON format, input size, schema validity, and database-backed request limits. LiveKit JWTs have no room administration or arbitrary data-publish grants.

`EMAIL_DELIVERY=disabled` defers all email sending. On Vercel it closes signup and new reset-email requests without changing the verified-email requirement for sign-in. The login page hides those unavailable actions. This permits a demonstration deployment before the client's sending domain is known; it does not provide a substitute way to enroll new clients. Re-enable with `EMAIL_DELIVERY=resend` only after the sending domain/key are configured, then redeploy and test delivered verification and reset links.

Use the trusted Vercel proxy for authentication's forwarded-IP rate limiting; self-hosted operators must configure trusted proxy headers correctly. Disable LiveKit Cloud automatic room creation. The application prepares rooms explicitly and revokes identities with a current cutoff before room deletion, including on cleanup retries. Cached-token reconnection is part of the required Cloud service tests, since JWT expiration alone does not close an active/refreshed session. [LiveKit participant revocation](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/).

`/api/health` checks database availability without exposing provider credentials or database details. API failures include safe messages and request IDs; error logs contain error type and request ID rather than customer messages or frames. Production browser headers restrict camera/mic to this origin, prevent framing, and include a CSP. The CSP permits inline Next.js bootstrap scripts and WASM compilation; nonce-based CSP is a hardening follow-up, not a completed control.

## Recovery and incidents

1. Check provider status, database connectivity, error IDs, auth verification delivery, and LiveKit room availability.
2. Degrade to human coaching/local camera practice when analysis or media fails. Explain the unavailable measurement rather than display stale assurance.
3. Rotate compromised keys in their providers and redeploy. Revoke affected auth sessions and investigate access audit events.
4. Roll back an application release only to a schema-compatible version. Restore a database from a verified backup into a separate environment and check row counts/access isolation before switching traffic.
5. Follow the published incident/notification process for affected users and markets; qualified review is required for legal obligations.

## Data retention

The cleanup endpoint is cron-secret-protected. Latest metrics: 7 days. Class messages: 90 days. Expired invites, sessions, verification records, and rate records are deleted. Summaries/account/studio records are retained for the operator's declared policy. Audit records contain actor/target IDs and control action but no camera frame data.

Data export returns only the requesting user's profile, memberships, and workout summaries. Automated account deletion is not yet exposed; the operator must publish and operate a deletion process before launch. Before erasing a coach account, review the cascading deletion of the owned studio and its clients' studio records, and reconcile Stripe subscriptions. Do not delete financial records without an approved retention policy.

## Known engineering limits

- Metrics, cues, and control state use 3-second polling rather than a durable realtime bus. Local detector feedback is immediate. Load-test before scaling beyond the eight-trainee cap.
- Clients compute their own estimates; the backend validates bounds but cannot attest that they came from an actual camera. They must not be used for competitions, insurance, medical decisions, or fraud-sensitive rewards.
- Scores are heuristic geometry comparisons. The included rule version is `geometry-v1`; no validated learned scoring model exists yet.
- Stopping local analysis while a shared camera is active stops inference, not the separately indicated video room stream. Use the room camera toggle or leave video to stop sharing.
- Browser CPU performance, thermal throttling, supported Safari behavior, and live WebRTC reconnection remain to be measured on physical devices.
- Stripe and email integration code needs real service tests. Paid feature entitlements, operator console, automated deletion, recurring availability, push notifications, and coach verification are future milestones.
- DB transactions use serializable isolation for invite/onboarding and metrics. Serialization conflicts fail safely; client summary polling retries on its next interval. Add bounded retry handling and observe conflicts under PostgreSQL load.

Before production, assess dependency licensing, conduct threat modeling/pentesting, test all service failure states, choose monitoring/alert recipients, and rehearse restores. The included checks are development verification, not an independent security certification.
