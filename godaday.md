<<<<<<< HEAD
# Deploy and sell KR7Tech memberships with GoDaddy

Updated for this project on **November 14, 2026**.

Project: `C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech`

Application folder: `StudyGuide`

Example domain: **kr7tech.example**. This is a placeholder, not a registered
production domain. Replace it everywhere below with a domain you own or your
actual deployment hostname. The application name is **KR7Tech**.

This is a manual deployment guide. Writing this file did not purchase a domain,
upload your project, create cloud accounts, configure DNS, or deploy anything.

## A. Deploy directly on GoDaddy Node.js Hosting

GoDaddy now provides **Node.js Hosting** with ZIP uploads, private previews,
environment secrets and custom domains. Use that product for the native route,
not Website Builder or a static HTML upload. Check availability and the plan's
current price in your own GoDaddy account before buying. Buying the domain
alone does not buy the application's hosting.

The application supports Node.js **22.x or 24.x**. GoDaddy's launch documentation
describes a Node.js 22 runtime; check the runtime shown for your actual app.
Render and Vercel can continue using Node.js 24.
The local Node 24 checks are runnable. Obtaining the additional Node 22 test
runtime in this assistant session was blocked by the local sandbox's npm-cache
permissions; a successful GoDaddy Node 22 preview is still a required release
check, not something the code changes alone prove.

### A1. Prepare the upload on your computer

Run from the application folder, not the repository's parent folder:

```powershell
Set-Location 'C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech\StudyGuide'
npm ci
npm run build
npm run package:godaddy
```

Upload **`StudyGuide\.godaddy\kr7tech.zip`**. Do not zip the entire disk folder.
The package contains the Node server, private APIs/content, public assets,
lockfile and production build script. `package.json` is at the ZIP root.
It excludes `.env.local`, local accounts, `node_modules`, tests and generated
Vercel output. It does contain your paid content, so keep the ZIP private.
GoDaddy installs dependencies; the project starts with `npm start`.

The checked-in commands are:

| Purpose | Command |
| --- | --- |
| Node hosting build | `npm run build` |
| Start the protected website and API | `npm start` |
| Generate GoDaddy upload | `npm run package:godaddy` |
| Generate Vercel deployment instead | `npm run build:vercel` |

Do not upload only `index.html`. Premium answers must remain behind the Node
server. Its listening port comes from the host's `PORT`; do not hard-code one.

### A2. Create and configure the app

1. Open GoDaddy **Node.js Hosting** and choose **Upload ZIP**.
2. Select `kr7tech.zip` and deploy to a private preview.
3. Use the app's Settings to manage secrets. Configure preview and published
   environments separately. Never test a preview with live payment credentials.
4. Set the following values in the environment you are testing:

```dotenv
NODE_ENV=production
AUTH_PROVIDER=mongodb
MONGODB_URI=YOUR_ROTATED_ATLAS_CONNECTION_STRING
MONGODB_DATABASE=kr7tech
AUTH_OTP_SECRET=YOUR_PRIVATE_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
PUBLIC_APP_URL=https://YOUR_ACTUAL_APP_HOST
LOCAL_ADMIN_LOGIN_ENABLED=false
AI_INTERVIEW_ALLOW_ANONYMOUS=false
SUPPORT_EMAIL=YOUR_WORKING_CUSTOMER_SUPPORT_EMAIL
SALES_ENABLED=false
```

`AUTH_OTP_SECRET` is also used by the password-account system; its name does not
mean customers need OTP login. Generate a strong random secret privately.
Never reuse the database password previously pasted in conversation: rotate it.

`PUBLIC_APP_URL` must be the exact HTTPS origin the browser uses, without a
path, query or fragment. For preview checks use the preview's actual origin.
Before publishing on your domain, update the published environment to the
final domain origin and restart/redeploy so the server reads the change.

### A3. Connect MongoDB Atlas

Use the existing MongoDB account backend, not GoDaddy's optional MySQL database.
Create a separate production database/user with appropriate privileges, enable
backups for your chosen Atlas tier, and configure Atlas network access for the
host's documented outbound addresses. Ask hosting support for stable egress
details if they are not published; do not assume public Node hosting can reach
Atlas just because static pages load.

Create a normal test account, sign out, sign in again and check that its record
persists. New customers start Free; buying a plan is separate from signing up.
Do not deploy `.local-preview\accounts.json`, preview Admin credentials,
local plan grants or secrets. Account and payment operations have no
filesystem fallback if Atlas is unavailable.

If importing additional SQL-seeded practice, run `npm run seed:mongodb` from
your secured local source checkout using the intended production connection,
not from a public web request. The upload already includes bundled learning
content; import is not required merely to display the free previews.

### A4. Publish your GoDaddy domain

Review the private preview, attach the required hosting subscription, and publish
the app. Use its Settings to connect your purchased domain. Follow the records
GoDaddy shows for that app; do not copy a guessed IP address from another host.
Confirm the domain and HTTPS certificate are working before enabling payments.

Choose one canonical hostname, such as the apex domain or `www`. Configure the
other hostname to redirect at the host. A cookie/session origin is not an alias
for every domain that happens to resolve to the server.

Check both the home page and `/api/health`. A health response proves the process
is running, not that MongoDB, AI or payments are configured.

### A5. Enable a real payment provider

Choose an account approved for your business, region and currency. GoDaddy's
hosting subscription is separate from the Go/Pro memberships your students buy.

| Provider | Private settings | Signed webhook URL on your final domain |
| --- | --- | --- |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | `/api/webhooks/razorpay` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `/api/webhooks/stripe` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_BASE_URL`, `PAYPAL_GO_USD` / `PAYPAL_PRO_USD` | `/api/webhooks/paypal` |

Use your provider's current webhook instructions and the event handling
documented in `StudyGuide\DEPLOYMENT.md`. Keep sandbox and live keys separate.
PayPal USD prices must be deliberately configured per plan; they are not an
automatic currency conversion from INR.

The current 50% INR offer is **Go 750** (regular 1,500) and **Pro 2,500**
(regular 5,000), one-time. This is a real server-side price reduction for new
INR checkouts, not an added coupon or fabricated countdown. PayPal's separately
configured USD prices are excluded. Existing purchases retain their recorded
amounts. `StudyGuide\api\_pricing.js` owns the current INR price policy;
update storefront copy and recheck provider amounts whenever that policy changes.
The server determines the charge; browser-supplied prices are ignored.
Payment returns go to `Purchase.html`. PayPal return processing captures the
owned order; signed webhook verification still activates the membership.
Do not manually mark a payment paid because its redirect looks successful.

Go and Pro advertise AI practice: configure `GEMINI_API_KEY` and the selected
model, then test their interview allowances before enabling those purchases.
Configure `JUDGE0_API_URL` / `JUDGE0_API_TOKEN` for the remote code runner.
Set provider spending alerts. Coaching and certificate benefits still require
your actual published availability, schedule and completion rules.

### A6. Commercial launch checklist

Keep `SALES_ENABLED=false` until every applicable check is complete:

- Review `Terms.html`, `Refund.html` and `Privacy.html` for your actual business,
  local requirements and operating practices. These project pages are not a
  legal-compliance certification. Publish your business/support information
  and any required purchase disclosures before accepting customers.
- Set a real, monitored `SUPPORT_EMAIL`; check that Contact support displays it.
- Test Create account -> Log in -> choose Go -> payment -> My purchases -> paid
  question access, and repeat for Pro -> full concept access.
- Verify signed webhook delivery, expected price/currency, account ownership,
  failed/cancelled checkout, delayed confirmation and sign-out/sign-in.
- Confirm Free cannot fetch paid bodies and Go cannot fetch later Pro lessons.
- Test an actual AI session, Go's daily allowance and failed-start recovery.
  Test code execution if you are offering the runner as an available benefit.
- Confirm an existing paid plan cannot be purchased again from that account.
- Make a small approved live transaction and verify actual provider receipt,
  membership activation, merchant settlement configuration and support handling.
  Complete any refund test through your provider's authorised tools.
- Check the real domain on mobile and desktop. Review your hosting, database,
  payment and AI costs, capacity, backups and incident contacts.

After review, configure live provider settings, set `SALES_ENABLED=true` in the
published environment and restart/redeploy. Production checkout requires that
switch and a valid support email, and still requires configured providers and
authentication. Never enable it merely to make a disabled button look active.

Membership delivery is implemented; purchasing hosting, merchant approval,
publishing, live DNS, live payments and revenue are not performed or guaranteed
by these files.

### A7. Update or roll back safely

#### Customer-facing outage messages

Every page includes a shared "We're working on it" notice for failed application
services, plus a Try again button. Offline browsers get a connection message.
Invalid passwords, paid-access restrictions, form errors and missing pages are
not reported as an application outage. Retrying reloads the page; it never
automatically repeats a checkout or another submitted action.

The public `Unavailable.html` page is also saved by a service worker after a
successful secure visit when the browser permits it. Returning visitors can
then see this fallback if a page navigation fails or returns a server error.
Only that public fallback is cached, never account data, payment responses or
paid learning pages. Keep its three supporting service-status/worker assets in
the upload; the package command includes them automatically.

An application cannot show a page on a first visit when its hosting or DNS is
completely unreachable, or when browser storage is disabled/cleared. Configure
a hosting/CDN-level error page using `Unavailable.html` if your chosen provider
supports it. This project does not configure an external outage service or
automatically notify your support team. Monitor the app separately.

Generate and privately retain the reviewed source ZIP for each release. Upload
the new ZIP to the same GoDaddy app, check its preview and publish the intended
release. Preserve environment secrets and MongoDB. If a release fails, disable
new sales while investigating and republish the previous known-good artifact.
Do not delete customer accounts, purchases or database data as a rollback.

### Official GoDaddy references checked for this guide

- App requirements: `https://developer.godaddy.com/en/docs/api-users/hosting/app-requirements`
- ZIP upload: `https://www.godaddy.com/help/upload-my-ai-generated-app-to-nodejs-hosting-42987`
- Deployment lifecycle: `https://developer.godaddy.com/en/docs/api-users/hosting/workflows/deploy-nodejs-app`
- Hosting FAQ: `https://www.godaddy.com/en-ca/help/nodejs-hosting-faq-42915`

## B. Alternative: GoDaddy domain with Render hosting

The remaining numbered sections describe the existing Render path, with a
Vercel alternative at the end. Use it if you prefer those hosts or your GoDaddy
product/account does not expose suitable Node.js Hosting. Choose one application
host. The production sales switch, customer policies and release checks above
apply to all hosts.

## 1. Understand the Render alternative

A **domain** is your website's address. Your GoDaddy purchase does not, by
itself, put this Node.js application online.

Use this setup:

```text
Student's browser
        |
        v
kr7tech.example
GoDaddy registration and DNS
        |
        v
Render Node.js Web Service
KR7Tech pages + protected content + API
        |
        +---- MongoDB Atlas: accounts, sessions, purchases and access
        +---- Payment provider: optional, after testing
        +---- Gemini / Judge0: optional, after testing
```

**Alternative path: GoDaddy DNS + Render + MongoDB Atlas.**
The project also supports Vercel; its alternative setup is in section 17.
Choose one hosting path, not both at once.

Do not upload only the HTML files to a static website host, GitHub Pages,
GoDaddy Website Builder, or a public storage bucket. The project's Node server
must protect premium guides and answers. Original source HTML can contain
private paid material.

You do not need a separate GoDaddy Website Builder, WordPress installation,
or Hostinger hosting subscription for the Render path described here.

### Budget before you pay

| Item | Purpose | What to check |
| --- | --- | --- |
| GoDaddy domain | Own the address | Renewal price, registration period, taxes and auto-renew |
| Render compute | Run the application | Paid production compute plan, usage limits and billing alerts |
| MongoDB Atlas | Store production accounts and purchases | Supported deployment, capacity, backups and network access |
| Payment provider | Accept purchases | Account approval, supported payment methods and provider fees |
| Gemini / Judge0 | AI interviews and remote code execution | Availability, quotas, usage charges and spending limits |

Use current provider checkout pages for actual costs. Your domain's first-year
offer is not the website's total operating cost or guaranteed renewal price.
Render documents its Free instances as unsuitable for production; use Free
only for evaluation, not as the availability plan for paying students.[^render-free]

## 2. Finish the GoDaddy domain purchase

1. Confirm the exact spelling of the domain in your cart.
2. Review the first-year price, renewal price and any selected add-ons.
3. Finish checkout if you have not already done so.
4. Open your GoDaddy **Domain Portfolio** and confirm the domain is present.
5. Complete any registration/contact verification requested by GoDaddy.
6. Secure the registrar account with two-step verification and keep recovery
   methods current. Review auto-renew and keep the billing method valid.

For the main path, keep DNS on GoDaddy's nameservers. If you already changed
nameservers to another provider, edit DNS at that authoritative provider instead;
records entered into an inactive GoDaddy DNS zone will not control the site.[^godaddy-dns]

## 3. Separate local preview from production

The local preview you have been testing is **not the production account system**.

| Local preview | Production |
| --- | --- |
| `npm run preview:local` | `npm start` |
| Loopback address on your computer | Public HTTPS domain |
| Local username/password registration | MongoDB username/password accounts |
| New accounts start as Free Students | New accounts start as Free Students |
| Private `.local-preview\accounts.json` | MongoDB users and session records |
| Existing preview Admins keep their roles | Owner privately assigns Admin; role and plan are separate |
| Payment, email, AI and compiler integrations disabled | Each requires real provider setup |

**Do not deploy the local account file or copy its password hashes into MongoDB.**
Local accounts, local sessions, and preview plan changes are not automatically
migrated into production.

Production now offers normal **Create account** and **Already have an account?
Login** forms. The username and salted password hash persist in MongoDB.
Public signup creates Free Student accounts, never Admins. Only a username
and password are required: no email, OTP, or separate Admin login. Google can remain paused.

Before deployment:

- Rotate any database credentials or API keys previously shared in messages.
- Keep secrets in provider dashboards, not source files, screenshots or chat.
- Keep `.env.local`, `.local-preview`, `node_modules` and generated `.vercel`
  output out of your Git upload.
- Keep the Git repository private because it contains your paid learning content.
- Do not set `LOCAL_PREVIEW_*`, `LOCAL_PRO_ACCESS_*` or bootstrap-password
  variables on the production host.
- Explicitly set `LOCAL_ADMIN_LOGIN_ENABLED=false`.

Render checks out your source repository, including private utility scripts.
Its production start command must not execute a preview script. The Vercel
builder separately excludes `scripts`, local state and environment files from
the generated function. Neither host should publicly serve private source files.

Implementation references: `StudyGuide\server.js`,
`StudyGuide\scripts\local-preview.js`, `StudyGuide\api\_mongo-auth.js`,
`StudyGuide\scripts\build-vercel.js`, and `.gitignore`.

## 4. Prepare the project and Git repository

Install supported Node.js **22.x or 24.x** on your own computer if needed.
The Render settings below deliberately select 24.

Open a regular PowerShell terminal:

```powershell
Set-Location 'C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech\StudyGuide'
node --version
npm ci
npm test
```

Resolve failed release checks before publishing. If a browser or local network
test is blocked by your machine's sandbox, validate it in an allowed environment;
do not treat a timeout as a successful test.

In the repository root, review what will be uploaded:

```powershell
Set-Location 'C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech'
git status --short
git branch --show-current
git remote -v
git check-ignore -- StudyGuide\.env.local StudyGuide\.local-preview\accounts.json
git ls-files -- StudyGuide\.env.local StudyGuide\.local-preview
```

The last command should not list private local settings or account state.
If it does, stop and remove those files from Git tracking through your normal
review process; rotate any exposed credentials. Adding a `.gitignore` rule does
not untrack a file already committed.

Use your existing repository and branch if available. If there is no remote
repository yet, create a **private** GitHub repository, then connect it using
GitHub's instructions for an existing local repository.

Review and commit the required project files, including:

```text
.gitignore
render.yaml
godaday.md
StudyGuide\package.json
StudyGuide\package-lock.json
StudyGuide\server.js
StudyGuide\vercel.json
StudyGuide\api\
StudyGuide\assets\
StudyGuide\scripts\
StudyGuide\*.html / *.css / *.js
StudyGuide\*-seed.sql
```

Keep the SQL seed files: the content importer reads them. They are not a
production Supabase migration requirement when using MongoDB.

Push your reviewed commit to the GitHub branch you will select on Render.
Do not reset existing work, force-push, or blindly upload your whole disk folder
through a browser. Browser file uploads do not automatically apply `.gitignore`.
No Git commit or push is performed by this guide.

## 5. Create the Render application

For a straightforward first setup, use **New > Web Service**, connect GitHub,
and choose the private repository and intended branch.[^render-node]

Enter these project-specific settings:

| Render setting | Exact value |
| --- | --- |
| Service type | Web Service, not Static Site |
| Name | `kr7tech` or another available service name |
| Runtime / Language | Node |
| Branch | Your reviewed deployment branch |
| Root Directory | `StudyGuide` |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Compute | Select an appropriate paid production instance |
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |

Choose a supported region suitable for your audience and database. Do not copy
an example region without considering latency. The checked-in `render.yaml`
is an alternative Blueprint configuration, but currently selects a Free
instance and Oregon; review those choices before using it for production.

Render supports selecting the Node version through `NODE_VERSION`.[^render-node-version]
Do not set a fixed hosting `PORT=10000`; the server reads the port supplied
by the host and listens on `0.0.0.0`.

Add these initial environment values:

```dotenv
NODE_VERSION=24
NODE_ENV=production
AUTH_PROVIDER=mongodb
MONGODB_DATABASE=kr7tech
AUTH_OTP_SECRET=YOUR_OWN_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
AI_INTERVIEW_ALLOW_ANONYMOUS=false
LOCAL_ADMIN_LOGIN_ENABLED=false
```

Generate the private signing/rate-limit secret with the command in section 7;
it is required for password accounts even when email OTP is disabled.

Set `PUBLIC_APP_URL` initially to the actual assigned HTTPS Render origin,
for example `https://YOUR-SERVICE.onrender.com`, with no path or trailing slash.
If it is not known before the first deploy, obtain it from the service page,
then update the variable and redeploy before testing forms.

Create/deploy the service. Missing account integrations should remain unavailable;
do not use a local-preview command to make them appear to work.

Open the assigned public Render URL and its `/api/health` endpoint. A healthy
response is:

```json
{"status":"ok"}
```

This health endpoint checks that the web server responds. It **does not**
prove that MongoDB, email delivery, checkout, AI or the compiler work.

## 6. Create the production MongoDB database

1. Create/sign in to MongoDB Atlas.
2. Create a project and supported cluster/deployment.
3. Use a replica-set-capable deployment: this application's payment activation
   and AI usage accounting require transactions, not a standalone database.
4. Create a dedicated **database user**, separate from your Atlas dashboard login.
5. Grant the application's necessary read/write access to the `kr7tech`
   database rather than using an all-powerful personal administrator.
6. In the cluster's **Connect > Drivers** flow, select Node.js and copy the
   application connection string.[^atlas-connect]

Use a fresh private connection string in Render:

```dotenv
MONGODB_URI=mongodb+srv://APP_USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=kr7tech
```

This is a placeholder, not a working credential. Use Atlas's generated URI;
percent-encode reserved characters in credentials and retain TLS verification.
Never use `tlsInsecure` or disable certificate checks to fix a connection.[^atlas-troubleshoot]

### Allow the hosting service to connect

In Render, open your service's **Connect > Outbound** information and copy all
applicable outbound IP/CIDR ranges. These are service-region egress ranges,
not the public IP used to route your website.[^render-outbound]

In Atlas, add those ranges to the project's IP access list. Allow your own
current IP separately only if you will run the content importer locally.
Avoid a permanent `0.0.0.0/0` rule. Dedicated outbound networking is an option
if you need narrower, exclusive addresses.

The website's DNS `A` record is **not** the address to add as the application's
MongoDB egress identity.

Redeploy after setting `MONGODB_URI`. The application creates its required
indexes on database connection. Connection errors must be resolved from the
actual host's logs and Atlas configuration; do not assume the previous local
sandbox's blocked MongoDB connection proves Atlas itself is broken.

### Import the existing question content

Run the importer once from a trusted environment with the production MongoDB
settings. It inserts missing content by deterministic ID, preserves existing
records, and does not create users or grant plans.

**Paid Render service:** open its dashboard **Shell**, ensure you are in the
application folder containing `package.json`, and run:[^render-shell]

```text
npm run seed:mongodb
```

The service environment already supplies the private connection settings.
Expected content totals in the current importer are 126 company/frontend
entries and 216 experience entries. Subject questions and concept lessons use
their existing private server modules.

**Alternative from your own PowerShell terminal:** add your current IP in Atlas,
then supply the fresh URI privately for this one command:

```powershell
Set-Location 'C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech\StudyGuide'
$saved = @{}
foreach ($key in @('AUTH_PROVIDER', 'MONGODB_DATABASE', 'MONGODB_URI')) {
    $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
$privateUri = Read-Host 'Paste the fresh production MongoDB URI' -AsSecureString
try {
    $env:AUTH_PROVIDER = 'mongodb'
    $env:MONGODB_DATABASE = 'kr7tech'
    $env:MONGODB_URI = [System.Net.NetworkCredential]::new('', $privateUri).Password
    npm run seed:mongodb
    if ($LASTEXITCODE -ne 0) { throw 'Content import failed; review connectivity before continuing.' }
}
finally {
    foreach ($key in $saved.Keys) {
        [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
    }
    $privateUri.Dispose()
}
```

Do not print the URI. Remove any temporary local IP access you no longer need.
Free Render services do not provide the dashboard Shell, which is why the
local importer option is included.[^render-shell]

## 7. Configure the private account signing secret

Account creation and Login use only username/password. No email provider,
email-domain DNS records, or OTP setup is needed. The existing
`AUTH_OTP_SECRET` setting is still used internally to protect account
sessions and rate-limit identifiers; its historical name does not enable OTP.

Generate a signing secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy it directly to Render's private `AUTH_OTP_SECRET` field. Do not paste it into
this file, Git, screenshots, support tickets or chat.

Keep existing business-mail DNS records unchanged. A support inbox, if needed,
is separate from website signup and login.

## 8. Production environment checklist

Enter values through Render's Environment settings, not client-side JavaScript.
Replace every placeholder and redeploy after changes.

### Required for username/password accounts

| Variable | Value / purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `PUBLIC_APP_URL` | Exact active HTTPS origin; replace the placeholder `https://kr7tech.example` |
| `AUTH_PROVIDER` | `mongodb` |
| `MONGODB_URI` | Fresh private Atlas application URI |
| `MONGODB_DATABASE` | `kr7tech` |
| `AUTH_OTP_SECRET` | Independently generated private secret, at least 32 characters |
| `LOCAL_ADMIN_LOGIN_ENABLED` | `false` |
| `AI_INTERVIEW_ALLOW_ANONYMOUS` | `false` |

`RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `MONGODB_ADMIN_EMAILS` are not needed
for this username/password-only flow. Assign owner access privately as below.

### Optional features

| Feature | Variables / prerequisite |
| --- | --- |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, explicit `PAYPAL_GO_USD` / `PAYPAL_PRO_USD`, suitable `PAYPAL_BASE_URL` |
| AI interviews | `GEMINI_API_KEY`; optionally `GEMINI_MODEL` |
| Remote compiler | HTTPS `JUDGE0_API_URL`; `JUDGE0_API_TOKEN` if required by that provider |
| Community/contact forms | Real `SUPPORT_EMAIL`, random `COMMUNITY_FORM_SECRET` of at least 32 characters |
| Per-item PIN | `PRO_ACCESS_PIN` of 8-128 characters; independent `PRO_ACCESS_SECRET` of at least 32 characters |

Supabase keys and Supabase SQL migrations are not required for this MongoDB
deployment. Do not switch an existing paid Supabase service to MongoDB without
a separate identity/purchase migration plan.

Never set local bootstrap passwords or local preview configuration on the host.
Use different secrets for authentication, community rate limiting and PIN grants.

## 9. Test the temporary Render domain first

Keep `PUBLIC_APP_URL` matched to the Render origin during this stage.

1. Open the Render homepage and navigate through Courses, Concepts, Interview
   Q&A, AI Interviews, Membership and Account.
2. Open `/api/account-auth`. Confirm `enabled` is `true`; this is a
   configuration check, not proof of database connectivity.
3. On `/Account.html`, create a unique username and password of 15-256 characters.
   No email OTP is required. Save your credentials privately.
4. Confirm the normal account has the Student role and Free plan.
5. Sign out. Reload and verify the account is signed out.
6. Select **Already have an account? Login** and use the same credentials.
7. Restart/redeploy the service, then confirm the same MongoDB account still works.
8. Test duplicate usernames, wrong passwords and attempts to choose Admin.

Already-signed-in legacy accounts can use **Enable username/password login**
without losing their existing UUID or purchases. Legacy users without a
session need owner-assisted migration; a new account will not inherit purchases.

An owner can create their normal
username/password account first and copy its dashboard Account ID. In the
owner's private Atlas Data Explorer, locate that exact document in
`kr7tech.users`, confirm its ID and username, and change only its `role` to
`admin`. This is a private database-owner operation, not a public signup option.
Do not promote other records or expose a role-editing link to students.

Existing roles are preserved on returning username/password logins.

**Admin does not automatically mean Pro in production.** To test full content,
copy your own dashboard Account ID, then use the Admin panel to grant Pro to
that ID. Verify the plan updates and later test revocation.

Do not place real purchases while using test payment keys or an unverified setup.

## 10. Connect the GoDaddy domain to Render

Only continue after the temporary Render site works.

### 10.1 Add the domain on Render

In the service's **Settings > Custom Domains**, add your actual domain (shown here as `kr7tech.example`).
Render also handles the corresponding `www` domain and redirects it to the
root when the root was added first. Use the root as this guide's canonical
address.[^render-domains]

### 10.2 Add the web DNS records

Open GoDaddy **Domain Portfolio > your domain (kr7tech.example in this example) > DNS**.
For GoDaddy-managed DNS, add or edit these records:[^godaddy-dns][^godaddy-a][^godaddy-cname][^render-dns]

| Type | Name / Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `216.24.57.1` | Default, or an available shorter TTL while setting up |
| CNAME | `www` | `YOUR-ACTUAL-SERVICE.onrender.com` | Default |

The A-record target above is Render's documented load-balancer address checked
on the preparation date. **The current Render dashboard/documentation takes
precedence if its required records change.** The CNAME value must be your
actual assigned Render hostname, not the example and not an IP address.

Do not enter `https://`, a port number, `/Account.html`, or a trailing path
in these DNS values. Do not point the public domain to `127.0.0.1`.

Before changing records, save a copy of the current DNS configuration.
Replace only conflicting website records for the names you are moving. Review
old parking/forwarding records and conflicting IPv6 `AAAA` records for those
website names. Render's instructions require removing conflicting AAAA
records while configuring its IPv4 hosting.[^render-domains]

**Do not delete the whole DNS zone, nameservers, unrelated subdomains, existing
mailbox MX records, or Resend verification records.** Domain forwarding is
not a replacement for connecting the application through DNS.

### 10.3 Verify the domain and HTTPS

Return to Render and select **Verify** for the custom domain. Wait for its
certificate to become ready; Render automatically provisions/renews TLS and
redirects HTTP to HTTPS.[^render-domains]

DNS changes may take time: GoDaddy says most are effective within an hour,
but global propagation can take up to 48 hours.[^godaddy-a]

Check records from your own normal PowerShell terminal:

```powershell
Resolve-DnsName kr7tech.example -Type A
Resolve-DnsName www.kr7tech.example -Type CNAME
```

Then open:

```text
https://kr7tech.example/
https://www.kr7tech.example/
https://kr7tech.example/api/health
```

If only the temporary Render URL works, resolve DNS/domain/TLS configuration
before changing application code.

## 11. Switch the app to the final domain

After DNS and HTTPS work:

1. Set `PUBLIC_APP_URL` to your real HTTPS origin in Render (replace `https://kr7tech.example`).
2. Save and redeploy.
3. Open the root domain, not the old Render URL, for login and forms.
4. Log in using your saved username and password on the final domain.
5. Recheck sign-out, Admin access and learner access.
6. Use the final HTTPS domain in every enabled payment webhook and callback.

This origin must match exactly. If you choose `www` as canonical instead,
consistently use your real `www` origin (replace `https://www.kr7tech.example`) in the host, provider settings
and your testing. Do not alternate between root and `www` when diagnosing
cookie-backed writes.

Cookies from the Render hostname or localhost do not become login cookies
for the new custom domain.

## 12. Enable payments only after account testing

Current server-side plan prices are:

| Plan | One-time INR amount | Access |
| --- | --- | --- |
| Go | INR 1,500 | Interview Q&A; first two concept lessons per subject; one AI interview session per UTC day |
| Pro | INR 5,000 | Full content; no daily AI session cap |

AI sessions contain at most six questions. A plan's benefits still require
working AI/compiler providers; buying a plan does not configure those services.
Live 1:1 coaching and certificates are not included free.

Start with one payment provider, use its test environment, and verify an entire
purchase before selecting live credentials. Complete that provider's merchant
activation requirements before taking real payments.

### Razorpay setup for the existing integration

1. Create/activate your provider account and select Test Mode initially.
2. Obtain the test key ID and secret.
3. Configure a webhook for:
   `https://kr7tech.example/api/webhooks/razorpay` (replace the placeholder domain).
4. Subscribe to **`payment_link.paid`**. This implementation uses Payment Links,
   not a generic client-side success callback.[^razorpay-links]
5. Choose a private webhook secret and set the three Razorpay variables from
   section 8.
6. Redeploy, log in as a test learner, and buy Go/Pro from the site's own
   Membership flow. Do not create an unrelated manual payment link and expect
   it to be matched automatically.
7. Confirm a signed webhook was delivered successfully and the matching
   entitlement appeared for the correct account.
8. Confirm another learner did not receive that access.
9. After verification, configure separate live-mode keys, webhook and secret,
   redeploy and repeat a controlled end-to-end live check.

### If you choose Stripe or PayPal instead

| Provider | Site webhook path | Event processed by the current code |
| --- | --- | --- |
| Stripe | `/api/webhooks/stripe` | `checkout.session.completed` or `checkout.session.async_payment_succeeded`, with `payment_status=paid` |
| PayPal | `/api/webhooks/paypal` | `PAYMENT.CAPTURE.COMPLETED` |

Use the full canonical HTTPS URL for the selected path. Keep webhook secrets
and IDs specific to the provider and its test/live environment.

PayPal requires explicit USD amounts in `PAYPAL_GO_USD` and/or
`PAYPAL_PRO_USD`; the code does not automatically convert the INR prices.
The PayPal capture return flow alone does not grant paid access.

Payment success redirects are not proof of payment. Keep signature
verification, recorded amount/currency/account matching and server-side
entitlement activation enabled.

**Current limitation:** refund/subscription-reversal automation is not supplied
by these paid-success handlers. Define a support/refund process and manually
revoke the relevant entitlement when appropriate until that automation exists.
Publish accurate contact, privacy, terms and refund information before launch.

## 13. Enable AI interviews and the remote compiler

### AI interviews

1. Create an appropriate Gemini API key in Google AI Studio and configure
   billing/quotas as needed.[^gemini]
2. Set `GEMINI_API_KEY` privately in Render.
3. If overriding `GEMINI_MODEL`, choose a currently available model compatible
   with this application's API usage; do not assume an old model remains
   available indefinitely.
4. Keep `AI_INTERVIEW_ALLOW_ANONYMOUS=false`.
5. Test using verified Go and Pro accounts, including Go's daily limit and
   Pro's lack of a daily cap.
6. Confirm unauthorized requests cannot contact the provider or obtain fake
   success responses.

### Remote compiler

1. Obtain a suitable Judge0-compatible hosted service or separately managed
   sandboxed Judge0 installation.[^judge0]
2. Configure its HTTPS base URL in `JUDGE0_API_URL`.
3. Configure `JUDGE0_API_TOKEN` if required by your provider and verify that
   its authentication/header requirements match this project's adapter.
4. Test supported C#, Python and Java submissions with a Pro account.
5. Verify incorrect-code, timeout and compiler-error responses as well as a
   successful program.

Never execute student-submitted code directly inside the website's Node.js
process or on an unsandboxed application host. Budget for usage and provider
rate limits; the UI alone does not make execution infrastructure available.

## 14. Optional contact forms and per-item PINs

For contact requests, interest lists and real learner feedback, set a monitored
`SUPPORT_EMAIL` and an independent `COMMUNITY_FORM_SECRET`, then test actual
records in MongoDB. Do not enable forms that falsely claim successful storage.

Feedback needs both publication consent and owner approval before appearing
publicly. Interest registration does not book coaching or confirm a seat.
Do not publish invented job outcomes or testimonials.

Leave production PIN variables empty if you are launching with verified
memberships only. If enabling them, use the lengths listed in section 8 and
verify that each grant opens only its chosen resource, not all Pro content.

**Scaling limitation:** PIN failed-attempt and consumed-grant tracking currently
live in process memory. Before relying on PINs for a scaled paid service,
implement a shared atomic replay/rate-limit store. Do not treat PIN access as
a payment or verified membership.

## 15. Final go-live checklist

Do these checks on the final domain, not just localhost:

- [ ] Root homepage and `www` reach the intended canonical HTTPS site.
- [ ] `/api/health` returns the expected JSON.
- [ ] Menus work on desktop and mobile for all primary destinations.
- [ ] Signed-out visitors receive previews, not full paid guides.
- [ ] Each subject shows only its free question allowance.
- [ ] The separate company bank does not reveal more free answers by filtering.
- [ ] Create account saves a normal user's username and salted password hash in MongoDB.
- [ ] The user can sign out and log in with the same details after a service restart.
- [ ] Wrong passwords and duplicate usernames fail without exposing credentials.
- [ ] Signup and login ask only for a username and password, without OTP.
- [ ] Only privately owner-authorized accounts have Admin privileges.
- [ ] Admin can grant/revoke a learner's Go/Pro access.
- [ ] Admin role alone is not being mistaken for a paid plan.
- [ ] Sign-out removes access; subsequent requests are no longer authenticated.
- [ ] Go and Pro prices/benefits match the server and payment amounts.
- [ ] A test purchase grants only the purchasing account's correct tier.
- [ ] Invalid/repeated payment notifications do not grant duplicate access.
- [ ] AI and compiler are either genuinely working or honestly unavailable.
- [ ] Local preview signup and bootstrap Admin login are unavailable publicly.
- [ ] `/.env.local`, `/.local-preview/accounts.json`, `/server.js`,
      `/scripts/local-preview.js` and `/api/_mongo.js` are not served as source.
- [ ] Support, privacy, contact and refund information are accurate.
- [ ] MongoDB backup/recovery, alerts and provider spending limits are configured.
- [ ] Secrets and local account state are not in Git or public build output.

No live purchases should be accepted until account, authorization, payment
and recovery checks succeed.

## 16. Troubleshooting and future updates

| Symptom | Check first |
| --- | --- |
| GoDaddy parking page | Correct domain, authoritative nameservers, root A record and any old forwarding |
| Domain not found / browser cannot reach site | Registration, DNS propagation, Render service state and the assigned Render URL |
| Temporary Render URL works but custom domain fails | Domain added to the same service, correct DNS, no conflicting website records, HTTPS verification |
| Homepage works but login/forms return 403 | Exact `PUBLIC_APP_URL` versus browser origin; root vs `www`; saved environment followed by redeploy |
| Username/password signup or login unavailable | MongoDB settings, signing secret length, exact application origin and database connectivity |
| Account storage unavailable | Atlas credentials, egress allowlist, DNS/TLS and host-to-database connectivity |
| Transaction errors | Replica-set-capable MongoDB deployment and supported transaction configuration |
| Login works, Admin does not | Owner-controlled MongoDB role; normal signup never makes an Admin |
| Admin cannot open all paid lessons | Grant a Pro entitlement to the appropriate account; role and plan are separate |
| Payment succeeded, plan unchanged | Correct user/order, delivered signed webhook, exact amount/currency and MongoDB transaction success |
| AI/compiler unavailable | Provider keys/URL, quotas, plan access, model availability and provider-specific requirements |
| Data disappeared after restarting the host | Production must use MongoDB, not local preview files or process memory |
| Public domain points to `127.0.0.1` or port `10000` | Replace with the hosting provider's public DNS records |

For the previous local "can't reach this page" problem: a process started in a
restricted assistant sandbox is not proof that your browser can reach it.
Deploying to a public host creates a different endpoint; check it directly.
Do not expose a development preview through port forwarding as a shortcut.

For later releases:

1. Review changes and run the project's checks in an allowed environment.
2. Commit/push the intended release branch without secrets.
3. Deploy through Render's configured workflow; inspect build and runtime logs.
4. Recheck the public homepage, username/password signup/login, logout and a protected route.
5. Retain the previous known-good release and current database backups.
6. Roll back application code through the hosting platform if needed; do not
   delete production collections or run destructive "reset" scripts.

Rotating `AUTH_OTP_SECRET`, sender settings or payment credentials requires a
planned change and revalidation. Redeploying code is not a database backup.

## 17. Alternative: GoDaddy domain with Vercel hosting

Use this only instead of the Render hosting/DNS steps. Keep the production
MongoDB, email, Admin, payment and go-live checks above.

The existing project-specific settings are:

| Setting | Value |
| --- | --- |
| Root Directory | `StudyGuide` |
| Framework | Other |
| Node.js | 24.x |
| Install Command | `npm ci --omit=dev` |
| Build Command | `npm run build:vercel` |
| Output Directory | Leave unset; do not set it to `.` |
| Start Command | None |

The checked-in builder creates `.vercel\output` with a private Node function
serving pages and APIs. Do not deploy the source folder as public static files.
Review the configured 60-second function limit against your enabled providers.

Use a hosting plan whose terms permit this paid commercial site. Vercel's
Hobby plan is for personal/non-commercial use, so do not select it for the
monetized service described here.[^vercel-plans]

Add the domain under the Vercel project's **Settings > Domains**, then copy
the exact DNS and any ownership-verification records shown into GoDaddy.
**Do not reuse Render's `216.24.57.1` A record or its `onrender.com` CNAME for
a Vercel deployment.** Use Vercel's current project-specific instructions.[^vercel-domains]

Add production secrets to the Production environment only and redeploy.
Set the final canonical `PUBLIC_APP_URL`. Preview deployments must not use
live payment credentials or be mistaken for production.

For Atlas, choose a supported secure connectivity/egress arrangement for
the Vercel deployment. Render's outbound ranges do not apply. If you cannot
establish a restricted, supported database connection, stop before enabling
accounts or payments.

## 18. Short order of execution

```text
Confirm domain ownership in GoDaddy
    -> Review source and push to private GitHub
    -> Create Node Web Service on Render
    -> Create/configure MongoDB and restricted networking
    -> Import teaching content
    -> Set required production account environment values
    -> Test Create account, username/password Login and Sign out on Render URL
    -> Privately authorize the owner Admin
    -> Add custom domain in Render
    -> Set GoDaddy A/CNAME records and verify HTTPS
    -> Switch PUBLIC_APP_URL to final domain and retest
    -> Configure/test optional payments, AI and compiler
    -> Complete go-live checks
    -> Start accepting students and verified purchases
```

## Official references

Provider dashboard labels, DNS targets, plans and limits can change. The links
below were checked while preparing this guide; prefer the current provider
dashboard and official documentation over copied values from old tutorials.
Project behavior above was checked against the existing source and
`StudyGuide\DEPLOYMENT.md`; this guide does not claim a live deployment was tested.

[^godaddy-dns]: GoDaddy, Manage DNS records: `https://www.godaddy.com/help/manage-dns-records-680`
[^godaddy-a]: GoDaddy, Add an A record: `https://www.godaddy.com/help/add-an-a-record-19238`
[^godaddy-cname]: GoDaddy, Add a CNAME record: `https://www.godaddy.com/help/add-a-cname-record-19236`
[^render-node]: Render, Deploy a Node Express App (the project uses its own Node server, not Express): `https://render.com/docs/deploy-node-express-app`
[^render-node-version]: Render, Setting Your Node.js Version: `https://render.com/docs/node-version`
[^render-free]: Render, Deploy for Free and production limitations: `https://render.com/docs/free`
[^render-outbound]: Render, Outbound IP Addresses: `https://render.com/docs/outbound-ip-addresses`
[^render-shell]: Render, SSH and Shell Access: `https://render.com/docs/ssh`
[^render-domains]: Render, Custom Domains: `https://render.com/docs/custom-domains`
[^render-dns]: Render, Configuring DNS Providers: `https://render.com/docs/configure-other-dns`
[^atlas-connect]: MongoDB Atlas, Connect via Client Libraries: `https://www.mongodb.com/docs/atlas/driver-connection/`
[^atlas-troubleshoot]: MongoDB Atlas, Troubleshoot Connection Issues: `https://www.mongodb.com/docs/atlas/troubleshoot-connection/`
[^resend-domains]: Resend, Verified Domains: `https://resend.com/docs/dashboard/domains/introduction`
[^resend-godaddy]: Resend, GoDaddy DNS guide: `https://resend.com/docs/guides/dns/godaddy`
[^razorpay-links]: Razorpay, Payment Links webhook events: `https://razorpay.com/docs/payments/payment-links/subscribe-to-webhooks/`
[^gemini]: Google AI Studio, Gemini API keys: `https://aistudio.google.com/docs/api-key`
[^judge0]: Judge0: `https://judge0.com/`
[^vercel-plans]: Vercel, Plans and commercial-use guidance: `https://vercel.com/pricing`
[^vercel-domains]: Vercel, Add and configure a domain: `https://vercel.com/docs/domains/working-with-domains/add-a-domain`
=======
# Deploy and sell KR7Tech memberships with GoDaddy

Updated for this project on **November 14, 2026**.

Project: `C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech`

Application folder: `StudyGuide`

Example domain: **kr7tech.example**. This is a placeholder, not a registered
production domain. Replace it everywhere below with a domain you own or your
actual deployment hostname. The application name is **KR7Tech**.

This is a manual deployment guide. Writing this file did not purchase a domain,
upload your project, create cloud accounts, configure DNS, or deploy anything.

## A. Deploy directly on GoDaddy Node.js Hosting

GoDaddy now provides **Node.js Hosting** with ZIP uploads, private previews,
environment secrets and custom domains. Use that product for the native route,
not Website Builder or a static HTML upload. Check availability and the plan's
current price in your own GoDaddy account before buying. Buying the domain
alone does not buy the application's hosting.

The application supports Node.js **22.x or 24.x**. GoDaddy's launch documentation
describes a Node.js 22 runtime; check the runtime shown for your actual app.
Render and Vercel can continue using Node.js 24.
The local Node 24 checks are runnable. Obtaining the additional Node 22 test
runtime in this assistant session was blocked by the local sandbox's npm-cache
permissions; a successful GoDaddy Node 22 preview is still a required release
check, not something the code changes alone prove.

### A1. Prepare the upload on your computer

Run from the application folder, not the repository's parent folder:

```powershell
Set-Location 'C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech\StudyGuide'
npm ci
npm run build
npm run package:godaddy
```

Upload **`StudyGuide\.godaddy\kr7tech.zip`**. Do not zip the entire disk folder.
The package contains the Node server, private APIs/content, public assets,
lockfile and production build script. `package.json` is at the ZIP root.
It excludes `.env.local`, local accounts, `node_modules`, tests and generated
Vercel output. It does contain your paid content, so keep the ZIP private.
GoDaddy installs dependencies; the project starts with `npm start`.

The checked-in commands are:

| Purpose | Command |
| --- | --- |
| Node hosting build | `npm run build` |
| Start the protected website and API | `npm start` |
| Generate GoDaddy upload | `npm run package:godaddy` |
| Generate Vercel deployment instead | `npm run build:vercel` |

Do not upload only `index.html`. Premium answers must remain behind the Node
server. Its listening port comes from the host's `PORT`; do not hard-code one.

### A2. Create and configure the app

1. Open GoDaddy **Node.js Hosting** and choose **Upload ZIP**.
2. Select `kr7tech.zip` and deploy to a private preview.
3. Use the app's Settings to manage secrets. Configure preview and published
   environments separately. Never test a preview with live payment credentials.
4. Set the following values in the environment you are testing:

```dotenv
NODE_ENV=production
AUTH_PROVIDER=mongodb
MONGODB_URI=YOUR_ROTATED_ATLAS_CONNECTION_STRING
MONGODB_DATABASE=kr7tech
AUTH_OTP_SECRET=YOUR_PRIVATE_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
PUBLIC_APP_URL=https://YOUR_ACTUAL_APP_HOST
LOCAL_ADMIN_LOGIN_ENABLED=false
AI_INTERVIEW_ALLOW_ANONYMOUS=false
SUPPORT_EMAIL=YOUR_WORKING_CUSTOMER_SUPPORT_EMAIL
SALES_ENABLED=false
```

`AUTH_OTP_SECRET` is also used by the password-account system; its name does not
mean customers need OTP login. Generate a strong random secret privately.
Never reuse the database password previously pasted in conversation: rotate it.

`PUBLIC_APP_URL` must be the exact HTTPS origin the browser uses, without a
path, query or fragment. For preview checks use the preview's actual origin.
Before publishing on your domain, update the published environment to the
final domain origin and restart/redeploy so the server reads the change.

### A3. Connect MongoDB Atlas

Use the existing MongoDB account backend, not GoDaddy's optional MySQL database.
Create a separate production database/user with appropriate privileges, enable
backups for your chosen Atlas tier, and configure Atlas network access for the
host's documented outbound addresses. Ask hosting support for stable egress
details if they are not published; do not assume public Node hosting can reach
Atlas just because static pages load.

Create a normal test account, sign out, sign in again and check that its record
persists. New customers start Free; buying a plan is separate from signing up.
Do not deploy `.local-preview\accounts.json`, preview Admin credentials,
local plan grants or secrets. Account and payment operations have no
filesystem fallback if Atlas is unavailable.

If importing additional SQL-seeded practice, run `npm run seed:mongodb` from
your secured local source checkout using the intended production connection,
not from a public web request. The upload already includes bundled learning
content; import is not required merely to display the free previews.

### A4. Publish your GoDaddy domain

Review the private preview, attach the required hosting subscription, and publish
the app. Use its Settings to connect your purchased domain. Follow the records
GoDaddy shows for that app; do not copy a guessed IP address from another host.
Confirm the domain and HTTPS certificate are working before enabling payments.

Choose one canonical hostname, such as the apex domain or `www`. Configure the
other hostname to redirect at the host. A cookie/session origin is not an alias
for every domain that happens to resolve to the server.

Check both the home page and `/api/health`. A health response proves the process
is running, not that MongoDB, AI or payments are configured.

### A5. Enable a real payment provider

Choose an account approved for your business, region and currency. GoDaddy's
hosting subscription is separate from the Go/Pro memberships your students buy.

| Provider | Private settings | Signed webhook URL on your final domain |
| --- | --- | --- |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | `/api/webhooks/razorpay` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `/api/webhooks/stripe` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_BASE_URL`, `PAYPAL_GO_USD` / `PAYPAL_PRO_USD` | `/api/webhooks/paypal` |

Use your provider's current webhook instructions and the event handling
documented in `StudyGuide\DEPLOYMENT.md`. Keep sandbox and live keys separate.
PayPal USD prices must be deliberately configured per plan; they are not an
automatic currency conversion from INR.

The current 50% INR offer is **Go 750** (regular 1,500) and **Pro 2,500**
(regular 5,000), one-time. This is a real server-side price reduction for new
INR checkouts, not an added coupon or fabricated countdown. PayPal's separately
configured USD prices are excluded. Existing purchases retain their recorded
amounts. `StudyGuide\api\_pricing.js` owns the current INR price policy;
update storefront copy and recheck provider amounts whenever that policy changes.
The server determines the charge; browser-supplied prices are ignored.
Payment returns go to `Purchase.html`. PayPal return processing captures the
owned order; signed webhook verification still activates the membership.
Do not manually mark a payment paid because its redirect looks successful.

Go and Pro advertise AI practice: configure `GEMINI_API_KEY` and the selected
model, then test their interview allowances before enabling those purchases.
Configure `JUDGE0_API_URL` / `JUDGE0_API_TOKEN` for the remote code runner.
Set provider spending alerts. Coaching and certificate benefits still require
your actual published availability, schedule and completion rules.

### A6. Commercial launch checklist

Keep `SALES_ENABLED=false` until every applicable check is complete:

- Review `Terms.html`, `Refund.html` and `Privacy.html` for your actual business,
  local requirements and operating practices. These project pages are not a
  legal-compliance certification. Publish your business/support information
  and any required purchase disclosures before accepting customers.
- Set a real, monitored `SUPPORT_EMAIL`; check that Contact support displays it.
- Test Create account -> Log in -> choose Go -> payment -> My purchases -> paid
  question access, and repeat for Pro -> full concept access.
- Verify signed webhook delivery, expected price/currency, account ownership,
  failed/cancelled checkout, delayed confirmation and sign-out/sign-in.
- Confirm Free cannot fetch paid bodies and Go cannot fetch later Pro lessons.
- Test an actual AI session, Go's daily allowance and failed-start recovery.
  Test code execution if you are offering the runner as an available benefit.
- Confirm an existing paid plan cannot be purchased again from that account.
- Make a small approved live transaction and verify actual provider receipt,
  membership activation, merchant settlement configuration and support handling.
  Complete any refund test through your provider's authorised tools.
- Check the real domain on mobile and desktop. Review your hosting, database,
  payment and AI costs, capacity, backups and incident contacts.

After review, configure live provider settings, set `SALES_ENABLED=true` in the
published environment and restart/redeploy. Production checkout requires that
switch and a valid support email, and still requires configured providers and
authentication. Never enable it merely to make a disabled button look active.

Membership delivery is implemented; purchasing hosting, merchant approval,
publishing, live DNS, live payments and revenue are not performed or guaranteed
by these files.

### A7. Update or roll back safely

#### Customer-facing outage messages

Every page includes a shared "We're working on it" notice for failed application
services, plus a Try again button. Offline browsers get a connection message.
Invalid passwords, paid-access restrictions, form errors and missing pages are
not reported as an application outage. Retrying reloads the page; it never
automatically repeats a checkout or another submitted action.

The public `Unavailable.html` page is also saved by a service worker after a
successful secure visit when the browser permits it. Returning visitors can
then see this fallback if a page navigation fails or returns a server error.
Only that public fallback is cached, never account data, payment responses or
paid learning pages. Keep its three supporting service-status/worker assets in
the upload; the package command includes them automatically.

An application cannot show a page on a first visit when its hosting or DNS is
completely unreachable, or when browser storage is disabled/cleared. Configure
a hosting/CDN-level error page using `Unavailable.html` if your chosen provider
supports it. This project does not configure an external outage service or
automatically notify your support team. Monitor the app separately.

Generate and privately retain the reviewed source ZIP for each release. Upload
the new ZIP to the same GoDaddy app, check its preview and publish the intended
release. Preserve environment secrets and MongoDB. If a release fails, disable
new sales while investigating and republish the previous known-good artifact.
Do not delete customer accounts, purchases or database data as a rollback.

### Official GoDaddy references checked for this guide

- App requirements: `https://developer.godaddy.com/en/docs/api-users/hosting/app-requirements`
- ZIP upload: `https://www.godaddy.com/help/upload-my-ai-generated-app-to-nodejs-hosting-42987`
- Deployment lifecycle: `https://developer.godaddy.com/en/docs/api-users/hosting/workflows/deploy-nodejs-app`
- Hosting FAQ: `https://www.godaddy.com/en-ca/help/nodejs-hosting-faq-42915`

## B. Alternative: GoDaddy domain with Render hosting

The remaining numbered sections describe the existing Render path, with a
Vercel alternative at the end. Use it if you prefer those hosts or your GoDaddy
product/account does not expose suitable Node.js Hosting. Choose one application
host. The production sales switch, customer policies and release checks above
apply to all hosts.

## 1. Understand the Render alternative

A **domain** is your website's address. Your GoDaddy purchase does not, by
itself, put this Node.js application online.

Use this setup:

```text
Student's browser
        |
        v
kr7tech.example
GoDaddy registration and DNS
        |
        v
Render Node.js Web Service
KR7Tech pages + protected content + API
        |
        +---- MongoDB Atlas: accounts, sessions, purchases and access
        +---- Payment provider: optional, after testing
        +---- Gemini / Judge0: optional, after testing
```

**Alternative path: GoDaddy DNS + Render + MongoDB Atlas.**
The project also supports Vercel; its alternative setup is in section 17.
Choose one hosting path, not both at once.

Do not upload only the HTML files to a static website host, GitHub Pages,
GoDaddy Website Builder, or a public storage bucket. The project's Node server
must protect premium guides and answers. Original source HTML can contain
private paid material.

You do not need a separate GoDaddy Website Builder, WordPress installation,
or Hostinger hosting subscription for the Render path described here.

### Budget before you pay

| Item | Purpose | What to check |
| --- | --- | --- |
| GoDaddy domain | Own the address | Renewal price, registration period, taxes and auto-renew |
| Render compute | Run the application | Paid production compute plan, usage limits and billing alerts |
| MongoDB Atlas | Store production accounts and purchases | Supported deployment, capacity, backups and network access |
| Payment provider | Accept purchases | Account approval, supported payment methods and provider fees |
| Gemini / Judge0 | AI interviews and remote code execution | Availability, quotas, usage charges and spending limits |

Use current provider checkout pages for actual costs. Your domain's first-year
offer is not the website's total operating cost or guaranteed renewal price.
Render documents its Free instances as unsuitable for production; use Free
only for evaluation, not as the availability plan for paying students.[^render-free]

## 2. Finish the GoDaddy domain purchase

1. Confirm the exact spelling of the domain in your cart.
2. Review the first-year price, renewal price and any selected add-ons.
3. Finish checkout if you have not already done so.
4. Open your GoDaddy **Domain Portfolio** and confirm the domain is present.
5. Complete any registration/contact verification requested by GoDaddy.
6. Secure the registrar account with two-step verification and keep recovery
   methods current. Review auto-renew and keep the billing method valid.

For the main path, keep DNS on GoDaddy's nameservers. If you already changed
nameservers to another provider, edit DNS at that authoritative provider instead;
records entered into an inactive GoDaddy DNS zone will not control the site.[^godaddy-dns]

## 3. Separate local preview from production

The local preview you have been testing is **not the production account system**.

| Local preview | Production |
| --- | --- |
| `npm run preview:local` | `npm start` |
| Loopback address on your computer | Public HTTPS domain |
| Local username/password registration | MongoDB username/password accounts |
| New accounts start as Free Students | New accounts start as Free Students |
| Private `.local-preview\accounts.json` | MongoDB users and session records |
| Existing preview Admins keep their roles | Owner privately assigns Admin; role and plan are separate |
| Payment, email, AI and compiler integrations disabled | Each requires real provider setup |

**Do not deploy the local account file or copy its password hashes into MongoDB.**
Local accounts, local sessions, and preview plan changes are not automatically
migrated into production.

Production now offers normal **Create account** and **Already have an account?
Login** forms. The username and salted password hash persist in MongoDB.
Public signup creates Free Student accounts, never Admins. Only a username
and password are required: no email, OTP, or separate Admin login. Google can remain paused.

Before deployment:

- Rotate any database credentials or API keys previously shared in messages.
- Keep secrets in provider dashboards, not source files, screenshots or chat.
- Keep `.env.local`, `.local-preview`, `node_modules` and generated `.vercel`
  output out of your Git upload.
- Keep the Git repository private because it contains your paid learning content.
- Do not set `LOCAL_PREVIEW_*`, `LOCAL_PRO_ACCESS_*` or bootstrap-password
  variables on the production host.
- Explicitly set `LOCAL_ADMIN_LOGIN_ENABLED=false`.

Render checks out your source repository, including private utility scripts.
Its production start command must not execute a preview script. The Vercel
builder separately excludes `scripts`, local state and environment files from
the generated function. Neither host should publicly serve private source files.

Implementation references: `StudyGuide\server.js`,
`StudyGuide\scripts\local-preview.js`, `StudyGuide\api\_mongo-auth.js`,
`StudyGuide\scripts\build-vercel.js`, and `.gitignore`.

## 4. Prepare the project and Git repository

Install supported Node.js **22.x or 24.x** on your own computer if needed.
The Render settings below deliberately select 24.

Open a regular PowerShell terminal:

```powershell
Set-Location 'C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech\StudyGuide'
node --version
npm ci
npm test
```

Resolve failed release checks before publishing. If a browser or local network
test is blocked by your machine's sandbox, validate it in an allowed environment;
do not treat a timeout as a successful test.

In the repository root, review what will be uploaded:

```powershell
Set-Location 'C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech'
git status --short
git branch --show-current
git remote -v
git check-ignore -- StudyGuide\.env.local StudyGuide\.local-preview\accounts.json
git ls-files -- StudyGuide\.env.local StudyGuide\.local-preview
```

The last command should not list private local settings or account state.
If it does, stop and remove those files from Git tracking through your normal
review process; rotate any exposed credentials. Adding a `.gitignore` rule does
not untrack a file already committed.

Use your existing repository and branch if available. If there is no remote
repository yet, create a **private** GitHub repository, then connect it using
GitHub's instructions for an existing local repository.

Review and commit the required project files, including:

```text
.gitignore
render.yaml
godaday.md
StudyGuide\package.json
StudyGuide\package-lock.json
StudyGuide\server.js
StudyGuide\vercel.json
StudyGuide\api\
StudyGuide\assets\
StudyGuide\scripts\
StudyGuide\*.html / *.css / *.js
StudyGuide\*-seed.sql
```

Keep the SQL seed files: the content importer reads them. They are not a
production Supabase migration requirement when using MongoDB.

Push your reviewed commit to the GitHub branch you will select on Render.
Do not reset existing work, force-push, or blindly upload your whole disk folder
through a browser. Browser file uploads do not automatically apply `.gitignore`.
No Git commit or push is performed by this guide.

## 5. Create the Render application

For a straightforward first setup, use **New > Web Service**, connect GitHub,
and choose the private repository and intended branch.[^render-node]

Enter these project-specific settings:

| Render setting | Exact value |
| --- | --- |
| Service type | Web Service, not Static Site |
| Name | `kr7tech` or another available service name |
| Runtime / Language | Node |
| Branch | Your reviewed deployment branch |
| Root Directory | `StudyGuide` |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Compute | Select an appropriate paid production instance |
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |

Choose a supported region suitable for your audience and database. Do not copy
an example region without considering latency. The checked-in `render.yaml`
is an alternative Blueprint configuration, but currently selects a Free
instance and Oregon; review those choices before using it for production.

Render supports selecting the Node version through `NODE_VERSION`.[^render-node-version]
Do not set a fixed hosting `PORT=10000`; the server reads the port supplied
by the host and listens on `0.0.0.0`.

Add these initial environment values:

```dotenv
NODE_VERSION=24
NODE_ENV=production
AUTH_PROVIDER=mongodb
MONGODB_DATABASE=kr7tech
AUTH_OTP_SECRET=YOUR_OWN_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
AI_INTERVIEW_ALLOW_ANONYMOUS=false
LOCAL_ADMIN_LOGIN_ENABLED=false
```

Generate the private signing/rate-limit secret with the command in section 7;
it is required for password accounts even when email OTP is disabled.

Set `PUBLIC_APP_URL` initially to the actual assigned HTTPS Render origin,
for example `https://YOUR-SERVICE.onrender.com`, with no path or trailing slash.
If it is not known before the first deploy, obtain it from the service page,
then update the variable and redeploy before testing forms.

Create/deploy the service. Missing account integrations should remain unavailable;
do not use a local-preview command to make them appear to work.

Open the assigned public Render URL and its `/api/health` endpoint. A healthy
response is:

```json
{"status":"ok"}
```

This health endpoint checks that the web server responds. It **does not**
prove that MongoDB, email delivery, checkout, AI or the compiler work.

## 6. Create the production MongoDB database

1. Create/sign in to MongoDB Atlas.
2. Create a project and supported cluster/deployment.
3. Use a replica-set-capable deployment: this application's payment activation
   and AI usage accounting require transactions, not a standalone database.
4. Create a dedicated **database user**, separate from your Atlas dashboard login.
5. Grant the application's necessary read/write access to the `kr7tech`
   database rather than using an all-powerful personal administrator.
6. In the cluster's **Connect > Drivers** flow, select Node.js and copy the
   application connection string.[^atlas-connect]

Use a fresh private connection string in Render:

```dotenv
MONGODB_URI=mongodb+srv://APP_USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=kr7tech
```

This is a placeholder, not a working credential. Use Atlas's generated URI;
percent-encode reserved characters in credentials and retain TLS verification.
Never use `tlsInsecure` or disable certificate checks to fix a connection.[^atlas-troubleshoot]

### Allow the hosting service to connect

In Render, open your service's **Connect > Outbound** information and copy all
applicable outbound IP/CIDR ranges. These are service-region egress ranges,
not the public IP used to route your website.[^render-outbound]

In Atlas, add those ranges to the project's IP access list. Allow your own
current IP separately only if you will run the content importer locally.
Avoid a permanent `0.0.0.0/0` rule. Dedicated outbound networking is an option
if you need narrower, exclusive addresses.

The website's DNS `A` record is **not** the address to add as the application's
MongoDB egress identity.

Redeploy after setting `MONGODB_URI`. The application creates its required
indexes on database connection. Connection errors must be resolved from the
actual host's logs and Atlas configuration; do not assume the previous local
sandbox's blocked MongoDB connection proves Atlas itself is broken.

### Import the existing question content

Run the importer once from a trusted environment with the production MongoDB
settings. It inserts missing content by deterministic ID, preserves existing
records, and does not create users or grant plans.

**Paid Render service:** open its dashboard **Shell**, ensure you are in the
application folder containing `package.json`, and run:[^render-shell]

```text
npm run seed:mongodb
```

The service environment already supplies the private connection settings.
Expected content totals in the current importer are 126 company/frontend
entries and 216 experience entries. Subject questions and concept lessons use
their existing private server modules.

**Alternative from your own PowerShell terminal:** add your current IP in Atlas,
then supply the fresh URI privately for this one command:

```powershell
Set-Location 'C:\Users\v-kbandoju\OneDrive - Microsoft\Desktop\KR7\KR7Tech\StudyGuide'
$saved = @{}
foreach ($key in @('AUTH_PROVIDER', 'MONGODB_DATABASE', 'MONGODB_URI')) {
    $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
$privateUri = Read-Host 'Paste the fresh production MongoDB URI' -AsSecureString
try {
    $env:AUTH_PROVIDER = 'mongodb'
    $env:MONGODB_DATABASE = 'kr7tech'
    $env:MONGODB_URI = [System.Net.NetworkCredential]::new('', $privateUri).Password
    npm run seed:mongodb
    if ($LASTEXITCODE -ne 0) { throw 'Content import failed; review connectivity before continuing.' }
}
finally {
    foreach ($key in $saved.Keys) {
        [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
    }
    $privateUri.Dispose()
}
```

Do not print the URI. Remove any temporary local IP access you no longer need.
Free Render services do not provide the dashboard Shell, which is why the
local importer option is included.[^render-shell]

## 7. Configure the private account signing secret

Account creation and Login use only username/password. No email provider,
email-domain DNS records, or OTP setup is needed. The existing
`AUTH_OTP_SECRET` setting is still used internally to protect account
sessions and rate-limit identifiers; its historical name does not enable OTP.

Generate a signing secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy it directly to Render's private `AUTH_OTP_SECRET` field. Do not paste it into
this file, Git, screenshots, support tickets or chat.

Keep existing business-mail DNS records unchanged. A support inbox, if needed,
is separate from website signup and login.

## 8. Production environment checklist

Enter values through Render's Environment settings, not client-side JavaScript.
Replace every placeholder and redeploy after changes.

### Required for username/password accounts

| Variable | Value / purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `PUBLIC_APP_URL` | Exact active HTTPS origin; replace the placeholder `https://kr7tech.example` |
| `AUTH_PROVIDER` | `mongodb` |
| `MONGODB_URI` | Fresh private Atlas application URI |
| `MONGODB_DATABASE` | `kr7tech` |
| `AUTH_OTP_SECRET` | Independently generated private secret, at least 32 characters |
| `LOCAL_ADMIN_LOGIN_ENABLED` | `false` |
| `AI_INTERVIEW_ALLOW_ANONYMOUS` | `false` |

`RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `MONGODB_ADMIN_EMAILS` are not needed
for this username/password-only flow. Assign owner access privately as below.

### Optional features

| Feature | Variables / prerequisite |
| --- | --- |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, explicit `PAYPAL_GO_USD` / `PAYPAL_PRO_USD`, suitable `PAYPAL_BASE_URL` |
| AI interviews | `GEMINI_API_KEY`; optionally `GEMINI_MODEL` |
| Remote compiler | HTTPS `JUDGE0_API_URL`; `JUDGE0_API_TOKEN` if required by that provider |
| Community/contact forms | Real `SUPPORT_EMAIL`, random `COMMUNITY_FORM_SECRET` of at least 32 characters |
| Per-item PIN | `PRO_ACCESS_PIN` of 8-128 characters; independent `PRO_ACCESS_SECRET` of at least 32 characters |

Supabase keys and Supabase SQL migrations are not required for this MongoDB
deployment. Do not switch an existing paid Supabase service to MongoDB without
a separate identity/purchase migration plan.

Never set local bootstrap passwords or local preview configuration on the host.
Use different secrets for authentication, community rate limiting and PIN grants.

## 9. Test the temporary Render domain first

Keep `PUBLIC_APP_URL` matched to the Render origin during this stage.

1. Open the Render homepage and navigate through Courses, Concepts, Interview
   Q&A, AI Interviews, Membership and Account.
2. Open `/api/account-auth`. Confirm `enabled` is `true`; this is a
   configuration check, not proof of database connectivity.
3. On `/Account.html`, create a unique username and password of 15-256 characters.
   No email OTP is required. Save your credentials privately.
4. Confirm the normal account has the Student role and Free plan.
5. Sign out. Reload and verify the account is signed out.
6. Select **Already have an account? Login** and use the same credentials.
7. Restart/redeploy the service, then confirm the same MongoDB account still works.
8. Test duplicate usernames, wrong passwords and attempts to choose Admin.

Already-signed-in legacy accounts can use **Enable username/password login**
without losing their existing UUID or purchases. Legacy users without a
session need owner-assisted migration; a new account will not inherit purchases.

An owner can create their normal
username/password account first and copy its dashboard Account ID. In the
owner's private Atlas Data Explorer, locate that exact document in
`kr7tech.users`, confirm its ID and username, and change only its `role` to
`admin`. This is a private database-owner operation, not a public signup option.
Do not promote other records or expose a role-editing link to students.

Existing roles are preserved on returning username/password logins.

**Admin does not automatically mean Pro in production.** To test full content,
copy your own dashboard Account ID, then use the Admin panel to grant Pro to
that ID. Verify the plan updates and later test revocation.

Do not place real purchases while using test payment keys or an unverified setup.

## 10. Connect the GoDaddy domain to Render

Only continue after the temporary Render site works.

### 10.1 Add the domain on Render

In the service's **Settings > Custom Domains**, add your actual domain (shown here as `kr7tech.example`).
Render also handles the corresponding `www` domain and redirects it to the
root when the root was added first. Use the root as this guide's canonical
address.[^render-domains]

### 10.2 Add the web DNS records

Open GoDaddy **Domain Portfolio > your domain (kr7tech.example in this example) > DNS**.
For GoDaddy-managed DNS, add or edit these records:[^godaddy-dns][^godaddy-a][^godaddy-cname][^render-dns]

| Type | Name / Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `216.24.57.1` | Default, or an available shorter TTL while setting up |
| CNAME | `www` | `YOUR-ACTUAL-SERVICE.onrender.com` | Default |

The A-record target above is Render's documented load-balancer address checked
on the preparation date. **The current Render dashboard/documentation takes
precedence if its required records change.** The CNAME value must be your
actual assigned Render hostname, not the example and not an IP address.

Do not enter `https://`, a port number, `/Account.html`, or a trailing path
in these DNS values. Do not point the public domain to `127.0.0.1`.

Before changing records, save a copy of the current DNS configuration.
Replace only conflicting website records for the names you are moving. Review
old parking/forwarding records and conflicting IPv6 `AAAA` records for those
website names. Render's instructions require removing conflicting AAAA
records while configuring its IPv4 hosting.[^render-domains]

**Do not delete the whole DNS zone, nameservers, unrelated subdomains, existing
mailbox MX records, or Resend verification records.** Domain forwarding is
not a replacement for connecting the application through DNS.

### 10.3 Verify the domain and HTTPS

Return to Render and select **Verify** for the custom domain. Wait for its
certificate to become ready; Render automatically provisions/renews TLS and
redirects HTTP to HTTPS.[^render-domains]

DNS changes may take time: GoDaddy says most are effective within an hour,
but global propagation can take up to 48 hours.[^godaddy-a]

Check records from your own normal PowerShell terminal:

```powershell
Resolve-DnsName kr7tech.example -Type A
Resolve-DnsName www.kr7tech.example -Type CNAME
```

Then open:

```text
https://kr7tech.example/
https://www.kr7tech.example/
https://kr7tech.example/api/health
```

If only the temporary Render URL works, resolve DNS/domain/TLS configuration
before changing application code.

## 11. Switch the app to the final domain

After DNS and HTTPS work:

1. Set `PUBLIC_APP_URL` to your real HTTPS origin in Render (replace `https://kr7tech.example`).
2. Save and redeploy.
3. Open the root domain, not the old Render URL, for login and forms.
4. Log in using your saved username and password on the final domain.
5. Recheck sign-out, Admin access and learner access.
6. Use the final HTTPS domain in every enabled payment webhook and callback.

This origin must match exactly. If you choose `www` as canonical instead,
consistently use your real `www` origin (replace `https://www.kr7tech.example`) in the host, provider settings
and your testing. Do not alternate between root and `www` when diagnosing
cookie-backed writes.

Cookies from the Render hostname or localhost do not become login cookies
for the new custom domain.

## 12. Enable payments only after account testing

Current server-side plan prices are:

| Plan | One-time INR amount | Access |
| --- | --- | --- |
| Go | INR 1,500 | Interview Q&A; first two concept lessons per subject; one AI interview session per UTC day |
| Pro | INR 5,000 | Full content; no daily AI session cap |

AI sessions contain at most six questions. A plan's benefits still require
working AI/compiler providers; buying a plan does not configure those services.
Live 1:1 coaching and certificates are not included free.

Start with one payment provider, use its test environment, and verify an entire
purchase before selecting live credentials. Complete that provider's merchant
activation requirements before taking real payments.

### Razorpay setup for the existing integration

1. Create/activate your provider account and select Test Mode initially.
2. Obtain the test key ID and secret.
3. Configure a webhook for:
   `https://kr7tech.example/api/webhooks/razorpay` (replace the placeholder domain).
4. Subscribe to **`payment_link.paid`**. This implementation uses Payment Links,
   not a generic client-side success callback.[^razorpay-links]
5. Choose a private webhook secret and set the three Razorpay variables from
   section 8.
6. Redeploy, log in as a test learner, and buy Go/Pro from the site's own
   Membership flow. Do not create an unrelated manual payment link and expect
   it to be matched automatically.
7. Confirm a signed webhook was delivered successfully and the matching
   entitlement appeared for the correct account.
8. Confirm another learner did not receive that access.
9. After verification, configure separate live-mode keys, webhook and secret,
   redeploy and repeat a controlled end-to-end live check.

### If you choose Stripe or PayPal instead

| Provider | Site webhook path | Event processed by the current code |
| --- | --- | --- |
| Stripe | `/api/webhooks/stripe` | `checkout.session.completed` or `checkout.session.async_payment_succeeded`, with `payment_status=paid` |
| PayPal | `/api/webhooks/paypal` | `PAYMENT.CAPTURE.COMPLETED` |

Use the full canonical HTTPS URL for the selected path. Keep webhook secrets
and IDs specific to the provider and its test/live environment.

PayPal requires explicit USD amounts in `PAYPAL_GO_USD` and/or
`PAYPAL_PRO_USD`; the code does not automatically convert the INR prices.
The PayPal capture return flow alone does not grant paid access.

Payment success redirects are not proof of payment. Keep signature
verification, recorded amount/currency/account matching and server-side
entitlement activation enabled.

**Current limitation:** refund/subscription-reversal automation is not supplied
by these paid-success handlers. Define a support/refund process and manually
revoke the relevant entitlement when appropriate until that automation exists.
Publish accurate contact, privacy, terms and refund information before launch.

## 13. Enable AI interviews and the remote compiler

### AI interviews

1. Create an appropriate Gemini API key in Google AI Studio and configure
   billing/quotas as needed.[^gemini]
2. Set `GEMINI_API_KEY` privately in Render.
3. If overriding `GEMINI_MODEL`, choose a currently available model compatible
   with this application's API usage; do not assume an old model remains
   available indefinitely.
4. Keep `AI_INTERVIEW_ALLOW_ANONYMOUS=false`.
5. Test using verified Go and Pro accounts, including Go's daily limit and
   Pro's lack of a daily cap.
6. Confirm unauthorized requests cannot contact the provider or obtain fake
   success responses.

### Remote compiler

1. Obtain a suitable Judge0-compatible hosted service or separately managed
   sandboxed Judge0 installation.[^judge0]
2. Configure its HTTPS base URL in `JUDGE0_API_URL`.
3. Configure `JUDGE0_API_TOKEN` if required by your provider and verify that
   its authentication/header requirements match this project's adapter.
4. Test supported C#, Python and Java submissions with a Pro account.
5. Verify incorrect-code, timeout and compiler-error responses as well as a
   successful program.

Never execute student-submitted code directly inside the website's Node.js
process or on an unsandboxed application host. Budget for usage and provider
rate limits; the UI alone does not make execution infrastructure available.

## 14. Optional contact forms and per-item PINs

For contact requests, interest lists and real learner feedback, set a monitored
`SUPPORT_EMAIL` and an independent `COMMUNITY_FORM_SECRET`, then test actual
records in MongoDB. Do not enable forms that falsely claim successful storage.

Feedback needs both publication consent and owner approval before appearing
publicly. Interest registration does not book coaching or confirm a seat.
Do not publish invented job outcomes or testimonials.

Leave production PIN variables empty if you are launching with verified
memberships only. If enabling them, use the lengths listed in section 8 and
verify that each grant opens only its chosen resource, not all Pro content.

**Scaling limitation:** PIN failed-attempt and consumed-grant tracking currently
live in process memory. Before relying on PINs for a scaled paid service,
implement a shared atomic replay/rate-limit store. Do not treat PIN access as
a payment or verified membership.

## 15. Final go-live checklist

Do these checks on the final domain, not just localhost:

- [ ] Root homepage and `www` reach the intended canonical HTTPS site.
- [ ] `/api/health` returns the expected JSON.
- [ ] Menus work on desktop and mobile for all primary destinations.
- [ ] Signed-out visitors receive previews, not full paid guides.
- [ ] Each subject shows only its free question allowance.
- [ ] The separate company bank does not reveal more free answers by filtering.
- [ ] Create account saves a normal user's username and salted password hash in MongoDB.
- [ ] The user can sign out and log in with the same details after a service restart.
- [ ] Wrong passwords and duplicate usernames fail without exposing credentials.
- [ ] Signup and login ask only for a username and password, without OTP.
- [ ] Only privately owner-authorized accounts have Admin privileges.
- [ ] Admin can grant/revoke a learner's Go/Pro access.
- [ ] Admin role alone is not being mistaken for a paid plan.
- [ ] Sign-out removes access; subsequent requests are no longer authenticated.
- [ ] Go and Pro prices/benefits match the server and payment amounts.
- [ ] A test purchase grants only the purchasing account's correct tier.
- [ ] Invalid/repeated payment notifications do not grant duplicate access.
- [ ] AI and compiler are either genuinely working or honestly unavailable.
- [ ] Local preview signup and bootstrap Admin login are unavailable publicly.
- [ ] `/.env.local`, `/.local-preview/accounts.json`, `/server.js`,
      `/scripts/local-preview.js` and `/api/_mongo.js` are not served as source.
- [ ] Support, privacy, contact and refund information are accurate.
- [ ] MongoDB backup/recovery, alerts and provider spending limits are configured.
- [ ] Secrets and local account state are not in Git or public build output.

No live purchases should be accepted until account, authorization, payment
and recovery checks succeed.

## 16. Troubleshooting and future updates

| Symptom | Check first |
| --- | --- |
| GoDaddy parking page | Correct domain, authoritative nameservers, root A record and any old forwarding |
| Domain not found / browser cannot reach site | Registration, DNS propagation, Render service state and the assigned Render URL |
| Temporary Render URL works but custom domain fails | Domain added to the same service, correct DNS, no conflicting website records, HTTPS verification |
| Homepage works but login/forms return 403 | Exact `PUBLIC_APP_URL` versus browser origin; root vs `www`; saved environment followed by redeploy |
| Username/password signup or login unavailable | MongoDB settings, signing secret length, exact application origin and database connectivity |
| Account storage unavailable | Atlas credentials, egress allowlist, DNS/TLS and host-to-database connectivity |
| Transaction errors | Replica-set-capable MongoDB deployment and supported transaction configuration |
| Login works, Admin does not | Owner-controlled MongoDB role; normal signup never makes an Admin |
| Admin cannot open all paid lessons | Grant a Pro entitlement to the appropriate account; role and plan are separate |
| Payment succeeded, plan unchanged | Correct user/order, delivered signed webhook, exact amount/currency and MongoDB transaction success |
| AI/compiler unavailable | Provider keys/URL, quotas, plan access, model availability and provider-specific requirements |
| Data disappeared after restarting the host | Production must use MongoDB, not local preview files or process memory |
| Public domain points to `127.0.0.1` or port `10000` | Replace with the hosting provider's public DNS records |

For the previous local "can't reach this page" problem: a process started in a
restricted assistant sandbox is not proof that your browser can reach it.
Deploying to a public host creates a different endpoint; check it directly.
Do not expose a development preview through port forwarding as a shortcut.

For later releases:

1. Review changes and run the project's checks in an allowed environment.
2. Commit/push the intended release branch without secrets.
3. Deploy through Render's configured workflow; inspect build and runtime logs.
4. Recheck the public homepage, username/password signup/login, logout and a protected route.
5. Retain the previous known-good release and current database backups.
6. Roll back application code through the hosting platform if needed; do not
   delete production collections or run destructive "reset" scripts.

Rotating `AUTH_OTP_SECRET`, sender settings or payment credentials requires a
planned change and revalidation. Redeploying code is not a database backup.

## 17. Alternative: GoDaddy domain with Vercel hosting

Use this only instead of the Render hosting/DNS steps. Keep the production
MongoDB, email, Admin, payment and go-live checks above.

The existing project-specific settings are:

| Setting | Value |
| --- | --- |
| Root Directory | `StudyGuide` |
| Framework | Other |
| Node.js | 24.x |
| Install Command | `npm ci --omit=dev` |
| Build Command | `npm run build:vercel` |
| Output Directory | Leave unset; do not set it to `.` |
| Start Command | None |

The checked-in builder creates `.vercel\output` with a private Node function
serving pages and APIs. Do not deploy the source folder as public static files.
Review the configured 60-second function limit against your enabled providers.

Use a hosting plan whose terms permit this paid commercial site. Vercel's
Hobby plan is for personal/non-commercial use, so do not select it for the
monetized service described here.[^vercel-plans]

Add the domain under the Vercel project's **Settings > Domains**, then copy
the exact DNS and any ownership-verification records shown into GoDaddy.
**Do not reuse Render's `216.24.57.1` A record or its `onrender.com` CNAME for
a Vercel deployment.** Use Vercel's current project-specific instructions.[^vercel-domains]

Add production secrets to the Production environment only and redeploy.
Set the final canonical `PUBLIC_APP_URL`. Preview deployments must not use
live payment credentials or be mistaken for production.

For Atlas, choose a supported secure connectivity/egress arrangement for
the Vercel deployment. Render's outbound ranges do not apply. If you cannot
establish a restricted, supported database connection, stop before enabling
accounts or payments.

## 18. Short order of execution

```text
Confirm domain ownership in GoDaddy
    -> Review source and push to private GitHub
    -> Create Node Web Service on Render
    -> Create/configure MongoDB and restricted networking
    -> Import teaching content
    -> Set required production account environment values
    -> Test Create account, username/password Login and Sign out on Render URL
    -> Privately authorize the owner Admin
    -> Add custom domain in Render
    -> Set GoDaddy A/CNAME records and verify HTTPS
    -> Switch PUBLIC_APP_URL to final domain and retest
    -> Configure/test optional payments, AI and compiler
    -> Complete go-live checks
    -> Start accepting students and verified purchases
```

## Official references

Provider dashboard labels, DNS targets, plans and limits can change. The links
below were checked while preparing this guide; prefer the current provider
dashboard and official documentation over copied values from old tutorials.
Project behavior above was checked against the existing source and
`StudyGuide\DEPLOYMENT.md`; this guide does not claim a live deployment was tested.

[^godaddy-dns]: GoDaddy, Manage DNS records: `https://www.godaddy.com/help/manage-dns-records-680`
[^godaddy-a]: GoDaddy, Add an A record: `https://www.godaddy.com/help/add-an-a-record-19238`
[^godaddy-cname]: GoDaddy, Add a CNAME record: `https://www.godaddy.com/help/add-a-cname-record-19236`
[^render-node]: Render, Deploy a Node Express App (the project uses its own Node server, not Express): `https://render.com/docs/deploy-node-express-app`
[^render-node-version]: Render, Setting Your Node.js Version: `https://render.com/docs/node-version`
[^render-free]: Render, Deploy for Free and production limitations: `https://render.com/docs/free`
[^render-outbound]: Render, Outbound IP Addresses: `https://render.com/docs/outbound-ip-addresses`
[^render-shell]: Render, SSH and Shell Access: `https://render.com/docs/ssh`
[^render-domains]: Render, Custom Domains: `https://render.com/docs/custom-domains`
[^render-dns]: Render, Configuring DNS Providers: `https://render.com/docs/configure-other-dns`
[^atlas-connect]: MongoDB Atlas, Connect via Client Libraries: `https://www.mongodb.com/docs/atlas/driver-connection/`
[^atlas-troubleshoot]: MongoDB Atlas, Troubleshoot Connection Issues: `https://www.mongodb.com/docs/atlas/troubleshoot-connection/`
[^resend-domains]: Resend, Verified Domains: `https://resend.com/docs/dashboard/domains/introduction`
[^resend-godaddy]: Resend, GoDaddy DNS guide: `https://resend.com/docs/guides/dns/godaddy`
[^razorpay-links]: Razorpay, Payment Links webhook events: `https://razorpay.com/docs/payments/payment-links/subscribe-to-webhooks/`
[^gemini]: Google AI Studio, Gemini API keys: `https://aistudio.google.com/docs/api-key`
[^judge0]: Judge0: `https://judge0.com/`
[^vercel-plans]: Vercel, Plans and commercial-use guidance: `https://vercel.com/pricing`
[^vercel-domains]: Vercel, Add and configure a domain: `https://vercel.com/docs/domains/working-with-domains/add-a-domain`
>>>>>>> 5855e6cdc4431f1a988e17847c88ae6d81a2f2cd
