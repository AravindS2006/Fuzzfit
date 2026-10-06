# Fuzzfit production setup status

Checked 6 October 2026. **The Vercel project is configured; the application is not deployed.**

| Item | Status |
| --- | --- |
| Vercel project | `aravinds2006s-projects/fuzzfit`, `prj_m5uOzEvrg5TZ44AKN2CJ2jRJlERK`; local `.vercel/project.json` linked |
| Assigned app domain | `fuzzfit.vercel.app`; assigned/verified by Vercel, no application serving yet |
| Build/runtime | Next.js, `npm ci`, guarded `npm run build:vercel`, Node 22.x, functions in Singapore `sin1` |
| Domain assignment | Automatic assignment disabled; use a staged production build and explicit promotion |
| GitHub | Private `AravindS2006/Fuzzfit` repository created and source pushed; `master` tracks `origin/master`; credentials, databases, builds, agent packages and generated assets excluded |
| Vercel Git connection | Existing project connected to `AravindS2006/Fuzzfit`; Production Branch is `master` |
| Auth and cleanup | Independent generated secrets stored as sensitive Production variables; origin and PostgreSQL provider set |
| PostgreSQL | Dedicated `fuzzfit-production` Neon Free resource, Singapore, Better Auth retained, connected only to Production; pooled URL and DIRECT_URL configured |
| Migration | `20261006000000_init` applied; basic read-only connectivity/auth/class/rate-limit queries pass |
| LiveKit Cloud | Three Production values are present; service connectivity, automatic-room-creation settings and real device checks remain unverified |
| Email | Resend signup completed; `EMAIL_DELIVERY=disabled` configured in Production. Builds no longer require a sender; signup and reset-email requests are closed, and verified-account sign-in remains mandatory |
| Required app keys | Nine core keys are present plus explicit email deferral; RESEND_API_KEY and EMAIL_FROM are needed only when EMAIL_DELIVERY=resend |
| Billing | Disabled; paid entitlements and live payment verification remain future work |
| Application deployment | Git push triggers a remote build; the email deferral fix removes the missing-sender blocker. READY build/promotion must be checked after push |
| Local app | Local SQLite setup preserved; stop the server before Prisma generation/build on Windows |
| New checks | 46 unit tests and TypeScript pass; production config diagnostics never print values; isolated deferred-email API/UI checks are included in CI |

Open [Vercel environment settings](https://vercel.com/aravinds2006s-projects/fuzzfit/settings/environment-variables) and [LiveKit Cloud](https://cloud.livekit.io), then enter the LiveKit credentials directly in Vercel Production. Never paste keys in chat. Defer Resend credentials until a domain whose DNS you control is available; the assigned Vercel app subdomain cannot be used to verify the `vercel.app` email domain. [Resend verified-domain requirements](https://resend.com/docs/dashboard/domains/introduction).

The initial database request was rejected by automatic approval review over unspecified billing/resource creation. The user subsequently approved the exact Neon Free plan; provisioning completed after the owner accepted Marketplace terms. That approval issue is resolved.

Follow DEPLOYMENT.md for the remaining commands. Camera thresholds/scores are still unvalidated `geometry-v1` heuristics; physical-device, coach accuracy, full PostgreSQL/concurrency, delivered email, and launch-review gates remain documented in VERIFICATION.md.
