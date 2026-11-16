# Deploy KR7Tech on GoDaddy, Render or Vercel

## Native GoDaddy Node.js Hosting

Use the repository-root `godaday.md` for the full setup. From `StudyGuide`, run
`npm ci`, `npm run build`, then `npm run package:godaddy`. Upload the generated
private `.godaddy\kr7tech.zip` to **Node.js Hosting**, not Website Builder.
The ZIP has a root package manifest, runtime source and production build script;
it excludes local secrets/accounts and `node_modules`. GoDaddy installs the
dependencies and runs `npm run build` / `npm start`. The app supports Node 22/24
and binds to the supplied `PORT`. Configure separate preview/published secrets,
Atlas network access and the exact HTTPS `PUBLIC_APP_URL`.

All hosts: production checkout remains closed until `SALES_ENABLED=true`, a
valid `SUPPORT_EMAIL`, account storage and provider credentials/webhooks are set.
Review Terms, Privacy, payment/refund disclosures and the real service
availability before enabling sales. The provider returns customers to
`Purchase.html`; signed verification, not the redirect, activates access.

Push the complete repository yourself, including `StudyGuide/package-lock.json`,
`StudyGuide/api/_project-questions.js`, assets, and the deployment files.
Do not upload only the HTML files. Never commit `.env.local` or filled-in
credentials. `.gitignore` excludes local environment files and generated
`.vercel` output; `.env.example` contains placeholders only.
Do not serve this source through Live Server, `file://`, GitHub Pages, or
a static-only host: original guide HTML contains paid material. All website
requests must go through the checked-in Node server or its Vercel function.

Both platforms use Node.js 24 and the existing server authorization rules.
The homepage, navigation, ten free questions per subject, and protected guide
previews work without Google, Supabase keys, payment keys, or AI keys.
The separate Company Interviews library has ten free questions in total;
changing company or topic filters does not unlock additional answers.
Unavailable integrations remain unavailable; deploying does not enable them.

## Render

1. Connect your Git repository and create a **Blueprint** using the repository
   root `render.yaml`. The service root is `StudyGuide`.
2. Set `PUBLIC_APP_URL` to the service's assigned HTTPS origin, with no trailing
   slash or path. If Render assigns a different URL after creation, update
   this setting before using PIN forms, authentication, or checkout.
3. Deploy. The manifest installs with `npm ci --omit=dev`, starts with
   `npm start`, and checks `/api/health`. Do not create a Static Site service.

For manual Web Service setup instead of a Blueprint:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | `StudyGuide` |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/api/health` |
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |
| `AI_INTERVIEW_ALLOW_ANONYMOUS` | `false` |

Render supplies `PORT`; the server binds to it on `0.0.0.0`. Do not hard-code
port 10000 in hosting settings. The Blueprint selects a free service for initial
evaluation, not a production availability guarantee. Review Render's current
sleeping, quota, and pricing rules before launching a paid student service.

## Vercel

1. Import the Git repository. Set **Root Directory** to `StudyGuide`,
   **Framework Preset** to **Other**, and **Node.js Version** to **24.x**.
2. Use the checked-in `vercel.json`: install command `npm ci --omit=dev`,
   build command `npm run build:vercel`. Leave **Output Directory** unset;
   do not override it to `.` or `StudyGuide`. There is no start command.
3. Set `NODE_ENV=production`, `AI_INTERVIEW_ALLOW_ANONYMOUS=false`, and
   `PUBLIC_APP_URL` to your final HTTPS production origin. Deploy.

The build produces Build Output API v3 files inside `.vercel/output`.
One Node.js function serves the complete website and API using the same
adapter as Render. No public static directory is generated: original premium
guides and private question-bank modules remain inside the server function.
Production dependencies are bundled; Playwright, SQL, local environment
files, documentation, and import scripts are not.

The function keeps request bodies unparsed until the shared server handles
them, preserving signed payment webhook bytes. Public assets also pass
through this function; account for this when reviewing hosting usage.
The configured function timeout is 60 seconds; enabled upstream services must
complete within it and your chosen platform limits.

Use a hosting plan whose current terms permit your commercial/paid site.
Do not assume a personal/Hobby plan permits monetization. Check Vercel's
current plan terms before launch; this configuration does not purchase a plan.
Do not point a preview deployment at live payment credentials. If you enable
authentication in a preview, use its own exact `PUBLIC_APP_URL` and allowed
redirects rather than the production origin.

## Environment variables

Enter values privately in the host dashboard, not browser JavaScript.
Redeploy after changes. `.env.example` lists supported integration settings;
its localhost `PUBLIC_APP_URL` must be replaced for deployment.

### MongoDB username/password accounts

Use **MongoDB Atlas or another MongoDB replica set**: verified payment
activation and AI quota claims use transactions. A standalone `mongod`
without replica-set transactions is not sufficient for paid features.

1. Privately set `AUTH_PROVIDER=mongodb`, `MONGODB_URI`, and
   `MONGODB_DATABASE`. Use a database-specific read/write user, TLS, and
   restricted network access. No MongoDB credentials go into frontend files.
2. Set `PUBLIC_APP_URL` to the exact HTTPS website origin. Local HTTP is only
   permitted on loopback in non-production. Cookie-backed writes require a
   matching browser Origin, including checkout and administrator changes.
   Local-only development also accepts `localhost`, `127.0.0.1`, or `[::1]`
   when the browser Origin exactly matches the request Host and port and the
   connection is loopback. This does not apply on Render, Vercel, or production.
3. Generate a private random `AUTH_OTP_SECRET` with at least 32 characters.
   Open `Account.html`: **Create account** stores a unique case-insensitive
   username and salted scrypt password hash in MongoDB. **Already have an
   account? Login** uses those saved credentials. Passwords require 15-256
   characters, are never stored as readable text, and are not placed in browser
   storage. New accounts start as Free Students; signup never grants Admin
   or paid access. Username-only accounts do not yet have email recovery.
   No email, OTP, Resend configuration, or separate Admin login is required.
   `AUTH_OTP_SECRET` remains the internal signing-secret setting, despite its
   historical name. Never paste secrets into chat or commit them.
4. If owner administration is needed, create a normal username/password
   account and copy its dashboard Account ID. Privately locate that exact
   UUID and username in Atlas `users`, and change only that account's `role`
   to `admin`. Never expose database administration to students. Existing
   accounts keep their role on subsequent logins; privately authorized admins
   can assign Student/Expert and grant/revoke Go/Pro using the learner's ID.
5. Before enabling MongoDB on the live site, run `npm run seed:mongodb`
   from `StudyGuide` with the private connection settings. This imports the
   existing company, frontend-coding, and experience question seeds. It only
   inserts missing deterministic IDs, preserves existing records, and does
   not delete data, create accounts, or grant access. Subject questions and
   concept lessons continue to use their existing private server modules.
6. Deploy/restart the Node app and open `Account.html`. Create a normal account,
   sign out, then log in again with its username/password. Verify persistence
   and permissions before accepting purchases. Already-signed-in legacy users
   can use **Enable username/password login** in their dashboard; their UUID,
   role and purchases remain unchanged. Legacy users without a session need
   owner-assisted migration; a new account does not inherit old purchases.
   Existing payment and Gemini/Judge0 settings are still required.

The password endpoint is `/api/account-auth`. Password attempts are limited
by database-backed keyed identity/network counters; HTTP-only sessions last
up to seven days and logout revokes the current session. Scrypt v2 uses
N=65536, r=8, p=2 with random salts and constant-time comparison. Password
hashing concurrency is bounded per server process. The unique `loginName`
index also enforces duplicate protection under concurrent signup.

For username-only accounts, an internal non-deliverable unique email identifier
satisfies the existing database schema; it is not shown as a real email or sent
to payment notification services. The account does not claim another person's
email. There is no automatic linking to an existing OTP account by email.

For local development in this workspace, `npm start` reads the sibling
`atlas-credentials.env` file when it is present; `.env.local` and existing
process environment variables take precedence. With an Atlas URI configured,
local startup defaults to the `kr7tech` database, a loopback app origin, and a
fresh process-local signing secret. Production does not load this file or use
these defaults; configure the production environment variables privately in
the host dashboard.

Private indexes are created on first database connection. MongoDB's TTL monitor
cleans up expired authentication records; authorization explicitly checks
expiry and does not rely on immediate TTL deletion. Session cookies are
HTTP-only, SameSite=Lax, Secure with a `__Host-` prefix on HTTPS, and expire
after seven days. Logout deletes the server session. Raw login tokens are
not stored in MongoDB or browser local storage.

**Switching is not migration.** Supabase users, purchases, grants, feedback,
and usage remain in their original database. Do not switch a paid production
site until the owner has reconciled verified identities and purchases into
MongoDB with their original account UUIDs. Do not automatically link accounts
merely because their email strings match. The seed command imports teaching
content only. MongoDB mode does not require the Supabase SQL migrations;
those instructions below apply only to the legacy Supabase backend.

### Offline local preview (not MongoDB)

For an **offline Version 1 visual preview without MongoDB**, run
`npm run setup:local-preview` with `LOCAL_PREVIEW_PASSWORD` supplied privately
in the terminal environment, then `npm run preview:local`. Open
`http://127.0.0.1:10000/Account.html` and choose **Create account** with a new
username and password of at least 15 characters. The setup initializes local
preview settings; there is no separate Admin login form.

The standalone launcher serves the real pages and private teaching content
with local preview accounts. The Account page supports **Create account**,
username/password login, and sign-out. Normal registration creates a Free
Student, including the first account. Existing saved local accounts retain
their credentials and roles. Accounts and salted password hashes persist in
ignored `.local-preview/accounts.json`, which is neither served nor packaged.
No email address is required. Do not use real production passwords for test accounts.

A visible LOCAL PREVIEW banner distinguishes
it from the real service. Logout revokes its one-hour cookie, and restarting
resets sessions and preview plan changes, not registered accounts. Payments, email delivery, MongoDB writes, AI and
remote compilation are explicitly unavailable, not simulated as successful.
The server binds only to loopback and refuses production/hosting environments.
The launcher and setup code are under `scripts`, excluded from the generated
deployment function; local settings and preview credentials are also excluded.
Keep the normal hosting command `npm start`, never `npm run preview:local`.

Use `npm start` for real MongoDB signup and login. A failed MongoDB connection
returns an error; it never silently falls back to local preview files. Local
Admin helpers are not part of the Account UI. Leave
`LOCAL_ADMIN_LOGIN_ENABLED=false` in hosted settings and do not expose the
development server by port forwarding. Rotate credentials shared in messages
before launching a public deployment.

| Feature | Settings / owner action |
| --- | --- |
| Free website and previews | `NODE_ENV=production`, `PUBLIC_APP_URL=https://your-domain` |
| Per-item Pro PIN | `PRO_ACCESS_PIN` (8-128 characters) and `PRO_ACCESS_SECRET` (at least 32 characters) |
| Accounts and paid entitlements | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; apply the schema and relevant seeds described in README |
| Administrators | Optional comma-separated Supabase user UUIDs in `ADMIN_USER_IDS` |
| Interest lists, feedback, chat contacts | Apply `supabase/community.sql`; set `SUPPORT_EMAIL` and `COMMUNITY_FORM_SECRET` (at least 32 characters), plus Supabase URL and legacy service-role key |
| Google sign-in | Optional Supabase Google provider setup and redirects described in README; Google credentials stay in Supabase |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, explicit `PAYPAL_GO_USD` and/or `PAYPAL_PRO_USD`; optional legacy tier amounts and `PAYPAL_BASE_URL` |
| AI interviews | Apply `supabase/membership-plans.sql` after `schema.sql`; `GEMINI_API_KEY`, optional `GEMINI_MODEL`; production requires verified Go/Pro and durable usage storage |
| Code execution | HTTPS `JUDGE0_API_URL`, optional `JUDGE0_API_TOKEN`; authenticated Pro access required |

Your Supabase base URL is
`https://zhzcmykfzeooadngrnyc.supabase.co` (not `/rest/v1/`).
Use the public publishable/anon key for `SUPABASE_ANON_KEY`. This backend
currently requires the **legacy `service_role` JWT** for
`SUPABASE_SERVICE_ROLE_KEY`, not an `sb_secret_` key. Never expose this key.
PIN-only access does not require Supabase; checkout and paid-account access do.

Before enabling Go/Pro purchases, manually apply `supabase/membership-plans.sql`
to fresh or existing databases after the base schema. No database changes are
applied by the website build. The current 50% INR offer charges Go INR 750
(regular 1,500) and Pro INR 2,500 (regular 5,000), one-time. Prices and offer
metadata come from `api/_pricing.js`. Review both advertised and charged amounts
before publishing a price change; do not rewrite historical purchases.
Go includes unlimited
Interview Q&A, the first two concept lessons per subject, and one six-question
AI session per UTC day. Pro includes all content and no daily AI session cap.
PayPal USD prices must be explicitly configured per plan and are not an automatic
currency conversion. Existing pending purchases retain their recorded amounts.
AI fails closed without the migration; production ignores the anonymous-testing
flag. Local anonymous testing requires an explicit flag and a loopback host.

The Render Blueprint generates `PRO_ACCESS_SECRET` automatically. Set your
own production `PRO_ACCESS_PIN` privately to enable PIN prompts. For Vercel or
manual Render setup, generate a signing secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep that value private. The short localhost test PIN is intentionally not
accepted in production. Never set `LOCAL_PRO_ACCESS_ENABLED`,
`LOCAL_PRO_ACCESS_PIN`, or `LOCAL_PRO_ACCESS_SECRET` on either host.
Without a production PIN, protected items remain locked. A PIN grant opens
only the selected item; it does not grant paid membership or open all topics.

PIN failed-attempt tracking and consumed-grant tracking are in process memory.
Resource binding and two-minute expiry remain enforced, but one-use replay
protection and rate limits are **not shared across instances or restarts**.
Before relying on PINs for a scaled paid launch, add a shared atomic
rate-limit/replay store. Verified paid Supabase entitlements are separate.

## Domain, callbacks, and payments

After adding a custom domain, change `PUBLIC_APP_URL` to its exact HTTPS
origin and update provider redirects/webhooks before accepting payments.
Keep Google configuration paused if you do not want sign-in enabled yet.
When enabling Google, allow the final origin's
`/Auth-Callback.html?state=*` in Supabase redirect settings; the Google
provider callback remains the Supabase `/auth/v1/callback` URL from README.

Register only the payment providers you configure:

| Provider | Webhook path |
| --- | --- |
| Stripe | `/api/webhooks/stripe` |
| Razorpay | `/api/webhooks/razorpay` |
| PayPal | `/api/webhooks/paypal` |

Use each full HTTPS URL in that provider's dashboard. Configure the matching
webhook secret/ID and required events described in README. Test sandbox
checkout, signed webhooks, and resulting entitlements before switching to
live credentials. A success redirect alone must never grant Pro.

## Local and release checks

From `StudyGuide`, with Node.js 24 installed:

```powershell
npm ci
npm test
npm run build:vercel
npm start
```

Local preview: `http://127.0.0.1:10000`. Render does not need the Vercel build.
The builder replaces only its own marked generated output and refuses to
overwrite an unrecognized `.vercel/output` directory.

After your manual deployment:

1. `/api/health` returns `{"status":"ok"}`. Open homepage links and a
   subject's Q&A; ten free answers should appear and remaining answers lock.
2. Open `/C%23Dotnet.html` and `/Dotnet-Roadmap.html`; signed-out visitors
   must receive previews, not full premium guides.
3. `/.env.local`, `/server.js`, `/scripts/build-vercel.js`,
   `/api/_project-questions.js`, and `/supabase/schema.sql` must return 404.
4. If PIN access is enabled, verify one selected item opens and a different
   protected item asks again. Check mobile layout and optional integrations.

Hosting, Supabase, payment processing, AI, and compiler providers have
independent limits or charges. No account setup, purchase, push, or remote
deployment is performed by these files.

AskKR7Tech FAQs work without community-form credentials and show predefined
answers after 2 seconds; they do not call an AI provider. Newsletter and
masterclass forms collect interest only. There is no email delivery or live
event booking integration. Publish a real support address before enabling
data collection, moderate feedback, and handle consent withdrawal/removal
requests through that contact. These owner actions are not automated.

The Free / Pro comparison lists the remote runner, live 1:1 coaching, and
completion certificates as Pro inclusions. Compiler execution still needs Judge0
configuration. Before offering coaching or issuing certificates, publish the
session terms, scheduling process, completion criteria, and issuance process.
These owner-arranged benefits are not automatically booked or issued by checkout.

Platform references: `https://vercel.com/docs/build-output-api/v3/primitives`,
`https://vercel.com/docs/build-output-api/v3/configuration`,
`https://vercel.com/docs/plans/hobby`, `https://render.com/docs/blueprint-spec`,
`https://render.com/docs/node-version`, and `https://render.com/docs/free`.
