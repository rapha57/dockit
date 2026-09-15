<p align="center">
  <img src="public/logo.svg" width="64" alt="Dockit" />
</p>

<h1 align="center">Dockit</h1>

<p align="center"><strong>Pin your URLs.</strong></p>

<p align="center">One page for the tools the team actually opens.<br />
Self-hosted. One JSON file. No database.</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111" alt="React 19" />
  <img src="https://img.shields.io/badge/TanStack_Start-FF4154?style=flat-square&logo=reactquery&logoColor=white" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/license-MIT-2EA043?style=flat-square" alt="MIT" />
  <a href="https://github.com/rapha57/dockit/actions/workflows/ci.yml"><img src="https://github.com/rapha57/dockit/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

<p align="center">
  <img src="screenshots/screen_001.png" alt="Dockit portal with spaces, categories and cards" />
</p>

## Why Dockit?

IT engineers live in dozens of tools: consoles, monitoring, ticketing, IAM, cloud, internal apps, docs. The links scatter across bookmarks, tabs, chat and mail.

**Dockit pins them on one shared page.**

A new engineer joining the team doesn't need to ask:

> “Where's the link to Grafana?”  
> “What's the URL for the Kubernetes console?”  
> “Where do I find the ITSM?”

It's already there. Use it as the browser start page, or push it to workstations (Windows GPO, and the like).

One place to start. Everything already organised.

## Architecture

```text
Space  →  Category  →  Card  →  Link | Note | Embed
```

A **space** is a home page. A **category** groups **cards**. A card is an app, a note, or an embedded page.

```text
 Browser
    │
    ▼
 Dockit
    │
    ├── Spaces · cards · Access · Settings
    │
    └── Server functions
            │
            ├── data/portal.json
            ├── data/curation.json
            ├── data/assets/
            ├── Local · LDAP · OIDC
            └── HTTP / ICMP probes
```

Dockit does not replace the tools. It sits in front of them:

```text
                         Dockit
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   Infrastructure        Systems           Security
        │                  │                  │
   Grafana              GitLab             Keycloak
   Proxmox              ITSM               IAM
   Kubernetes           Wiki               SIEM
   Cloud                DNS                ...
```

## Features

| | What it does |
| --- | --- |
| **Spaces / categories / cards** | Drag and drop |
| **Link hub** | Several URLs on one card (`https://`, `ssh://`, `ftp://`…) |
| **Probes** | HTTP and ICMP on cards |
| **Curation** | Server-side check of every link |
| **Access** | Users, groups, roles, grants |
| **History** | Audit and restore |
| **Reports** | Audit CSV · inventory CSV / PDF |
| **Auth** | Local accounts, LDAP / AD, OIDC — local login always stays |
| **Look** | Light / dark, logo, favicon, tags |
| **Import / export** | Whole portal, or one space |
| **Icons** | Built-in and custom |

## Curation

A portal that is never cleaned rots. Services get renamed, hosts get retired, paths move behind a proxy — the bookmark stays. Past a certain volume, nobody opens every link every day. The day someone needs the Kubernetes console or the DNS panel, the link may be dead.

**Curation answers one question: do the card links still work?**

From the account menu it checks every card link (primary and extras):

- Live progress and a step-by-step log
- OK, redirect (with target), HTTP error, timeout, unreachable
- Per-card breakdown — spot the broken cards, then **Edit** to fix

Checks run on the server (no CORS, shared timeouts, SSRF guards, rate limits). Results live in `data/curation.json` next to `portal.json`. Admins and editors.

## Run

**Dev** — Node 22. http://localhost:8080 — `admin` / `admin` (dev only).

```bash
npm ci
npm run dev
```

The pre-commit hook runs `typecheck` and `lint` (zero warnings).

**Docker** — set `PORTAL_EDIT_PASSWORD` (≥ 12 characters) in `docker-compose.yml`. Port **3000**. Data in the `portal-data` volume. The image is two-stage: build tools stay in the first stage, the run image is production `npm ci --omit=dev` plus `.output`. `data/` is not copied into the image (`.dockerignore`).

```bash
docker compose up -d --build
```

Behind a proxy:

```bash
PORTAL_PUBLIC_ORIGIN=https://portal.example
PORTAL_TRUST_PROXY=1
```

**OpenShift / Kubernetes** — HTTP probes need no extra capabilities. ICMP (ping) needs `NET_RAW`. The default `restricted` SCC does not grant it: omit `cap_add` and leave ICMP off, or use a dedicated SCC. HTTP probes still work. Mount `/app/data`; do not bake `portal.json` into the image.

**Production** — `PORTAL_EDIT_PASSWORD` required, no default. Intranet + reverse proxy. HTTPS.

```bash
npm ci
export PORTAL_EDIT_PASSWORD="a-real-password"
export NITRO_PRESET=node-server
npm run build
node .output/server/index.mjs
```

### SSO and LDAP bind secrets

Two ways. Neither is required; pick one.

**In the product** — Settings → Sign-in. Paste the OIDC client secret and the LDAP bind password as usual. Dockit stores them in `portal.json`. Fine on a box you trust. This is the default if you set nothing extra.

**On the server** — put them in the environment instead (OpenShift: a Secret). The fields in Settings turn grey (“set on the server”). The next save writes those fields **empty** in the JSON. An old value in the file still works until then.

```bash
export PORTAL_OIDC_CLIENT_SECRET="…"
export PORTAL_LDAP_BIND_PASSWORD="…"
```

One LDAP bind for every directory: the single `PORTAL_LDAP_BIND_PASSWORD` is enough. That same password is used for all directories, and every bind-password field in Settings is greyed.

Several directories with **different** bind accounts: do **not** set the generic variable. Set one variable per directory, from the directory **id** (in `portal.json` under `ldapDirectories`, or a short id like `ad`):

- id `ad` → `PORTAL_LDAP_BIND_PASSWORD_AD`
- id `corp-emea` → `PORTAL_LDAP_BIND_PASSWORD_CORP_EMEA`
- a UUID keeps its hex, hyphens become underscores, then uppercase

The specific variable wins over the generic one. User passwords (local Dockit accounts) are unchanged: they stay hashed in the JSON either way.

## Data

No database. The whole portal is one file: `data/portal.json`. Backup, move, restore = copy it.

```bash
PORTAL_DATA_FILE=/path/to/portal.json
```

Treat it as sensitive (password hashes, who can see what). If you chose the environment for SSO / LDAP bind, restore is the JSON **plus** those variables. If you pasted the secrets in Settings, they are already in the file.

| Path | What |
| --- | --- |
| `data/portal.json` | Portal |
| `data/curation.json` | Link checks |
| `public/icons/` | Built-in icons |

## Security

Built for internal networks, typically behind a reverse proxy. Not a public SaaS.

**Threat model.** One JSON file, no database. Attack surface is the portal process plus whatever the reverse proxy exposes. The server does not fetch cloud metadata (`169.254.169.254`, GCP metadata, link-local). HTTP probes are http(s) only, no embedded credentials, DNS-checked, timeout-capped (4s), rate-limited, and can be limited to signed-in sessions. ICMP is optional and needs `NET_RAW` (see OpenShift above). Production requires `PORTAL_EDIT_PASSWORD` (≥ 12 characters, no default). Local login always stays, even with LDAP / OIDC. The OIDC client secret and LDAP bind password can live in Settings (`portal.json`) or in the environment — see above.

- scrypt, login rate limiting, ACL, OIDC PKCE
- Security headers, iframes without `allow-same-origin`
- Theme CSS without `url(` / `@import`
- HttpOnly session cookie (off by default), TLS probe verify (off by default)
- Non-root Docker image (`USER node`)

More under **Settings → Security**.

## Stack

React 19 · TanStack Start · Vite 8 · Tailwind CSS 4 · Nitro · JSON file
