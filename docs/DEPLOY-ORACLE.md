# Hosting Wisdom Shop and Wisdom Campus on Oracle Cloud Free Tier

Written for someone who has never deployed a server. Every command is meant to
be copied exactly. Where a step can fail, the failure is described so you can
tell "this is broken" apart from "this is normal and slow".

**Read Part 0 before doing anything.** It is short, and it explains one
decision that cannot be undone later.

---

## Part 0 — What you are building, and what it costs

One virtual machine, rented from Oracle, that never expires and never charges
you. On it, in Docker containers:

| Container | What it is | Reachable from outside |
|---|---|---|
| `caddy` | the front door — receives all web traffic, handles HTTPS | yes, ports 80 + 443 |
| `web` | Wisdom Shop storefront | through Caddy |
| `api` | Wisdom Shop backend | through Caddy only |
| `ems` | Wisdom Campus school console | through Caddy |
| `ems-api` | Wisdom Campus backend | through Caddy only |
| `platform` | Super Admin console | through Caddy |
| `postgres` | the database — every school, order, and student | **no** |
| `redis` | sessions and queues | **no** |
| `meilisearch` | shop search | **no** |

**Cost.** Oracle's "Always Free" tier is genuinely free and does not expire.
You must give a credit or debit card at signup for identity verification —
Oracle places a temporary hold of about $1 and releases it. You are not
charged unless you explicitly upgrade *and* exceed the free allowances.

The only money in this entire plan is an optional domain name (~$12/year),
and Part 5 shows you how to skip that for now.

**What you get free, forever:**

- 4 CPU cores and 24 GB of RAM (Ampere ARM). This is a genuinely capable
  server — more RAM than most people's laptops.
- 200 GB of disk.
- 10 TB of outbound traffic per month.

### The one irreversible decision

At signup Oracle asks for a **home region**. It can never be changed. Based on
your users being in West Africa:

1. **South Africa (Johannesburg)** — first choice. The only Oracle region on
   the African continent, ~60–90 ms from Lagos.
2. **France (Marseille)** or **Germany (Frankfurt)** — fallback, ~90–130 ms
   from Lagos. Pick one of these if Johannesburg has no free ARM capacity
   (see Part 2), because that problem is not fixable from your side.

Either is fine. Nobody will notice the difference between 90 ms and 120 ms on
a school admin page.

---

## Part 1 — Create the Oracle account

**Time: 20 minutes, plus up to a few hours of waiting for approval.**

Start this first, even before reading further — the approval wait is the
longest thing in this document and everything else can happen while you wait.

1. Go to <https://www.oracle.com/cloud/free/> and click **Start for free**.
2. Enter your country: **Nigeria** (or wherever you are).
3. Enter your name and email. Verify the email.
4. **Choose your home region** — see Part 0. This is the irreversible one.
5. Enter your address and phone. Verify the phone by SMS.
6. Add a card. You will see a ~$1 authorisation hold that is released.
7. Accept the agreement and click **Start my free trial**.

You will get an email when the account is ready. Sometimes it is instant,
sometimes it takes hours. If it is rejected — this happens for reasons Oracle
does not explain — try a different card, or a card from a different bank.

> **What "Free Trial" means.** Your account starts with $300 of trial credit
> for 30 days, which unlocks *paid* services too. When those 30 days end, the
> paid things stop and the **Always Free** things keep running forever. The
> server in this guide is an Always Free thing. You do not need to do anything
> when the trial ends.

### Strongly recommended: upgrade to Pay As You Go

This sounds like the opposite of what you want. It isn't.

- Free-tier-only accounts get **last priority** for ARM capacity, which is the
  single most common reason people fail to create this server at all.
- Oracle **reclaims idle Always Free servers** on trial accounts. A quiet
  school ERP at night looks exactly like an idle server.
- Upgrading keeps every Always Free resource free. You are billed only for
  things beyond the free allowances, and this guide never crosses them.

Do it from the console: **Billing & Cost Management → Upgrade and Payment
Method → Upgrade to Pay As You Go**. Then set a **budget alert** at $1 so you
are emailed the instant anything is ever charged: **Billing → Budgets →
Create Budget**.

If you would rather not, skip it — just expect Part 2 to be harder.

---

## Part 2 — Create the server

**Time: 15 minutes, or several days if you hit the capacity problem.**

### 2a. Make an SSH key (on your Windows machine, not Oracle)

An SSH key is a pair of files: a public one you give Oracle, and a private one
that stays on your computer and is the only thing that can log in. Anyone with
the private file has your server. Never send it to anyone — including me.

Open PowerShell and run:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\oracle_wisdom" -C "wisdom-oracle"
```

Press Enter when it asks for a passphrase (or set one — you will type it on
every login).

This creates two files in `C:\Users\<you>\.ssh\`:

- `oracle_wisdom` — **private. Never share. Never commit to git.**
- `oracle_wisdom.pub` — public, safe to paste anywhere.

Show the public one, ready to copy:

```powershell
Get-Content "$env:USERPROFILE\.ssh\oracle_wisdom.pub"
```

### 2b. Create the instance

In the Oracle console: **☰ Menu → Compute → Instances → Create instance**.

| Field | Value |
|---|---|
| Name | `wisdom-prod` |
| Placement | leave the default availability domain |
| Image | **Ubuntu 24.04** — click *Change image*, choose Canonical Ubuntu, and make sure the shape below is set first so only ARM images are offered |
| Shape | click *Change shape* → **Ampere** → `VM.Standard.A1.Flex` |
| OCPUs | **4** |
| Memory | **24 GB** |
| Primary VNIC / Subnet | leave defaults (it creates a network for you) |
| Public IPv4 address | **Assign** — this must be on or you cannot reach it |
| SSH keys | **Paste public keys** → paste the `.pub` contents from 2a |
| Boot volume | tick *Specify a custom boot volume size* → **150** GB |

Click **Create**. It takes 1–3 minutes to go from PROVISIONING to RUNNING.

Copy the **Public IP address** from the instance page. Everything below calls
it `<SERVER_IP>`.

### 2c. When it says "Out of host capacity"

This is the single most common obstacle, and it is not your fault: Oracle's
free ARM capacity in a region is genuinely exhausted much of the time. It has
nothing to do with your account or your settings.

In order of what actually works:

1. **Retry.** Capacity is released constantly. Click Create again. Many people
   succeed within an hour of trying periodically.
2. **Change the availability domain** (AD-1 / AD-2 / AD-3) if your region has
   more than one, and retry each.
3. **Ask for less.** 2 OCPU / 12 GB often succeeds where 4/24 fails, and is
   still enough to run this whole stack. You can raise it later for free.
4. **Upgrade to Pay As You Go** (Part 1) — this is the biggest single
   improvement to your odds.
5. **Choose a different region** — but only if you have not yet created
   anything, since the home region cannot change. This means a new account.

Do not pay for a script that "farms" instances for you. Retrying by hand works.

### 2d. Keep the IP address forever

By default the public IP is *ephemeral* and changes if the instance is ever
stopped and started. Pin it:

**Instance page → Resources → Attached VNICs → click the VNIC → IPv4
Addresses → the ⋮ menu on the primary → Edit → Public IP → No public IP →
Update.** Then edit it again, choose **Reserved public IP → Create new
reserved IP**, name it `wisdom-ip`, and Update.

You will briefly lose connectivity while it swaps. The new IP is permanent —
note it down.

---

## Part 3 — Open the doors (there are two locks, and everyone forgets the second)

Your server has **two** firewalls. Traffic must pass both. Beginners almost
always open only the first, then spend hours wondering why the site does not
load while `curl localhost` works fine on the server.

### 3a. Lock one — Oracle's virtual firewall

**☰ Menu → Networking → Virtual cloud networks →** your VCN **→ Security
Lists →** *Default Security List* **→ Add Ingress Rules.**

Add these two rules:

| Source CIDR | IP Protocol | Destination Port Range | Description |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `80` | HTTP |
| `0.0.0.0/0` | TCP | `443` | HTTPS |

Leave *Stateless* unchecked. Do **not** open 5432, 6379, 7700, 4000 or 4001 —
the database and the backends must never be reachable from the internet. They
talk to each other on Docker's private network.

### 3b. Lock two — the firewall inside Ubuntu

Oracle's Ubuntu images ship with iptables rules that reject everything except
SSH. This is lock two. Part 4 does it, once you are logged in.

---

## Part 4 — Log in and prepare the server

### 4a. Connect

In PowerShell:

```powershell
ssh -i "$env:USERPROFILE\.ssh\oracle_wisdom" ubuntu@<SERVER_IP>
```

Type `yes` at the fingerprint prompt. You are now on the server — the prompt
changes to `ubuntu@wisdom-prod`. **Every command from here to the end of Part
9 runs on the server, not on Windows.**

If it hangs with no error, the instance is still booting; wait a minute. If it
says *Permission denied (publickey)*, the key you pasted at 2b does not match
the one you are using.

### 4b. Update, and open lock two

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

The `netfilter-persistent save` is the part that matters — without it the
rules vanish on the next reboot and the site goes down for reasons that look
mysterious a month later.

### 4c. Add swap

24 GB of RAM is plenty to *run* this, but compiling four Next.js apps at once
spikes hard. Swap is cheap insurance against a build that dies at 90%.

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 4d. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Log out and back in for the group change to take effect:

```bash
exit
```

```powershell
ssh -i "$env:USERPROFILE\.ssh\oracle_wisdom" ubuntu@<SERVER_IP>
```

Check it worked — this must print a version and must **not** say "permission
denied":

```bash
docker run --rm hello-world && docker compose version
```

### 4e. Automatic security updates

```bash
sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
```

`fail2ban` bans IPs that repeatedly fail SSH login. Your server will start
getting brute-force attempts within hours of existing. This is normal and not
a sign anyone is targeting you.

---

## Part 5 — A free hostname, and why you cannot skip it

You said you would rather not buy a domain yet. That is fine, but you cannot
run this on a bare IP over plain HTTP, for a reason specific to your own code:

```ts
// apps/ems-api/src/auth/auth.controller.ts:35
secure: this.config.get("NODE_ENV") === "production",
```

`secure: true` tells the browser to send that cookie **only over HTTPS**. Run
in production mode over plain HTTP and the browser silently refuses to store
the session cookie: you log in, it looks like it works, and you are logged out
on the next page. You would lose a day to that.

The fix costs nothing. **DuckDNS** gives free hostnames that Let's Encrypt
will issue real certificates for.

1. Go to <https://www.duckdns.org> and sign in with Google/GitHub.
2. Create **three** subdomains (you get five):
   - `wisdomshop` → becomes `wisdomshop.duckdns.org`
   - `wisdomcampus` → `wisdomcampus.duckdns.org`
   - `wisdomadmin` → `wisdomadmin.duckdns.org`
3. Put `<SERVER_IP>` in the **current ip** box for each and press **update ip**.

Three hostnames, one server. Caddy will get a real HTTPS certificate for each
one automatically, on first start, with no action from you.

> **What you are giving up until you buy a real domain:** per-school
> subdomains (`st-marys.campus.yourdomain.com`). Schools will pick their
> school from the login form instead, which is a supported configuration, not
> a broken one. Switching later is a DNS change and three environment
> variables — not a rebuild.

---

## Part 6 — Get your code onto the server

Your repository has no remote — it exists only on your Windows machine. If
that laptop dies today, ten weeks of work dies with it. Fix that first; it is
also how the server will get the code, and how every future update will reach
it.

### 6a. Create a private GitHub repository

1. Create an account at <https://github.com> if you have none.
2. **New repository** → name `wisdom-shop` → **Private** → do *not* add a
   README or .gitignore → Create.

### 6b. Push from Windows

Before anything else, confirm no secrets are about to be published:

```powershell
git check-ignore -v .env
```

That must print a line naming `.gitignore`. If it prints nothing, **stop** and
tell me — your `.env` would be published.

```powershell
git remote add origin https://github.com/<your-username>/wisdom-shop.git
git push -u origin master
```

GitHub will ask you to authenticate in a browser window.

### 6c. Let the server read the repository

On the **server**, make a deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

Copy that output. On GitHub: **your repo → Settings → Deploy keys → Add deploy
key** → paste → leave *Allow write access* **off** → Add key.

Then, on the server:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  StrictHostKeyChecking accept-new
EOF
git clone git@github.com:<your-username>/wisdom-shop.git ~/wisdom-shop
```

---

## Part 7 — The production build (done — here is what it does)

This part used to be a list of things I had not written yet. They are written.
You do not have to do anything in this section; read it so the commands in
Part 9 are not magic.

- `apps/ems-api/Dockerfile` — compiles once, generates **both** Prisma clients,
  runs as a non-root user. It deliberately keeps the Prisma CLI and the tenant
  `migrations/` folder in the final image: onboarding a school shells out to
  `prisma migrate deploy` against that school's brand-new database. An image
  without them boots perfectly and then fails the first time you create a
  school.
- `apps/ems/Dockerfile`, `apps/platform/Dockerfile` — Next.js standalone
  output, so the image carries only the modules actually used rather than the
  whole workspace.
- `docker-compose.prod.yml` — extended with `ems-api`, `ems`, `platform` and
  `ems-migrate`. Nothing but the proxy publishes a port; everything else is
  reachable only on the internal Docker network.
- `deploy/caddy/Caddyfile` — **Caddy replaces nginx.** It obtains and renews
  Let's Encrypt certificates itself for all three hostnames. No certbot
  container, no cron job, no renewal hook that fails silently until a
  certificate expires on a Sunday. This closes the known gap named in
  `docs/DEPLOYMENT.md`.
- `.env.production.example` — every secret, each with a note on what breaks if
  it is wrong.
- `deploy/deploy.sh` — build, migrate, restart, in that order, refusing to
  start if `.env` still has placeholder values.
- `deploy/backup.sh` — every database, both apps' uploaded files, `.env` and
  Caddy's certificates; keeps 14 days.

**One deliberate omission: per-school subdomains are off.**
`st-marys.campus.yourdomain.com` needs a certificate per school hostname,
which means either a wildcard certificate (a DNS-01 challenge, a custom Caddy
build and an API token for your whole DNS zone) or Caddy's on-demand TLS.
On-demand TLS is the right answer for multi-tenant SaaS, but it must be paired
with an endpoint that answers "is this hostname a real school?" — without one,
anyone who points a DNS record at your server can make it request
certificates until Let's Encrypt rate-limits your domain. The API has no such
endpoint yet, so rather than wire it to something that might answer yes to
everything, schools pick their school on the login form. That is a supported
configuration, not a broken one, and switching later is a DNS change plus that
one endpoint.

**One thing that must be true and is easy to get wrong:** the images must be
built **on the server**. It is ARM, your laptop is Intel, and Prisma compiles
a database engine binary for whichever architecture it is generated on. An
image built on Windows and shipped to Oracle fails at boot with an error about
a missing query engine. Building on the server sidesteps this entirely, and 4
cores builds it comfortably.

---

## Part 8 — Secrets

On the server:

```bash
cd ~/wisdom-shop
cp .env.production.example .env
```

Generate a fresh value for **every** secret — never reuse a development one,
several of which are published in this repository:

```bash
openssl rand -base64 48
```

The full list of what must change is in
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md#what-must-change-before-this-faces-the-internet).
Lock the file down so other users on the machine cannot read it:

```bash
chmod 600 .env
```

**Your AI provider key does not go in this file.** It is entered in the Super
Admin console, which stores it encrypted in the database — that is the design,
and it is why the key can be rotated without a redeploy.

> Rotate the OpenRouter key you pasted into our chat before it is ever used in
> production. Anything that appears in a chat log should be considered
> published: <https://openrouter.ai/keys>

---

## Part 9 — First deploy

```bash
cd ~/wisdom-shop
docker compose -f docker-compose.prod.yml build
```

The first build takes **15–30 minutes** — it compiles five applications. It
looks stuck at several points. It is not. Later builds take 2–5 minutes
because Docker reuses the unchanged layers.

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml run --rm migrate-ems
docker compose -f docker-compose.prod.yml up -d
```

Migrations run as their own one-shot containers, before the apps start, so
that the code never meets a schema it does not expect.

Watch it come up:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy
```

Caddy fetching certificates takes 10–60 seconds per hostname on first start.
`certificate obtained successfully` three times means you are live.

---

## Part 10 — Check it actually works

From your own browser:

| URL | What you should see |
|---|---|
| `https://wisdomshop.duckdns.org` | the storefront, with products |
| `https://wisdomcampus.duckdns.org/login` | the school console login |
| `https://wisdomadmin.duckdns.org` | the Super Admin console |

A padlock in the address bar on all three. Then the test that actually
matters, because it is the one the HTTPS decision was about:

1. Log in to the school console.
2. Reload the page.
3. **You must still be logged in.** If you are not, the session cookie is
   being rejected — tell me and do not work around it.

Then create a school in the Super Admin console and log into it. That
exercises provisioning, which creates a whole database — the most complex
thing this system does.

---

## Part 11 — Updating it, from now on

This is the loop you will use for every change for the rest of the project.

**On Windows**, having tested locally as you do now:

```powershell
git push
```

**On the server:**

```bash
cd ~/wisdom-shop && ./deploy.sh
```

That script pulls, rebuilds only what changed, runs migrations, and restarts.
Roughly 2–5 minutes, with a few seconds of downtime while containers swap.

Two rules that keep this boring:

1. **Migrations must be backwards compatible.** For the seconds between
   migrating and restarting, the *old* code is running against the *new*
   schema. Add columns as nullable, backfill, and drop the old ones a release
   later — never rename or drop in the same release that stops using them.
2. **Never edit files directly on the server.** The next `git pull` will
   overwrite them, or refuse to pull. If something is wrong, fix it on
   Windows, test, push, deploy.

To undo a bad deploy:

```bash
git log --oneline -5
git checkout <the-previous-commit-hash>
./deploy.sh
```

This does **not** undo a database migration. That is why rule 1 exists.

---

## Part 12 — Backups

`docker compose down -v` deletes every order, student, and school. There is no
undo. `backup.sh` will run nightly via cron and keep 14 days of compressed
dumps under `~/backups`.

Two things people skip and regret:

- **Copy them off the server.** A backup on the same disk as the database is
  not a backup. Once a week, from Windows:
  ```powershell
  scp -i "$env:USERPROFILE\.ssh\oracle_wisdom" -r ubuntu@<SERVER_IP>:~/backups .
  ```
- **Restore one.** A backup that has never been restored is a hypothesis.
  Restore into a scratch database and confirm a known school and student are
  intact.

School logos and product images live on disk in Docker volumes, **not** in the
database dump. Back those up separately or a restored database will point at
files that no longer exist.

---

## Part 13 — Two things that went wrong the first time

Both were found on a real deployment, both looked like something else, and
neither is obvious from reading the code. They are written down because the
next person to deploy will otherwise spend an evening on each.

### The storefront 500s, and the two consoles quietly lose their branding

`API_URL` and `EMS_API_URL` are supplied as **build args**, which is correct
and deliberate: Next resolves `rewrites()` into `routes-manifest.json` at
build time, so the browser's own calls need the value baked in.

But `ENV` does not cross a Docker stage boundary, and these Dockerfiles build
in one stage and run in another. The runtime image therefore has no such
variable at all, and every **server component** falls back to localhost inside
its own container:

```ts
// apps/web/lib/catalog.ts:3
const API_URL = process.env.API_URL ?? "http://localhost:4000";
```

Nothing listens on 4000 inside the web container, so the homepage fetch dies
with ECONNREFUSED and Next serves a 500. The campus and admin consoles do the
same thing, but their failure path returns "this host matches no school" —
which is indistinguishable from a correctly unbranded deployment. You would
find that weeks later wondering why the logo never appeared.

The fix is in `docker-compose.prod.yml`: the same values are now set as
runtime environment variables as well as build args. If you ever add a fourth
Next app, it needs both.

Worth knowing while debugging this: **the container cannot reach its own
public hostname.** Oracle's network does not hairpin, so "just point it at
https://<public-name>" fails differently rather than fixing anything.

### Restoring a database from another machine breaks every uploaded file

A storage key embeds the school's id:

```
schools/<schoolId>/branding/<uuid>.png
```

Restore a tenant database from a laptop into a school that was provisioned
here, and the ids differ — so `branding_settings.logoKey`,
`class_message_attachments.storageKey` and `users.photoKey` all name paths
that do not exist. The rows are intact, the pages render, the `<img>` tags
are present, and every file 404s.

Two halves to moving a school between machines:

1. The database (`pg_dump -Fc`, restore with `--no-owner`).
2. **The files.** In development they are bind-mounted at
   `apps/ems-api/.storage`; in production they live in the `ems-storage`
   volume at `/var/lib/wisdom-campus/storage`. Different places, so a copy
   between the two is not a straight volume copy.

Then re-file the keys to the destination school id:

```sql
UPDATE branding_settings
SET "logoKey" = replace("logoKey", 'schools/<old>/', 'schools/<new>/')
WHERE "logoKey" LIKE 'schools/<old>/%';
-- and the same for class_message_attachments."storageKey" and users."photoKey"
```

The tell that this has happened is a backup whose "Uploaded files" line is a
few kilobytes when it should be megabytes. Check that number; it is the
cheapest signal you will get.

### And one that is not a bug

Passwords in `scripts/provision-demo-school.ts` and the seed data are
published in this repository. That is harmless on a laptop and is working
credentials for anybody who finds the address once a server is on the public
internet. After restoring demo data anywhere reachable, reset them — the
school admin account can see every child's record.

---

## Part 14 — Deliberately not doing this yet

Named so you know they are decisions, not oversights:

- **One server, no redundancy.** If it dies, the site is down until it comes
  back. Real redundancy costs money and is the wrong trade at this stage.
- **No custom domain, so no per-school subdomains.** Part 5 explains the swap.
- **No CI/CD.** You deploy by running one command over SSH. Automating this
  through GitHub Actions is worth doing once deploys are frequent and boring —
  not before.
- **No monitoring or alerting.** You will find out something is down by
  looking. A free uptime checker pointed at the three hostnames is the
  cheapest next improvement.
- **Local disk storage.** Fine on one server; would need shared storage or S3
  before a second one.
