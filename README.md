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

**Docker** — set `PORTAL_EDIT_PASSWORD` (≥ 12 characters) in `docker-compose.yml`. Port **3000**. Data in the `portal-data` volume.

```bash
docker compose up -d --build
```

Behind a proxy:

```bash
PORTAL_PUBLIC_ORIGIN=https://portal.example
PORTAL_TRUST_PROXY=1
```

**Production** — `PORTAL_EDIT_PASSWORD` required, no default. Intranet + reverse proxy. HTTPS.

```bash
npm ci
export PORTAL_EDIT_PASSWORD="a-real-password"
export NITRO_PRESET=node-server
npm run build
node .output/server/index.mjs
```

## Data

No database. The whole portal is one file: `data/portal.json`. Backup, move, restore = copy it.

```bash
PORTAL_DATA_FILE=/path/to/portal.json
```

Treat it as a secret (password hashes, OIDC secret, LDAP bind).

| Path | What |
| --- | --- |
| `data/portal.json` | Portal |
| `data/curation.json` | Link checks |
| `public/icons/` | Built-in icons |

## Security

Built for internal networks, typically behind a reverse proxy.

- Strong `PORTAL_EDIT_PASSWORD`, HTTPS, protected `portal.json`
- scrypt, login rate limiting, ACL, OIDC PKCE
- Security headers, iframes without `allow-same-origin`
- Bounded probes, HttpOnly session cookie, non-root Docker image

More under **Settings → Security**.

## Stack

React 19 · TanStack Start · Vite 8 · Tailwind CSS 4 · Nitro · JSON file
