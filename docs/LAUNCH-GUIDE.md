# Put Penguin online: backend, accounts, subscriptions and Discord

**Where you are now:** the application code is built. A hosting server, Supabase project, email sender and Stripe configuration are separate services you control. None of those external accounts is automatically created by a GitHub commit. Never send their passwords or keys in chat.

## What “backend” means

The VPS runs the app and scanning worker, not a local AI model; cloud providers still perform inference and you do not need a GPU. Your laptop is the remote control. The backend is Penguin running continuously on a server, even when that laptop is off. The same Next.js application serves the website and its private API. Its worker checks closed candles, journals demo orders/protection and schedules AI reviews.

| Part | What it does | Where it runs |
| --- | --- | --- |
| Website/frontend | Landing page, sign-in, charts, settings | Your visitor's browser |
| Backend + worker | Authentication checks, scanning, demo order/protection journals, research | Your Ubuntu VPS |
| Supabase | Email/password identity, encrypted integration records, subscription records | Your Supabase project |
| Stripe | Checkout, recurring payments, customer billing portal, signed status events | Your Stripe account |
| AI provider | Answers and advisory reports | Your selected cloud provider |
| Discord | Optional notifications and commands | Your Discord application/channel |

Supabase is **not** the scanning worker. The app still stores its authoritative trading ledger, session/enrollment registry, administrator binding and Markdown vault on the VPS. Start with **one durable server and one active worker**. Multiple independent replicas with the same exchange keys can duplicate decisions. Do not use an ephemeral serverless filesystem for this version.

A starting development deployment can use an Ubuntu 24.04 VPS with 2 vCPU, 4 GB RAM and persistent SSD storage. This is a starting point, not a customer-capacity guarantee. Provider geography must permit the exchange APIs you intend to use. Budget for the server, domain, SMTP and applicable provider/payment costs; “free AI” does not make all hosting free.

## 1. Prepare your server

These are **Ubuntu server commands**, not PowerShell commands. On Windows, use PowerShell only to connect:

```powershell
ssh YOUR_SERVER_USER@YOUR_SERVER_IP
```

Replace placeholders with your actual details. Use a normal SSH user with sudo privileges and SSH keys. Keep an existing SSH session open when changing firewall rules.

On the Ubuntu server:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git python3 python3-venv nginx certbot python3-certbot-nginx
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /tmp/nodesource.asc
sudo gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg /tmp/nodesource.asc
sudo chmod 0644 /etc/apt/keyrings/nodesource.gpg
printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main' | sudo tee /etc/apt/sources.list.d/nodesource.list > /dev/null
sudo apt-get update
sudo apt-get install -y nodejs
node --version
python3 --version
```

Use Node 24+ and Python 3.12+. These commands use the NodeSource signed package repository; verify the current installation instructions at the official NodeSource distribution project if your image differs. Do not disable TLS, repository signature checks or add unrelated package sources.

Create an unprivileged service user and persistent directories:

```bash
sudo useradd --system --create-home --home-dir /var/lib/penguin --shell /usr/sbin/nologin penguin
sudo install -d -o penguin -g penguin -m 0750 /opt/penguin /var/lib/penguin
sudo install -d -o root -g penguin -m 0750 /etc/penguin
sudo -u penguin git clone https://github.com/Devologger/129381293iewq.git /opt/penguin
cd /opt/penguin
sudo -u penguin npm ci --cache /var/lib/penguin/.npm
sudo -u penguin npm run build
```

If your repository is private, configure a **read-only deployment credential** through GitHub, such as a deploy key, before cloning. Do not paste a token into the clone URL or reuse keys shown in chat. The development cloud's Git proxy is not your VPS's credential manager.

## 2. Create Supabase and private configuration

1. Create your own Supabase project. Record its project URL, anon key and service-role key privately. The service-role key is powerful: it belongs only on the server.
2. Open SQL Editor and run [the initial hosted migration](../supabase/migrations/202610160001_hosted.sql), followed by [the AI-access expiry migration](../supabase/migrations/202610170001_ai_access_expiry.sql), in that order. If the initial migration was already applied, run only the new expiry migration. Alternatively apply it through your managed migration process. It creates the encrypted integrations, subscriptions and billing-event transaction function. It denies browser-role access to those tables.
3. Under Authentication, enable email/password and **Confirm email**. Use your own SMTP provider for a real customer launch. Configure sender-domain DNS records as required by that provider, test delivery and set appropriate Auth rate limits.
4. Set Auth's Site URL to your public HTTPS origin, for example `https://YOUR_DOMAIN`.
5. Change **Confirm signup** email content to include this link:

```html
<a href="{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=signup">Confirm your Penguin email</a>
```

6. Change **Reset password** email content to include:

```html
<a href="{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=recovery">Reset your Penguin password</a>
```

These are confirmation **links**, not codes to enter. The hash fragment is read in the browser and removed from its address bar. A confirmation button submits it to the same-origin API. Merely fetching the page does not consume the token. Signup confirmation does not silently sign someone into a different account: after confirmation, they sign in with their password. Recovery uses a short-lived HttpOnly cookie solely for password reset; it does not unlock the app.

Create your private server environment file:

```bash
sudo install -o root -g penguin -m 0640 /dev/null /etc/penguin/penguin.env
sudoedit /etc/penguin/penguin.env
```

Enter real values privately. This is the minimum shape, not real credentials:

```dotenv
NODE_ENV=production
PENGUIN_AUTH_PROVIDER=supabase
PENGUIN_ACCOUNT_MODE=1
PENGUIN_OPEN_SIGNUP=1
PENGUIN_SIGNUP_CODE=
TERMINAL_PUBLIC_ORIGIN=https://YOUR_DOMAIN
TERMINAL_DATA_DIR=/var/lib/penguin
PENGUIN_TRUSTED_IP_HEADER=X-Real-IP
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PRIVATE_VALUE
SUPABASE_SERVICE_ROLE_KEY=YOUR_PRIVATE_VALUE
PENGUIN_SECRET_MASTER_KEY=YOUR_PRIVATE_64_HEX_CHARACTER_VALUE
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
PENGUIN_REQUIRE_SUBSCRIPTION=0
```

Do not run `install /dev/null` again over an existing configured file: that would erase its values. Keep it outside Git and never prefix service credentials with `NEXT_PUBLIC_`. The proxy configured below overwrites `X-Real-IP`; only then is that header trustworthy.

Generate the encryption master key on your trusted server using:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

This intentionally displays a **new private secret on your own terminal**. Put it directly into the private file and a separate encrypted backup; never post it in chat. Keep the master key outside Supabase. Replacing it without re-encrypting existing records makes old integrations and hosted sessions unreadable. The running server can decrypt keys to use integrations; encryption does not make a compromised server harmless.

Registration is open with `PENGUIN_OPEN_SIGNUP=1`. An explicit `0` closes public registration. Existing local users and keys are not silently converted to hosted users: use a dedicated hosted runtime for a commercial deployment. Two different account systems cannot claim the same local registry email automatically.

## 3. Create the administrator

The reserved address is **info@penguin.com.cy**. It cannot claim administrator status through public signup. There is no default password, no role taken from browser input or editable user metadata, and no email-only admin check.

After configuring Supabase privately, run on your trusted VPS:

```bash
cd /opt/penguin
sudo -u penguin node --env-file=/etc/penguin/penguin.env scripts/admin-setup.mjs
```

Type a new private password twice; the terminal hides it. The command creates the selected Supabase user through the service-role API, binds its immutable UUID to `admin-identity.json` in your persistent runtime and enrolls it in Penguin. The operator-authorized bootstrap confirms this reserved account; normal customer emails still require the confirmation link. Sign in at `/account`, then open `/admin`.

If that email already exists, the command **refuses to claim or reset it automatically**. Verify that it is your intended, confirmed Supabase user. Temporarily set its exact UUID as `PENGUIN_ADMIN_EXISTING_USER_ID` in private server configuration, then rerun the command. Remove that temporary setting afterward. Existing passwords are not changed by this path. A different bound administrator cannot be silently replaced.

The bound administrator can test AI without a subscription, but still needs its own free-provider settings and retains token/spending/provider limits. Its admin screen reports configuration presence only; it cannot display customer keys or arbitrarily mark subscriptions paid. Back up `admin-identity.json` with the runtime.

**Development status:** no live admin account has been created by this coding environment because your Supabase credentials are absent. The command and its tests are provided so you can create the real account privately.

## 4. Start the backend continuously

Review the service file and verify the Node executable is `/usr/bin/node` with `command -v node`. Then:

```bash
cd /opt/penguin
sudo cp deploy/penguin.service /etc/systemd/system/penguin.service
sudo systemctl daemon-reload
sudo systemctl enable --now penguin
sudo systemctl status penguin --no-pager
```

The service reads `/etc/penguin/penguin.env`, runs as `penguin`, and stores its state under `/var/lib/penguin`. It runs only one Node instance. `npm run build` prepares files; it does not keep a server running. `systemd` keeps the actual backend running after you close SSH or reboot.

Check the landing page locally on the server:

```bash
curl -I http://127.0.0.1:3000/
```

A response proves that HTTP is served, not that exchange execution or billing works. Do not expose port 3000 directly to the internet.

## 5. Add your domain and HTTPS

At your DNS provider, point an A record for `YOUR_DOMAIN` to the VPS IP. Add an AAAA record only if IPv6 is actually configured. Wait for DNS to resolve correctly.

Create `/etc/nginx/sites-available/penguin` with your actual domain:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN;
    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

Activate and request a certificate:

```bash
sudo ln -s /etc/nginx/sites-available/penguin /etc/nginx/sites-enabled/penguin
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

Do not repeat `ln -s` if that link already exists. Use firewall rules that allow your SSH access and public ports 80/443; leave the application port private. Verify HTTPS and that `TERMINAL_PUBLIC_ORIGIN` matches it exactly, without a trailing slash. Nginx forwards the webhook body without parsing it, so Stripe signature checks use the original payload.

## 6. Enable subscriptions and verify the AI gate

1. In **Stripe test mode**, create a product with one recurring Price. Choose your own honest price and billing interval.
2. Configure Stripe's customer billing portal and your business/customer disclosures.
3. Create a webhook at `https://YOUR_DOMAIN/api/billing/webhook` for `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`.
4. Privately set the matching `STRIPE_SECRET_KEY`, webhook `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_ID` in the server environment file. Restart with `sudo systemctl restart penguin`.
5. Register a new ordinary customer, accept Terms/Privacy, click the email confirmation link and sign in. Charts, account/billing and static guides are accessible. AI help, council generation, connection/model tests and scheduled inference remain locked before subscription.
6. Use Account → checkout and a Stripe **test** payment method from Stripe's official test documentation. Confirm webhook delivery succeeds, then refresh the app. Existing active subscriptions need a fresh Stripe subscription event after the expiry migration; do not manually mark them active in the database. Use the Stripe dashboard to send a fresh event or make a legitimate subscription update, then verify delivery. Only `active` status at the configured Price with an unexpired period from a signed Stripe event unlocks customer AI; `trialing`, `past_due`, `unpaid`, `canceled`, `incomplete`, missing billing or an unverifiable status does not.
7. Test cancellation/expiry, failed payment, webhook replay and two-account isolation. The server gates AI before cache reads, provider catalogs, token reservations or inference; changing UI labels cannot bypass it. Each role also checks access before an upstream call, so losing access during a council can stop later calls.
8. `PENGUIN_REQUIRE_SUBSCRIPTION` is a separate optional **demo-entry** gate. Set it to `1` if new demo bot enables/orders should also require membership. It does **not** disable the mandatory customer AI gate when set to `0`. Pause/close/reconcile/protection continue regardless of AI entitlement or subscription expiry.

Payment does not provide exchange credentials or unlimited AI tokens. Each customer currently connects its own confirmed free Groq/OpenRouter credentials in Settings. Shared operator keys and gateways are not inherited. Free quotas/privacy/availability restrictions remain; there is no paid inference fallback. The administrator exception does not remove these provider requirements.

Before using live Stripe keys, finalize your legal business identity, pricing, taxes, cancellation/refund rights, Terms/Privacy and security/operational review. The included legal pages are pre-launch texts with those gaps explicitly stated, not legal approval to sell regulated services or a promise of profitability.

## 7. Connect Binance demo and AI

In Settings → Exchanges, save the **demo** key and secret separately and verify the account. Keep withdrawals disabled. Real Binance has separate read-only fields; no production order execution exists.

In Settings → AI providers, save your Groq or OpenRouter key and select its route. Confirm the Groq free plan if appropriate. Hosted accounts use their own direct routes; shared root FreeRide/9Router gateways are disabled for customer isolation. Do not paste keys into Ask Penguin.

In Overview, choose demo, set size, tick explicit demo-order consent and Start demo. The worker establishes a closed-bar baseline and waits for a new setup. It does not force a trade. Council reviews begin after evidence exists, for active subscribers or the bound administrator. Read the order/protection journal; entry and SL/TP submissions are separate and require exchange acknowledgements.

## 8. Discord: the simplest useful setup

### A. Outgoing notifications — recommended first

1. Create a private Discord channel that only intended recipients can read.
2. In that channel's server settings, open **Integrations → Webhooks → New webhook**. Choose the channel and copy its webhook URL privately.
3. In Penguin, open Settings → Discord, select **Discord channel webhook**, paste privately and save.
4. In the Discord notifications section, enable alerts and click **Send Discord test**.
5. Confirm the message appears. You control this test; development did not send any message to your channel.

A webhook is enough for outgoing notifications. It does **not** require a bot token or application public key. It reports implemented demo monitor/council failures and sampled loss alerts; notification coverage is not a complete risk-monitoring service. There are no automatic voice calls or human-like phone conversations. Treat the URL as a secret; recreate it in Discord if exposed.

### B. Optional slash commands

1. Create your own application in Discord Developer Portal. Copy its **Application ID** (public number) and **Public Key** from General Information.
2. Save the **Public Key** in Penguin Settings → Discord. This verifies signatures and is different from a bot token.
3. In Penguin Account, expand **Discord integration endpoint**. Copy its full path onto your public HTTPS domain, for example `https://YOUR_DOMAIN/api/integrations/discord/YOUR_ACCOUNT_ID`.
4. Set that URL as the application's **Interactions Endpoint URL** in Discord Developer Portal. Discord sends a signed PING; the app must return success. Configure the Public Key first.
5. Register the command definition from your trusted terminal:

```bash
cd /opt/penguin
sudo -u penguin node scripts/discord-register.mjs
```

Enter the Application ID and your own application's bot token in the hidden prompt. The token is used once to register `/penguin`; it is not saved in Penguin integration storage or printed. Other application commands are not removed. If no Bot section exists yet, create the application's bot in Developer Portal first. Never share its token.

6. Use Developer Portal's Installation settings to install the application with the `applications.commands` scope in your Discord server. Do not grant Administrator or unrelated permissions.
7. In Penguin Settings → Discord, generate a one-time link code. In Discord, use `/penguin link code:YOUR_CODE` within ten minutes.
8. `/penguin status` reports demo worker state and archived paper context. `/penguin pause` pauses new demo entries. `/penguin resume` directs you to the dashboard for explicit confirmation; it does not resume orders from Discord. `/penguin positions` currently reports **historical paper positions**, not live Binance positions.

Discord permits one interactions endpoint per application. The current account-specific design means each customer supplies its own Discord application for slash commands; a shared commercial multi-tenant Discord bot has not been implemented. Channel webhooks are the simpler customer notification path.

## 9. Updates, backups and what to test

For an update, stop the service, pull the code, install/build, then restart. Preserve runtime and vault:

```bash
sudo systemctl stop penguin
cd /opt/penguin
sudo -u penguin git pull origin main
sudo -u penguin npm ci --cache /var/lib/penguin/.npm
sudo -u penguin npm run build
sudo systemctl start penguin
```

Take consistent encrypted backups of `/var/lib/penguin`, private environment settings and the separately protected encryption master key. SQLite WAL state must be captured consistently, preferably with the service stopped or an appropriate SQLite backup process. Test restoring while the previous instance is stopped so two workers never trade the same account.

Use `sudo journalctl -u penguin --since '15 minutes ago'` for service startup failures; treat operational logs as private. Do not copy environment files, tokens, request bodies, signed confirmation links or customer records into support messages. Missing optional service configuration must be distinguished from an application bug.

Before selling access, test real SMTP delivery, signup/recovery links, unpaid/paid/admin separation, Stripe test events, actual exchange demo acknowledgements, Discord opt-in alerts and restoration. Code tests use fixtures and do not prove these external services are configured. End-user MFA, automated encryption-key rotation, abuse/CAPTCHA controls, shared transactional trading-state scale and a complete demo realized-outcome learning pipeline remain unfinished. The current demo harness is not full original-strategy parity. No deployment command or AI answer establishes profitable returns.

## Development verification

120 Node tests, 16 Python research tests, lint and the production build passed. Browser checks covered public desktop/mobile/reduced-motion layouts, anonymous redirects, signup/terms UI, backend unpaid AI 402 responses, non-admin 403, safe Markdown (no raw HTML, scripts, tracking images or JavaScript links), public legal/setup pages and explicit confirmation-link POST. These use synthetic services and do not establish live Supabase/SMTP/Stripe/exchange/Discord readiness.

[Landing desktop](images/landing-desktop.png) · [Landing mobile](images/landing-mobile.png) · [Organized AI help](images/organized-ai-help.png). The previews and example AI answer are synthetic UI fixtures, not trading evidence.
