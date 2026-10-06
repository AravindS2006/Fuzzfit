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
| LiveKit Cloud | Owner reports signup completed; project credentials and the three Production values pending; disable automatic room creation and test real devices before launch |
| Email | Owner reports Resend signup completed; configuration deferred at their request until the client's domain requirements are known; production build and public signup remain gated on verified email delivery |
| Required app keys | 6 of 11 configured; missing LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, RESEND_API_KEY, EMAIL_FROM |
| Billing | Disabled; paid entitlements and live payment verification remain future work |
| Application deployment | No source upload, READY build, or promotion yet |
| Local app | Still healthy at `http://localhost:3000`; local SQLite setup preserved |
| New checks | 36 unit tests, TypeScript, formatting pass; production config diagnostics never print values |

Open [Vercel environment settings](https://vercel.com/aravinds2006s-projects/fuzzfit/settings/environment-variables) and [LiveKit Cloud](https://cloud.livekit.io), then enter the LiveKit credentials directly in Vercel Production. Never paste keys in chat. Defer Resend credentials until a domain whose DNS you control is available; the assigned Vercel app subdomain cannot be used to verify the `vercel.app` email domain. [Resend verified-domain requirements](https://resend.com/docs/dashboard/domains/introduction).

The initial database request was rejected by automatic approval review over unspecified billing/resource creation. The user subsequently approved the exact Neon Free plan; provisioning completed after the owner accepted Marketplace terms. That approval issue is resolved.

Follow DEPLOYMENT.md for the remaining commands. Camera thresholds/scores are still unvalidated `geometry-v1` heuristics; physical-device, coach accuracy, full PostgreSQL/concurrency, delivered email, and launch-review gates remain documented in VERIFICATION.md.
