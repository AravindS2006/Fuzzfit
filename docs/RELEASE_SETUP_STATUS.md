# Fuzzfit production setup status

Checked 6 October 2026. **The application is deployed at fuzzfit.vercel.app for operator testing.** Full service/device and public-launch acceptance remain pending.

| Item | Status |
| --- | --- |
| Vercel project | `aravinds2006s-projects/fuzzfit`, `prj_m5uOzEvrg5TZ44AKN2CJ2jRJlERK`; local `.vercel/project.json` linked |
| Assigned app domain | `fuzzfit.vercel.app`; publicly serving the app with HTTPS |
| Build/runtime | Next.js, `npm ci`, guarded `npm run build:vercel`, Node 22.x, functions in Singapore `sin1` |
| Domain assignment | Git production deployments automatically receive the default app URL; disabling custom-domain auto-assignment did not prevent this |
| GitHub | Private `AravindS2006/Fuzzfit` repository created and source pushed; `master` tracks `origin/master`; credentials, databases, builds, agent packages and generated assets excluded |
| Vercel Git connection | Existing project connected to `AravindS2006/Fuzzfit`; Production Branch is `master` |
| Auth and cleanup | Independent generated secrets stored as sensitive Production variables; origin and PostgreSQL provider set |
| PostgreSQL | Dedicated `fuzzfit-production` Neon Free resource, Singapore, Better Auth retained, connected only to Production; pooled URL and DIRECT_URL configured |
| Migration | `20261006000000_init` applied; basic read-only connectivity/auth/class/rate-limit queries pass |
| LiveKit Cloud | Three Production values are present; service connectivity, automatic-room-creation settings and real device checks remain unverified |
| Email | Resend signup completed; `EMAIL_DELIVERY=test` selected for operator testing without a domain. Signup/sign-in enabled, email addresses remain unverified, and mail delivery/recovery are deferred |
| Required app keys | Nine core keys are present plus explicit email deferral; RESEND_API_KEY and EMAIL_FROM are needed only when EMAIL_DELIVERY=resend |
| Billing | Disabled; paid entitlements and live payment verification remain future work |
| Application deployment | Private Git push triggers a remote production build; check READY state and canonical URL against the released commit after each change |
| Local app | Local SQLite setup preserved; stop the server before Prisma generation/build on Windows |
| New checks | 49 unit tests; production config diagnostics never print values; isolated deferred-email and two-role testing signup checks are included in CI |

Open [Vercel environment settings](https://vercel.com/aravinds2006s-projects/fuzzfit/settings/environment-variables) and [LiveKit Cloud](https://cloud.livekit.io), then enter the LiveKit credentials directly in Vercel Production. Never paste keys in chat. Defer Resend credentials until a domain whose DNS you control is available; the assigned Vercel app subdomain cannot be used to verify the `vercel.app` email domain. [Resend verified-domain requirements](https://resend.com/docs/dashboard/domains/introduction).

The initial database request was rejected by automatic approval review over unspecified billing/resource creation. The user subsequently approved the exact Neon Free plan; provisioning completed after the owner accepted Marketplace terms. That approval issue is resolved.

Follow DEPLOYMENT.md for the remaining commands. Camera thresholds/scores are still unvalidated `geometry-v1` heuristics; physical-device, coach accuracy, full PostgreSQL/concurrency, delivered email, and launch-review gates remain documented in VERIFICATION.md.
